import { randomUUID } from "node:crypto";
import { and, count, eq, gte } from "drizzle-orm";
import { databaseEnabled, db, requireDb } from "@/db/client";
import * as t from "@/db/schema";
import { liveAddonsFor, recordRun } from "@/db/addons";
import { COMPANY_ID } from "@/lib/seed";
import { runRecipe, type Effects } from "./run";
import type { TriggerName } from "./recipe";

/**
 * Setting addons off, and giving them somewhere to write.
 *
 * The one structural thing to understand here is why the effects write to the
 * tables directly instead of going through `applyMutations`. An addon that
 * files a task would otherwise land in the same code path that fires
 * `task.created`, which would fire the addon again, which would file another
 * task. Not a rate limit problem, an unbounded one. Writing underneath the
 * trigger path means that loop cannot form, rather than being caught after it
 * starts.
 *
 * Nothing in here throws. An addon failing is a line in its run log, and a run
 * log is not worth failing somebody's task update over.
 */

/** Where an addon's writes are filed, since no department asked for them. */
const ADDON_DEPARTMENT = COMPANY_ID;

/** A day, in the format a person reads rather than a timestamp. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * What a step may write, bound to one workspace.
 *
 * The workspace id is closed over rather than passed in a step, because there
 * is nowhere in the recipe language to name one. An addon cannot write outside
 * the business it belongs to because it has no way to say the words.
 */
function effectsFor(workspaceId: string): Effects {
  return {
    createTask: async ({ title, status }) => {
      const database = requireDb();
      await database.insert(t.tasks).values({
        id: randomUUID(),
        workspaceId,
        title,
        notes: "",
        status,
        departmentId: ADDON_DEPARTMENT,
        completedAt: status === "done" ? Date.now() : null,
      });
    },

    saveNote: async ({ title, body }) => {
      const database = requireDb();
      await database.insert(t.deliverables).values({
        id: randomUUID(),
        workspaceId,
        title,
        body,
        departmentId: ADDON_DEPARTMENT,
      });
    },
  };
}

/**
 * Runs every live addon listening for one trigger.
 *
 * Sequential rather than parallel, on purpose. Five addons each allowed five
 * steps, each of which may be a five second outbound call, is a lot of
 * concurrent sockets to open because somebody ticked a task off. In order also
 * means the run log reads in the order things happened.
 */
async function fire(
  workspaceId: string,
  trigger: TriggerName,
  context: Record<string, string>,
): Promise<void> {
  if (!databaseEnabled || !db) return;

  try {
    const addons = await liveAddonsFor(workspaceId, trigger);
    if (addons.length === 0) return;

    const effects = effectsFor(workspaceId);

    for (const addon of addons) {
      try {
        const result = await runRecipe({
          recipe: addon.recipe,
          context,
          // What the administrator approved, never what the recipe now asks
          // for. liveAddonsFor has already refused any addon where those two
          // have come apart; this is the same rule said again at the point of
          // use, because it is the one that matters.
          approvedHosts: addon.hosts,
          effects,
        });
        await recordRun(workspaceId, addon.id, result);
      } catch (error) {
        console.error(`[addons] ${addon.id} in ${workspaceId}`, error);
        await recordRun(workspaceId, addon.id, {
          ran: true,
          ok: false,
          steps: [{ did: addon.name, ok: false, detail: "That addon could not be run." }],
        }).catch(() => {});
      }
    }
  } catch (error) {
    // An addon system that cannot read its own table must not stop a task from
    // being saved.
    console.error("[addons] could not run", trigger, error);
  }
}

export interface TaskEvent {
  workspaceId: string;
  trigger: "task.created" | "task.completed";
  title: string;
  status: string;
  departmentId: string;
}

/**
 * Everything an addon is told about a task, and nothing else.
 *
 * Built here rather than by handing over the row, so a column added to the
 * tasks table later is not silently readable by every addon that already
 * exists. The list here and the list in `READABLE` have to agree, and a field
 * that is in one and not the other simply renders empty.
 */
export async function fireTaskEvents(events: TaskEvent[]): Promise<void> {
  if (events.length === 0) return;

  const names = new Map<string, string>();

  for (const event of events) {
    let company = names.get(event.workspaceId);
    if (company === undefined) {
      company = await companyName(event.workspaceId);
      names.set(event.workspaceId, company);
    }

    await fire(event.workspaceId, event.trigger, {
      "task.title": event.title,
      "task.status": event.status,
      "task.department": event.departmentId,
      "company.name": company,
      today: today(),
    });
  }
}

/** The daily tick, for one business. */
export async function fireDaily(workspaceId: string): Promise<void> {
  if (!databaseEnabled || !db) return;

  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);

  const [open, done] = await Promise.all([
    db
      .select({ n: count() })
      .from(t.tasks)
      .where(and(eq(t.tasks.workspaceId, workspaceId), eq(t.tasks.status, "todo"))),
    db
      .select({ n: count() })
      .from(t.tasks)
      .where(
        and(
          eq(t.tasks.workspaceId, workspaceId),
          eq(t.tasks.status, "done"),
          gte(t.tasks.completedAt, midnight.getTime()),
        ),
      ),
  ]).catch(() => [[{ n: 0 }], [{ n: 0 }]] as const);

  await fire(workspaceId, "schedule.daily", {
    "company.name": await companyName(workspaceId),
    today: today(),
    "tasks.open_count": String(open[0]?.n ?? 0),
    "tasks.done_today_count": String(done[0]?.n ?? 0),
  });
}

async function companyName(workspaceId: string): Promise<string> {
  if (!databaseEnabled || !db) return "";
  try {
    const [row] = await db
      .select({ name: t.settings.companyName })
      .from(t.settings)
      .where(eq(t.settings.workspaceId, workspaceId));
    return row?.name ?? "";
  } catch {
    return "";
  }
}

/**
 * The daily tick for every business that has an addon waiting for one.
 *
 * Only businesses with a live daily addon are looked at, so a deployment where
 * nobody uses them costs one query rather than one per workspace. Failures are
 * per business: one company's unreachable webhook must not stop the next
 * company's addon from running.
 */
export async function runDailyAddons(): Promise<{ considered: number; failed: string[] }> {
  if (!databaseEnabled || !db) return { considered: 0, failed: [] };

  // tenancy-audit: every business's daily addons, because this is the nightly
  // tick rather than a request. Each is then run against its own workspace.
  const rows = await db
    .selectDistinct({ workspaceId: t.addons.workspaceId })
    .from(t.addons)
    .where(and(eq(t.addons.state, "live"), eq(t.addons.trigger, "schedule.daily")));

  const failed: string[] = [];
  for (const row of rows) {
    try {
      await fireDaily(row.workspaceId);
    } catch (error) {
      console.error("[addons] daily failed for", row.workspaceId, error);
      failed.push(row.workspaceId);
    }
  }

  return { considered: rows.length, failed };
}
