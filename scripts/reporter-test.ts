/**
 * What gets attached to an accusation about somebody's conduct.
 *
 * The transcript is the difference between an operator judging a sentence and
 * judging a conversation, and the same sentence is a threat or a quote from a
 * film depending on what surrounds it. Getting the slice wrong would attach the
 * wrong context to a real person's name, which is worse than attaching none.
 *
 * Run with: npm run reporter-test
 */
import { contextFor, type Reviewable } from "../src/lib/reporter";

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!condition) failures += 1;
}

const line = (n: number): Reviewable => ({
  id: `m${n}`,

  author: n % 2 === 0 ? "ada@example.com" : "bob@example.com",
  body: `line ${n}`,
  sentAt: 1_700_000_000_000 + n * 60_000,
});

const many = Array.from({ length: 40 }, (_, i) => line(i));

console.log("the flagged line is in there, and marked");
const middle = contextFor("m20", many);
check("the line itself is present", middle.includes("line 20"));
check("it is marked", /^>> .*line 20/m.test(middle));
check("only one line is marked", (middle.match(/^>> /gm) ?? []).length === 1);

console.log("\nboth sides, because the reply is what settles it");
check("what came before", middle.includes("line 14"));
check("what came after", middle.includes("line 26"));
check("not the whole batch", !middle.includes("line 5") && !middle.includes("line 35"));

console.log("\nthe edges do not run off the end");
const first = contextFor("m0", many);
check("the first message still works", first.includes("line 0"));
check("and is marked", /^>> .*line 0/m.test(first));
const last = contextFor("m39", many);
check("the last message still works", last.includes("line 39"));

console.log("\nwho and when, so it reads as a conversation");
check("the author is there", middle.includes("ada@example.com"));
check("a timestamp is there", /\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(middle));

console.log("\nbounded");
const huge = [
  { ...line(1), body: "x".repeat(50_000) },
  { ...line(2), body: "y".repeat(50_000) },
];
check("one enormous message cannot fill the column", contextFor("m2", huge).length <= 4_000);

console.log("\nan id that was not in the batch attaches nothing");
// A model that invented a finding about a message it was never shown must not
// get somebody else's conversation stapled to it.
check("unknown id gives an empty transcript", contextFor("m999", many) === "");
check("empty batch gives an empty transcript", contextFor("m1", []) === "");

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
