/**
 * That the monthly budget actually stops spending, and only when it should.
 *
 * It spent months as a number that was watched and never enforced, so the one
 * thing worth proving is that it is no longer decorative. The failure that
 * matters is the quiet one: a ceiling that reads correctly on the card, and
 * lets every request through anyway.
 *
 * Run against a scratch workspace of its own, since it writes messages with
 * token counts on them and then reads the money back out.
 *
 * Not part of `npm test`, for the same reason message-churn-test is not: it
 * needs a real database and CI has no credentials for one. Adding it to the
 * suite broke the build immediately, which is the convention announcing itself.
 *
 *   npm run budget-test
 */
import { eq, sql } from "drizzle-orm";
import { requireDb } from "../src/db/client";
import * as t from "../src/db/schema";
import { budgetState, forgetBudget } from "../src/db/budget";

const WS = `ws_budgettest_${Date.now().toString(36)}`;

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures += 1;
}

/** The first moment of this month, which is what budgetState counts from. */
function monthStart(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
}

void (async () => {
  const db = requireDb();

  try {
    await db.insert(t.settings).values({ workspaceId: WS, model: "claude-sonnet-5" });
    await db.insert(t.departments).values({
      id: "d1",
      workspaceId: WS,
      name: "Finance",
      roleTitle: "Head",
      status: "active",
    });
    await db
      .insert(t.conversations)
      .values({ id: "c1", workspaceId: WS, departmentId: "d1", title: "Costs" });

    console.log("\nno ceiling means nothing is counted or stopped");
    {
      const state = await budgetState(WS);
      check("not exceeded", !state.exceeded);
      check("and reports no limit", state.limit === 0, String(state.limit));
      // The point of the zero case: it must not pay for the count at all.
      check("with nothing spent", state.spent === 0, String(state.spent));
    }

    console.log("\na reply is spent against it");
    {
      // Priced at Sonnet's published rate. A million in and a million out is
      // comfortably more than a one dollar ceiling and comfortably less than a
      // ten thousand dollar one, which is what the two cases below need.
      await db.insert(t.messages).values({
        id: "m1",
        workspaceId: WS,
        conversationId: "c1",
        role: "assistant",
        content: "spent",
        model: "claude-sonnet-5",
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        sentAt: monthStart() + 1000,
      });

      forgetBudget(WS);
      await db.update(t.settings).set({ monthlyBudget: 10_000 }).where(eq(t.settings.workspaceId, WS));
      const roomy = await budgetState(WS);
      check("a ceiling well above it does not stop", !roomy.exceeded);
      check("and the spend is real money", roomy.spent > 0, `$${roomy.spent.toFixed(2)}`);

      forgetBudget(WS);
      await db.update(t.settings).set({ monthlyBudget: 1 }).where(eq(t.settings.workspaceId, WS));
      const tight = await budgetState(WS);
      check("a ceiling below it does", tight.exceeded, `$${tight.spent.toFixed(2)} of $1`);
    }

    console.log("\nraising the ceiling takes effect at once, stale count or not");
    {
      /*
       * Only the spend is reused for a minute; the limit is read on every call.
       *
       * Which is the right way round, and worth pinning down. An administrator
       * raising a budget is doing it because everything has stopped, and a
       * minute of it going on refusing while a cached number caught up would be
       * the worst possible moment to be slow. The figure being up to a minute
       * behind is the only staleness anybody meets, and it costs a minute of
       * replies at the ceiling rather than a minute of an outage.
       *
       * This test ran the other way round first: it expected a raise to be
       * ignored until the cache was cleared, and the code was already better
       * than the test.
       */
      await db.update(t.settings).set({ monthlyBudget: 10_000 }).where(eq(t.settings.workspaceId, WS));
      const raised = await budgetState(WS);
      check("clear immediately after being raised", !raised.exceeded);
      check("on a count that was not retaken", raised.spent > 0, `$${raised.spent.toFixed(2)}`);

      await db.update(t.settings).set({ monthlyBudget: 1 }).where(eq(t.settings.workspaceId, WS));
      check("and lowering it stops just as fast", (await budgetState(WS)).exceeded);
    }

    console.log("\nand a ceiling set back to zero is no ceiling");
    {
      forgetBudget(WS);
      await db.update(t.settings).set({ monthlyBudget: 0 }).where(eq(t.settings.workspaceId, WS));
      const none = await budgetState(WS);
      check("nothing is stopped", !none.exceeded);
    }
  } finally {
    await db.execute(sql`delete from messages where workspace_id = ${WS}`);
    await db.execute(sql`delete from conversations where workspace_id = ${WS}`);
    await db.execute(sql`delete from departments where workspace_id = ${WS}`);
    await db.execute(sql`delete from settings where workspace_id = ${WS}`);
    const left = await db.select().from(t.messages).where(eq(t.messages.workspaceId, WS));
    console.log("\nand the scratch workspace is cleaned up");
    check("nothing is left behind", left.length === 0, `${left.length} rows`);
  }

  console.log(failures === 0 ? "\nall checks passed" : `\n${failures} FAILURES ABOVE`);
  process.exit(failures === 0 ? 0 : 1);
})();
