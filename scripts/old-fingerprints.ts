/**
 * The fingerprints of the bodies a live workspace is still holding.
 *
 * Reconciliation only rewrites a skill whose current content fingerprint is in
 * SHIPPED_SKILL_BODIES, which is how it tells a copy nobody has touched from
 * one somebody has rewritten. The generator writes only what ships today, on
 * the reasoning that nothing out there holds an older copy.
 *
 * That stopped being true the moment there were customers. Editing a shipped
 * skill and regenerating drops the fingerprint of the body every existing
 * workspace is holding, so those copies stop being recognised as untouched and
 * the improvement never reaches the people it was written for. Silently: the
 * test passes, the deploy is clean, and nothing changes for anybody.
 *
 * So the previous bodies get fingerprinted too, and added by hand.
 *
 *   npx tsx scripts/old-fingerprints.ts <a file to read the old bodies from>
 */
import { readFileSync } from "node:fs";
import { promptFingerprint } from "../src/lib/coachSkills";

const file = process.argv[2];
if (!file) {
  console.error("Give it a file. Usually: git show HEAD:src/lib/seedSkills.ts > old.ts");
  process.exit(1);
}

const source = readFileSync(file, "utf8");

// Every `content:` template literal in the file, which is every skill body.
const bodies = [...source.matchAll(/content: `([\s\S]*?)`,\n/g)].map((m) => m[1]);

console.log(`${bodies.length} bodies in ${file}\n`);
for (const body of bodies) {
  const first = body.split("\n")[0].slice(0, 58);
  console.log(`  ${promptFingerprint(body)}  ${first}`);
}
