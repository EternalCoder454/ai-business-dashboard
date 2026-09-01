import { ALLOWED_EMAILS, parseEmailList } from "@/auth";

/**
 * Who can review other people's work.
 *
 * Separate from the allowlist on purpose: being allowed in and being allowed to
 * read everyone else are different permissions, and collapsing them would make
 * every new colleague an administrator the moment they were added.
 *
 * Defaults to the first address on the allowlist, which on a single-person
 * deployment is the owner and on a larger one is whoever set it up.
 */
export const ADMIN_EMAILS = parseEmailList(process.env.ADMIN_EMAILS, ALLOWED_EMAILS[0] ?? "");

/**
 * The one account the workspace belongs to: the first administrator.
 *
 * Distinct from being an administrator, because some things are the owner's
 * alone and adding a second administrator should not hand them over.
 */
export function isOwnerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS[0] === email.trim().toLowerCase();
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

/**
 * Administrator by environment or by grant.
 *
 * ADMIN_EMAILS is still the deployment's own answer and is checked first, so
 * the owner never waits on a query and never loses admin because a row is
 * wrong. Anything granted in the access table is added to that, which is what
 * lets a second administrator be appointed without a redeploy.
 *
 * Async, and therefore only usable from a route or a server component. The
 * synchronous `isAdminEmail` above stays for the environment-only checks.
 */
export async function isAdminAccount(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  if (isAdminEmail(email)) return true;
  const { isAdminInDatabase } = await import("@/db/access");
  return isAdminInDatabase(email);
}
