import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

/** Generated at build time, so the app ships no binary icon assets. */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#004f58",
          color: "#97f0ff",
          fontSize: 220,
          fontWeight: 600,
          letterSpacing: -8,
        }}
      >
        HQ
      </div>
    ),
    size,
  );
}
