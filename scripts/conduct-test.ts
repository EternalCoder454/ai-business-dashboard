/**
 * That the conduct policy agrees with itself.
 *
 * Three lists have to stay in step: what the prompt tells the model it may
 * raise, what severity each kind carries, and what each is called on screen.
 * A category in the prompt and nowhere else is a finding that gets thrown away
 * on the way in. One with no label renders as its own slug. Neither shows up
 * as an error and neither is visible until somebody is looking at a real
 * report about a real person.
 *
 * Run with: npm run conduct-test
 */
import { readFileSync } from "node:fs";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  FLOOR,
  atLeast,
  floorFor,
  isCategory,
  labelFor,
  type Category,
} from "../src/lib/conduct";

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!condition) failures += 1;
}

/** The category names the prompt actually offers the model. */
function promptCategories(): string[] {
  const source = readFileSync("src/lib/reporter.ts", "utf8");
  const start = source.indexOf("const INSTRUCTIONS = `");
  const end = source.indexOf("`;", start);
  const prompt = source.slice(start, end);
  const named = new Set<string>();
  for (const line of prompt.split("\n")) {
    const match = /^- ([a-z-]+):/.exec(line.trim());
    if (match) named.add(match[1]);
  }
  return [...named];
}

console.log("every category has a floor and a label");
for (const category of CATEGORIES) {
  check(category, Boolean(FLOOR[category]) && Boolean(CATEGORY_LABEL[category]));
}

console.log("\nthe prompt and the code name the same things");
const named = promptCategories();
const listed = new Set<string>(CATEGORIES);
for (const category of named) {
  check(`${category} is a real category`, listed.has(category));
}
// suspicious-link is written by the link stripper, not raised by the model, so
// it is the one category that is deliberately absent from the prompt.
const missing = CATEGORIES.filter(
  (category) => category !== "suspicious-link" && !named.includes(category),
);
check(
  "every category is offered to the model",
  missing.length === 0,
  missing.join(", ") || "none missing",
);

console.log("\nthe things that were being missed");
for (const category of ["abuse", "discrimination", "drugs"] as const) {
  check(`${category} can be raised`, named.includes(category));
}
// "Fuck you" has to land somewhere that is not filtered out as swearing, and
// a slur has to be serious rather than a footnote.
check("abuse is at least medium", FLOOR.abuse === "medium" || FLOOR.abuse === "high");
check("discrimination is high", FLOOR.discrimination === "high");
check("child safety is high", FLOOR["child-safety"] === "high");

console.log("\nthe prompt does not undo itself");
const source = readFileSync("src/lib/reporter.ts", "utf8");
const prompt = source.slice(source.indexOf("const INSTRUCTIONS = `"));
// The old wording excluded swearing outright, which is what swallowed
// "fuck you". It must now be qualified by the target.
check(
  "swearing is excluded only when aimed at a thing",
  /swearing (that is )?aimed at a thing/.test(prompt),
);
check(
  "and the test is stated as the target",
  /target, not the language|aimed AT a person/i.test(prompt),
);
check("a joke is not a defence for a slur", /not rescued by being a joke/i.test(prompt));

console.log("\nseverity floors hold");
check("the model may raise", atLeast("high", "low") === "high");
check("the model may not lower", atLeast("low", "high") === "high");
check("nonsense falls to the floor", atLeast("banana", "medium") === "medium");
check("a missing value falls to the floor", atLeast(undefined, "high") === "high");

console.log("\nrows written before a rename still read");
check("a known category", labelFor("threat") === "Threat");
check("an unknown one shows itself", labelFor("gossip") === "gossip");
check("and gets a sane floor", floorFor("gossip") === "medium");
check("isCategory refuses a stranger", !isCategory("gossip"));
check("and accepts a real one", isCategory("drugs" satisfies Category));

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
