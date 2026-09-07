/**
 * That making an image smaller never changes it, and never makes it bigger.
 *
 * Both halves are load bearing and neither is obvious from the code.
 *
 * An uploaded image is a record: a contract, an invoice, a screenshot of a bug.
 * Somebody will download it one day and it has to be what they put in, so the
 * pixels are compared rather than trusted. Consumer photo apps do the lossy
 * version of this and restore nothing, which is fine for holiday pictures and
 * not for a business panel.
 *
 * And an optimiser that quietly makes something larger is the kind of thing
 * nobody checks for afterwards, because the feature is called compression and
 * everybody assumes it compressed.
 *
 *   npm run image-test
 */
import sharp from "sharp";
import { optimiseImage, toOriginalFormat } from "../src/lib/optimiseImage";

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures += 1;
}

/**
 * Raw pixels, normalised to four channels before comparing.
 *
 * The alpha channel is why this needs saying. A PNG out of most tools carries
 * one whether or not anything in the image is transparent, and lossless WebP
 * drops it when every pixel is opaque, because it holds no information. The
 * first version of this test compared the raw buffers directly, found 96000
 * bytes against 72000, and reported that the image had changed. It had not: one
 * of them was carrying a fourth channel of solid 255.
 *
 * ensureAlpha puts it back on both sides, so what is compared is the picture
 * rather than the encoder's choice about how to store it.
 */
const pixels = (buf: Buffer) => sharp(buf).ensureAlpha().raw().toBuffer();

void (async () => {
  const screenshot = await sharp(Buffer.from(`<svg width="1200" height="800" xmlns="http://www.w3.org/2000/svg">
    <rect width="1200" height="800" fill="#12161a"/>
    <rect x="40" y="80" width="1120" height="200" rx="16" fill="#1e262d"/>
    ${Array.from({ length: 30 }, (_, i) => `<rect x="${70 + (i % 6) * 180}" y="${110 + Math.floor(i / 6) * 30}" width="120" height="12" fill="#8fa6b2"/>`).join("")}
    <circle cx="1120" cy="40" r="18" fill="#3fb8c9"/>
  </svg>`)).png().toBuffer();

  console.log("\na screenshot gets much smaller and stays identical");
  {
    const out = await optimiseImage(screenshot, "image/png");
    check("it was re-encoded", out.mediaType === "image/webp", out.mediaType);
    check("and it is smaller", out.bytes.length < screenshot.length,
      `${(screenshot.length / 1024).toFixed(0)}KB to ${(out.bytes.length / 1024).toFixed(0)}KB`);
    check("by a margin worth having", screenshot.length / out.bytes.length > 2,
      `${(screenshot.length / out.bytes.length).toFixed(1)}x`);
    check("it remembers what arrived", out.originalMediaType === "image/png");

    // The claim the whole feature rests on.
    const before = await pixels(screenshot);
    const after = await pixels(out.bytes);
    check("every pixel is the same", before.equals(after),
      before.equals(after) ? "" : "THE IMAGE CHANGED");
  }

  console.log("\nand comes back as what was uploaded");
  {
    const out = await optimiseImage(screenshot, "image/png");
    const back = await toOriginalFormat(out.bytes, out.mediaType, out.originalMediaType);
    check("the download is a png again", back.mediaType === "image/png", back.mediaType);
    const before = await pixels(screenshot);
    const after = await pixels(back.bytes);
    check("with the pixels it went in with", before.equals(after));
  }

  console.log("\nand transparency is not quietly flattened");
  {
    /*
     * The counterpart to the note above. Alpha is dropped only when it says
     * nothing; an image that is actually transparent has to keep it, or a logo
     * uploaded for the company mark comes back sitting on a black square.
     */
    const logo = await sharp({
      create: { width: 64, height: 64, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([
        {
          input: Buffer.from(
            `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg"><circle cx="32" cy="32" r="24" fill="#3fb8c9"/></svg>`,
          ),
          top: 0,
          left: 0,
        },
      ])
      .png()
      .toBuffer();

    const out = await optimiseImage(logo, "image/png");
    const after = await sharp(out.bytes).metadata();
    check(
      "a transparent image keeps its alpha channel",
      after.hasAlpha === true,
      `alpha=${after.hasAlpha}`,
    );

    const before = await pixels(logo);
    const now = await pixels(out.bytes);
    check("and the same pixels, transparent corners included", before.equals(now));
  }

  console.log("\na photograph is left alone");
  {
    /*
     * JPEG has already thrown away what makes a photograph expensive, so
     * lossless re-encoding cannot win and reliably loses by several times.
     */
    const w = 900, h = 600;
    const noise = Buffer.alloc(w * h * 3);
    for (let i = 0; i < noise.length; i++) noise[i] = (Math.sin(i / 91) * 90 + 128 + Math.random() * 40) | 0;
    const photo = await sharp(noise, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 92 }).toBuffer();

    const out = await optimiseImage(photo, "image/jpeg");
    check("it is untouched", out.bytes === photo && out.mediaType === "image/jpeg");
    check("and nothing was claimed to be saved", out.savedBytes === 0);
  }

  console.log("\nnothing is ever made larger");
  {
    // A tiny, already well encoded png, which webp usually loses on.
    const tiny = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#123456" } })
      .png({ compressionLevel: 9 }).toBuffer();
    const out = await optimiseImage(tiny, "image/png");
    check("the result is never bigger than the source", out.bytes.length <= tiny.length,
      `${tiny.length}B in, ${out.bytes.length}B out`);
  }

  console.log("\nand a file it cannot read is stored as it arrived");
  {
    const rubbish = Buffer.from("this is not an image at all");
    const out = await optimiseImage(rubbish, "image/png");
    check("returned unchanged rather than thrown", out.bytes.equals(rubbish));
    check("still described as what it claimed to be", out.mediaType === "image/png");
  }

  console.log(failures === 0 ? "\nall checks passed" : `\n${failures} FAILURES ABOVE`);
  process.exit(failures === 0 ? 0 : 1);
})();
