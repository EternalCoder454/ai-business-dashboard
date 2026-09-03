import { auth, authEnabled } from "@/auth";
import { databaseEnabled } from "@/db/client";
import { upcoming } from "@/lib/google";
import { withinRate } from "@/lib/rateLimit";
import { record, refused } from "@/lib/telemetry";
import { membershipFor } from "@/db/tenancy";
import { allowsArea } from "@/lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The next few days from the signed-in person's own calendar.
 *
 * Never anybody else's. The address comes from the session and there is no
 * parameter that could name a different one, so this route has no version of
 * itself that reads somebody else's diary.
 */
export async function GET(request: Request) {
  if (!authEnabled || !databaseEnabled) {
    return Response.json({ events: [], problem: "unavailable" });
  }

  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return Response.json({ error: "Not signed in." }, { status: 401 });

  // Every call refreshes an access token against Google, so this is worth a
  // ceiling even though the caller is a page somebody opened.
  if (!(await withinRate(`calendar:${email}`, 30, 60_000))) {
    const mine = await membershipFor(email);
    refused("calendar.read", mine?.workspaceId, "RateLimited");
    return Response.json({ events: [], problem: "unavailable" });
  }

  /*
   * A calendar the business has switched off for this person.
   *
   * Answered as not connected rather than refused, because that is what it is
   * from where they are standing: there is no calendar for this account to
   * read, and every screen and prompt already knows how to say nothing about
   * one. A 403 would put an error on a dashboard about a thing they cannot
   * change.
   */
  const membership = await membershipFor(email);
  if (!allowsArea(membership?.role, membership?.permissions, "calendar")) {
    return Response.json({ events: [], problem: "not-connected" });
  }

  const raw = Number(new URL(request.url).searchParams.get("days") ?? "7");
  const days = Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 1), 31) : 7;

  const startedAt = Date.now();
  const result = await upcoming(email, days);

  /*
   * Recorded because this is exactly the failure nobody sees.
   *
   * Google refused every read for days with a 403, the calendar card hid
   * itself, the heads said they had no access, and nothing anywhere counted
   * it. A calendar that has stopped working is invisible until somebody thinks
   * to complain, which is the definition of a thing worth measuring.
   *
   * Only when there is something to say. A person who has never connected one
   * is not a failure and should not appear as a call at all.
   */
  if (result.problem !== "not-connected") {
    if (membership) {
      record({
        operation: "calendar.read",
        workspaceId: membership.workspaceId,
        ms: Date.now() - startedAt,
        outcome: result.problem === "unavailable" ? "error" : "ok",
        errorKind: result.problem === "unavailable" ? "CalendarUnavailable" : undefined,
        errorNote:
          result.problem === "unavailable"
            ? "Google refused the calendar read"
            : undefined,
      });
    }
  }

  return Response.json(result);
}
