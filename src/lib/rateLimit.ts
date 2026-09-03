import { sql } from "drizzle-orm";
import { databaseEnabled, db } from "@/db/client";

/**
 * How often something may be done, counted across every instance at once.
 *
 * This was a Map in the process. On Vercel that is one Map per instance, so a
 * limit of ten was ten per instance, and the platform adds instances under
 * load: the ceiling rose exactly when it was supposed to hold. Sixteen routes
 * relied on it, including the ones that spend money.
 *
 * The count now lives in one row per bucket per window, incremented with a
 * single statement, so the number in the code is the number that applies.
 *
 * @see rateLimitPrune for how old rows are cleared.
 */

/** Fixed windows, weighted against the one before. */
export interface RateState {
  allowed: boolean;
  limit: number;
  /** Requests left in this window, after counting the one being answered. */
  remaining: number;
  /** Unix seconds when the window frees up. */
  resetAt: number;
  /** Zero when allowed, otherwise the whole seconds until it will be. */
  retryAfter: number;
}

/**
 * The fallback, used only when there is no database to count in.
 *
 * A local checkout runs without one, and a route that stops limiting because
 * Neon blinked is worse than one that limits per instance for a moment. It is
 * the old behaviour, kept for the case where it is the only behaviour
 * available.
 */
const local = new Map<string, number[]>();

function locally(key: string, limit: number, windowMs: number): RateState {
  const now = Date.now();
  const hits = (local.get(key) ?? []).filter((at) => at > now - windowMs);
  const resetAt = Math.ceil(((hits[0] ?? now) + windowMs) / 1000);

  if (hits.length >= limit) {
    local.set(key, hits);
    return {
      allowed: false,
      limit,
      remaining: 0,
      resetAt,
      retryAfter: Math.max(1, resetAt - Math.ceil(now / 1000)),
    };
  }

  hits.push(now);
  local.set(key, hits);

  // Bounded, because this map is only ever a fallback and nothing else prunes
  // it. Anything whose newest hit is a window old cannot affect an answer.
  if (local.size > 5_000) {
    for (const [entry, times] of local) {
      if ((times.at(-1) ?? 0) < now - windowMs) local.delete(entry);
    }
  }

  return {
    allowed: true,
    limit,
    remaining: Math.max(0, limit - hits.length),
    resetAt,
    retryAfter: 0,
  };
}

/**
 * Counts one attempt and says where the caller stands.
 *
 * Fixed windows rather than a log of timestamps, because a log needs a row per
 * request and this needs one row per window. The cost of a fixed window is a
 * caller who spends their whole allowance at the end of one window and again
 * at the start of the next, so the window before this one is counted too, in
 * proportion to how much of the current one is left. A limit of ten an hour
 * stays about ten in any hour rather than twenty across one boundary.
 *
 * The attempt is counted whether or not it is allowed, which is what Upstash's
 * sliding window does and is the behaviour to want: hammering a closed door
 * keeps it closed rather than resetting the answer. The consequence to know
 * about is that a key which was hammered takes two quiet windows to clear
 * rather than one, because the refused attempts are weighted in alongside the
 * granted ones.
 *
 * Failure is not silent but it is not fatal either: an unreachable database
 * drops to the per instance count rather than refusing the request, because a
 * limiter that takes the whole product down when Postgres hiccups is a worse
 * outage than the one it prevents.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateState> {
  if (!databaseEnabled || !db) return locally(key, limit, windowMs);

  const now = Date.now();
  const start = Math.floor(now / windowMs) * windowMs;
  const previous = start - windowMs;
  const resetAt = Math.ceil((start + windowMs) / 1000);

  try {
    /*
     * One statement, one round trip. The insert and the read of the previous
     * window cannot be two queries: between them another instance can move the
     * window on, and the answer would then be counted against a window that no
     * longer exists.
     */
    const rows = await db.execute<{ current: number; previous: number }>(sql`
      WITH bumped AS (
        INSERT INTO rate_limits (bucket, window_start, hits)
        VALUES (${key}, ${start}, 1)
        ON CONFLICT (bucket, window_start)
        DO UPDATE SET hits = rate_limits.hits + 1
        RETURNING hits
      )
      SELECT
        (SELECT hits FROM bumped)::int AS current,
        COALESCE(
          (SELECT hits FROM rate_limits
            WHERE bucket = ${key} AND window_start = ${previous}),
          0
        )::int AS previous
    `);

    // postgres.js hands back the rows themselves rather than a result object.
    const row = rows[0];
    const current = Number(row?.current ?? 1);
    const before = Number(row?.previous ?? 0);

    // How much of the previous window still overlaps the one a full window
    // back from now. At the start of a window that is nearly all of it; by the
    // end it is none.
    const carried = before * (1 - (now - start) / windowMs);
    const counted = current + carried;

    return {
      allowed: counted <= limit,
      limit,
      remaining: Math.max(0, Math.floor(limit - counted)),
      resetAt,
      retryAfter: counted <= limit ? 0 : Math.max(1, resetAt - Math.ceil(now / 1000)),
    };
  } catch (error) {
    console.error("[rate] could not count against the database", error);
    return locally(key, limit, windowMs);
  }
}

/** Yes or no, which is all a page needs. */
export async function withinRate(
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  return (await rateLimit(key, limit, windowMs)).allowed;
}

/**
 * Zero when the call is allowed, otherwise the seconds until it will be.
 *
 * "Wait a few minutes" is not something anybody can act on. This is the number
 * to put in the message and in Retry-After.
 */
export async function retryAfter(
  key: string,
  limit: number,
  windowMs: number,
): Promise<number> {
  return (await rateLimit(key, limit, windowMs)).retryAfter;
}

/**
 * Drops windows nothing can be counted against any more.
 *
 * Called from the nightly pass. A row is only ever read by its own window or
 * by the one after it, so anything older than two of the longest window in use
 * is dead weight; a day covers every limiter here with room to spare.
 */
export async function rateLimitPrune(olderThanMs = 24 * 60 * 60_000): Promise<number> {
  if (!databaseEnabled || !db) return 0;
  try {
    const cutoff = Date.now() - olderThanMs;
    const rows = await db.execute<{ count: number }>(sql`
      WITH gone AS (
        DELETE FROM rate_limits WHERE window_start < ${cutoff} RETURNING 1
      )
      SELECT COUNT(*)::int AS count FROM gone
    `);
    return Number(rows[0]?.count ?? 0);
  } catch (error) {
    console.error("[rate] could not prune", error);
    return 0;
  }
}
