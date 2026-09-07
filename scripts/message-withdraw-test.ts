/**
 * That an administrator taking a message down removes it from the people in
 * the thread and leaves it on the record.
 *
 * The two halves are one feature and they pull opposite ways, which is why this
 * exists. Discord's moderator delete is the model for the first half: somebody
 * with the authority removes a message and it is gone for everyone. The second
 * half is the part Discord does not have, and the part a business needs, since
 * the manager who can be asked what was said must not be able to make it never
 * have happened by pressing the same button.
 *
 * So the assertions are: the inbox stops returning it, management goes on
 * returning it, and it is marked with who took it down.
 *
 * Not part of `npm test`: it needs a real database and CI has no credentials
 * for one, the same reason budget-test and message-churn-test are out.
 *
 *   npm run message-withdraw-test
 */
import { eq, sql } from "drizzle-orm";
import { requireDb } from "../src/db/client";
import * as t from "../src/db/schema";
import {
  auditThread,
  listThread,
  threadKeyFor,
  withdrawForReview,
} from "../src/db/messages";

const WS = `ws_withdrawtest_${Date.now().toString(36)}`;
const BOSS = "boss@withdrawtest.local";
const ALICE = "alice@withdrawtest.local";
const BOB = "bob@withdrawtest.local";

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures += 1;
}

void (async () => {
  const db = requireDb();
  const key = threadKeyFor(ALICE, BOB);

  const line = (id: string, body: string, at: number) => ({
    id,
    workspaceId: WS,
    threadKey: key,
    fromEmail: ALICE,
    toEmail: BOB,
    body,
    sentAt: at,
  });

  try {
    await db.insert(t.directMessages).values([
      line("dm1", "first", 1000),
      line("dm2", "second", 2000),
      line("dm3", "third", 3000),
    ]);

    console.log("\nbefore anybody takes anything down");
    {
      const inbox = await listThread(WS, ALICE, BOB);
      const record = await auditThread(WS, key);
      check("all three are in the thread", inbox.length === 3, `${inbox.length}`);
      check("and all three are on the record", record.length === 3, `${record.length}`);
    }

    console.log("\none message, taken down by the administrator");
    {
      const { withdrawn } = await withdrawForReview(WS, BOSS, { messageId: "dm2" });
      check("one went", withdrawn === 1, `${withdrawn}`);

      const inbox = await listThread(WS, ALICE, BOB);
      check("the thread is down to two", inbox.length === 2, `${inbox.length}`);
      check("and it is the right two", !inbox.some((m) => m.id === "dm2"),
        inbox.map((m) => m.id).join(","));

      const record = await auditThread(WS, key);
      check("the record still has all three", record.length === 3, `${record.length}`);

      const taken = record.find((m) => m.id === "dm2");
      check("the withdrawn one is marked", Boolean(taken?.deletedAt));
      check("with the administrator against it", taken?.deletedBy === BOSS, taken?.deletedBy);
      // The point of the whole exercise: the words are still there to read.
      check("and its text is still readable", taken?.body === "second", taken?.body);
    }

    console.log("\nthen the rest of the conversation");
    {
      const { withdrawn } = await withdrawForReview(WS, BOSS, { threadKey: key });
      check("the two that were left went", withdrawn === 2, `${withdrawn}`);

      const inbox = await listThread(WS, ALICE, BOB);
      check("nothing is left in the thread", inbox.length === 0, `${inbox.length}`);

      const record = await auditThread(WS, key);
      check("and the record is whole", record.length === 3, `${record.length}`);
      check("every one of them marked", record.every((m) => Boolean(m.deletedAt)));
    }

    console.log("\nand a second pass does not rewrite who took what down");
    {
      const before = (await auditThread(WS, key)).find((m) => m.id === "dm2")?.deletedAt;
      const { withdrawn } = await withdrawForReview(WS, "someone.else@withdrawtest.local", {
        threadKey: key,
      });
      check("there is nothing left to take down", withdrawn === 0, `${withdrawn}`);

      const after = (await auditThread(WS, key)).find((m) => m.id === "dm2");
      check("the timestamp is untouched", after?.deletedAt === before);
      check("and so is the name", after?.deletedBy === BOSS, after?.deletedBy);
    }
  } finally {
    await db.execute(sql`delete from direct_messages where workspace_id = ${WS}`);
    const left = await db
      .select()
      .from(t.directMessages)
      .where(eq(t.directMessages.workspaceId, WS));
    console.log("\nand the scratch workspace is cleaned up");
    check("nothing is left behind", left.length === 0, `${left.length} rows`);
  }

  console.log(failures === 0 ? "\nall checks passed" : `\n${failures} FAILURES ABOVE`);
  process.exit(failures === 0 ? 0 : 1);
})();
