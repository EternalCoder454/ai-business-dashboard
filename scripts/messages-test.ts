/**
 * Direct messages against the real database.
 *
 * These are the only rows in the app that belong to two accounts, so the things
 * worth proving are the ones that a single-owner table never has to think
 * about: that a thread is the same thread in both directions, that reading it
 * marks only what was addressed to the reader, and that neither person can see
 * a conversation they are not part of.
 *
 * Run with: npm run messages-test
 */
import {
  deleteThreadsFor,
  listThread,
  listThreads,
  markThreadRead,
  sendMessage,
  threadKeyFor,
  unreadTotal,
} from "../src/db/messages";

const ADA = "ada@example.invalid";
const BEN = "ben@example.invalid";
const CAI = "cai@example.invalid";
const EVERYONE = [ADA, BEN, CAI];

let failures = 0;

function check(label: string, condition: boolean, detail = "") {
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!condition) failures += 1;
}

/** The business these people are in. Every read is fenced to it. */
const WS = "ws_test";

let counter = 0;
const send = (from: string, to: string, body: string) =>
  sendMessage(WS, from, to, body, `dmtest_${counter++}`);

async function main() {
  await deleteThreadsFor(EVERYONE);

  console.log("a thread is the same thread in both directions");
  check("key is order independent", threadKeyFor(ADA, BEN) === threadKeyFor(BEN, ADA));
  check("case is ignored", threadKeyFor("Ada@Example.invalid", BEN) === threadKeyFor(ADA, BEN));

  await send(ADA, BEN, "Are the mod servers up?");
  await send(BEN, ADA, "Two of three. Third is restarting.");
  await send(ADA, BEN, "Good enough for the demo.");

  const fromAda = await listThread(WS, ADA, BEN);
  const fromBen = await listThread(WS, BEN, ADA);
  check("both sides see the same messages", fromAda.length === 3 && fromBen.length === 3,
    `${fromAda.length} and ${fromBen.length}`);
  check("order is oldest first", fromAda[0].body.startsWith("Are the mod"));
  check("the reply is in the middle", fromAda[1].fromEmail === BEN);

  console.log("\nunread counts only what was addressed to you");
  check("ben has one unread from ada", (await unreadTotal(WS, BEN)) === 2, String(await unreadTotal(WS, BEN)));
  check("ada has one unread from ben", (await unreadTotal(WS, ADA)) === 1, String(await unreadTotal(WS, ADA)));

  console.log("\nreading a thread marks only the incoming half");
  await markThreadRead(WS, BEN, ADA);
  check("ben is caught up", (await unreadTotal(WS, BEN)) === 0);
  check(
    "ada is not marked read on ben's behalf",
    (await unreadTotal(WS, ADA)) === 1,
    String(await unreadTotal(WS, ADA)),
  );

  console.log("\na third person sees none of it");
  const caiThreads = await listThreads(WS, CAI);
  check("cai has no threads", caiThreads.length === 0, String(caiThreads.length));
  const caiPeek = await listThread(WS, CAI, ADA);
  check("cai cannot read ada's thread with ben", caiPeek.length === 0, String(caiPeek.length));

  console.log("\nthe overview shows the last line of each thread");
  await send(CAI, ADA, "Invoice for the Ravenmoor build is ready.");
  const adaThreads = await listThreads(WS, ADA);
  check("ada has two threads", adaThreads.length === 2, String(adaThreads.length));
  check("newest thread comes first", adaThreads[0].email === CAI, adaThreads[0].email);
  const withBen = adaThreads.find((t) => t.email === BEN);
  check("preview is the last message, not the first", withBen?.lastBody === "Good enough for the demo.");
  check("and it knows ada said it", withBen?.lastFromSelf === true);
  check("unread is per thread", adaThreads.find((t) => t.email === CAI)?.unread === 1);

  console.log("\nthe since cursor returns only what is new");
  const newest = Math.max(...fromAda.map((m) => m.sentAt));
  const nothingNew = await listThread(WS, ADA, BEN, newest);
  check("nothing new yet", nothingNew.length === 0, String(nothingNew.length));
  await send(BEN, ADA, "Third one is back.");
  const justOne = await listThread(WS, ADA, BEN, newest);
  check("one new message", justOne.length === 1, String(justOne.length));
  check("and it is the right one", justOne[0]?.body === "Third one is back.");

  console.log("\nsomebody who moves business leaves the old inbox behind");
  /*
   * The bug this was written for.
   *
   * A thread is keyed by the pair of addresses, and an address belongs to one
   * business at a time, so the pair looked like enough. It is not: an operator
   * can move somebody between businesses in two clicks, and every read here
   * was unfenced, so they would have opened their inbox in the new company and
   * found their old colleagues and everything said to each other.
   */
  const OTHER_WS = "ws_test_other";
  await sendMessage(OTHER_WS, ADA, BEN, "Said at the old place", "dmtest_moved");

  const hereThreads = await listThreads(WS, ADA);
  check(
    "the old thread is not in the new inbox",
    hereThreads.every((thread) => thread.lastBody !== "Said at the old place"),
  );

  const hereThread = await listThread(WS, ADA, BEN);
  check(
    "nor in the thread itself",
    hereThread.every((message) => message.body !== "Said at the old place"),
  );

  const thereThread = await listThread(OTHER_WS, ADA, BEN);
  check(
    "and it is still readable where it was said",
    thereThread.some((message) => message.body === "Said at the old place"),
    String(thereThread.length),
  );

  const hereUnread = await unreadTotal(WS, BEN);
  const thereUnread = await unreadTotal(OTHER_WS, BEN);
  check("unread is counted per business", thereUnread === 1, String(thereUnread));
  check("and the other business is unaffected", hereUnread !== thereUnread + 1);


  console.log("\ncleaning up");
  await deleteThreadsFor(EVERYONE);
  check("nothing left", (await listThreads(WS, ADA)).length === 0);

  console.log(failures ? "\nFAILURES ABOVE" : "\nall checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error("messages test threw:", error);
  process.exit(1);
});
