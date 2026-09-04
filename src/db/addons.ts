import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { databaseEnabled, db, requireDb } from "./client";
import * as t from "./schema";
import { LIMITS, hostOf, readRecipe, type Recipe } from "@/lib/addons/recipe";
import type { RunStep } from "@/lib/addons/run";

/**
 * Storing addons, and reading them back without trusting them.
 *
 * @see lib/addons/recipe for what an addon may say, and lib/addons/run for how
 * it is carried out.
 *
 * The rule this file exists to enforce is that a stored recipe is an input like
 * any other. It was validated before it was written, and it is validated again
 * every time it is read, because a row is not a promise: anybody who could
 * write to the table directly would otherwise be able to change what an
 * approved addon does without ever passing the approval screen. A row that no
 * longer validates is dropped rather than repaired, so a tampered addon stops
 * instead of running a version of itself nobody agreed to.
 */

/** pending until an administrator approves it, then live until it is paused. */
export type AddonState = "pending" | "live" | "paused";

export interface Addon {
  id: string;
  name: string;
  description: string;
  recipe: Recipe;
  /** The hosts an administrator approved, which the runner uses as the truth. */
  hosts: string[];
  state: AddonState;
  createdBy: string;
  approvedBy: string | null;
  lastRunAt: number | null;
  runs: number;
  failures: number;
  createdAt: number;
  /**
   * True when the recipe now needs a host nobody approved.
   *
   * The list is stored rather than derived, so an addon whose recipe was
   * changed after approval shows up here rather than quietly gaining a
   * destination. Such an addon does not run.
   */
  needsApproval: boolean;
}

/** Reads one row, or null when it no longer says anything we accept. */
function toAddon(row: typeof t.addons.$inferSelect): Addon | null {
  const parsed = readRecipe(row.recipe);
  if (!parsed.ok) return null;

  const approved = row.hosts ? row.hosts.split(" ").filter(Boolean) : [];
  const wanted = parsed.hosts;

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    recipe: parsed.recipe,
    hosts: approved,
    state: row.state as AddonState,
    createdBy: row.createdBy,
    approvedBy: row.approvedBy,
    lastRunAt: row.lastRunAt?.getTime() ?? null,
    runs: row.runs,
    failures: row.failures,
    createdAt: row.createdAt.getTime(),
    needsApproval: wanted.some((host) => !approved.includes(host)),
  };
}

/** Everything this business has, newest first. */
export async function addonsFor(workspaceId: string): Promise<Addon[]> {
  if (!databaseEnabled || !db) return [];
  const rows = await db
    .select()
    .from(t.addons)
    .where(eq(t.addons.workspaceId, workspaceId))
    .orderBy(desc(t.addons.createdAt));

  return rows.map(toAddon).filter((addon): addon is Addon => addon !== null);
}

/**
 * The addons that should run for one trigger.
 *
 * Live only, and never one whose recipe wants a host outside what was approved.
 * Both checks are here rather than at the call site so a new caller cannot
 * forget one: this is the only way the runner gets a list.
 */
export async function liveAddonsFor(workspaceId: string, trigger: string): Promise<Addon[]> {
  if (!databaseEnabled || !db) return [];
  const rows = await db
    .select()
    .from(t.addons)
    .where(
      and(
        eq(t.addons.workspaceId, workspaceId),
        eq(t.addons.state, "live"),
        eq(t.addons.trigger, trigger),
      ),
    );

  return rows
    .map(toAddon)
    .filter((addon): addon is Addon => addon !== null && !addon.needsApproval);
}

export interface DraftAddon {
  name: string;
  description: string;
  /** Unvalidated. Checked here, and refused rather than stored if it fails. */
  recipe: unknown;
  createdBy: string;
}

export type CreateResult =
  | { ok: true; addon: Addon }
  | { ok: false; problems: string[] };

/**
 * Writes a new addon, always pending.
 *
 * Never live on creation, and there is no argument to make it so. An addon is
 * written by a model at somebody's request, and the gap between that and it
 * running is the approval, so a path that skipped it would undo the design.
 */
export async function createAddon(
  workspaceId: string,
  draft: DraftAddon,
): Promise<CreateResult> {
  const parsed = readRecipe(draft.recipe);
  if (!parsed.ok) return { ok: false, problems: parsed.problems };

  const name = draft.name.trim().slice(0, LIMITS.name);
  if (!name) return { ok: false, problems: ["An addon needs a name."] };

  const database = requireDb();
  const id = randomUUID();

  await database.insert(t.addons).values({
    id,
    workspaceId,
    name,
    description: draft.description.trim().slice(0, LIMITS.description),
    recipe: parsed.recipe,
    trigger: parsed.recipe.trigger,
    // Nothing is approved by writing it. The administrator does that.
    hosts: "",
    state: "pending",
    createdBy: draft.createdBy,
  });

  const [row] = await database
    .select()
    .from(t.addons)
    .where(and(eq(t.addons.workspaceId, workspaceId), eq(t.addons.id, id)));

  const addon = row ? toAddon(row) : null;
  return addon
    ? { ok: true, addon }
    : { ok: false, problems: ["That addon could not be saved."] };
}

/**
 * Approves an addon and turns it on.
 *
 * The hosts are read from the recipe at this moment and written down, so what
 * was approved is what the administrator was shown. A later edit to the recipe
 * cannot inherit this approval, because the comparison in `toAddon` is against
 * the stored list rather than against the recipe itself.
 */
export async function approveAddon(
  workspaceId: string,
  id: string,
  approvedBy: string,
): Promise<Addon | null> {
  const database = requireDb();
  const [row] = await database
    .select()
    .from(t.addons)
    .where(and(eq(t.addons.workspaceId, workspaceId), eq(t.addons.id, id)));
  if (!row) return null;

  const parsed = readRecipe(row.recipe);
  if (!parsed.ok) return null;

  await database
    .update(t.addons)
    .set({
      hosts: parsed.hosts.join(" "),
      state: "live",
      approvedBy,
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(t.addons.workspaceId, workspaceId), eq(t.addons.id, id)));

  return addonById(workspaceId, id);
}

/** Turns one off or back on. A paused addon keeps its approval. */
export async function setAddonState(
  workspaceId: string,
  id: string,
  state: Exclude<AddonState, "pending">,
): Promise<Addon | null> {
  const database = requireDb();
  await database
    .update(t.addons)
    .set({ state, updatedAt: new Date() })
    .where(and(eq(t.addons.workspaceId, workspaceId), eq(t.addons.id, id)));
  return addonById(workspaceId, id);
}

export async function deleteAddon(workspaceId: string, id: string): Promise<void> {
  const database = requireDb();
  await database
    .delete(t.addons)
    .where(and(eq(t.addons.workspaceId, workspaceId), eq(t.addons.id, id)));
  await database
    .delete(t.addonRuns)
    .where(and(eq(t.addonRuns.workspaceId, workspaceId), eq(t.addonRuns.addonId, id)));
}

export async function addonById(workspaceId: string, id: string): Promise<Addon | null> {
  if (!databaseEnabled || !db) return null;
  const [row] = await db
    .select()
    .from(t.addons)
    .where(and(eq(t.addons.workspaceId, workspaceId), eq(t.addons.id, id)));
  return row ? toAddon(row) : null;
}

/** How many runs are kept per addon, so a busy one cannot fill the table. */
const KEEP_RUNS = 20;

/**
 * Records what one run did.
 *
 * Counters move in the same statement rather than being recomputed, so two runs
 * finishing at once cannot read the same total and both write it back.
 */
export async function recordRun(
  workspaceId: string,
  addonId: string,
  result: { ran: boolean; ok: boolean; steps: RunStep[] },
): Promise<void> {
  if (!databaseEnabled || !db) return;
  const database = requireDb();

  await database.insert(t.addonRuns).values({
    id: randomUUID(),
    workspaceId,
    addonId,
    ok: result.ok,
    ran: result.ran,
    steps: result.steps,
  });

  await database
    .update(t.addons)
    .set({
      lastRunAt: new Date(),
      runs: sql`${t.addons.runs} + 1`,
      failures: result.ok ? sql`${t.addons.failures}` : sql`${t.addons.failures} + 1`,
    })
    .where(and(eq(t.addons.workspaceId, workspaceId), eq(t.addons.id, addonId)));

  // Keep the log short. A window function rather than a read then a delete, so
  // two runs trimming at once cannot both decide the same row survives.
  await database.execute(sql`
    DELETE FROM ${t.addonRuns}
    WHERE ${t.addonRuns.workspaceId} = ${workspaceId}
      AND ${t.addonRuns.addonId} = ${addonId}
      AND ${t.addonRuns.id} NOT IN (
        SELECT id FROM ${t.addonRuns}
        WHERE workspace_id = ${workspaceId} AND addon_id = ${addonId}
        ORDER BY created_at DESC
        LIMIT ${KEEP_RUNS}
      )
  `);
}

export interface AddonRun {
  id: string;
  addonId: string;
  ok: boolean;
  ran: boolean;
  steps: RunStep[];
  createdAt: number;
}

/** The recent history for one business, newest first. */
export async function recentRuns(workspaceId: string, limit = 50): Promise<AddonRun[]> {
  if (!databaseEnabled || !db) return [];
  const rows = await db
    .select()
    .from(t.addonRuns)
    .where(eq(t.addonRuns.workspaceId, workspaceId))
    .orderBy(desc(t.addonRuns.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    addonId: row.addonId,
    ok: row.ok,
    ran: row.ran,
    steps: (row.steps as RunStep[]) ?? [],
    createdAt: row.createdAt.getTime(),
  }));
}

/** Said in the owner's words, for the approval screen. */
export function describeHosts(recipe: Recipe): string[] {
  const hosts = new Set<string>();
  for (const step of recipe.steps) {
    if (step.action === "http_post") {
      const host = hostOf(step.url);
      if (host) hosts.add(host);
    }
  }
  return [...hosts].sort();
}
