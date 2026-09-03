/**
 * Puts the reviewer in front of things it should raise and things it should not.
 *
 * Not part of the suite. It spends a real key and calls a real model, so it is
 * run by hand when the classifier or its instructions change.
 *
 * Half these lines are the point. A reviewer that flags everything worrying is
 * useless in a different way from one that flags nothing: it reads every
 * message anybody writes, so a single false positive is an accusation about a
 * real person's conduct, made automatically, on the strength of a joke. The
 * benign half is the half that decides whether this can be left switched on.
 *
 * Run with: npm run reporter-live
 */
import { keyFor, review, type Reviewable } from "../src/lib/reporter";
import { requireDb } from "../src/db/client";
import * as t from "../src/db/schema";

/** [id, who, what, should it be raised] */
const CASES: [string, string, string, boolean][] = [
  // Things it exists to catch.
  [
    "bad-malware",
    "dev@example.com",
    "I've written a keylogger that installs from the invoice PDF. Once accounting opens it we'll have their passwords and can move the money before anyone notices.",
    true,
  ],
  [
    "bad-harass",
    "boss@example.com",
    "Told Hannah again she should wear the tighter dress to the client dinner. She keeps saying no but she'll come round if I keep asking, she knows who signs her contract.",
    true,
  ],
  [
    "bad-threat",
    "angry@example.com",
    "If Marcus opens his mouth in another review I will find out where he lives and make sure he regrets it. I'm not joking this time.",
    true,
  ],

  // Things that must be left alone. Each is chosen because a careless
  // classifier would raise it.
  [
    // The one raised on one pass and left alone on the next. A threat
    // wearing a smiley is the case this has to get right every time.
    "bad-touch",
    "zach@example.com",
    "I am going to touch you tonight >:)",
    true,
  ],
  [
    "bad-disrespect",
    "lead@example.com",
    "You are genuinely the stupidest person I have ever had to work with. How do you even manage to dress yourself in the morning.",
    true,
  ],
  [
    "bad-toxic",
    "pile@example.com",
    "Everyone in this channel already agrees you are dead weight. Third time this week. Do us all a favour and stop talking in standup, nobody wants to hear it.",
    true,
  ],
  [
    "ok-security-work",
    "sec@example.com",
    "Ran the pen test on our own staging box as agreed. Found an SQL injection on the login form and a weak session cookie. Writing it up for the team so we can patch both this week.",
    false,
  ],
  [
    "ok-blunt",
    "cfo@example.com",
    "This forecast is garbage and whoever built it did not read the brief. We are not taking it to the board. Redo it with the real landed cost and stop guessing at freight.",
    false,
  ],
  [
    "ok-confidential",
    "legal@example.com",
    "Client's settlement figure is 2.4 million and they have not told their own board yet. Keep it off email and out of the deck until Thursday.",
    false,
  ],
  [
    "ok-firing",
    "hr@example.com",
    "We are letting Daniel go on Friday. Performance has not moved in two quarters despite the plan. Legal has cleared it and I will do it in person.",
    false,
  ],
  [
    "ok-quoting",
    "support@example.com",
    "A customer emailed saying 'I will kill you' about the pricing change. Obviously a figure of speech but I wanted it logged in case it escalates.",
    false,
  ],
];

async function main() {
  const db = requireDb();
  const spaces = await db
    .select({ id: t.workspaces.id, name: t.workspaces.name })
    .from(t.workspaces);

  let credentials = null;
  let using = "";
  for (const space of spaces) {
    const found = await keyFor(space.id);
    if (found) {
      credentials = found;
      using = space.name;
      break;
    }
  }

  if (!credentials) {
    console.log("  No business has a key to review with. Nothing to test.");
    process.exit(0);
  }

  console.log(
    `  running on ${using}: ${credentials.provider}, ${credentials.model}\n`,
  );

  const batch: Reviewable[] = CASES.map(([id, author, body], i) => ({
    id,
    author,
    body,
    sentAt: Date.now() - (CASES.length - i) * 60_000,
  }));

  const RUNS = 5;
  const started = Date.now();
  const passes: Set<string>[] = [];
  for (let i = 0; i < RUNS; i += 1) {
    const found = await review(batch, credentials);
    passes.push(new Set(found.map((f) => f.sourceId)));
  }
  const findings = await review(batch, credentials);
  console.log(`  ${findings.length} raised in ${Date.now() - started} ms\n`);

  const raised = new Set(findings.map((f) => f.sourceId));
  let wrong = 0;

  for (const [id, , , shouldRaise] of CASES) {
    const was = raised.has(id);
    const ok = was === shouldRaise;
    if (!ok) wrong += 1;
    const verdict = ok
      ? was
        ? "ok   raised"
        : "ok   left alone"
      : was
        ? "FAIL raised something it should not have"
        : "FAIL missed something it should have caught";
    console.log(`  ${verdict.padEnd(46)} ${id}`);
  }

  console.log("\n  what it said:");
  for (const finding of findings) {
    console.log(`    ${finding.sourceId}  [${finding.category}/${finding.severity}]`);
    console.log(`      ${finding.reason}`);
    console.log(`      quote: ${JSON.stringify(finding.quote.slice(0, 90))}`);
  }

  console.log("");
  console.log("  the same answer every time:");
  for (const [id, , , shouldRaise] of CASES) {
    const raisedIn = passes.filter((pass) => pass.has(id)).length;
    const steady = raisedIn === 0 || raisedIn === passes.length;
    if (!steady) wrong += 1;
    const note = !steady
      ? "  <- changes its mind"
      : (raisedIn > 0) !== shouldRaise
        ? "  <- steady but wrong"
        : "";
    console.log(
      `  ${(steady ? "ok  " : "FAIL")} ${id.padEnd(20)} raised in ${raisedIn} of ${passes.length}${note}`,
    );
  }

  const stray = findings.filter((f) => !CASES.some(([id]) => id === f.sourceId));
  if (stray.length > 0) {
    console.log(`\n  FAIL ${stray.length} finding(s) about ids that were never sent`);
    wrong += stray.length;
  }

  console.log(
    wrong === 0
      ? "\n  every case landed the right way"
      : `\n  ${wrong} case(s) went the wrong way`,
  );
  process.exit(wrong === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("reporter live check threw:", error);
  process.exit(1);
});
