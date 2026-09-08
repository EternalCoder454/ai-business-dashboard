import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { databaseEnabled, requireDb } from "@/db/client";
import { membershipFor } from "@/db/tenancy";
import * as t from "@/db/schema";
import { readStoredFile } from "@/lib/fileStore";
import { requireSession } from "@/lib/guard";
import { toOriginalFormat } from "@/lib/optimiseImage";

export const runtime = "nodejs";

/**
 * A file's bytes never change: an edit makes a new row with a new id.
 *
 * Private, because this is one account's file and a shared cache must not hold
 * it. next.config deliberately excludes this route from the blanket no-store it
 * puts on /api, because a rule there replaces whatever a handler sets and
 * cannot vary by status, which would have cached a missing file's 404 for a
 * year. So every path out of this route names its own, and headers-test checks
 * that the exclusion and these two still agree.
 */
const FOUND = "private, max-age=31536000, immutable";
/** Anything that is not the bytes: an error now must not answer for a year. */
const NOT_FOUND = "no-store, max-age=0";

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
    return Response.json(
      { error: session.error },
      { status: session.status, headers: { "Cache-Control": NOT_FOUND } },
    );
  }
  if (!databaseEnabled || !session.email) {
    // A local workspace keeps its bytes in the browser, so nothing should ask.
    return Response.json(
      { error: "No hosted workspace." },
      { status: 404, headers: { "Cache-Control": NOT_FOUND } },
    );
  }

  const { id } = await context.params;

  /*
   * One workspace, one lookup. Files used to be searched across every project
   * shared with this account as well, which is gone: everything in a workspace
   * is already reachable by everyone in it.
   */
  const mine = await membershipFor(session.email);
  if (!mine) {
    return Response.json(
      { error: "Not found." },
      { status: 404, headers: { "Cache-Control": NOT_FOUND } },
    );
  }

  const [row] = await requireDb()
    .select()
    .from(t.files)
    .where(and(eq(t.files.workspaceId, mine.workspaceId), eq(t.files.id, id)))
    .limit(1);

  if (!row) {
    return Response.json(
      { error: "Not found." },
      { status: 404, headers: { "Cache-Control": NOT_FOUND } },
    );
  }

  /*
   * The bytes, from wherever this row keeps them: most point at a file on the
   * disk beside this app, and a row written before there was one still carries
   * base64.
   *
   * Read and served here rather than handed to the browser as a path it could
   * fetch. Nothing under the store is reachable over HTTP at all, which is what
   * makes the membership check a few lines above the only way in rather than
   * the polite way in.
   */
  const bytes = await load(row);
  if (!bytes) {
    return Response.json(
      { error: "Not found." },
      { status: 404, headers: { "Cache-Control": NOT_FOUND } },
    );
  }

  if (request.nextUrl.searchParams.get("json")) {
    return Response.json(
      {
        id: row.id,
        data: Buffer.from(bytes).toString("base64"),
        text: row.textContent ?? undefined,
      },
      { headers: { "Cache-Control": FOUND } },
    );
  }

  /*
   * Back to what was uploaded, when it is being downloaded rather than shown.
   *
   * A screenshot is kept as lossless WebP because that is a tenth of the room a
   * PNG takes for the same pixels. Every browser renders WebP, so the inline
   * case wants the stored bytes as they are. Somebody saving the file wants
   * back what they put in, and the pixels are identical either way because
   * nothing lossy happened on the way in.
   */
  const wantsFile = request.nextUrl.searchParams.get("download") !== null;
  const served =
    wantsFile && row.originalMediaType
      ? await toOriginalFormat(bytes, row.mediaType, row.originalMediaType)
      : { bytes, mediaType: row.mediaType };

  return new Response(new Uint8Array(served.bytes), {
    headers: {
      "Content-Type": served.mediaType,
      "Content-Length": String(served.bytes.length),
      "Cache-Control": FOUND,
      "Content-Disposition": `${wantsFile ? "attachment" : "inline"}; filename="${encodeURIComponent(row.name)}"`,
      // Never let a stored file be interpreted as something else.
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** The disk if the row points at it, the row itself if it does not. */
async function load(row: {
  storageKey: string;
  data: string;
}): Promise<Buffer | null> {
  if (!row.storageKey) return row.data ? Buffer.from(row.data, "base64") : null;
  return readStoredFile(row.storageKey);
}
