"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authInstance } from "@/auth";

/**
 * Signs out and returns to the sign-in page.
 *
 * Still a server action rather than a form posting at the endpoint directly.
 * Under next-auth that was because the endpoint demanded a CSRF token a plain
 * form would not carry, and the button appeared to do nothing on exactly the
 * machine where it matters most: a shared computer somebody is trying to leave.
 * The reason now is smaller but the same shape, which is that the action can
 * clear the cookie and redirect in one step and a form cannot.
 *
 * The session row is deleted rather than the cookie merely dropped. That is the
 * point of sessions being rows: signing out on a shared machine ends the
 * session everywhere it could have been replayed, instead of leaving a token
 * that stays valid until it expires.
 */
export async function signOutAction(): Promise<void> {
  if (authInstance) {
    try {
      await authInstance.api.signOut({ headers: await headers() });
    } catch (error) {
      // Leaving is not a thing to fail at. If the row cannot be deleted the
      // redirect still happens and the next request finds no valid session.
      console.error("[auth] sign out did not complete cleanly", error);
    }
  }
  redirect("/signin");
}
