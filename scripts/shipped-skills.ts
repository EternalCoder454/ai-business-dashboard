/**
 * Regenerates the fingerprint set in `src/lib/shippedSkills.ts`.
 *
 * The set holds the current shipped bodies. Reconciliation uses it to tell a
 * skill nobody has touched from one somebody has rewritten, and only touches
 * the first kind.
 *
 * It used to walk git history as well, so that a workspace loading after a gap
 * still had its older copy recognised. Nothing out there holds an older copy
 * any more, and carrying every body this app ever shipped meant an edit could
 * collide with a fingerprint from a version nobody remembers.
 *
 *   npm run skills-fingerprint
 *
 * Run it after changing any shipped skill, and commit the result alongside.
 * `npm run skills-test` fails if you forget.
 */
import { readFileSync, writeFileSync } from "node:fs";

import { promptFingerprint, seedCoachSkills } from "../src/lib/coachSkills";
import { seedSkills } from "../src/lib/seedSkills";

const OUT = "src/lib/shippedSkills.ts";

const seen = new Set<string>();
// The working tree is read from the modules rather than parsed, so what gets
// fingerprinted is exactly what reconciliation writes into a workspace.
const current = [...seedSkills(), ...seedCoachSkills()];
for (const skill of current) seen.add(promptFingerprint(skill.content));

// Only the array of fingerprints is generated. The imports above it, and the
// retired list and reconciliation below it, are written by hand, so the file
// is patched in place rather than rebuilt.
const existing = readFileSync(OUT, "utf8");
const open = existing.indexOf("new Set([");
const close = existing.indexOf("]);", open);
if (open < 0 || close < 0) throw new Error(`${OUT}: cannot find the fingerprint set`);

const lines = [...seen].sort().map((fingerprint) => `  "${fingerprint}",`);
writeFileSync(
  OUT,
  `${existing.slice(0, open)}new Set([\n${lines.join("\n")}\n${existing.slice(close)}`,
  "utf8",
);

console.log(`${seen.size} fingerprints from ${current.length} shipped skills`);
