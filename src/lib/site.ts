/**
 * The canonical origin, from the deployment rather than hardcoded.
 *
 * One variable and a local fallback. There used to be a platform one in
 * between, read from Vercel, and it was worth removing along with the platform:
 * it resolved to a per deployment hostname on previews, which put a host Google
 * has never heard of into the redirect URI and broke sign in on branches while
 * looking correct in production.
 *
 * Production is business.eterneon.net; eterneon.net itself is the portfolio and
 * is a different site.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  return "http://localhost:3000";
}
