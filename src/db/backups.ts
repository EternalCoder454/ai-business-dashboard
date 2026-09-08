/**
 * A point a workspace can be put back to.
 *
 * The panel is the only copy of a business's own writing: its departments, its
 * skills, the wiki, and every conversation it has had. Neon keeps point in time
 * restores of the database, but reaching for those means a support request and
 * restoring everybody's workspace to recover one person's mistake. This is the
 * smaller thing that covers the case people actually hit, which is deleting
 * something and wanting it back.
 *
 * Two rules shape the whole module.
 *
 * Everything content bearing is covered or explicitly excluded, and the list
 * lives in one place that both the backup and the restore read. A table added
 * later and quietly left out would produce a backup that looks complete and
 * silently is not, which is worse than having no backup at all, so
 * backups-test fails when a workspace scoped table appears in neither list.
 *
 * And a restore is itself undoable. It takes a backup of what is there before
 * it replaces anything, so the answer to restoring the wrong one is to restore
 * the one it just made.
 */
import { and, desc, eq, getTableColumns, inArray } from "drizzle-orm";
import { requireDb } from "./client";
import * as t from "./schema";

/**
 * The tables a backup carries, in the order a restore must insert them.
 *
 * Order matters on the way in: a message names a conversation, a round names a
 * run. Nothing here declares a foreign key, so this is not enforced by the
 * database, and inserting in a sensible order costs nothing and keeps the data
 * consistent at every point during the restore rather than only at the end.
 */
export const BACKED_UP = [
  ["departments", t.departments],
  ["projects", t.projects],
  ["conversations", t.conversations],
  ["messages", t.messages],
  ["skills", t.skills],
  ["deliverables", t.deliverables],
  ["files", t.files],
  ["meetings", t.meetings],
  ["meetingRounds", t.meetingRounds],
  ["memory", t.memory],
  ["tasks", t.tasks],
  ["taskComments", t.taskComments],
  ["wikiPages", t.wikiPages],
  ["directMessages", t.directMessages],
  ["briefings", t.briefings],
  ["schedules", t.schedules],
  ["addons", t.addons],
  ["profiles", t.profiles],
  ["settings", t.settings],
] as const;

/**
 * Workspace scoped tables a backup deliberately does not carry, and why.
 *
 * Every one of these is either access, a credential, or a record of something
 * that happened rather than something somebody wrote. Rolling back who may open
 * the workspace, or which key it holds, is not what anybody means by undo, and
 * both have a failure mode worse than the mistake being recovered from: a
 * restore that locks the owner out, or one that quietly reinstates a key that
 * was revoked on purpose.
 */
export const NOT_BACKED_UP: Record<string, string> = {
  access:
    "who may open this workspace; a restore that reinstated an older membership " +
    "list could remove somebody added since, or lock out the person restoring",
  accounts:
    "keyed by email rather than by workspace, so it is a person's own name and " +
    "which business they are currently in, and follows them everywhere",
  reviewCursors:
    "how far the reporter has already read; winding it back would report months " +
    "of old messages as though they had just arrived",
  apiKeys: "credentials, so an old backup can never reinstate a revoked key",
  googleConnections: "OAuth tokens, which are a live grant rather than content",
  linkAllowlist: "a security decision, and restoring an older one widens it",
  messageBlocks:
    "who has stopped somebody writing to them; the same shape of decision as the link allowlist, and reinstating an older list would either restore a block somebody lifted or drop one they meant",
  telemetry: "a record of what happened, which did still happen",
  addonRuns: "the same, for add-ons",
  reports: "generated output, reproducible from the briefing that made it",
  feedback: "sent to us rather than owned by the workspace",
  idempotency: "in flight request bookkeeping, meaningless once restored",
  backups: "the backups themselves, which a restore must not replace",
};

/**
 * Columns that are stripped out of a backed up row, and put back on restore.
 *
 * The provider keys live on `settings`, which is otherwise entirely worth
 * backing up: it is the model, the effort, the theme, the budget, the link
 * policy. Excluding the whole table to protect five columns would mean a
 * restore that silently reverted none of a workspace's settings.
 *
 * So the table is covered and the five columns are not, which fixes both halves
 * of the same bug. A backup is a copy of the workspace that gets moved around,
 * read by an administrator and kept for weeks, and it has no business carrying
 * a live credential. And a restore must never quietly reinstate a key that was
 * rotated afterwards, which was exactly what would have happened: the comment
 * beside NOT_BACKED_UP already said credentials were excluded and was wrong,
 * because it named apiKeys, which is the developer API, and not these.
 *
 * On the way back in, the values that are live right now are carried forward,
 * so a restore leaves the keys exactly as they are. Dropping the columns alone
 * would be worse than the bug: the insert would fall back to the column default
 * of an empty string and a restore would wipe the workspace's keys.
 */
export const REDACTED: Record<string, readonly string[]> = {
  settings: ["anthropicKey", "openaiKey", "googleKey", "deepseekKey", "perplexityKey"],
};

/** What a stored payload looks like. */
export interface BackupPayload {
  /** Bumped when the shape changes, so an old one is refused rather than half read. */
  version: 1;
  workspaceId: string;
  takenAt: string;
  tables: Record<string, Record<string, unknown>[]>;
}

export interface BackupSummary {
  id: string;
  label: string;
  kind: string;
  takenBy: string;
  bytes: number;
  counts: Record<string, number>;
  createdAt: number;
}

/**
 * Refused above this, rather than stored and found to be unreadable later.
 *
 * The largest workspace measured when this was written held 0.08MB of messages,
 * so this is not a limit anybody is near. It is here because the payload is one
 * row and one JSON.parse, and both have a size past which they stop being a
 * good idea.
 */
export const MAX_BACKUP_BYTES = 32 * 1024 * 1024;

/** How many to keep, oldest deleted first, counted per kind. */
export const KEEP = { manual: 20, automatic: 10, "before-restore": 10 } as const;

export type BackupKind = keyof typeof KEEP;

/** The scoping column, which every backed up table has and none of them types alike. */
type Scoped = { workspaceId: typeof t.departments.workspaceId };

function newId(): string {
  return `bk_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Turns a row's timestamps back into Dates on the way in.
 *
 * A timestamp column reads as a Date, and JSON has no such thing, so it goes
 * into the payload as an ISO string and comes out as one. Handing that straight
 * back to an insert throws, because the driver calls toISOString on whatever it
 * is given, and a string does not have one.
 *
 * This is the whole reason there is a test that restores against a real
 * database rather than one that reads the table lists. Nothing about the shape
 * of the code says the round trip loses a type: it compiles, the backup is
 * written correctly and looks complete, and the failure appears only when
 * somebody restores, which is the one moment they cannot afford it.
 *
 * Asked of drizzle rather than listed by hand, so a timestamp column added to
 * any table later is covered without anybody remembering this exists.
 */
function reviveDates<Row extends Record<string, unknown>>(
  table: (typeof BACKED_UP)[number][1],
  rows: Row[],
): Row[] {
  const dateColumns = Object.entries(getTableColumns(table))
    .filter(([, column]) => (column as { dataType?: string }).dataType === "date")
    .map(([name]) => name);

  if (!dateColumns.length) return rows;

  return rows.map((row) => {
    const copy: Record<string, unknown> = { ...row };
    for (const name of dateColumns) {
      const value = copy[name];
      if (typeof value === "string" || typeof value === "number") {
        const asDate = new Date(value);
        // A value that does not parse is left as it was, so the insert fails
        // loudly on the row that is wrong rather than silently storing an epoch.
        if (!Number.isNaN(asDate.getTime())) copy[name] = asDate;
      }
    }
    return copy as Row;
  });
}

/** Reads every covered table for one workspace. */
async function readAll(workspaceId: string): Promise<BackupPayload> {
  const db = requireDb();
  const tables: BackupPayload["tables"] = {};

  /*
   * Sequentially rather than together. These run on one connection anyway, and
   * a backup is not on anybody's critical path, so there is nothing to buy by
   * holding every row of every table in memory at the same moment.
   */
  for (const [name, table] of BACKED_UP) {
    const rows = (await db
      .select()
      .from(table)
      .where(eq((table as Scoped).workspaceId, workspaceId))) as Record<string, unknown>[];

    // Never let a credential into a payload. See REDACTED.
    const strip = REDACTED[name];
    tables[name] = strip
      ? rows.map((row) => {
          const copy = { ...row };
          for (const column of strip) delete copy[column];
          return copy;
        })
      : rows;
  }

  return { version: 1, workspaceId, takenAt: new Date().toISOString(), tables };
}

interface NewBackup {
  workspaceId: string;
  label: string;
  kind: BackupKind;
  takenBy: string;
  /**
   * Skip when this would be identical to the last one of the same kind.
   *
   * For the nightly pass. A workspace nobody touched for a fortnight would
   * otherwise spend its whole retention on fourteen identical copies of itself
   * and push out the last backup taken while it was still being used, which is
   * the opposite of what keeping fourteen of them is for.
   */
  onlyIfChanged?: boolean;
}

/*
 * Overloaded so that only the caller who asks for it has to think about the
 * third answer. Somebody taking a backup by hand can always have one, so the
 * button, the safety copy before a restore and the tests get back two cases
 * rather than three, and none of them needs a branch for something that cannot
 * reach it.
 */
export async function createBackup(
  input: NewBackup & { onlyIfChanged: true },
): Promise<{ backup: BackupSummary } | { unchanged: true } | { error: string }>;
export async function createBackup(
  input: NewBackup & { onlyIfChanged?: false },
): Promise<{ backup: BackupSummary } | { error: string }>;

/** Takes a backup. Returns its summary, or a reason it was refused. */
export async function createBackup(
  input: NewBackup,
): Promise<{ backup: BackupSummary } | { unchanged: true } | { error: string }> {
  const db = requireDb();
  const payload = await readAll(input.workspaceId);
  const text = JSON.stringify(payload);
  const bytes = Buffer.byteLength(text, "utf8");

  if (bytes > MAX_BACKUP_BYTES) {
    return { error: "This workspace is too large to back up in one piece." };
  }

  if (input.onlyIfChanged) {
    const [previous] = await db
      .select({ payload: t.backups.payload })
      .from(t.backups)
      .where(and(eq(t.backups.workspaceId, input.workspaceId), eq(t.backups.kind, input.kind)))
      .orderBy(desc(t.backups.createdAt))
      .limit(1);

    if (previous) {
      try {
        /*
         * The tables only. Every payload carries the moment it was taken, so
         * comparing the whole thing would find a difference every single time
         * and the check would never once fire.
         */
        const before = JSON.parse(previous.payload) as BackupPayload;
        if (JSON.stringify(before.tables) === JSON.stringify(payload.tables)) {
          return { unchanged: true };
        }
      } catch {
        // Unreadable, so treat it as nothing to compare against and take one.
      }
    }
  }

  const counts: Record<string, number> = {};
  for (const [name, rows] of Object.entries(payload.tables)) counts[name] = rows.length;

  const id = newId();
  await db.insert(t.backups).values({
    id,
    workspaceId: input.workspaceId,
    label: input.label.slice(0, 200),
    kind: input.kind,
    takenBy: input.takenBy,
    bytes,
    counts,
    payload: text,
  });

  await prune(input.workspaceId, input.kind);

  return {
    backup: {
      id,
      label: input.label,
      kind: input.kind,
      takenBy: input.takenBy,
      bytes,
      counts,
      createdAt: Date.now(),
    },
  };
}

/**
 * Drops the oldest of one kind past the limit.
 *
 * Per kind rather than overall, so a run of automatic backups can never push
 * out the one somebody took by hand before doing something they were unsure
 * about, which is the one most likely to be wanted.
 */
async function prune(workspaceId: string, kind: BackupKind): Promise<void> {
  const db = requireDb();
  const rows = await db
    .select({ id: t.backups.id })
    .from(t.backups)
    .where(and(eq(t.backups.workspaceId, workspaceId), eq(t.backups.kind, kind)))
    .orderBy(desc(t.backups.createdAt));

  const extra = rows.slice(KEEP[kind]).map((row) => row.id);
  if (!extra.length) return;

  await db
    .delete(t.backups)
    .where(and(eq(t.backups.workspaceId, workspaceId), inArray(t.backups.id, extra)));
}

/** Every backup a workspace holds, newest first, without their payloads. */
export async function listBackups(workspaceId: string): Promise<BackupSummary[]> {
  const db = requireDb();
  const rows = await db
    .select({
      id: t.backups.id,
      label: t.backups.label,
      kind: t.backups.kind,
      takenBy: t.backups.takenBy,
      bytes: t.backups.bytes,
      counts: t.backups.counts,
      createdAt: t.backups.createdAt,
    })
    .from(t.backups)
    .where(eq(t.backups.workspaceId, workspaceId))
    .orderBy(desc(t.backups.createdAt));

  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    kind: row.kind,
    takenBy: row.takenBy,
    bytes: row.bytes,
    counts: row.counts ?? {},
    createdAt: row.createdAt.getTime(),
  }));
}

export async function deleteBackup(workspaceId: string, id: string): Promise<void> {
  const db = requireDb();
  await db
    .delete(t.backups)
    .where(and(eq(t.backups.workspaceId, workspaceId), eq(t.backups.id, id)));
}

/**
 * Puts a workspace back to a backup, after taking one of where it is now.
 *
 * The whole replacement is one transaction. A restore that deleted the current
 * rows and then failed part way through inserting the old ones would leave a
 * workspace holding neither, which is the single worst outcome this feature
 * could have and exactly what a transaction is for.
 *
 * File bytes are never touched. The rows that point at them are restored and
 * the blobs themselves are left alone, so a file uploaded after the backup
 * stops being referenced rather than being destroyed. Storage is cheap and the
 * alternative is a delete nobody can undo.
 */
export async function restoreBackup(input: {
  workspaceId: string;
  id: string;
  restoredBy: string;
}): Promise<{ ok: true; safety: string } | { error: string }> {
  const db = requireDb();

  const [row] = await db
    .select({ payload: t.backups.payload, label: t.backups.label })
    .from(t.backups)
    .where(and(eq(t.backups.workspaceId, input.workspaceId), eq(t.backups.id, input.id)))
    .limit(1);

  if (!row) return { error: "That backup no longer exists." };

  let payload: BackupPayload;
  try {
    payload = JSON.parse(row.payload) as BackupPayload;
  } catch {
    return { error: "That backup could not be read." };
  }

  if (payload.version !== 1) {
    return { error: "That backup was taken by a newer version of the panel." };
  }

  /*
   * A payload names the workspace it came from. Restoring one workspace's rows
   * into another would mean rewriting every row's workspace_id and handing one
   * business another's work, so it is refused rather than translated.
   */
  if (payload.workspaceId !== input.workspaceId) {
    return { error: "That backup belongs to a different workspace." };
  }

  // Before anything is replaced, so restoring the wrong one is recoverable.
  const safety = await createBackup({
    workspaceId: input.workspaceId,
    label: `Before restoring ${row.label || "a backup"}`,
    kind: "before-restore",
    takenBy: input.restoredBy,
  });
  if ("error" in safety) return { error: safety.error };

  /*
   * The columns a payload deliberately does not carry, read as they are right
   * now and put back on the way in. Read before the transaction, because inside
   * it the rows holding them are about to be deleted.
   *
   * Without this a restore would insert the settings row without its keys, take
   * the column default of an empty string, and disconnect the workspace from
   * every model it uses. See REDACTED.
   */
  const carried: Record<string, Record<string, unknown>> = {};
  for (const [name, table] of BACKED_UP) {
    const strip = REDACTED[name];
    if (!strip) continue;
    const [live] = await db
      .select()
      .from(table)
      .where(eq((table as Scoped).workspaceId, input.workspaceId))
      .limit(1);
    if (!live) continue;
    const keep: Record<string, unknown> = {};
    for (const column of strip) keep[column] = (live as Record<string, unknown>)[column];
    carried[name] = keep;
  }

  await db.transaction(async (tx) => {
    for (const [name, table] of BACKED_UP) {
      await tx.delete(table).where(eq((table as Scoped).workspaceId, input.workspaceId));

      let rows = reviveDates(table, payload.tables[name] ?? []);
      if (carried[name]) rows = rows.map((row) => ({ ...row, ...carried[name] }));
      if (!rows.length) continue;

      /*
       * In chunks, because one insert of every message in a workspace is a
       * single statement carrying a parameter per column per row, and Postgres
       * stops at 65535 of them. A workspace large enough to reach that is one
       * where this would otherwise fail for the first time in production.
       */
      for (let i = 0; i < rows.length; i += 200) {
        await tx.insert(table).values(rows.slice(i, i + 200) as never);
      }
    }
  });

  return { ok: true, safety: safety.backup.id };
}

/**
 * A backup of every workspace, once a night, from the cron tick.
 *
 * The point of the whole feature. A backup somebody remembered to take is
 * useful; the one that matters is the one nobody thought about until the
 * morning they needed it.
 *
 * Per workspace rather than in one pass, and one failing does not stop the
 * rest: a workspace too large to back up must not be the reason nobody else
 * gets one.
 */
export async function runDailyBackups(): Promise<{
  taken: number;
  unchanged: number;
  failed: number;
}> {
  const db = requireDb();
  const workspaces = await db.select({ id: t.workspaces.id }).from(t.workspaces);

  let taken = 0;
  let unchanged = 0;
  let failed = 0;

  for (const workspace of workspaces) {
    try {
      const made = await createBackup({
        workspaceId: workspace.id,
        label: "Daily backup",
        kind: "automatic",
        // Nobody. The column is who asked, and here the answer is the clock.
        takenBy: "",
        onlyIfChanged: true,
      });
      if ("error" in made) failed += 1;
      else if ("unchanged" in made) unchanged += 1;
      else taken += 1;
    } catch (error) {
      console.error("[backups] nightly failed for", workspace.id, error);
      failed += 1;
    }
  }

  return { taken, unchanged, failed };
}
