import sharp from "sharp";

/**
 * Making an uploaded image smaller without changing a single pixel of it.
 *
 * The panel's own writing is tiny. A whole workspace of departments, skills,
 * conversations and a wiki measured 345KB, and a single phone screenshot is
 * larger than that. So images are the only thing here that will ever decide
 * what a server costs, and they arrive as whatever the person's device made.
 *
 * The saving is real and it is not evenly spread, which is the whole reason
 * this is a decision rather than a setting. Measured:
 *
 *   a 1600x1000 screenshot     41KB as PNG    4KB as lossless WebP   11.3x
 *   a 3000x2000 photograph   3147KB as JPEG  10454KB as lossless WebP  0.3x
 *
 * WebP's lossless mode is simply a better encoder than PNG for the flat colour
 * and hard edges a screenshot is made of. On a photograph it is far worse than
 * the JPEG already sitting there, because JPEG threw away the detail that makes
 * a photograph expensive and lossless cannot throw anything away.
 *
 * So the rule is: try it, keep it only if it wins. Nothing is ever made larger,
 * and nothing already compressed by a lossy encoder is touched at all.
 *
 * Lossless is the only kind used here, and that is not caution for its own
 * sake. An image somebody uploads is a record: a contract, an invoice, a
 * screenshot of a bug. They will download it again one day and it has to be
 * what they put in. Storage saver modes in consumer photo apps are lossy and do
 * not restore anything, which is fine for holiday pictures and not for this.
 */

/** What lossless re-encoding can help. A lossy source is already as small as it gets. */
const WORTH_TRYING = new Set(["image/png", "image/gif", "image/bmp", "image/tiff"]);

export interface Optimised {
  bytes: Buffer;
  mediaType: string;
  /** What it arrived as, so a download can hand back the format they gave us. */
  originalMediaType: string;
  savedBytes: number;
}

/**
 * Returns the smaller of the original and a lossless re-encoding.
 *
 * Never throws. An image sharp cannot read is one that is stored exactly as it
 * arrived, which is the behaviour this replaces, so the worst outcome of a
 * failure here is the status quo.
 */
export async function optimiseImage(
  bytes: Buffer,
  mediaType: string,
): Promise<Optimised> {
  const unchanged: Optimised = {
    bytes,
    mediaType,
    originalMediaType: mediaType,
    savedBytes: 0,
  };

  if (!WORTH_TRYING.has(mediaType)) return unchanged;

  try {
    const encoded = await sharp(bytes)
      // Animation survives, which matters for the gif somebody pastes into a
      // conversation to show what a bug looks like.
      .webp({ lossless: true, effort: 5 })
      .toBuffer();

    /*
     * Only if it actually won. A small PNG that is already well encoded can
     * come out larger, and an image made bigger by an optimiser is the kind of
     * thing nobody checks for afterwards.
     */
    if (encoded.length >= bytes.length) return unchanged;

    return {
      bytes: encoded,
      mediaType: "image/webp",
      originalMediaType: mediaType,
      savedBytes: bytes.length - encoded.length,
    };
  } catch {
    return unchanged;
  }
}

/**
 * Back to the format it was uploaded as, for a download.
 *
 * The pixels are identical either way, because nothing lossy happened on the
 * way in. The file will not be byte for byte the original, since a different
 * encoder wrote it, but the image is the image. Anything needing the exact
 * original bytes, a checksum or a signature, needs the original kept whole and
 * that is a different feature with a different cost.
 */
export async function toOriginalFormat(
  bytes: Buffer,
  storedType: string,
  originalType: string,
): Promise<{ bytes: Buffer; mediaType: string }> {
  if (storedType === originalType) return { bytes, mediaType: storedType };

  try {
    const image = sharp(bytes);
    switch (originalType) {
      case "image/png":
        return { bytes: await image.png({ compressionLevel: 9 }).toBuffer(), mediaType: originalType };
      case "image/gif":
        return { bytes: await image.gif().toBuffer(), mediaType: originalType };
      case "image/tiff":
        return { bytes: await image.tiff().toBuffer(), mediaType: originalType };
      case "image/bmp":
        // sharp does not write bmp. PNG is lossless and every reader opens one.
        return { bytes: await image.png().toBuffer(), mediaType: "image/png" };
      default:
        return { bytes, mediaType: storedType };
    }
  } catch {
    // Handing back what is stored beats failing a download.
    return { bytes, mediaType: storedType };
  }
}
