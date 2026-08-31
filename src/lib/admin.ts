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

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}
