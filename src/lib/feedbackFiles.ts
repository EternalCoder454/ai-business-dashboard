/**
 * What may be attached to a piece of feedback, and how much of it.
 *
 * Pictures and clips only. A bug report is "here is what I saw", and a
 * screenshot or ten seconds of screen recording says it better than a
 * paragraph. Documents are not that: a .docx attached to a support note is
 * either the wrong channel or a file that belongs in the Library, and every
 * format accepted is one more thing the operator screen has to know how to
 * open.
 *
 * The caps are small on purpose. This travels as base64 inside one JSON
 * request, which is a third larger again than the bytes, and it lands in a
 * serverless function with a request limit of its own.
 */

export const FEEDBACK_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
] as const;

export const MAX_FEEDBACK_FILES = 5;

/** Per file. A screenshot is well under this; a short clip fits. */
export const MAX_FEEDBACK_FILE_BYTES = 10 * 1024 * 1024;

/**
 * Across all of them.
 *
 * Five files at the per file limit would be fifty megabytes, which is sixty
 * seven as base64 and more than the request is allowed to be, so the total is
 * the limit that actually bites.
 */
export const MAX_FEEDBACK_TOTAL_BYTES = 15 * 1024 * 1024;

export function isFeedbackType(type: string): boolean {
  return (FEEDBACK_TYPES as readonly string[]).includes(type);
}

export function isVideo(type: string): boolean {
  return type.startsWith("video/");
}

/** What the file picker offers, so the wrong kind is hard to choose. */
export const FEEDBACK_ACCEPT = FEEDBACK_TYPES.join(",");

/** Human sizes, for the one place this says why something was refused. */
export function readableSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface FeedbackAttachment {
  name: string;
  mediaType: string;
  size: number;
  /** base64 without the data URL prefix. */
  data: string;
}

/**
 * Whether a set of attachments may be sent.
 *
 * Shared by the dialog and the route, so the message somebody reads and the
 * rule that is enforced are the same rule. The route is the one that matters;
 * the dialog only saves them the round trip.
 */
export function checkAttachments(files: FeedbackAttachment[]): string | null {
  if (files.length > MAX_FEEDBACK_FILES) {
    return `Up to ${MAX_FEEDBACK_FILES} files.`;
  }
  for (const file of files) {
    if (!isFeedbackType(file.mediaType)) {
      return `${file.name || "That file"} is not a picture or a video.`;
    }
    if (file.size > MAX_FEEDBACK_FILE_BYTES) {
      return `${file.name || "That file"} is over ${readableSize(MAX_FEEDBACK_FILE_BYTES)}.`;
    }
  }
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total > MAX_FEEDBACK_TOTAL_BYTES) {
    return `Those come to ${readableSize(total)}, over the ${readableSize(
      MAX_FEEDBACK_TOTAL_BYTES,
    )} limit.`;
  }
  return null;
}
