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

let counter = 0;
const send = (from: string, to: string, body: string) =>
  sendMessage(
  "ws_test",
  from, to, body, `dmtest_${counter++}`);

async function main() {
  await deleteThreadsFor(EVERYONE);

  console.log("a thread is the same thread in both directions");
  check("key is order independent", threadKeyFor(ADA, BEN) === threadKeyFor(BEN, ADA));
  check("case is ignored", threadKeyFor("Ada@Example.invalid", BEN) === threadKeyFor(ADA, BEN));

  await send(ADA, BEN, "Are the mod servers up?");
  await send(BEN, ADA, "Two of three. Third is restarting.");
  await send(ADA, BEN, "Good enough for the demo.");

  const fromAda = await listThread(ADA, BEN);
  const fromBen = await listThread(BEN, ADA);
  check("both sides see the same messages", fromAda.length === 3 && fromBen.length === 3,
    `${fromAda.length} and ${fromBen.length}`);
  check("order is oldest first", fromAda[0].body.startsWith("Are the mod"));
  check("the reply is in the middle", fromAda[1].fromEmail === BEN);

  console.log("\nunread counts only what was addressed to you");
  check("ben has one unread from ada", (await unreadTotal(BEN)) === 2, String(await unreadTotal(BEN)));
  check("ada has one unread from ben", (await unreadTotal(ADA)) === 1, String(await unreadTotal(ADA)));

  console.log("\nreading a thread marks only the incoming half");
  await markThreadRead(BEN, ADA);
  check("ben is caught up", (await unreadTotal(BEN)) === 0);
  check(
    "ada is not marked read on ben's behalf",
    (await unreadTotal(ADA)) === 1,
    String(await unreadTotal(ADA)),
  );

  console.log("\na third person sees none of it");
  const caiThreads = await listThreads(CAI);
  check("cai has no threads", caiThreads.length === 0, String(caiThreads.length));
  const caiPeek = await listThread(CAI, ADA);
  check("cai cannot read ada's thread with ben", caiPeek.length === 0, String(caiPeek.length));

  console.log("\nthe overview shows the last line of each thread");
  await send(CAI, ADA, "Invoice for the Ravenmoor build is ready.");
  const adaThreads = await listThreads(ADA);
  check("ada has two threads", adaThreads.length === 2, String(adaThreads.length));
  check("newest thread comes first", adaThreads[0].email === CAI, adaThreads[0].email);
  const withBen = adaThreads.find((t) => t.email === BEN);
  check("preview is the last message, not the first", withBen?.lastBody === "Good enough for the demo.");
  check("and it knows ada said it", withBen?.lastFromSelf === true);
  check("unread is per thread", adaThreads.find((t) => t.email === CAI)?.unread === 1);

  console.log("\nthe since cursor returns only what is new");
  const newest = Math.max(...fromAda.map((m) => m.sentAt));
  const nothingNew = await listThread(ADA, BEN, newest);
  check("nothing new yet", nothingNew.length === 0, String(nothingNew.length));
  await send(BEN, ADA, "Third one is back.");
  const justOne = await listThread(ADA, BEN, newest);
  check("one new message", justOne.length === 1, String(justOne.length));
  check("and it is the right one", justOne[0]?.body === "Third one is back.");

  console.log("\ncleaning up");
  await deleteThreadsFor(EVERYONE);
  check("nothing left", (await listThreads(ADA)).length === 0);

  console.log(failures ? "\nFAILURES ABOVE" : "\nall checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error("messages test threw:", error);
  process.exit(1);
});
