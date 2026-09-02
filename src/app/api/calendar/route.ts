import { auth, authEnabled } from "@/auth";
import { databaseEnabled } from "@/db/client";
import { upcoming } from "@/lib/google";
import { withinRate } from "@/lib/guard";

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
  if (!withinRate(`calendar:${email}`, 30, 60_000)) {
    return Response.json({ events: [], problem: "unavailable" });
  }

  const raw = Number(new URL(request.url).searchParams.get("days") ?? "7");
  const days = Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 1), 31) : 7;

  return Response.json(await upcoming(email, days));
}
