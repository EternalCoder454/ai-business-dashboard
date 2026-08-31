"use server";

import { signOut } from "@/auth";

/**
 * Signs out and returns to the sign-in page.
 *
 * A plain form posting to /api/auth/signout does not work: next-auth requires a
 * CSRF token in that request, and without one the endpoint rejects it and the
 * button appears to do nothing. That is worst on exactly the machine where it
 * matters most, a shared computer someone is trying to leave.
 *
 * A server action carries the token itself, so there is nothing to get wrong.
 */
export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/signin" });
}
