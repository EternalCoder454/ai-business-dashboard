import { timingSafeEqual } from "node:crypto";
import { auth, authEnabled } from "@/auth";
import { isOperator } from "@/lib/admin";
import { reporterEnabled, runReview } from "@/lib/reporter";
import { runSchedules } from "@/lib/schedules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Every business's schedules plus a pass of the reviewer. The longest thing
// this deployment does, and it must not be cut off half way.
export const maxDuration = 300;

/**
 * Everything that happens on a timer, in one call.
 *
 * One endpoint rather than one per job, because Vercel's free plan allows two
 * cron entries and there will be more than two kinds of scheduled work. What
 * the schedule decides is how often the tick happens; what the tick decides is
 * what is owed a run.
 *
 * Two ways in:
 *
 * - `Authorization: Bearer $CRON_SECRET`, which is what Vercel sends. Compared
 *   in constant time, because this is a secret comparison and not a lookup.
 * - An operator with a session, so it can be opened by hand to see what a tick
 *   does without waiting for the morning.
 *
 * With no CRON_SECRET set the bearer path is closed entirely rather than open.
 * A route that spends money on every request and authenticates nobody is the
 * kind of thing discovered by the bill.
 */
function bearerMatches(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(/\s+/, 2);
  if (!token || scheme.toLowerCase() !== "bearer") return false;

  const a = Buffer.from(token, "utf8");
  const b = Buffer.from(secret, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

async function operatorSignedIn(): Promise<boolean> {
  if (!authEnabled) return false;
  const session = await auth();
  return isOperator(session?.user?.email?.toLowerCase());
}

export async function GET(request: Request) {
  const allowed = bearerMatches(request) || (await operatorSignedIn());
  if (!allowed) {
    // 404 rather than 401. Somebody probing for a scheduled job should not be
    // told they have found one.
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const started = Date.now();

  // Schedules first. They are the thing a customer is waiting to read when
  // they open the panel; the review is ours and can have whatever is left.
  const schedules = await runSchedules().catch((error) => {
    console.error("[cron] schedules failed", error);
    return null;
  });

  const review = reporterEnabled()
    ? await runReview().catch((error) => {
        console.error("[cron] review failed", error);
        return null;
      })
    : null;

  const ms = Date.now() - started;
  // Logged as well as returned, because the usual reader is a scheduler that
  // throws the body away. The log is where somebody looks to find out whether
  // this has been running at all.
  console.log(
    `[cron] ${schedules?.ran ?? 0} briefings, ${review?.raised ?? 0} raised, ${ms}ms`,
  );

  return Response.json({ ok: true, schedules, review, ms });
}
