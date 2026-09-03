import { timingSafeEqual } from "node:crypto";
import { auth, authEnabled } from "@/auth";
import { isOperator } from "@/lib/admin";
import { reporterEnabled, runReview } from "@/lib/reporter";
import { runSchedules } from "@/lib/schedules";
import { DEPLOYMENT, flush, kindOf, prune, record } from "@/lib/telemetry";
import { rateLimitPrune } from "@/lib/rateLimit";

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
    record({
      operation: "cron.schedules",
      workspaceId: DEPLOYMENT,
      ms: Date.now() - started,
      outcome: "error",
      errorKind: kindOf(error),
      errorNote: error instanceof Error ? error.message : String(error),
    });
    return null;
  });

  const reviewStarted = Date.now();
  const review = reporterEnabled()
    ? await runReview().catch((error) => {
        console.error("[cron] review failed", error);
        record({
          operation: "cron.review",
          workspaceId: DEPLOYMENT,
          ms: Date.now() - reviewStarted,
          outcome: "error",
          errorKind: kindOf(error),
          errorNote: error instanceof Error ? error.message : String(error),
        });
        return null;
      })
    : null;
  if (review) {
    record({
      operation: "cron.review",
      workspaceId: DEPLOYMENT,
      ms: Date.now() - reviewStarted,
      outcome: "ok",
    });
  }

  // Telemetry keeps itself in bounds here rather than in a job of its own.
  // Buckets past the retention window go, and whatever this instance has
  // buffered is written out before it is thrown away with the instance.
  // Rate limit windows nothing can be counted against any more. Cheap, and
  // the table only grows otherwise.
  const rateRows = await rateLimitPrune().catch((error) => {
    console.error("[cron] rate limit prune failed", error);
    return 0;
  });

  const pruned = await prune().catch((error) => {
    console.error("[cron] telemetry prune failed", error);
    return 0;
  });
  await flush();

  const ms = Date.now() - started;

  /*
   * One row for the tick itself. What makes it worth recording is not the row
   * that appears but the one that does not: an hour with no cron.tick is a
   * tick that never happened, which otherwise looks like a quiet night.
   */
  record({
    operation: "cron.tick",
    workspaceId: DEPLOYMENT,
    ms,
    outcome: schedules ? "ok" : "error",
    errorKind: schedules ? undefined : "SchedulesFailed",
  });
  // Logged as well as returned, because the usual reader is a scheduler that
  // throws the body away. The log is where somebody looks to find out whether
  // this has been running at all.
  console.log(
    `[cron] ${schedules?.ran ?? 0} briefings, ${review?.raised ?? 0} raised, ` +
      `${pruned} telemetry rows and ${rateRows} rate limit rows dropped, ${ms}ms`,
  );

  return Response.json({ ok: true, schedules, review, pruned, rateRows, ms });
}
