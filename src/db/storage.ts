/**
 * How much room a workspace actually takes, in bytes.
 *
 * The screen this replaces counted rows: eight departments, thirty four skills,
 * sixty two messages. Those are worth knowing and they are not what anybody
 * means by how much space they are using, because a row is not a size. One
 * conversation with a pasted contract in it outweighs a thousand tasks.
 *
 * Asked of Postgres rather than estimated from what the browser holds, for two
 * reasons. The workspace snapshot carries no message bodies at all, so the
 * largest thing in most workspaces would have been invisible. And an estimate
 * from string lengths ignores what storage actually costs: per row overhead,
 * the jsonb columns, and TOAST compression on the long text, which between them
 * are the difference between a guess and a number.
 */
import { eq, sql } from "drizzle-orm";
import { requireDb } from "./client";
import * as t from "./schema";

export interface StorageLine {
  /** What to call it on screen. */
  label: string;
  rows: number;
  bytes: number;
}

/**
 * Each table worth naming, and what to call it.
 *
 * Deliberately a list rather than every table in the schema. This answers "what
 * is taking up the room", and rate limits, idempotency keys and telemetry
 * buckets are not things a business put there or can do anything about.
 */
const COUNTED: { table: string; label: string }[] = [
  { table: "messages", label: "Messages" },
  { table: "conversations", label: "Conversations" },
  { table: "files", label: "Library files" },
  { table: "deliverables", label: "Deliverables" },
  { table: "skills", label: "Skills" },
  { table: "wiki_pages", label: "Wiki" },
  { table: "direct_messages", label: "Internal messages" },
  { table: "meeting_rounds", label: "Meetings" },
  { table: "memory", label: "Memory" },
  { table: "tasks", label: "Tasks" },
  { table: "backups", label: "Backups" },
];

/**
 * What each part of one workspace weighs, largest first.
 *
 * One statement rather than eleven. Every one of these is the same shape
 * against a different table, and eleven round trips to draw one card is the
 * kind of thing that makes a dashboard feel slow for no reason.
 */
export async function storageFor(workspaceId: string): Promise<StorageLine[]> {
  const db = requireDb();

  /*
   * pg_column_size of the whole row, which counts the row itself rather than
   * the length of its text: the per row overhead, the jsonb columns, and the
   * compression Postgres applies to long values are all in it. Summed, so a
   * table with one enormous document reads as large, which it is.
   *
   * The table names are ours, from the list above, and never from a request.
   */
  const parts = COUNTED.map(({ table, label }) =>
    table === "files"
      ? /*
         * Files are counted in two places at once, because that is where they
         * are. The row holds the name, the type and the extracted text, and
         * since the move off Vercel Blob the bytes are on a disk beside the
         * app. Reporting only the row would say a workspace holding six
         * hundred megabytes of screenshots is using two.
         *
         * `size` is the raw byte count written when the row was made, so this
         * does not go near the disk to draw a card. A row that still carries
         * base64 has no key and is already counted by pg_column_size, which is
         * why the filter is there rather than summing every row's size.
         */
        sql`
      SELECT ${label}::text AS label,
             count(*)::int AS rows,
             (coalesce(sum(pg_column_size(x.*)), 0)
              + coalesce(sum(x.size) FILTER (WHERE x.storage_key <> ''), 0))::bigint AS bytes
      FROM "files" x
      WHERE x.workspace_id = ${workspaceId}
    `
      : sql`
      SELECT ${label}::text AS label,
             count(*)::int AS rows,
             coalesce(sum(pg_column_size(x.*)), 0)::bigint AS bytes
      FROM ${sql.raw(`"${table}"`)} x
      WHERE x.workspace_id = ${workspaceId}
    `,
  );

  const rows = await db.execute<{ label: string; rows: number; bytes: string | number }>(
    sql.join(parts, sql` UNION ALL `),
  );

  return [...rows]
    .map((row) => ({
      label: row.label,
      rows: Number(row.rows),
      bytes: Number(row.bytes),
    }))
    .sort((a, b) => b.bytes - a.bytes);
}

/** The default every workspace starts on, and what the product says out loud. */
export const DEFAULT_STORAGE_LIMIT = 1_000_000_000;

export interface StorageUsage {
  lines: StorageLine[];
  /** Everything above, added up. */
  used: number;
  /** What this workspace is allowed, which is a column and can be raised. */
  limit: number;
}

/**
 * What a workspace is using and what it is allowed.
 *
 * One place, because two answers to this question drift: a card that says 1.1
 * GB beside an upload that still succeeds is worse than either number alone.
 * The upload route and the dashboard both read it here.
 */
export async function storageUsage(workspaceId: string): Promise<StorageUsage> {
  const [lines, [row]] = await Promise.all([
    storageFor(workspaceId),
    requireDb()
      .select({ limit: t.workspaces.storageLimitBytes })
      .from(t.workspaces)
      .where(eq(t.workspaces.id, workspaceId))
      .limit(1),
  ]);

  return {
    lines,
    used: lines.reduce((sum, line) => sum + line.bytes, 0),
    limit: Number(row?.limit ?? DEFAULT_STORAGE_LIMIT),
  };
}
