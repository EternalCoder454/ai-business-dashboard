/**
 * Regenerates the fingerprint set in `src/lib/shippedSkills.ts`.
 *
 * The set has to hold every skill body this app has ever shipped, not just the
 * current one, because a workspace loading after a gap still carries an older
 * version and reconciliation has to recognise it as unedited. So this walks
 * back through git history, fingerprints the skill bodies in each revision of
 * the three skill files, and unions them with the working tree.
 *
 *   npm run skills-fingerprint
 *
 * Run it after changing any shipped skill, and commit the result alongside.
 * `npm run skills-test` fails if you forget.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

import { promptFingerprint, seedCoachSkills } from "../src/lib/coachSkills";
import { seedSkills } from "../src/lib/seedSkills";

const SOURCES = [
  "src/lib/seedSkills.ts",
  // Deleted from the working tree. The path stays so its history is still
  // walked: workspaces out there still hold those bodies, and reconciliation
  // has to recognise them as unedited.
  "src/lib/handbookSkills.ts",
  "src/lib/coachSkills.ts",
];

const OUT = "src/lib/shippedSkills.ts";

/**
 * Every `content` body in one past revision of a skill file.
 *
 * Old revisions are only text, so the template literals have to be unescaped
 * by hand to recover the string the app actually stored. Missing that makes a
 * body containing a backtick fingerprint differently from the running one, and
 * reconciliation then treats a skill nobody has touched as edited.
 */
function bodies(source: string): string[] {
  return [...source.matchAll(/content:\s*`((?:[^`\\]|\\[\s\S])*)`/g)].map((match) =>
    match[1].replace(/\\([\s\S])/g, (_, char: string) =>
      char === "n" ? "\n" : char === "t" ? "\t" : char,
    ),
  );
}

function git(...args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

const seen = new Set<string>();
let revisions = 0;

for (const file of SOURCES) {
  for (const commit of git("log", "--format=%H", "--", file).split("\n").filter(Boolean)) {
    let source: string;
    try {
      source = git("show", `${commit}:${file}`);
    } catch {
      continue; // The file did not exist at that commit.
    }
    revisions += 1;
    for (const body of bodies(source)) seen.add(promptFingerprint(body));
  }
}

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

console.log(
  `${seen.size} fingerprints: ${revisions} past revisions of ${SOURCES.length} files, plus ${current.length} current skills`,
);
