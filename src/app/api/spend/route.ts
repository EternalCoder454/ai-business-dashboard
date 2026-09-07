import { and, eq, gte, sql } from "drizzle-orm";
import { auth, authEnabled } from "@/auth";
import { databaseEnabled, db } from "@/db/client";
import * as t from "@/db/schema";
import { membershipFor } from "@/db/tenancy";
import { costOf } from "@/lib/pricing";
import { track } from "@/lib/telemetry";
import type { TokenUsage } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What this business has spent on models this month, and on whom.
 *
 * Every reply already records its tokens, per message, on purpose: a running
 * total cannot be taken apart again and the question somebody asks later is
 * which head spent it. This is that question finally being asked.
 *
 * Summed in Postgres rather than in the browser. The snapshot deliberately does
 * not carry message bodies, so the client has counts and not usage, and even if
 * it did, totalling a year of messages on a phone to draw one number is the
 * wrong place for the arithmetic.
 *
 * Priced in TypeScript rather than in SQL, because the price table is code that
 * changes when a vendor reprices, and a model with no price has to come back as
 * unpriced rather than as zero. A CASE expression full of rates would put that
 * decision somewhere nobody would think to look when a price moved.
 */
export async function GET(request: Request) {
  if (!authEnabled || !databaseEnabled || !db) {
    return Response.json({ error: "Not configured." }, { status: 501 });
  }

  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return Response.json({ error: "Not signed in." }, { status: 401 });

  const membership = await membershipFor(email);
  if (!membership) return Response.json({ error: "No workspace." }, { status: 404 });

  /*
   * Calendar month, in the browser's own reckoning.
   *
   * The client sends the start rather than the server deciding it, because a
   * business in New Zealand and a server in Virginia disagree about when the
   * month turned, and the figure has to match the month the person is looking
   * at. Anything unparseable falls back to thirty days, which is wrong in a way
   * that is obvious rather than wrong in a way that is not.
   */
  const asked = Number(new URL(request.url).searchParams.get("since"));
  const since =
    Number.isFinite(asked) && asked > 0 && asked <= Date.now()
      ? asked
      : Date.now() - 30 * 86_400_000;

  const database = db;
  const workspaceId = membership.workspaceId;

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

  return Response.json({
    since,
    total,
    /** Replies the panel could not put a price on, so the total can say so. */
    unpriced,
    departments: [...byDepartment.values()].sort((a, b) => b.cost - a.cost),
  });
}
