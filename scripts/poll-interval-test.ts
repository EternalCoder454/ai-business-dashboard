/**
 * That the inbox slows down when nothing is happening, and speeds back up.
 *
 * messages.overview was 55% of all server time across the life of the
 * deployment: 7,313 calls averaging 324ms, 790 of them slow. The query is one
 * round trip doing four milliseconds of work against twenty odd rows, so
 * nothing about it explains the number. It is simply asked constantly, mostly
 * by somebody with the panel open in a tab, and mostly it answers "the same as
 * last time".
 *
 * Backing off is worth real money and gets a feature wrong if it sticks: an
 * inbox that takes two minutes to show a message somebody is waiting for is a
 * broken inbox, however cheap. So both directions are asserted here, and the
 * one that matters is that it comes back.
 *
 *   npm run poll-interval-test
 */
import {
  FAST_MS,
  PATIENCE,
  SLOW_MS,
  digestOf,
  nextInterval,
  type InboxShape,
} from "../src/lib/pollInterval";

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures += 1;
}

console.log("\nit stays responsive while anything is happening");
{
  check("a fresh inbox polls fast", nextInterval(0) === FAST_MS, `${nextInterval(0)}ms`);
  for (let quiet = 0; quiet <= PATIENCE; quiet += 1) {
    check(
      `still fast after ${quiet} identical answers`,
      nextInterval(quiet) === FAST_MS,
      `${nextInterval(quiet)}ms`,
    );
  }
  /*
   * Somebody who has just read a message is very likely about to get a reply,
   * so the responsive window has to outlast the pause in a conversation rather
   * than only the moment of it.
   */
  check(
    "which is at least a minute of quiet before slowing at all",
    FAST_MS * (PATIENCE + 1) >= 60_000,
    `${(FAST_MS * (PATIENCE + 1)) / 1000}s`,
  );
}

console.log("\nand stretches once it is clear nothing is");
{
  check("it widens past the patience", nextInterval(PATIENCE + 1) > FAST_MS);
  check("and keeps widening", nextInterval(PATIENCE + 2) > nextInterval(PATIENCE + 1));
  check("up to the ceiling", nextInterval(PATIENCE + 20) === SLOW_MS, `${SLOW_MS}ms`);
  check("and never past it", nextInterval(9999) === SLOW_MS);
  check(
    "never going backwards on the way",
    Array.from({ length: 30 }, (_, i) => nextInterval(i)).every(
      (value, i, all) => i === 0 || value >= all[i - 1],
    ),
  );

  /*
   * The saving this exists for. A tab open eight hours with one busy hour goes
   * from about 1,150 polls to a few hundred.
   */
  let polls = 0;
  let quiet = 0;
  for (let elapsed = 0; elapsed < 7 * 3600_000; ) {
    elapsed += nextInterval(quiet);
    quiet += 1;
    polls += 1;
  }
  const fixed = Math.floor((7 * 3600_000) / FAST_MS);
  check(
    "seven idle hours costs far fewer polls than a fixed interval",
    polls < fixed / 2,
    `${polls} against ${fixed}`,
  );
}

console.log("\nthe digest notices everything worth waking up for");
{
  const base: InboxShape = {
    unread: 0,
    threads: [{ email: "a@b.com", lastSentAt: 1000, unread: 0, lastSeen: true }],
    people: [{ email: "a@b.com", presence: "online" }],
  };
  const same = digestOf(base);

  check("an unchanged inbox reads as unchanged", digestOf({ ...base }) === same);

  const changed = (shape: InboxShape) => digestOf(shape) !== same;

  check("a new message", changed({ ...base, unread: 1 }));
  check(
    "a reply in a thread",
    changed({
      ...base,
      threads: [{ email: "a@b.com", lastSentAt: 2000, unread: 0, lastSeen: true }],
    }),
  );
  check(
    "one read somewhere else",
    changed({
      ...base,
      threads: [{ email: "a@b.com", lastSentAt: 1000, unread: 0, lastSeen: false }],
    }),
  );
  check(
    "an unread count moving on its own",
    changed({
      ...base,
      threads: [{ email: "a@b.com", lastSentAt: 1000, unread: 3, lastSeen: true }],
    }),
  );
  check("a new thread", changed({ ...base, threads: [] }));
  check(
    "a colleague coming online",
    changed({ ...base, people: [{ email: "a@b.com", presence: "away" }] }),
  );
  check(
    "and somebody joining",
    changed({
      ...base,
      people: [...(base.people ?? []), { email: "c@d.com", presence: "online" }],
    }),
  );
}

console.log("\nand an empty inbox is still a stable answer");
{
  /*
   * Nothing at all has to digest identically every time, or a workspace with an
   * empty inbox would look like constant activity and never back off, which is
   * the one case where backing off is most obviously right.
   */
  check("twice over", digestOf({}) === digestOf({}));
  check(
    "however it arrives",
    digestOf({}) === digestOf({ threads: [], people: [], unread: 0 }),
  );
}

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} FAILURES ABOVE`);
process.exit(failures === 0 ? 0 : 1);
