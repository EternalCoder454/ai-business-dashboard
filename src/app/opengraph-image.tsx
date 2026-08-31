import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Eterneon";

/**
 * The card Discord, Slack, and iMessage show when the link is pasted.
 *
 * Everything on this site redirects an unauthenticated request to the sign-in
 * page, and a link preview crawler is unauthenticated by definition, so this is
 * the only thing anyone sees before signing in. It therefore says what the site
 * is and nothing about what is inside it.
 */
export default function OpenGraphImage() {
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
          background: "#1a1c1e",
          color: "#e3e2e6",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 104,
            height: 104,
            borderRadius: 28,
            background: "#004f58",
            color: "#97f0ff",
            fontSize: 44,
            fontWeight: 600,
            letterSpacing: -2,
          }}
        >
          HQ
        </div>

        <div style={{ display: "flex", fontSize: 86, fontWeight: 600, letterSpacing: -3, marginTop: 40 }}>
          Eterneon
        </div>

        <div style={{ display: "flex", fontSize: 34, color: "#c3c7c9", marginTop: 16 }}>
          Internal operations workspace
        </div>

        <div style={{ display: "flex", fontSize: 26, color: "#8b9296", marginTop: 44 }}>
          Sign in required
        </div>
      </div>
    ),
    size,
  );
}
