import type { Attachment } from "./types";

export const ACCEPTED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];

/** Anthropic resizes anything larger, so sending more than this is wasted upload. */
const MAX_EDGE = 1568;

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
    };
  }

  const image = await loadImage(dataUrl);
  const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  // No resize needed, so keep the original bytes rather than re-encoding them.
  if (scale === 1 && file.type !== "image/webp") {
    return {
      id: `att_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      kind: "image",
      mediaType: file.type,
      name: file.name || "pasted image",
      data: dataUrl.slice(dataUrl.indexOf(",") + 1),
      width,
      height,
    };
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new AttachmentError("This browser could not process the image.");
  context.drawImage(image, 0, 0, width, height);

  // PNG for anything that might carry transparency or flat colour, which
  // covers pixel art and UI screenshots. JPEG only for photographs.
  const asPng = file.type !== "image/jpeg";
  const encoded = canvas.toDataURL(asPng ? "image/png" : "image/jpeg", asPng ? undefined : 0.9);

  return {
    id: `att_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    kind: "image",
    mediaType: asPng ? "image/png" : "image/jpeg",
    name: file.name || "pasted image",
    data: encoded.slice(encoded.indexOf(",") + 1),
    width,
    height,
  };
}

/** For rendering a stored attachment back into an <img>. */
export function attachmentSrc(attachment: Attachment): string {
  return `data:${attachment.mediaType};base64,${attachment.data}`;
}

/** Rough byte size of the stored base64, for the size hint in the UI. */
export function attachmentBytes(attachment: Attachment): number {
  return Math.round((attachment.data.length * 3) / 4);
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

  // JPEG throughout: a face or a logo at 256px gains nothing from PNG and the
  // row is a third of the size.
  return canvas.toDataURL("image/jpeg", 0.85);
}
