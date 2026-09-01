import { OPERATOR_EMAILS } from "@/auth";

export { OPERATOR_EMAILS };

/**
 * The operator: whoever runs this deployment.
 *
 * OPERATOR_EMAILS and nothing else. This briefly also accepted anyone the
 * access table marked as an admin, which was wrong in the worst available way:
 * every business's first member is made an admin of their own workspace, so
 * that union handed each customer the routes that read and delete every other
 * customer's workspace.
 *
 * Running your own business is a different permission and lives on the access
 * row as `role`. The two are deliberately not one function, because the whole
 * difference between them is which side of the tenant boundary they act on.
 *
 * Kept in the environment rather than the database so it cannot be granted by
 * anything the app itself does.
 */
export function isOperator(email: string | null | undefined): boolean {
  if (!email) return false;
  return OPERATOR_EMAILS.includes(email.trim().toLowerCase());
}

/**
 * The first operator, for the things that are one person's rather than a
 * role's: which branding the sign-in page wears, and who the shipped
 * leadership coach is seeded for.
 */
export function isOwnerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return OPERATOR_EMAILS[0] === email.trim().toLowerCase();
}
