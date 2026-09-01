import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { databaseEnabled, requireDb } from "@/db/client";
import { membershipsFor } from "@/db/sharing";
import { membershipFor } from "@/db/tenancy";
import * as t from "@/db/schema";
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

  /**
   * Owned first, then anything reachable through a shared project.
   *
   * Without the second lookup a file attached to a shared conversation is
   * visible in the transcript and refuses to load for the person it was
   * shared with, which reads as the app being broken.
   */
  const mine = await membershipFor(session.email);
  if (!mine) return Response.json({ error: "Not found." }, { status: 404 });

  const shared = await membershipsFor(session.email);
  const owners = [mine.workspaceId, ...new Set(shared.map((m) => m.workspaceId))];

  const db = requireDb();
  let row: typeof t.files.$inferSelect | undefined;
  for (const owner of owners) {
    const [found] = await db
      .select()
      .from(t.files)
      .where(and(eq(t.files.workspaceId, owner), eq(t.files.id, id)))
      .limit(1);
    if (found) {
      row = found;
      break;
    }
  }

  if (!row) return Response.json({ error: "Not found." }, { status: 404 });

  if (request.nextUrl.searchParams.get("json")) {
    return Response.json(
      { id: row.id, data: row.data, text: row.textContent ?? undefined },
      // Private: this is one account's file, and a shared cache must not hold it.
      { headers: { "Cache-Control": "private, max-age=31536000, immutable" } },
    );
  }

  const bytes = Buffer.from(row.data, "base64");
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
