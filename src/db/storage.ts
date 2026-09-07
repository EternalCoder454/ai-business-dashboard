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
import { sql } from "drizzle-orm";
import { requireDb } from "./client";

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
  { table: "all_hands_rounds", label: "Meetings" },
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
  const parts = COUNTED.map(
    ({ table, label }) => sql`
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
