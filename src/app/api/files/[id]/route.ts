import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { databaseEnabled, requireDb } from "@/db/client";
import { membershipFor } from "@/db/tenancy";
import * as t from "@/db/schema";
import { get } from "@vercel/blob";
import { requireSession } from "@/lib/guard";

export const runtime = "nodejs";

/**
 * One file's bytes.
 *
 * The workspace snapshot carries every file's metadata and none of its bytes,
 * because sending them meant eleven megabytes on every page load for eight
 * screenshots, paid whether or not anything was opened. This is where they are
 * fetched from when something actually needs them.
 *
 * `?json=1` returns base64 for the chat route, which sends bytes to a model.
 * Everything else gets the binary, so an <img> or an <embed> can point straight
 * at it and the browser handles caching.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireSession();
  if (!session.ok) {
    return Response.json({ error: session.error }, { status: session.status });
  }
  if (!databaseEnabled || !session.email) {
    // A local workspace keeps its bytes in the browser, so nothing should ask.
    return Response.json({ error: "No hosted workspace." }, { status: 404 });
  }

  const { id } = await context.params;

  /*
   * One workspace, one lookup. Files used to be searched across every project
   * shared with this account as well, which is gone: everything in a workspace
   * is already reachable by everyone in it.
   */
  const mine = await membershipFor(session.email);
  if (!mine) return Response.json({ error: "Not found." }, { status: 404 });

  const [row] = await requireDb()
    .select()
    .from(t.files)
    .where(and(eq(t.files.workspaceId, mine.workspaceId), eq(t.files.id, id)))
    .limit(1);

  if (!row) return Response.json({ error: "Not found." }, { status: 404 });

  /*
   * The bytes, from wherever this row keeps them.
   *
   * Newer rows point at the blob store and older ones still carry base64, so
   * both are read here and nothing had to be migrated for the change to land.
   *
   * Still served through this route rather than by handing the browser the blob
   * URL, which would have been faster and wrong. A blob URL is unguessable and
   * permanent and answers to nobody: once it is out, it is out, and it is not
   * checked against a workspace ever again. Everything this product says about
   * one business's files not reaching another depends on the check a few lines
   * above, and a redirect would route around it.
   */
  const bytes = await load(row);
  if (!bytes) return Response.json({ error: "Not found." }, { status: 404 });

  if (request.nextUrl.searchParams.get("json")) {
    return Response.json(
      {
        id: row.id,
        data: Buffer.from(bytes).toString("base64"),
        text: row.textContent ?? undefined,
      },
      // Private: this is one account's file, and a shared cache must not hold it.
      { headers: { "Cache-Control": "private, max-age=31536000, immutable" } },
    );
  }

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": row.mediaType,
      "Content-Length": String(bytes.length),
      // A file's bytes never change: an edit makes a new row with a new id.
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Disposition": `inline; filename="${encodeURIComponent(row.name)}"`,
      // Never let a stored file be interpreted as something else.
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** The blob store if the row points at one, the row itself if it does not. */
async function load(row: {
  blobUrl: string;
  data: string;
}): Promise<Buffer | null> {
  if (!row.blobUrl) return row.data ? Buffer.from(row.data, "base64") : null;

  try {
    /*
     * Through the SDK rather than a plain fetch of the URL.
     *
     * The store is private: a blob URL answers nothing on its own, which is
     * the property that makes it safe to keep a client's documents in. Reading
     * one needs the deployment's own credential, which lives here and nowhere
     * near a browser.
     */
    const found = await get(row.blobUrl, { access: "private" });
    if (!found) {
      console.error("[api/files] the store has no such blob");
      return null;
    }
    return Buffer.from(await new Response(found.stream).arrayBuffer());
  } catch (error) {
    console.error("[api/files] could not read from the store", error);
    return null;
  }
}
