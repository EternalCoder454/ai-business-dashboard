import { loadBranding } from "@/lib/branding";
import type { MetadataRoute } from "next";

/**
 * Installable as a standalone app. This is an internal tool, so the point of
 * the manifest is not discovery, it is getting rid of browser chrome and
 * letting it sit on a home screen like any other work app.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const { name } = await loadBranding();
  return {
    name,
    short_name: name,
    description: "Internal operations workspace.",
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
      { name: "Chief of Staff", short_name: "Staff", url: "/ceo" },
      { name: "Ask Everyone", short_name: "Everyone", url: "/all-hands" },
      { name: "Tasks", short_name: "Tasks", url: "/tasks" },
      { name: "Deliverables", short_name: "Output", url: "/deliverables" },
    ],
  };
}
