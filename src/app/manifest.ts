import type { MetadataRoute } from "next";

/**
 * Installable as a standalone app. This is an internal tool, so the point of
 * the manifest is not discovery, it is getting rid of browser chrome and
 * letting it sit on a home screen like any other work app.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Eterneon",
    short_name: "Eterneon",
    description: "A personal AI operating system for running Eterneon Studio.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#1a1c1e",
    theme_color: "#1a1c1e",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "CEO Office", short_name: "CEO", url: "/ceo" },
      { name: "All Hands", short_name: "Room", url: "/all-hands" },
      { name: "Deliverables", short_name: "Output", url: "/deliverables" },
    ],
  };
}
