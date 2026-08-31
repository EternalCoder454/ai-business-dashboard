import type { MetadataRoute } from "next";

/**
 * Nothing here is for the public, including the sign-in page.
 *
 * A crawler cannot get past the allowlist anyway, but an indexed sign-in page
 * advertises that this deployment exists and which addresses it belongs to,
 * which is a free head start for anyone deciding what to target.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
