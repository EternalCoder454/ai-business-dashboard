import { auth, authEnabled } from "@/auth";
import { databaseEnabled } from "@/db/client";
import { storageUsage } from "@/db/storage";
import { membershipFor } from "@/db/tenancy";
import { fileStoreEnabled, putFile } from "@/lib/fileStore";
import { formatBytes } from "@/lib/files";
import { withinRate } from "@/lib/rateLimit";
import { MAX_UPLOAD_BYTES } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Takes one file and puts it where files go.
 *
 * The bytes used to travel from the browser straight to Vercel Blob, and this
 * route only handed out a token to do it with. Off that platform there is
 * nowhere to send them but here, which costs a hop and buys two things worth
 * more than it: the file is checked before it exists rather than after, and the
 * room a workspace has left can actually be enforced, which is not possible
 * from the side of a transfer that is not in it.
 *
 * What it will not do is let bytes in without knowing whose they are. The
 * upload is refused unless somebody is signed in and in a workspace, the type
 * is one this app knows how to render, and there is room for it.
 */

/** Whether this deployment has anywhere to put a file. */
export const UPLOADS_ENABLED = fileStoreEnabled;

const ALLOWED = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
];

export async function POST(request: Request): Promise<Response> {
  if (!authEnabled || !databaseEnabled || !UPLOADS_ENABLED()) {
    // Nowhere to put it. The client falls back to sending bytes the old way,
    // so a checkout with no volume keeps working exactly as it did.
    return Response.json({ error: "No file storage on this deployment." }, { status: 501 });
  }

  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return Response.json({ error: "Not signed in." }, { status: 401 });

  const mine = await membershipFor(email);
  if (!mine) return Response.json({ error: "Not found." }, { status: 404 });

  // Uploading is cheap for the person doing it and not for the machine holding
  // it, and every one of these now occupies a request for as long as it takes.
  if (!(await withinRate(`upload:${email}`, 60, 60_000))) {
    return Response.json({ error: "Too many uploads at once." }, { status: 429 });
  }

  let file: File;
  try {
    const form = await request.formData();
    const found = form.get("file");
    if (!(found instanceof File)) {
      return Response.json({ error: "No file in that request." }, { status: 400 });
    }
    file = found;
  } catch (error) {
    console.error("[api/files/upload] unreadable body", error);
    return Response.json({ error: "Could not read that upload." }, { status: 400 });
  }

  if (!ALLOWED.includes(file.type)) {
    return Response.json({ error: "That kind of file is not accepted." }, { status: 415 });
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return Response.json(
      { error: `Files go up to ${formatBytes(MAX_UPLOAD_BYTES)}.` },
      { status: 413 },
    );
  }

  /*
   * Room, checked before the bytes are read rather than after they are written.
   *
   * Counted against everything the workspace holds and not only its files,
   * because that is what the Storage card on the dashboard shows and two
   * different answers to how full something is would be worse than either.
   *
   * There is a race in here and it is the right one to accept: two uploads
   * starting together both read the same figure and both proceed, so a
   * workspace can end up a few megabytes over. Locking to close that would
   * serialise every upload in the deployment to protect a limit whose whole
   * purpose is to stop somebody storing a hundred gigabytes.
   */
  let room: { used: number; limit: number };
  try {
    room = await storageUsage(mine.workspaceId);
  } catch (error) {
    console.error("[api/files/upload] could not read storage", error);
    return Response.json({ error: "Could not check your storage." }, { status: 500 });
  }

  if (room.used + file.size > room.limit) {
    return Response.json(
      {
        error: `This workspace has used ${formatBytes(room.used)} of its ${formatBytes(
          room.limit,
        )}. Delete something, or ask for more room.`,
      },
      { status: 507 },
    );
  }

  try {
    const key = await putFile({
      workspaceId: mine.workspaceId,
      mediaType: file.type,
      bytes: Buffer.from(await file.arrayBuffer()),
    });

    if (!key) {
      return Response.json({ error: "Could not store that file." }, { status: 500 });
    }

    /*
     * Nothing else to do. The row is written by the client's own save, in the
     * same mutation as the rest of the attachment, so there is no window where
     * a file exists and the row that explains it does not. The other way round
     * happens and is handled: a row whose bytes are missing reads as a file
     * with nothing in it rather than an error.
     */
    return Response.json({ key });
  } catch (error) {
    console.error("[api/files/upload]", error);
    return Response.json({ error: "Could not store that file." }, { status: 500 });
  }
}
