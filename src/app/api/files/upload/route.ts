import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { auth, authEnabled } from "@/auth";
import { databaseEnabled } from "@/db/client";
import { membershipFor } from "@/db/tenancy";
import { withinRate } from "@/lib/guard";
import { MAX_UPLOAD_BYTES } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Hands the browser a short lived permission to put one file in the blob store.
 *
 * The bytes go from the browser to the store without passing through here,
 * which is the point. Everything used to arrive as base64 inside a JSON
 * mutation, so a scanned document travelled as a third again its own size
 * through a serverless function with a request body limit measured in single
 * megabytes, and then sat in a Postgres row forever.
 *
 * What this route still does is decide whether the person may upload at all.
 * The token is issued only to somebody signed in and in a workspace, it is
 * limited to the types this app knows how to render, and it carries the
 * workspace it was issued for so the path can be fenced.
 */
export const BLOB_ENABLED = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());

const ALLOWED = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
];

export async function POST(request: Request): Promise<Response> {
  if (!authEnabled || !databaseEnabled || !BLOB_ENABLED()) {
    // No store configured. The client falls back to sending bytes the old way,
    // so a deployment without one keeps working exactly as it did.
    return Response.json({ error: "No blob store on this deployment." }, { status: 501 });
  }

  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return Response.json({ error: "Not signed in." }, { status: 401 });

  const mine = await membershipFor(email);
  if (!mine) return Response.json({ error: "Not found." }, { status: 404 });

  // Uploading is cheap for the person doing it and not for the person paying
  // for the store.
  if (!withinRate(`upload:${email}`, 60, 60_000)) {
    return Response.json({ error: "Too many uploads at once." }, { status: 429 });
  }

  try {
    const body = (await request.json()) as HandleUploadBody;

    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        // Private, so a blob URL on its own opens nothing. Reads are served by
        // this app, which checks the workspace first.
        access: "private" as const,
        allowedContentTypes: ALLOWED,
        maximumSizeInBytes: MAX_UPLOAD_BYTES,
        /*
         * A random suffix on every name.
         *
         * Two people uploading `scan.pdf` must not collide, and a name that can
         * be guessed from the one before it is a name somebody can walk. The
         * workspace is in the path as well, which is for reading a listing
         * rather than for access: what actually keeps one business out of
         * another's files is that every read goes through this app and is
         * checked against the session.
         */
        addRandomSuffix: true,
        pathname: `workspaces/${mine.workspaceId}`,
        tokenPayload: JSON.stringify({ workspaceId: mine.workspaceId }),
      }),
      // Nothing to do. The row is written by the client's own save, in the same
      // mutation as the rest of the attachment, so there is no window where a
      // blob exists and the row that explains it does not.
      onUploadCompleted: async () => {},
    });

    return Response.json(result);
  } catch (error) {
    console.error("[api/files/upload]", error);
    return Response.json({ error: "Could not start that upload." }, { status: 400 });
  }
}
