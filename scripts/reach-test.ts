/**
 * An improved shipped skill actually reaches a workspace that has the old one.
 *
 * Reconciliation rewrites a skill only when its current fingerprint is in
 * SHIPPED_SKILL_BODIES, which is how it avoids trampling a skill somebody has
 * rewritten themselves. The generator writes what ships today and nothing
 * else, so editing a shipped skill and regenerating drops the fingerprint of
 * the body every live workspace is holding, and the improvement silently never
 * arrives. The test passes, the deploy is clean, and nothing changes.
 *
 * Run with: npm run reach-test
 */
import { skillReconciliation } from "../src/lib/shippedSkills";
import { seedSkills } from "../src/lib/seedSkills";
import type { Skill } from "../src/lib/types";

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!condition) failures += 1;
}

const shipped = seedSkills();
const pricing = shipped.find((s) => s.name === "Pricing Model")!;

// What a workspace created before today is holding.
const OLD_PRICING = `Start from what it is worth to the buyer, then check it clears cost. Cost sets the floor, never the price.

1. What it is worth to them, in money or time saved. Ask if you do not know.
2. The floor: real hours at a real rate, plus anything bought in, plus the share of fixed costs it has to carry.
3. What the alternatives cost, including doing nothing.
4. The price, and what it includes, stated so a scope argument later has an answer.
5. What happens at half the volume, and at double. If half is fatal, the price is wrong.

Rules:
- Show the arithmetic. A price with no working cannot be defended or adjusted.
- Mark every assumption in line, as "assuming 20 hours, replace with your real number". Never invent a number.
- This is a planning model, not tax or regulated financial advice. Anything with a filing, a statutory deadline, or a tax position on it goes to a licensed accountant in the user's jurisdiction, and you say so once, in line.`;

const asStored = (content: string): Skill => ({
  ...pricing,
  content,
  createdAt: 0,
  updatedAt: 0,
});

console.log("a workspace holding the previous body");
const ops = skillReconciliation([asStored(OLD_PRICING)], shipped, []);
const written = ops.flatMap((op) =>
  op.table === "skills" && op.action === "upsert" ? op.rows : [],
);
const rewritten = written.find((s) => s.id === pricing.id);

check("gets the skill rewritten", Boolean(rewritten));
check(
  "and the new content actually arrives",
  Boolean(rewritten && rewritten.content.includes("duty and customs")),
);

console.log("\na workspace that rewrote it themselves is left alone");
const theirs = asStored("Our own pricing process. Ask Dave first, he owns this.");
const leftAlone = skillReconciliation([theirs], shipped, []).flatMap((op) =>
  op.table === "skills" && op.action === "upsert" ? op.rows : [],
);
check(
  "their version survives",
  !leftAlone.some((s) => s.id === pricing.id),
  "the whole reason the fingerprint set exists",
);

console.log("\na workspace already up to date is not written to");
const current = skillReconciliation([asStored(pricing.content)], shipped, []).flatMap((op) =>
  op.table === "skills" && op.action === "upsert" ? op.rows : [],
);
check("nothing to do", !current.some((s) => s.id === pricing.id));

console.log(failures ? "\nFAILURES ABOVE" : "\nall checks passed");
process.exit(failures ? 1 : 0);
