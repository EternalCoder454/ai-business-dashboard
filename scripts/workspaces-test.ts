/**
 * Which business a person lands in when they belong to more than one.
 *
 * This is the rule the whole panel hangs off. membershipFor decides the
 * workspace on nearly every request, and every tenancy fence in the product is
 * an equality check against whatever it returns, so getting it wrong does not
 * produce an error: it produces one company's data on another company's screen.
 *
 * The ordering logic is reproduced here rather than reached through the
 * database, so the rule can be tested without three businesses and a person in
 * two of them. The query it mirrors sits in db/tenancy.ts and is a single
 * ORDER BY; if that changes, this must.
 *
 * Run with: npm run workspaces-test
 */

interface Row {
  workspaceId: string;
  createdAt: number;
  revoked: boolean;
}

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!condition) failures += 1;
}

/** The chosen one if it is still theirs, otherwise their oldest. */
function lands(rows: Row[], chosen: string | null): string | null {
  const live = rows.filter((row) => !row.revoked);
  if (live.length === 0) return null;
  const sorted = [...live].sort((a, b) => {
    const aChosen = a.workspaceId === chosen ? 1 : 0;
    const bChosen = b.workspaceId === chosen ? 1 : 0;
    if (aChosen !== bChosen) return bChosen - aChosen;
    return a.createdAt - b.createdAt;
  });
  return sorted[0].workspaceId;
}

const row = (id: string, at: number, revoked = false): Row => ({
  workspaceId: id,
  createdAt: at,
  revoked,
});

const two = [row("older", 100), row("newer", 200)];

console.log("one membership");
check("lands there", lands([row("only", 100)], null) === "only");
check("a stale choice does not strand them", lands([row("only", 100)], "gone") === "only");

console.log("\ntwo memberships");
check("no choice yet goes to the oldest", lands(two, null) === "older");
check("a choice is honoured", lands(two, "newer") === "newer");
check("choosing the one they are in changes nothing", lands(two, "older") === "older");

console.log("\nthe choice stops being valid");
// The case that matters. Somebody removed from the business they last had open
// must land somewhere they still belong, not nowhere.
check(
  "removed from the chosen one, falls back",
  lands([row("older", 100), row("newer", 200, true)], "newer") === "older",
);
check(
  "chosen a business they were never in",
  lands(two, "someone-elses") === "older",
);
check(
  "removed from all of them",
  lands([row("a", 100, true), row("b", 200, true)], "a") === null,
);

console.log("\nno memberships at all");
check("nothing to land in", lands([], null) === null);
check("and a choice does not invent one", lands([], "anything") === null);

console.log("\norder does not depend on the order rows come back");
const shuffled = [row("newer", 200), row("older", 100)];
check("oldest still wins", lands(shuffled, null) === "older");
check("chosen still wins", lands(shuffled, "newer") === "newer");

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
