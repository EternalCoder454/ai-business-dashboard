import { eq } from "drizzle-orm";
import { auth, authEnabled } from "@/auth";
import { databaseEnabled, requireDb } from "@/db/client";
import * as t from "@/db/schema";
import { isOperator } from "@/lib/admin";

export const runtime = "nodejs";

/**
 * One screenshot or clip attached to a piece of feedback.
 *
 * Operator only. Feedback is addressed to whoever runs the deployment, so
 * these are read on that screen and nowhere else, and a workspace has no claim
 * on them even though somebody in one sent it.
 *
 * Served here rather than inlined into the listing, so a page of two hundred
 * notes stays a page of two hundred notes and a video is fetched when somebody
 * presses play.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const noStore = { "Cache-Control": "no-store, max-age=0" };

  if (!authEnabled || !databaseEnabled) {
    return Response.json({ error: "Not configured." }, { status: 501, headers: noStore });
  }

  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email || !isOperator(email)) {
    // 404 rather than 403: somebody who should not be here is not told that
    // the thing they guessed at exists.
    return Response.json({ error: "Not found." }, { status: 404, headers: noStore });
  }

  const { id } = await context.params;

  const [row] = await requireDb()
    .select()
    .from(t.feedbackFiles)
    .where(eq(t.feedbackFiles.id, id))
    .limit(1);

  if (!row) {
    return Response.json({ error: "Not found." }, { status: 404, headers: noStore });
  }

  const bytes = Buffer.from(row.data, "base64");

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": row.mediaType,
      "Content-Length": String(bytes.length),
      // Somebody else's screenshot, so a shared cache must never hold it. The
      // bytes never change, so this browser may.
      "Cache-Control": "private, max-age=3600",
      // Nothing here is ever interpreted as anything but what it says it is.
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `inline; filename="${encodeURIComponent(row.name || id)}"`,
    },
  });
}
