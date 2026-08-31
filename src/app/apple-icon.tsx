import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** iOS ignores the manifest icons when adding to the home screen. */
export default function AppleIcon() {
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
          fontSize: 76,
          fontWeight: 600,
        }}
      >
        HQ
      </div>
    ),
    size,
  );
}
