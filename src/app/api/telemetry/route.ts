import { desc, gte, sql } from "drizzle-orm";
import { auth, authEnabled } from "@/auth";
import { databaseEnabled, requireDb } from "@/db/client";
import * as t from "@/db/schema";
import { membershipFor } from "@/db/tenancy";
import { isOperator } from "@/lib/admin";
import { readJsonWithin, withinRate } from "@/lib/guard";
import { DEPLOYMENT, HOUR_MS, record } from "@/lib/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The browser's half of the telemetry, and the operator's view of all of it.
 *
 * What a browser is allowed to say is a fixed list. Without one, the operation
 * name is a string a client chooses, and since a row exists per business per
 * operation per hour, a client choosing freely is a client that can write
 * unlimited rows. The list is short on purpose and anything not on it is
 * dropped rather than argued with.
 *
 * The business is taken from the session, never from the body. A browser that
 * could name its own workspace could write into somebody else's numbers.
 */
const CLIENT_OPERATIONS = new Set([
  /** How long the app took to become usable, from navigation start. */
  "client.load",
  /** An uncaught error or rejection reached the window. */
  "client.error",
  /** A save was refused or failed, which the user sees as work being lost. */
  "client.write",
  /** The snapshot could not be fetched, after the retries gave up. */
  "client.load-failed",
]);

/** A browser reporting more than this per minute is broken or hostile. */
const BEACON_LIMIT = 40;

export async function POST(request: Request) {
  if (!authEnabled || !databaseEnabled) {
    return Response.json({ ok: false }, { status: 503 });
  }

  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return Response.json({ ok: false }, { status: 401 });

  if (!withinRate(`beacon:${email}`, BEACON_LIMIT, 60_000)) {
    // Quietly. A client that is over the limit is usually one in a failure
    // loop, and answering it with an error it will also report is a way of
    // making a bad minute worse.
    return Response.json({ ok: true });
  }

  const parsed = await readJsonWithin<{
    operation?: string;
    ms?: number;
    ok?: boolean;
    errorKind?: string;
    errorNote?: string;
  }>(request, 4_000);
  if (!parsed.ok) return Response.json({ ok: false }, { status: parsed.status });

  const { operation, ms, ok, errorKind, errorNote } = parsed.body;
  if (typeof operation !== "string" || !CLIENT_OPERATIONS.has(operation)) {
    return Response.json({ ok: true });
  }

  const mine = await membershipFor(email);
  if (!mine) return Response.json({ ok: true });

  record({
    operation,
    workspaceId: mine.workspaceId,
    source: "browser",
    ms: typeof ms === "number" && Number.isFinite(ms) ? Math.min(ms, 600_000) : 0,
    outcome: ok === false ? "error" : "ok",
    errorKind: typeof errorKind === "string" ? errorKind : undefined,
    // Scrubbed and truncated in record(). Nothing here is trusted.
    errorNote: typeof errorNote === "string" ? errorNote : undefined,
  });

  return Response.json({ ok: true });
}

/**
 * What the deployment has been doing, for an operator.
 *
 * Deployment-wide rather than per business by default, because the question
 * this answers is usually "is anything broken" rather than "how is one
 * customer doing". The rows carry the business either way, so both readings
 * come out of the same query.
 */
export async function GET(request: Request) {
  if (!authEnabled || !databaseEnabled) {
    return Response.json({ error: "Not available on this instance." }, { status: 503 });
  }

  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!isOperator(email)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const url = new URL(request.url);
  const asked = Number(url.searchParams.get("hours") ?? "24");
  const hours = Number.isFinite(asked) ? Math.min(Math.max(asked, 1), 24 * 14) : 24;
  const since = Math.floor((Date.now() - hours * HOUR_MS) / HOUR_MS) * HOUR_MS;

  try {
    const db = requireDb();

    // Per business and operation, which is the table the operator reads, and
    // per hour, which is the shape a chart wants. Two aggregates over the same
    // small set of rows rather than one and then arithmetic in JavaScript.
    const [rows, byHour, names] = await Promise.all([
      db
        .select({
          workspaceId: t.telemetry.workspaceId,
          operation: t.telemetry.operation,
          source: t.telemetry.source,
          calls: sql<number>`sum(${t.telemetry.calls})::int`,
          errors: sql<number>`sum(${t.telemetry.errors})::int`,
          refused: sql<number>`sum(${t.telemetry.refused})::int`,
          cold: sql<number>`sum(${t.telemetry.cold})::int`,
          totalMs: sql<number>`sum(${t.telemetry.totalMs})::bigint`,
          maxMs: sql<number>`max(${t.telemetry.maxMs})::int`,
          slow: sql<number>`sum(${t.telemetry.slow})::int`,
          // The newest hour this operation was seen in. What makes a missing
          // nightly tick visible: the row is old rather than absent.
          lastBucket: sql<number>`max(${t.telemetry.bucket})::bigint`,
          lastErrorKind: sql<string | null>`(array_agg(${t.telemetry.lastErrorKind} ORDER BY ${t.telemetry.lastErrorAt} DESC NULLS LAST))[1]`,
          lastErrorNote: sql<string | null>`(array_agg(${t.telemetry.lastErrorNote} ORDER BY ${t.telemetry.lastErrorAt} DESC NULLS LAST))[1]`,
          lastErrorAt: sql<number | null>`max(${t.telemetry.lastErrorAt})::bigint`,
        })
        .from(t.telemetry)
        .where(gte(t.telemetry.bucket, since))
        .groupBy(t.telemetry.workspaceId, t.telemetry.operation, t.telemetry.source)
        .orderBy(desc(sql`sum(${t.telemetry.calls})`))
        .limit(500),

      // tenancy-audit: deliberately across every business. This is the
      // deployment's own health over time, for an operator, and the route
      // refuses anybody who is not one before it gets here. It returns counts
      // by hour and nothing that says which business they came from.
      db
        .select({
          bucket: t.telemetry.bucket,
          calls: sql<number>`sum(${t.telemetry.calls})::int`,
          errors: sql<number>`sum(${t.telemetry.errors})::int`,
          refused: sql<number>`sum(${t.telemetry.refused})::int`,
          totalMs: sql<number>`sum(${t.telemetry.totalMs})::bigint`,
          slow: sql<number>`sum(${t.telemetry.slow})::int`,
        })
        .from(t.telemetry)
        .where(gte(t.telemetry.bucket, since))
        .groupBy(t.telemetry.bucket)
        .orderBy(t.telemetry.bucket),

      db.select({ id: t.workspaces.id, name: t.workspaces.name }).from(t.workspaces),
    ]);

    const nameOf = new Map(names.map((row) => [row.id, row.name]));

    return Response.json({
      hours,
      rows: rows.map((row) => ({
        ...row,
        calls: Number(row.calls),
        errors: Number(row.errors),
        refused: Number(row.refused),
        cold: Number(row.cold),
        totalMs: Number(row.totalMs),
        maxMs: Number(row.maxMs),
        slow: Number(row.slow),
        lastBucket: Number(row.lastBucket),
        lastErrorAt: row.lastErrorAt == null ? null : Number(row.lastErrorAt),
        workspaceName:
          row.workspaceId === DEPLOYMENT
            ? "Scheduled work"
            : (nameOf.get(row.workspaceId) ?? "Deleted business"),
      })),
      byHour: byHour.map((row) => ({
        bucket: Number(row.bucket),
        calls: Number(row.calls),
        errors: Number(row.errors),
        refused: Number(row.refused),
        totalMs: Number(row.totalMs),
        slow: Number(row.slow),
      })),
    });
  } catch (error) {
    console.error("[api/telemetry] read", error);
    return Response.json({ error: "Could not read telemetry." }, { status: 500 });
  }
}
