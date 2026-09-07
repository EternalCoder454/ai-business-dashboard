/**
 * That withdrawing a message hides it without losing it.
 *
 * The two halves are the feature. Somebody should be able to take back a
 * message they regret, so it leaves the thread for both people in it. And a
 * business that may have to answer for what was said inside it should not lose
 * the record because the sender would rather it were gone, so the row stays and
 * the management screen still reads it.
 *
 * Neither half is visible from the other. Nothing about listThread says what
 * auditThread returns, and a filter dropped from one of them would look
 * correct: the inbox would simply show a message somebody withdrew, or the
 * record would quietly lose it. So both are asserted here, from the same rows.
 *
 * It runs in a scratch workspace and removes everything afterwards.
 *
 *   npm run messages-edit-test
 */
import { eq } from "drizzle-orm";
import { requireDb } from "../src/db/client";
import * as t from "../src/db/schema";
import { editMessage, deleteMessage, listThread, auditThread, withdrawnSince, threadKeyFor } from "../src/db/messages";

const WS = `ws_msgselftest_${Date.now().toString(36)}`;
const A = "a@selftest.local", B = "b@selftest.local";

void (async () => {
  const db = requireDb();
  let failures = 0;
  const ok = (l: string, c: boolean, d = "") => {
    console.log(`  ${c ? "ok  " : "FAIL"} ${l}${d ? ` (${d})` : ""}`);
    if (!c) failures += 1;
  };
  const key = threadKeyFor(A, B);
  try {
    await db.insert(t.directMessages).values([
      { id: "m1", workspaceId: WS, threadKey: key, fromEmail: A, toEmail: B, body: "first", sentAt: 1000 },
      { id: "m2", workspaceId: WS, threadKey: key, fromEmail: A, toEmail: B, body: "second", sentAt: 2000 },
      { id: "m3", workspaceId: WS, threadKey: key, fromEmail: B, toEmail: A, body: "reply", sentAt: 3000 },
    ]);

    console.log("\nediting");
    const e = await editMessage(WS, "m2", A, "second, corrected");
    ok("the sender may edit their own", "ok" in e, "error" in e ? e.error : "");
    const notMine = await editMessage(WS, "m3", A, "hijacked");
    ok("but not somebody else's", "error" in notMine, "error" in notMine ? notMine.error : "IT WAS ALLOWED");

    let live = await listThread(WS, A, B);
    ok("the thread shows the new text", live.find(m=>m.id==="m2")?.body === "second, corrected");
    ok("marked as edited", Boolean(live.find(m=>m.id==="m2")?.editedAt));
    ok("and never the old text", !live.some(m=>m.body === "second"));

    console.log("\nwithdrawing");
    const d = await deleteMessage(WS, "m1", A);
    ok("the sender may withdraw their own", "ok" in d);
    const notMineD = await deleteMessage(WS, "m3", A);
    ok("but not somebody else's", "error" in notMineD, "error" in notMineD ? notMineD.error : "IT WAS ALLOWED");

    live = await listThread(WS, A, B);
    ok("it is gone from the thread", !live.some(m=>m.id==="m1"), `${live.length} left`);
    ok("for the other person too", !(await listThread(WS, B, A)).some(m=>m.id==="m1"));

    console.log("\nbut management still has all of it");
    const seen = await auditThread(WS, key);
    ok("every message is there", seen.length === 3, `${seen.length}`);
    const m1 = seen.find(m=>m.id==="m1");
    ok("the withdrawn one included", Boolean(m1?.deletedAt), m1?.deletedAt ? "marked" : "not marked");
    ok("with who withdrew it", m1?.deletedBy === A, m1?.deletedBy);
    const m2 = seen.find(m=>m.id==="m2");
    ok("and the edited one keeps what it said first", m2?.originalBody === "second", m2?.originalBody);
    ok("alongside what it says now", m2?.body === "second, corrected");

    console.log("\na second edit does not lose the original");
    await editMessage(WS, "m2", A, "third go");
    const again = (await auditThread(WS, key)).find(m=>m.id==="m2");
    ok("still the text as first sent", again?.originalBody === "second", again?.originalBody);

    console.log("\nthe poll learns about it");
    const gone = await withdrawnSince(WS, A, B, 0);
    ok("withdrawals come back with a cursor", gone.some(g=>g.id==="m1"), JSON.stringify(gone));
    const delta = await listThread(WS, A, B, 2500);
    ok("an edit older than the cursor still arrives", delta.some(m=>m.id==="m2"), delta.map(m=>m.id).join(","));

    console.log("\nand a withdrawn message cannot be edited back");
    const revive = await editMessage(WS, "m1", A, "back again");
    ok("refused", "error" in revive, "error" in revive ? revive.error : "IT WAS ALLOWED");
  } finally {
    await db.delete(t.directMessages).where(eq(t.directMessages.workspaceId, WS));
    const left = await db.select().from(t.directMessages).where(eq(t.directMessages.workspaceId, WS));
    console.log("\nand the scratch workspace is cleaned up");
    ok("nothing is left behind", left.length === 0, `${left.length} rows`);
  }

  console.log(failures === 0 ? "\nall checks passed" : `\n${failures} FAILURES ABOVE`);
  process.exit(failures === 0 ? 0 : 1);
})();
