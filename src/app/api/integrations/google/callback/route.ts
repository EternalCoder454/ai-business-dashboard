import { auth, authEnabled } from "@/auth";
import { databaseEnabled } from "@/db/client";
import { membershipFor } from "@/db/tenancy";
import { connect, readState } from "@/lib/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Where Google sends somebody back to.
 *
 * Three things have to agree before anything is stored: the signed state has to
 * be one we issued and still fresh, there has to be a session, and the address
 * in the state has to be the address in that session.
 *
 * The third is the one worth spelling out. Without it, anybody could send a
 * signed-in person a link to this route carrying their own authorization code,
 * and that person's panel would quietly start showing the attacker's calendar.
 * Nobody's data leaks in that direction, which is exactly why it would go
 * unnoticed.
 */
function back(message?: string): Response {
  const to = new URL("/settings", process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");
  if (message) to.searchParams.set("google", message);
  return Response.redirect(to.toString(), 302);
}

export async function GET(request: Request) {
  if (!authEnabled || !databaseEnabled) return back("unavailable");

  const url = new URL(request.url);

  // Somebody who pressed cancel on the consent screen. Not an error worth
  // shouting about, just a person who changed their mind.
  if (url.searchParams.get("error")) return back("cancelled");

  const code = url.searchParams.get("code");
  const wanted = readState(url.searchParams.get("state"));
  if (!code || !wanted) return back("expired");

  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return back("signed-out");
  if (email !== wanted) return back("mismatch");

  const membership = await membershipFor(email);
  if (!membership) return back("no-workspace");

  const problem = await connect(email, membership.workspaceId, code);
  return back(problem ? "failed" : "connected");
}
