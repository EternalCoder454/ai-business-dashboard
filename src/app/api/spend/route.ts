import { auth, authEnabled } from "@/auth";
import { databaseEnabled, db } from "@/db/client";
import { membershipFor } from "@/db/tenancy";
import { spendSince } from "@/db/spend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What this business has spent on models this month, and on whom.
 *
 * The arithmetic lives in db/spend, because the budget stops replies now and
 * the thing doing the stopping has to be counting the same way this is. What is
 * left here is who is asking and which month they mean.
 */
export async function GET(request: Request) {
  if (!authEnabled || !databaseEnabled || !db) {
    return Response.json({ error: "Not configured." }, { status: 501 });
  }

  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return Response.json({ error: "Not signed in." }, { status: 401 });

  const membership = await membershipFor(email);
  if (!membership) return Response.json({ error: "No workspace." }, { status: 404 });

  /*
   * Calendar month, in the browser's own reckoning.
   *
   * The client sends the start rather than the server deciding it, because a
   * business in New Zealand and a server in Virginia disagree about when the
   * month turned, and the figure has to match the month the person is looking
   * at. Anything unparseable falls back to thirty days, which is wrong in a way
   * that is obvious rather than wrong in a way that is not.
   */
  const asked = Number(new URL(request.url).searchParams.get("since"));
  const since =
    Number.isFinite(asked) && asked > 0 && asked <= Date.now()
      ? asked
      : Date.now() - 30 * 86_400_000;

  const spend = await spendSince(membership.workspaceId, since);
  return Response.json({ since, ...spend });
}
