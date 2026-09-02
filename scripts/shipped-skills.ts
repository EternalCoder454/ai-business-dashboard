/**
 * Regenerates the fingerprint set in `src/lib/shippedSkills.ts`.
 *
 * The set holds the current shipped bodies. Reconciliation uses it to tell a
 * skill nobody has touched from one somebody has rewritten, and only touches
 * the first kind.
 *
 * It used to walk git history as well, so that a workspace loading after a gap
 * still had its older copy recognised. Carrying every body this app ever
 * shipped meant an edit could collide with a fingerprint from a version nobody
 * remembers, so that went.
 *
 * What replaced it is PREVIOUSLY_SHIPPED, a short hand-kept list in the same
 * file, and this writes the spread of it back every time. That line used to be
 * hand-added inside the set, which meant the next run of this script deleted
 * it: the fingerprint of the body every live workspace was holding disappeared,
 * those copies stopped being recognised as untouched, and the improvement they
 * were waiting for silently never arrived. The test passed, the deploy was
 * clean, and nothing changed for anybody.
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

// The spread goes first and is written by this script rather than by hand, so
// it cannot be lost the next time somebody regenerates.
const lines = [
  "  ...PREVIOUSLY_SHIPPED,",
  ...[...seen].sort().map((fingerprint) => `  "${fingerprint}",`),
];
writeFileSync(
  OUT,
  `${existing.slice(0, open)}new Set([\n${lines.join("\n")}\n${existing.slice(close)}`,
  "utf8",
);

console.log(
  `${seen.size} shipped fingerprints from ${current.length} skills, ` +
    "plus whatever PREVIOUSLY_SHIPPED holds",
);
