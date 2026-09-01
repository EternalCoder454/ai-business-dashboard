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
export const OPERATOR_EMAILS = parseEmailList(process.env.OPERATOR_EMAILS, ALLOWED_EMAILS[0] ?? "");

/**
 * The one account the workspace belongs to: the first administrator.
 *
 * Distinct from being an administrator, because some things are the owner's
 * alone and adding a second administrator should not hand them over.
 */
export function isOwnerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return OPERATOR_EMAILS[0] === email.trim().toLowerCase();
}

export function isOperatorEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return OPERATOR_EMAILS.includes(email.trim().toLowerCase());
}

/**
 * The operator: whoever runs this deployment.
 *
 * OPERATOR_EMAILS and nothing else. This used to also accept anyone the access
 * table marked as an admin, which was wrong in the worst available way: every
 * business's first member is made an admin of their own workspace, so that
 * union handed each customer the routes that read and delete every other
 * customer's workspace.
 *
 * Being an administrator of your own business is a different permission, and
 * it lives on the access row as `role`. The two are deliberately not one
 * function, because the whole difference between them is which side of the
 * tenant boundary they act on.
 *
 * Kept in the environment rather than the database so it cannot be granted by
 * anything the app itself does.
 */
export function isOperator(email: string | null | undefined): boolean {
  return isOperatorEmail(email);
}
