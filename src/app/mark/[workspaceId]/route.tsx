import { ImageResponse } from "next/og";
import { eq } from "drizzle-orm";
import { databaseEnabled, db } from "@/db/client";
import * as t from "@/db/schema";
import { markFor } from "@/db/tenancy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One business's mark, as a PNG anybody can fetch.
 *
 * This exists for email. A logo set in Appearance is stored as a data URL, and
 * a data URL in an `img` tag is stripped by Gmail and most other clients, so
 * putting the stored value straight into a message renders a broken image:
 * worse than the letters it replaced. A mail client will fetch an https URL
 * like any other remote image, so the logo is re-served as a real file here.
 *
 * Unauthenticated on purpose, because the thing fetching it is a mail client
 * with no session and no way to get one. Three things keep that reasonable: a
 * workspace id is random rather than sequential, so this is not a list anybody
 * can walk; the only thing behind it is a company's own logo, which is the
 * least private thing a business owns; and an id matching nothing returns the
 * same generic mark as one that does, so this cannot be used to ask whether a
 * particular business is here.
 */

/** The primary container pair, matching app/icon.tsx and the panel's sidebar. */
const GROUND = "#1d525d";
const INK = "#c2ecf5";

/** Big enough for a retina inbox, small enough to arrive instantly. */
const EDGE = 128;

/**
 * Cached hard, and deliberately.
 *
 * A message already sent was never going to pick up a logo changed afterwards.
 * What this buys is that a mail client's image proxy, which fetches on behalf
 * of every reader, fetches once rather than on every open.
 */
const CACHE = "public, max-age=86400, s-maxage=86400";

function drawn(text: string): Response {
  const response = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: GROUND,
          color: INK,
          fontSize: Math.round(EDGE * 0.42),
          fontWeight: 600,
          letterSpacing: 1,
        }}
      >
        {text}
      </div>
    ),
    { width: EDGE, height: EDGE },
  );
  response.headers.set("Cache-Control", CACHE);
  return response;
}

/**
 * The stored logo as a PNG, or null if it cannot be made into one.
 *
 * PNG rather than whatever was uploaded, because the uploader prefers WebP and
 * Outlook on Windows renders through Word, which has never supported it. Left
 * as stored, a logo would look right in Gmail and be a broken image icon for a
 * good share of the business world.
 *
 * Sharp is what Next already uses to optimise images, so this adds no new
 * machinery, but it is declared as a dependency rather than borrowed from
 * Next's own tree: something a build could quietly drop is not something to
 * rest an outgoing email on.
 */
async function asPng(dataUrl: string): Promise<Buffer | null> {
  const match = /^data:image\/([a-z+]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!match) return null;

  try {
    const bytes = Buffer.from(match[2], "base64");
    if (bytes.length === 0 || bytes.length > 2_000_000) return null;

    const sharp = (await import("sharp")).default;
    return await sharp(bytes)
      .resize(EDGE, EDGE, { fit: "contain", background: "#ffffff" })
      /*
       * Flattened onto white rather than left transparent.
       *
       * Most logos are drawn for a light background, and a transparent one in
       * an email lands on whatever the client decides: white in Gmail, near
       * black in a dark themed reader, where a dark logo disappears entirely.
       * Choosing white makes it the same everywhere and matches the tile the
       * message puts it on. Contain rather than cover for the same reason: a
       * wide logo should be letterboxed, not have its ends cropped off.
       */
      .flatten({ background: "#ffffff" })
      .png({ compressionLevel: 9 })
      .toBuffer();
  } catch {
    // A logo that will not decode is a logo we do not send. The caller falls
    // back to the letters, which is what the message looked like before.
    return null;
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;

  if (!databaseEnabled || !db) return drawn("?");

  try {
    const [row] = await db
      .select({
        logo: t.settings.companyLogoUrl,
        mark: t.settings.companyMark,
        name: t.settings.companyName,
      })
      .from(t.settings)
      .where(eq(t.settings.workspaceId, workspaceId))
      .limit(1);

    // The same answer for a business that is not here and one that has never
    // opened its settings, so neither can be told apart from outside.
    if (!row) return drawn("?");

    const logo = row.logo?.trim();
    if (logo) {
      const png = await asPng(logo);
      if (png) {
        return new Response(new Uint8Array(png), {
          headers: { "Content-Type": "image/png", "Cache-Control": CACHE },
        });
      }
    }

    return drawn((row.mark?.trim() || markFor(row.name ?? "")).slice(0, 2).toUpperCase() || "?");
  } catch {
    // A mark is not worth failing an invitation over.
    return drawn("?");
  }
}
