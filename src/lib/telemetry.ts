import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import * as t from "@/db/schema";

/**
 * What the deployment is doing and where it hurts, per business.
 *
 * Three rules it is built around.
 *
 * It must never break or slow the thing it measures. Every write is buffered,
 * flushed off the request's critical path, and wrapped so that a telemetry
 * failure can only ever cost a line in the log. A monitoring system that takes
 * the site down with it is worse than no monitoring system.
 *
 * It must not grow faster than the product. Buckets by hour and operation, so
 * a business making a hundred thousand calls an hour writes the same one row
 * as a business making three.
 *
 * It must not become a second copy of everybody's data. What goes in is a
 * workspace id, an operation name we chose ourselves, timings, counts, and a
 * scrubbed error note. No address, no name, no title, no message, no prompt,
 * no query string, and nothing about the machine it came from.
 */

/** Anything slower than this is worth counting separately. */
const SLOW_MS = 1_000;

/** Flush when either of these is reached, whichever comes first. */
const BUFFER_LIMIT = 40;
const BUFFER_AGE_MS = 10_000;

/** Long enough to see a pattern, short enough that the table stays small. */
export const RETENTION_DAYS = 14;

export const HOUR_MS = 3_600_000;

/**
 * Work that belongs to the deployment rather than to any one business: the
 * nightly tick, the conduct review, anything on a timer.
 *
 * A reserved id rather than a nullable column, so every row still has a
 * workspace and nothing in the query layer has to grow a special case. It
 * cannot collide with a real workspace: ids are generated and none of them
 * start with a tilde.
 */
export const DEPLOYMENT = "~deployment";

/**
 * Three outcomes, not two.
 *
 * A refusal is the system working. A rate limit, a body over the size cap, a
 * permission check saying no: none of those mean anything is broken, and
 * counting them as errors makes the error rate meaningless and hides the
 * failures worth looking at. Counted separately, a few refusals are healthy and
 * a lot of them are a limit set wrong or somebody stuck in a loop.
 */
export type Outcome = "ok" | "error" | "refused";

export interface Recording {
  operation: string;
  workspaceId: string;
  ms: number;
  outcome: Outcome;
  source?: "server" | "browser";
  errorKind?: string;
  errorNote?: string;
}

interface Bucket {
  workspaceId: string;
  operation: string;
  source: string;
  bucket: number;
  calls: number;
  errors: number;
  refused: number;
  cold: number;
  totalMs: number;
  maxMs: number;
  slow: number;
  lastErrorKind?: string;
  lastErrorNote?: string;
  lastErrorAt?: number;
}

/**
 * Held per instance and merged in the database, so instances never have to
 * agree on anything. Module scope survives between invocations on a warm
 * serverless instance and is thrown away with a cold one, which costs at most
 * the last few seconds of counts.
 */
const pending = new Map<string, Bucket>();
let oldestAt = 0;
let flushing: Promise<void> | null = null;

/**
 * Whether this instance has served anything yet.
 *
 * Module scope is per instance, so the first call to reach this module is by
 * definition the first that instance handled. Whichever operation it was is the
 * one that paid for the cold start, which is the interesting attribution.
 */
let warm = false;

const bucketFor = (at: number) => Math.floor(at / HOUR_MS) * HOUR_MS;

/**
 * Takes anything that could identify a person out of an error message.
 *
 * Errors are written by us, but they carry values: a Postgres constraint
 * violation quotes the row, a fetch failure quotes the URL. So the note is
 * treated as hostile and stripped before it is stored, rather than trusted
 * because of where it came from.
 */
export function scrub(message: string): string {
  return message
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[address]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[ip]")
    .replace(/\bhttps?:\/\/\S+/gi, "[url]")
    // Keys, tokens, ids: any long unbroken run of key-ish characters.
    .replace(/\b[A-Za-z0-9_-]{24,}\b/g, "[id]")
    // Anything quoted, which is how Postgres and our own guards report values.
    .replace(/"[^"]{0,400}"/g, '"[value]"')
    .replace(/'[^']{0,400}'/g, "'[value]'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

/** A stable short name for what went wrong, for grouping rather than reading. */
export function kindOf(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code) return code.slice(0, 40);
    return error.constructor?.name || "Error";
  }
  return typeof error;
}

/** Buffers one measurement. Never throws, never waits. */
export function record(entry: Recording): void {
  if (!db || !entry.workspaceId || !entry.operation) return;
  try {
    const at = Date.now();
    const source = entry.source ?? "server";
    const bucket = bucketFor(at);
    const key = `${entry.workspaceId}|${entry.operation}|${source}|${bucket}`;

    const ms = Number.isFinite(entry.ms) ? Math.max(0, Math.round(entry.ms)) : 0;
    const current = pending.get(key) ?? {
      workspaceId: entry.workspaceId,
      operation: entry.operation.slice(0, 60),
      source,
      bucket,
      calls: 0,
      errors: 0,
      refused: 0,
      cold: 0,
      totalMs: 0,
      maxMs: 0,
      slow: 0,
    };

    current.calls += 1;
    current.totalMs += ms;
    if (ms > current.maxMs) current.maxMs = ms;
    if (ms >= SLOW_MS) current.slow += 1;
    if (!warm) {
      warm = true;
      current.cold += 1;
    }
    if (entry.outcome === "refused") {
      current.refused += 1;
    } else if (entry.outcome === "error") {
      current.errors += 1;
      current.lastErrorKind = (entry.errorKind ?? "Error").slice(0, 40);
      current.lastErrorNote = entry.errorNote ? scrub(entry.errorNote) : "";
      current.lastErrorAt = at;
    }

    pending.set(key, current);
    if (oldestAt === 0) oldestAt = at;

    if (pending.size >= BUFFER_LIMIT || at - oldestAt >= BUFFER_AGE_MS) {
      void flush();
    }
  } catch {
    // Measuring must not be able to break the thing being measured.
  }
}

/**
 * Writes what is buffered.
 *
 * Every column that counts something is added to what is already in the row,
 * so two instances flushing the same hour produce a sum rather than one
 * overwriting the other. `max_ms` takes the larger of the two for the same
 * reason. The error columns are last write wins, which is what "last error"
 * means.
 */
export async function flush(): Promise<void> {
  if (flushing) return flushing;
  if (!db || pending.size === 0) return;

  const batch = [...pending.values()];
  pending.clear();
  oldestAt = 0;
  const handle = db;

  flushing = (async () => {
    try {
      await handle
        .insert(t.telemetry)
        .values(
          batch.map((row) => ({
            id: `${row.workspaceId}:${row.operation}:${row.source}:${row.bucket}`,
            workspaceId: row.workspaceId,
            operation: row.operation,
            source: row.source,
            bucket: row.bucket,
            calls: row.calls,
            errors: row.errors,
            refused: row.refused,
            cold: row.cold,
            totalMs: row.totalMs,
            maxMs: row.maxMs,
            slow: row.slow,
            lastErrorKind: row.lastErrorKind ?? null,
            lastErrorNote: row.lastErrorNote ?? "",
            lastErrorAt: row.lastErrorAt ?? null,
            updatedAt: new Date(),
          })),
        )
        .onConflictDoUpdate({
          target: t.telemetry.id,
          set: {
            calls: sql`${t.telemetry.calls} + excluded.calls`,
            errors: sql`${t.telemetry.errors} + excluded.errors`,
            refused: sql`${t.telemetry.refused} + excluded.refused`,
            cold: sql`${t.telemetry.cold} + excluded.cold`,
            totalMs: sql`${t.telemetry.totalMs} + excluded.total_ms`,
            maxMs: sql`greatest(${t.telemetry.maxMs}, excluded.max_ms)`,
            slow: sql`${t.telemetry.slow} + excluded.slow`,
            lastErrorKind: sql`coalesce(excluded.last_error_kind, ${t.telemetry.lastErrorKind})`,
            lastErrorNote: sql`case when excluded.last_error_at is null then ${t.telemetry.lastErrorNote} else excluded.last_error_note end`,
            lastErrorAt: sql`nullif(greatest(coalesce(excluded.last_error_at, 0), coalesce(${t.telemetry.lastErrorAt}, 0)), 0)`,
            updatedAt: new Date(),
          },
        });
    } catch (error) {
      // One line, and the counts for this window are lost. That is the whole
      // consequence, and it is the right one.
      console.error("[telemetry] flush failed", error);
    } finally {
      flushing = null;
    }
  })();

  return flushing;
}

/**
 * Times one operation, records how it went, and gets out of the way.
 *
 * Rethrows whatever it caught, unchanged. Nothing about the caller's behaviour
 * changes by being wrapped in this, which is the only way it is safe to put
 * around things that matter.
 */
export async function track<T>(
  operation: string,
  workspaceId: string | undefined,
  run: () => Promise<T>,
): Promise<T> {
  if (!workspaceId) return run();
  const started = Date.now();
  try {
    const result = await run();
    record({ operation, workspaceId, ms: Date.now() - started, outcome: "ok" });
    return result;
  } catch (error) {
    record({
      operation,
      workspaceId,
      ms: Date.now() - started,
      outcome: "error",
      errorKind: kindOf(error),
      errorNote: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/** One turned away by a guard: a rate limit, a size cap, a permission. */
export function refused(operation: string, workspaceId: string | undefined, why: string): void {
  if (!workspaceId) return;
  record({ operation, workspaceId, ms: 0, outcome: "refused", errorKind: why });
}

/** Drops buckets past the retention window. Called from the cron. */
export async function prune(): Promise<number> {
  if (!db) return 0;
  const cutoff = bucketFor(Date.now()) - RETENTION_DAYS * 24 * HOUR_MS;
  // tenancy-audit: deliberately across every business. Retention is a property
  // of the table rather than of any one workspace, and a prune that ran per
  // business would keep the rows of a business nobody has visited lately for
  // as long as nobody visits it.
  const gone = await db
    .delete(t.telemetry)
    .where(sql`${t.telemetry.bucket} < ${cutoff}`)
    .returning({ id: t.telemetry.id });
  return gone.length;
}
