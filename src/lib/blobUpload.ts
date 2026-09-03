"use client";

import { upload } from "@vercel/blob/client";
import type { Attachment } from "./types";

/**
 * Moves one attachment's bytes out of the row and into the blob store.
 *
 * Called at the moment something is saved rather than the moment it is picked,
 * so a file attached to a message and then removed before sending never reaches
 * the store at all. Uploading on pick would have been one line in one place and
 * would have left a paid-for orphan behind every time somebody changed their
 * mind.
 *
 * Falls back to leaving the bytes where they are. A deployment with no blob
 * store, a store that refuses, a network that drops: in every case the
 * attachment is returned exactly as it arrived and is saved the old way. This
 * is the whole reason the `data` column stays. A file that saves slowly and
 * bloats a table is worse than one that does not; a file that fails to save at
 * all because the store was unreachable is worse than both.
 */
export async function toBlob(attachment: Attachment): Promise<Attachment> {
  // Nothing to move. Documents are extracted to text and never had bytes, and
  // anything already carrying a URL has been through here.
  if (!attachment.data || attachment.blobUrl) return attachment;

  try {
    const bytes = Uint8Array.from(atob(attachment.data), (c) => c.charCodeAt(0));
    const file = new File([bytes], attachment.name || "file", {
      type: attachment.mediaType,
    });

    const result = await upload(attachment.name || "file", file, {
      // The store is private, so nothing here is readable by URL alone. That
      // is the whole reason this can hold somebody's scanned tax return: a
      // link that leaks is not a file that leaks.
      access: "private",
      handleUploadUrl: "/api/files/upload",
      contentType: attachment.mediaType,
    });

    // The bytes are dropped from the row now that they are somewhere else.
    return { ...attachment, blobUrl: result.url, data: "" };
  } catch (error) {
    console.warn("[blob] keeping the bytes in the row", error);
    return attachment;
  }
}

/** The same, for a handful at once. */
export async function allToBlob(attachments: Attachment[]): Promise<Attachment[]> {
  if (attachments.length === 0) return attachments;
  return Promise.all(attachments.map((one) => toBlob(one)));
}
