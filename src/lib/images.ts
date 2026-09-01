import type { Attachment } from "./types";

export const ACCEPTED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];

/** Anthropic resizes anything larger, so sending more than this is wasted upload. */
const MAX_EDGE = 1568;

/**
 * Quality for the stored copy.
 *
 * 0.92 in WebP is visually indistinguishable from the source on screenshots
 * and photographs alike, and a good deal smaller than either PNG or JPEG at
 * comparable quality. Measured on a 1568x900 interface screenshot: 277 KB as
 * PNG, 99 KB as WebP. On a photograph: 3,500 KB against 458 KB.
 */
const QUALITY = 0.92;

/**
 * WebP where the browser can write it, PNG where it cannot.
 *
 * Every provider this app talks to accepts WebP, so the only question is
 * whether the browser encodes it. Safari has since 14 and everything else for
 * longer, but a canvas asked for a type it does not know silently returns a
 * PNG, so the answer is read back rather than assumed.
 */
let encoder: "image/webp" | "image/png" | undefined;

function bestEncoder(): "image/webp" | "image/png" {
  if (encoder) return encoder;
  const probe = document.createElement("canvas");
  probe.width = 1;
  probe.height = 1;
  encoder = probe.toDataURL("image/webp").startsWith("data:image/webp")
    ? "image/webp"
    : "image/png";
  return encoder;
}

/** Guard against someone dropping a 40MB PSD export into the composer. */
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

export const MAX_ATTACHMENTS_PER_MESSAGE = 5;

export class AttachmentError extends Error {}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("That file is not a readable image."));
    image.src = src;
  });
}

/**
 * Turns a picked, pasted, or dropped file into something sendable.
 *
 * Downscaling happens here rather than at send time for two reasons: the API
 * resizes anything over 1568px on the long edge anyway, and the stored copy
 * would otherwise sit in IndexedDB at full camera resolution forever.
 *
 * Animated GIFs are passed through untouched, because drawing one to a canvas
 * would flatten it to its first frame.
 */
export async function fileToAttachment(file: File): Promise<Attachment> {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    throw new AttachmentError(
      `${file.name || "That file"} is a ${file.type || "unknown type"}. Images only for now: PNG, JPEG, WebP, or GIF.`,
    );
  }

  if (file.size > MAX_SOURCE_BYTES) {
    throw new AttachmentError(
      `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)}MB. Keep it under 20MB.`,
    );
  }

  const dataUrl = await readAsDataUrl(file);

  if (file.type === "image/gif") {
    return {
      id: `att_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      kind: "image",
      mediaType: file.type,
      name: file.name || "pasted.gif",
      data: dataUrl.slice(dataUrl.indexOf(",") + 1),
      width: 0,
      height: 0,
      size: file.size,
    };
  }

  const image = await loadImage(dataUrl);
  const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new AttachmentError("This browser could not process the image.");
  context.drawImage(image, 0, 0, width, height);

  /**
   * Re-encoded even when nothing needed resizing.
   *
   * Skipping that used to pass a 600x400 PNG straight through at 91 KB where
   * WebP writes the same picture at 51 KB, and every copy of it is then stored,
   * synced, and re-sent for as long as the workspace exists.
   */
  const type = bestEncoder();
  const encoded = canvas.toDataURL(type, QUALITY);
  const rewritten = encoded.slice(encoded.indexOf(",") + 1);
  const original = dataUrl.slice(dataUrl.indexOf(",") + 1);

  // An already-optimised source can beat what a canvas writes, so whichever is
  // smaller wins rather than assuming the re-encode is an improvement.
  const useOriginal = scale === 1 && original.length <= rewritten.length;

  const data = useOriginal ? original : rewritten;

  return {
    id: `att_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    kind: "image",
    mediaType: useOriginal ? file.type : type,
    name: file.name || "pasted image",
    data,
    width,
    height,
    // Recorded rather than derived later. A hosted workspace does not carry the
    // bytes in its snapshot, so anything measuring them there measures nothing,
    // and every image in the Library read as 0 B.
    size: base64Bytes(data),
  };
}

/** Decoded length of a base64 string, without decoding it. */
function base64Bytes(data: string): number {
  const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((data.length * 3) / 4) - padding);
}

/** For rendering a stored attachment back into an <img>. */
/**
 * Where to point an <img> or an <embed> at.
 *
 * A local workspace holds the bytes already, so a data URL costs nothing. A
 * hosted one does not, and a URL lets the browser fetch and cache the file
 * itself rather than every file riding in on every page load.
 */
export function attachmentSrc(attachment: Attachment): string {
  if (attachment.data) return `data:${attachment.mediaType};base64,${attachment.data}`;
  return `/api/files/${encodeURIComponent(attachment.id)}`;
}

/** Rough byte size of the stored base64, for the size hint in the UI. */
export function attachmentBytes(attachment: Attachment): number {
  // The stored size, since the bytes themselves are usually not here.
  if (typeof attachment.size === "number" && attachment.size > 0) return attachment.size;
  return attachment.data ? Math.round((attachment.data.length * 3) / 4) : 0;
}

/**
 * Anthropic prices an image by its dimensions, at about width times height
 * divided by 750. Useful for warning before a send rather than after the bill.
 */
export function estimateImageTokens(attachment: Attachment): number {
  if (!attachment.width || !attachment.height) return 1600;
  return Math.round((attachment.width * attachment.height) / 750);
}

/** Avatars are shown at 56px at most, so anything larger is stored for nothing. */
const AVATAR_EDGE = 256;

/**
 * Crops a picked file to a centred square and returns it as a data URL.
 *
 * Cropping here rather than with CSS keeps the stored row small and means every
 * avatar is the same shape wherever it is rendered, so callers never have to
 * think about aspect ratio.
 */
export async function fileToAvatar(file: File): Promise<string> {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    throw new AttachmentError("Pick a PNG, JPEG, WebP, or GIF.");
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new AttachmentError(`${file.name} is too large. Keep it under 20MB.`);
  }

  const image = await loadImage(await readAsDataUrl(file));
  const edge = Math.min(image.width, image.height);

  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_EDGE;
  canvas.height = AVATAR_EDGE;
  const context = canvas.getContext("2d");
  if (!context) throw new AttachmentError("This browser could not process the image.");

  context.drawImage(
    image,
    (image.width - edge) / 2,
    (image.height - edge) / 2,
    edge,
    edge,
    0,
    0,
    AVATAR_EDGE,
    AVATAR_EDGE,
  );

  // WebP where it is available: smaller than the JPEG this used to write, and
  // at a higher quality setting rather than a lower one. A logo with flat
  // colour suffered visibly at JPEG 0.85; it does not at WebP 0.92.
  return canvas.toDataURL(bestEncoder(), QUALITY);
}
