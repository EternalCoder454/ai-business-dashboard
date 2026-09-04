import { ImageResponse } from "next/og";
import { loadBranding } from "@/lib/branding";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "AI department heads for a small business";

/**
 * Read at request time rather than baked at build time, since the branding it
 * shows is edited in Settings and lives in the database.
 */
export const dynamic = "force-dynamic";

/**
 * The card Discord, Slack, and iMessage show when the link is pasted.
 *
 * Everything on this site redirects an unauthenticated request to the sign-in
 * page, and a crawler is unauthenticated, so this is the only thing anyone sees
 * before signing in. It therefore says what the site is and nothing about what
 * is inside it.
 */
export default async function OpenGraphImage() {
  const { name, mark, logo } = await loadBranding();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 96px",
          background: "#171a1c",
          color: "#e7e8e9",
        }}
      >
        {logo ? (
          // Stored as a data URL, already downsized on upload.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logo}
            alt=""
            width={104}
            height={104}
            style={{ width: 104, height: 104, borderRadius: 28, objectFit: "cover" }}
          />
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 104,
              height: 104,
              borderRadius: 28,
              background: "#1d525d",
              color: "#c2ecf5",
              fontSize: 44,
              fontWeight: 600,
              letterSpacing: -2,
            }}
          >
            {mark}
          </div>
        )}

        <div
          style={{
            display: "flex",
            fontSize: 86,
            fontWeight: 600,
            letterSpacing: -3,
            marginTop: 40,
          }}
        >
          {name}
        </div>

        <div style={{ display: "flex", fontSize: 34, color: "#c0c5c9", marginTop: 16 }}>
          AI department heads for a small business
        </div>

        <div style={{ display: "flex", fontSize: 26, color: "#89929a", marginTop: 44 }}>
          Sign in required
        </div>
      </div>
    ),
    size,
  );
}
