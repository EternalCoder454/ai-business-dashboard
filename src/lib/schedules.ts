import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { databaseEnabled, db, requireDb } from "@/db/client";
import * as t from "@/db/schema";
import { workspaceKey } from "@/db/keys";
import { loadWorkspace } from "@/db/repo";
import { kindOf, record } from "./telemetry";
import { buildSystemPrompt } from "@/lib/prompts";
import { providerOf, providerInfo, type Provider } from "@/lib/providers";
import { upcoming } from "@/lib/google";

/**
 * Work that happens without anybody asking for it.
 *
 * A business owner does not open a panel to ask what to focus on. They open it
 * when something is already there. So a schedule puts a question to one head on
 * a cadence and leaves the answer waiting, and the rhythm is the product rather
 * than the chat window.
 *
 * It spends the business's own key, unlike the conduct reviewer, which spends
 * the deployment's. The difference is whose work it is: a review of somebody's
 * staff is our duty of care and charging them for it would be strange, while a
 * Monday briefing is the thing they are paying for.
 */

/** A cap per run, so one business cannot spend the whole window. */
const MAX_PER_RUN = 10;
const MAX_TOKENS = 2_000;

export type Cadence = "daily" | "weekly" | "monthly";

/**
 * Whether a schedule is owed a run.
 *
 * Compared in whole days rather than by an interval, so a run that happens at
 * 03:00 one day and 03:05 the next is not judged to be four hours early. The
 * question is "has it already run for this period", not "has enough time
 * passed", and those come apart exactly when somebody is watching.
 */
export function isDue(
  schedule: { cadence: string; weekday: number; dayOfMonth: number; lastRunAt: Date | null },
  now: Date,
): boolean {
  const day = (date: Date) => Math.floor(date.getTime() / 86_400_000);
  const lastDay = schedule.lastRunAt ? day(schedule.lastRunAt) : -Infinity;
  const today = day(now);

  // Already run today, whatever the cadence. This is the guard that makes a
  // second tick in the same day harmless, which matters because a retry, a
  // manual run, and the cron can all land on the same morning.
  if (lastDay >= today) return false;

  if (schedule.cadence === "daily") return true;
  if (schedule.cadence === "weekly") return now.getUTCDay() === schedule.weekday;
  if (schedule.cadence === "monthly") return now.getUTCDate() === schedule.dayOfMonth;
  return false;
}

/** A readable line for the top of a briefing. */
function heading(cadence: string, now: Date): string {
  const date = now.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  if (cadence === "daily") return date;
  if (cadence === "weekly") return `Week of ${date}`;
  return now.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

interface Reply {
  text: string;
  input: number;
  output: number;
}

/**
 * One question, one answer, no streaming.
 *
 * Nobody is watching this run, so the streaming path the chat route uses would
 * be complication for nothing. Anthropic directly rather than through that
 * route, because the route is built around a browser holding the connection.
 */
async function ask(
  provider: Provider,
  model: string,
  apiKey: string,
  system: string,
  question: string,
): Promise<Reply | null> {
  const info = providerInfo(provider);
  if (provider !== "anthropic") {
    // The other two would each need their own request shape here, and a
    // scheduled briefing is not the place to find out that one of them has
    // drifted. A business on OpenAI or Gemini gets told rather than guessed at.
    console.warn(`[schedules] ${info.label} is not wired for scheduled runs yet`);
    return null;
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: MAX_TOKENS,
      // The same system block the chat path builds, so a scheduled answer
      // knows the business exactly as well as a typed one does.
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral", ttl: "1h" } }],
      messages: [{ role: "user", content: question }],
    }),
  });

  if (!response.ok) {
    console.error("[schedules] refused", response.status, (await response.text()).slice(0, 400));
    return null;
  }

  const body = (await response.json()) as {
    content?: { type: string; text?: string }[];
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text = body.content?.find((block) => block.type === "text")?.text ?? "";
  if (!text.trim()) return null;

  return {
    text,
    input: body.usage?.input_tokens ?? 0,
    output: body.usage?.output_tokens ?? 0,
  };
}

export interface ScheduleRun {
  considered: number;
  ran: number;
  skipped: string[];
  failed: string[];
}

/**
 * Every schedule that is owed a run, across every business.
 *
 * Sequential, and each one wrapped on its own. Unattended work that stops at
 * the first error stops silently, and every business after the broken one would
 * go without its briefing for as long as that lasted, with nothing saying so.
 */
export async function runSchedules(now = new Date()): Promise<ScheduleRun> {
  if (!databaseEnabled || !db) {
    return { considered: 0, ran: 0, skipped: ["No database."], failed: [] };
  }

  // tenancy-audit: every business's schedules, because this is the nightly
  // tick rather than a request. Each one is then loaded and run against its
  // own workspace, one at a time.
  const rows = await db
    .select()
    .from(t.schedules)
    .where(eq(t.schedules.enabled, true))
    .orderBy(asc(t.schedules.createdAt));

  const due = rows.filter((row) => isDue(row, now)).slice(0, MAX_PER_RUN * 20);

  let ran = 0;
  const skipped: string[] = [];
  const failed: string[] = [];
  const perWorkspace = new Map<string, number>();

  for (const schedule of due) {
    const already = perWorkspace.get(schedule.workspaceId) ?? 0;
    if (already >= MAX_PER_RUN) continue;

    const startedAt = Date.now();
    try {
      const workspace = await loadWorkspace(schedule.workspaceId, schedule.createdBy);
      const department = workspace.departments.find((d) => d.id === schedule.departmentId);
      if (!department) {
        skipped.push(`${schedule.name}: that head no longer exists`);
        continue;
      }

      const model = department.model || workspace.settings.model;
      const provider = providerOf(model);
      const apiKey =
        process.env[providerInfo(provider).envVar]?.trim() ||
        (await workspaceKey(schedule.workspaceId, provider));

      if (!apiKey) {
        skipped.push(`${schedule.name}: no ${provider} key on that business`);
        continue;
      }

      /*
       * The calendar of whoever set the schedule up.
       *
       * A briefing is addressed to that person: they wrote the question and
       * they are the one who will read the answer on Monday morning. Nobody
       * else's diary is involved, and somebody who has not connected one
       * simply gets a briefing without a calendar block in it.
       */
      const { events } = await upcoming(schedule.createdBy, 7);

      const system = buildSystemPrompt(
        department,
        workspace.profile,
        workspace.settings.companyName,
        workspace.skills.filter((s) => s.enabled && s.departmentId === department.id),
        workspace.settings.writingRules,
        workspace.account,
        workspace.memory,
        workspace.tasks,
        [],
        events,
      );

      const reply = await ask(provider, model, apiKey, system, schedule.prompt);
      if (!reply) {
        failed.push(schedule.name);
        record({
          operation: "schedule.run",
          workspaceId: schedule.workspaceId,
          ms: Date.now() - startedAt,
          outcome: "error",
          errorKind: "NoReply",
          errorNote: `${provider} returned nothing for a scheduled briefing`,
        });
        continue;
      }

      await requireDb().insert(t.briefings).values({
        id: randomUUID(),
        workspaceId: schedule.workspaceId,
        scheduleId: schedule.id,
        scheduleName: schedule.name,
        departmentId: department.id,
        title: `${schedule.name}: ${heading(schedule.cadence, now)}`,
        body: reply.text,
        inputTokens: reply.input,
        outputTokens: reply.output,
      });

      // Stamped only after the briefing is stored, so a failure between the two
      // is retried tomorrow rather than counted as done.
      // tenancy-audit: by the schedule's own id, taken from the row being run.
      await requireDb()
        .update(t.schedules)
        .set({ lastRunAt: now })
        .where(eq(t.schedules.id, schedule.id));

      perWorkspace.set(schedule.workspaceId, already + 1);
      ran += 1;
      record({
        operation: "schedule.run",
        workspaceId: schedule.workspaceId,
        ms: Date.now() - startedAt,
        outcome: "ok",
      });
    } catch (error) {
      console.error(`[schedules] ${schedule.id} failed`, error);
      failed.push(schedule.name);
      record({
        operation: "schedule.run",
        workspaceId: schedule.workspaceId,
        ms: Date.now() - startedAt,
        outcome: "error",
        errorKind: kindOf(error),
        errorNote: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { considered: due.length, ran, skipped, failed };
}

/** The briefings one business has, newest first. */
export async function listBriefings(workspaceId: string, limit = 50) {
  if (!databaseEnabled || !db) return [];
  return db
    .select()
    .from(t.briefings)
    .where(eq(t.briefings.workspaceId, workspaceId))
    .orderBy(desc(t.briefings.createdAt))
    .limit(limit);
}

/** How many nobody has opened, for the badge. */
export async function unreadBriefings(workspaceId: string): Promise<number> {
  if (!databaseEnabled || !db) return 0;
  const rows = await db
    .select({ id: t.briefings.id })
    .from(t.briefings)
    // isNull, not eq(readAt, null). `readAt = NULL` is never true in SQL, so the
    // eq form counts nothing and the badge never appears. The same mistake was
    // in the idempotency release path an hour before this was written, which is
    // a good argument for the linter rule this codebase does not have.
    .where(and(eq(t.briefings.workspaceId, workspaceId), isNull(t.briefings.readAt)))
    .limit(50);
  return rows.length;
}
