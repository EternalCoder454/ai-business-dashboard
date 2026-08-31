/**
 * The canonical origin, derived rather than hardcoded.
 *
 * The explicit variable comes first because the platform one can resolve to a
 * preview deployment, which would put the wrong host in every absolute URL the
 * app emits. Production is business.eterneon.net; eterneon.net itself is the
 * portfolio and is a different site.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const platform = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (platform) return `https://${platform}`;

  return "http://localhost:3000";
}
