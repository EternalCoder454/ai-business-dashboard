import { and, eq, gte, sql } from "drizzle-orm";
import { requireDb } from "@/db/client";
import * as t from "@/db/schema";
import { costOf } from "@/lib/pricing";
import { track } from "@/lib/telemetry";
import type { TokenUsage } from "@/lib/types";

/**
 * What a business has spent on models since a moment, and on whom.
 *
 * Lifted out of /api/spend when the monthly budget started stopping replies
 * rather than only warning about them. Two callers now read this: the card that
 * draws the figure, and the chat route that refuses to spend past the limit.
 * They have to agree, and the only way to be sure of that is for there to be
 * one of it. A second implementation drifting from the first would mean a guard
 * that blocks at a number nobody is being shown.
 *
 * Everything below is the arithmetic the endpoint already did, unchanged.
 */
export interface Spend {
  total: number;
  /** Replies the panel could not put a price on, so the total can say so. */
  unpriced: number;
  departments: {
    departmentId: string;
    cost: number;
    replies: number;
    unpriced: number;
  }[];
}

export async function spendSince(workspaceId: string, since: number): Promise<Spend> {
  const db = requireDb();
  const database = db;

  /*
   * Which model each head runs on, and the workspace default behind it.
   *
   * Chat records the model on every message, because it can change between one
   * reply and the next. Meetings and briefings do not: they store the tokens a
   * head used and nothing about what produced them. So those two are priced at
   * the model that head is configured to use now, which is an assumption, and
   * is only wrong for a business that changed model part way through a month.
   *
   * The alternative was leaving them out, and that is worse. A meeting asks
   * every head at once and is the most expensive thing the panel does; a budget
   * that quietly omitted it would be wrong in the direction that costs money.
   */
  const [departmentRows, settingsRow] = await Promise.all([
    database
      .select({ id: t.departments.id, model: t.departments.model })
      .from(t.departments)
      .where(eq(t.departments.workspaceId, workspaceId)),
    database
      .select({ model: t.settings.model })
      .from(t.settings)
      .where(eq(t.settings.workspaceId, workspaceId))
      .limit(1),
  ]);

  const fallback = settingsRow[0]?.model ?? "";
  const modelOf = (departmentId: string) =>
    departmentRows.find((row) => row.id === departmentId)?.model || fallback;

  const [chat, meetings, briefings] = await track("spend.month", workspaceId, () =>
    Promise.all([
      database
        .select({
          departmentId: t.conversations.departmentId,
          model: t.messages.model,
          input: sql<number>`sum(${t.messages.inputTokens})::int`,
          output: sql<number>`sum(${t.messages.outputTokens})::int`,
          cacheRead: sql<number>`sum(${t.messages.cacheReadTokens})::int`,
          cacheWrite: sql<number>`sum(${t.messages.cacheWriteTokens})::int`,
          replies: sql<number>`count(*)::int`,
        })
        .from(t.messages)
        .innerJoin(
          t.conversations,
          and(
            eq(t.conversations.workspaceId, t.messages.workspaceId),
            eq(t.conversations.id, t.messages.conversationId),
          ),
        )
        .where(
          and(
            eq(t.messages.workspaceId, workspaceId),
            eq(t.messages.role, "assistant"),
            gte(t.messages.sentAt, since),
          ),
        )
        .groupBy(t.conversations.departmentId, t.messages.model),

      /*
       * One row per head per meeting reply, out of the JSON a round stores. A
       * response still pending, or one that failed, carries no usage, and those
       * are skipped rather than counted as zero: nothing was billed for a reply
       * that never arrived, and counting it would inflate the reply count.
       */
      database.execute<{
        department_id: string;
        input: string | number;
        output: string | number;
        cache_read: string | number;
        cache_write: string | number;
        replies: string | number;
      }>(sql`
        SELECT
          response->>'departmentId' AS department_id,
          sum(COALESCE((response->'usage'->>'input')::int, 0))::int AS input,
          sum(COALESCE((response->'usage'->>'output')::int, 0))::int AS output,
          sum(COALESCE((response->'usage'->>'cacheRead')::int, 0))::int AS cache_read,
          sum(COALESCE((response->'usage'->>'cacheWrite')::int, 0))::int AS cache_write,
          count(*)::int AS replies
        FROM meeting_rounds
        CROSS JOIN LATERAL jsonb_array_elements(responses) AS response
        WHERE workspace_id = ${workspaceId}
          AND created_at >= to_timestamp(${since} / 1000.0)
          AND response ? 'usage'
        GROUP BY response->>'departmentId'
      `),

      database
        .select({
          departmentId: t.briefings.departmentId,
          input: sql<number>`sum(${t.briefings.inputTokens})::int`,
          output: sql<number>`sum(${t.briefings.outputTokens})::int`,
          replies: sql<number>`count(*)::int`,
        })
        .from(t.briefings)
        .where(
          and(
            eq(t.briefings.workspaceId, workspaceId),
            gte(t.briefings.createdAt, new Date(since)),
          ),
        )
        .groupBy(t.briefings.departmentId),
    ]),
  );

  const byDepartment = new Map<
    string,
    { departmentId: string; cost: number; replies: number; unpriced: number }
  >();
  let total = 0;
  let unpriced = 0;

  const add = (
    departmentId: string,
    model: string | undefined,
    usage: TokenUsage,
    replies: number,
  ) => {
    const cost = costOf(model, usage);
    const current = byDepartment.get(departmentId) ?? {
      departmentId,
      cost: 0,
      replies: 0,
      unpriced: 0,
    };
    current.replies += replies;
    if (cost === null) {
      // Counted, never costed. A reply on a model with no published price is
      // still a reply, and hiding it would make the count disagree with itself.
      current.unpriced += replies;
      unpriced += replies;
    } else {
      current.cost += cost;
      total += cost;
    }
    byDepartment.set(departmentId, current);
  };

  for (const row of chat) {
    add(
      row.departmentId,
      row.model ?? undefined,
      {
        input: row.input,
        output: row.output,
        cacheRead: row.cacheRead,
        cacheWrite: row.cacheWrite,
      },
      row.replies,
    );
  }

  for (const row of meetings) {
    if (!row.department_id) continue;
    add(
      row.department_id,
      modelOf(row.department_id),
      {
        input: Number(row.input),
        output: Number(row.output),
        cacheRead: Number(row.cache_read),
        cacheWrite: Number(row.cache_write),
      },
      Number(row.replies),
    );
  }

  for (const row of briefings) {
    /*
     * A briefing records two totals and no cache split, so whatever it read
     * back from the cache is counted here at the full input price. That
     * overstates it, and the overstatement is stated rather than quietly
     * corrected: inventing a split that was never recorded would be a made up
     * number wearing the same clothes as a measured one.
     */
    add(
      row.departmentId,
      modelOf(row.departmentId),
      { input: row.input, output: row.output, cacheRead: 0, cacheWrite: 0 },
      row.replies,
    );
  }


  return {
    total,
    unpriced,
    departments: [...byDepartment.values()].sort((a, b) => b.cost - a.cost),
  };
}
