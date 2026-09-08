"use client";

import { AttachmentError } from "./images";
import type { Attachment } from "./types";

/**
 * Moves one attachment's bytes out of the row and onto the server's disk.
 *
 * Called at the moment something is saved rather than the moment it is picked,
 * so a file attached to a message and then removed before sending never reaches
 * the disk at all. Uploading on pick would have been one line in one place and
 * would have left an orphan behind every time somebody changed their mind.
 *
 * The bytes used to go straight from the browser to Vercel Blob, with this app
 * only handing out a token. Off that platform there is no store to upload to,
 * so they come through the app, which is also what lets it count them: a limit
 * cannot be enforced by the side of the transfer that is not in it.
 *
 * Two kinds of failure, deliberately handled differently. A network that drops
 * or a server that errors falls back to leaving the bytes in the row, which is
 * why the `data` column still exists: a file that saves clumsily is better than
 * one that does not save. Being out of room is not that, and falling back there
 * would put the bytes in the database instead, which is the same room by
 * another name. So it is raised, and the screen says so.
 */
export async function toStore(attachment: Attachment): Promise<Attachment> {
  // Nothing to move. Documents are extracted to text and never had bytes, and
  // anything already carrying a key has been through here.
  if (!attachment.data || attachment.storageKey) return attachment;

  const bytes = Uint8Array.from(atob(attachment.data), (c) => c.charCodeAt(0));
  const file = new File([bytes], attachment.name || "file", {
    type: attachment.mediaType,
  });

  let response: Response;
  try {
    const form = new FormData();
    form.append("file", file);
    response = await fetch("/api/files/upload", { method: "POST", body: form });
  } catch (error) {
    console.warn("[files] keeping the bytes in the row", error);
    return attachment;
  }

  // 507 is out of room and 413 is one file that is too big. Both are answers
  // rather than faults, and both have to reach the person who chose the file.
  if (response.status === 507 || response.status === 413) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new AttachmentError(body?.error ?? "There is no room for that file.");
  }

  if (!response.ok) {
    console.warn("[files] the server refused the upload", response.status);
    return attachment;
  }

  const body = (await response.json().catch(() => null)) as { key?: string } | null;
  if (!body?.key) return attachment;

  // The bytes are dropped from the row now that they are somewhere else.
  return { ...attachment, storageKey: body.key, data: "" };
}

/**
 * The same, for a handful at once.
 *
 * One at a time rather than all together. They go through the app now instead
 * of straight to a store, so five files at once is five uploads competing for
 * one server's attention, and the count against the workspace's room is read
 * per request: sending them in parallel is how two uploads both read the same
 * figure and both decide there is space for one more.
 */
export async function allToStore(attachments: Attachment[]): Promise<Attachment[]> {
  if (attachments.length === 0) return attachments;

  const done: Attachment[] = [];
  for (const one of attachments) done.push(await toStore(one));
  return done;
}
