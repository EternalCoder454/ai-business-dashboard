import { ImageResponse } from "next/og";
import { loadBranding } from "@/lib/branding";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/**
 * Rendered per request rather than baked at build time, so the icon follows
 * the logo set in Settings instead of shipping whatever was there at deploy.
 */
export const dynamic = "force-dynamic";

export default async function AppleIcon() {
  const { mark, logo } = await loadBranding();

  if (logo) {
    return new ImageResponse(
      (
        // Stored as a data URL, already downsized on upload.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logo}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ),
      size,
    );
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1d525d",
          color: "#c2ecf5",
          fontSize: 76,
          fontWeight: 600,
          letterSpacing: -8,
        }}
      >
        {mark}
      </div>
    ),
    size,
  );
}
