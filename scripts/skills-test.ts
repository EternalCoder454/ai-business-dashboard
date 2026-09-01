/**
 * Checks the shipped skill library and the reconciliation that delivers it.
 *
 * Reconciliation deletes and rewrites rows in a live workspace, so a wrong id,
 * a missed fingerprint, or an over-eager rule silently loses someone's
 * writing. These are the invariants that make it safe to run on every load.
 *
 *   npm run skills-test
 */
import { execFileSync } from "node:child_process";

import { promptFingerprint } from "../src/lib/coachSkills";
import { seedSkills } from "../src/lib/seedSkills";
import {
  RETIRED_SKILL_IDS,
  SHIPPED_SKILL_BODIES,
  skillReconciliation,
} from "../src/lib/shippedSkills";
import type { Skill } from "../src/lib/types";
import type { MutationOp } from "../src/lib/workspace";

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  if (ok) {
    console.log(`  ok   ${label}`);
    return;
  }
  failures += 1;
  console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ""}`);
}

const shipped = seedSkills();
const additions: typeof shipped = [];
const NOW = 1_700_000_000_000;

function gitShow(ref: string): string {
  return execFileSync("git", ["show", ref], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

/** Every skill body in a past revision, unescaped back to the stored string. */
function bodiesIn(source: string): string[] {
  return [...source.matchAll(/content:\s*`((?:[^`\\]|\\[\s\S])*)`/g)].map((match) =>
    match[1].replace(/\\([\s\S])/g, (_, char: string) =>
      char === "n" ? "\n" : char === "t" ? "\t" : char,
    ),
  );
}

function upserted(ops: MutationOp[]): Skill[] {
  const op = ops.find((o) => o.table === "skills" && o.action === "upsert");
  return op && op.action === "upsert" ? (op.rows as Skill[]) : [];
}

function deleted(ops: MutationOp[]): string[] {
  const op = ops.find((o) => o.table === "skills" && o.action === "delete");
  return op && op.action === "delete" ? op.ids : [];
}

console.log("\nthe library is internally consistent");
{
  const ids = shipped.map((s) => s.id);
  const dupes = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  check("no duplicate ids", dupes.length === 0, dupes.join(", "));

  const zombies = RETIRED_SKILL_IDS.filter(([id]) => ids.includes(id));
  check("nothing retired is still shipped", zombies.length === 0, zombies.map(([id]) => id).join(", "));

  const unknown = shipped.filter((s) => !SHIPPED_SKILL_BODIES.has(promptFingerprint(s.content)));
  check(
    "every shipped body is fingerprinted",
    unknown.length === 0,
    `${unknown.map((s) => s.name).join(", ")} — run: npm run skills-fingerprint`,
  );

  // The name beside each retired id records where its content went. It is a
  // note, not a live reference: cutting the library to a generic set unshipped
  // several of those destinations, and a skill that no longer ships is not a
  // skill that was wrongly retired.
  //
  // What has to hold is the opposite direction. Retiring something that still
  // ships would have reconciliation delete it and the next load add it back,
  // for as long as both lists disagree.
  const retired = new Set(RETIRED_SKILL_IDS.map(([id]) => id));
  const both = shipped.filter((s) => retired.has(s.id));
  check(
    "nothing is retired and shipped at once",
    both.length === 0,
    both.map((s) => s.id).join(", "),
  );
  check(
    "no id is retired twice",
    retired.size === RETIRED_SKILL_IDS.length,
    `${RETIRED_SKILL_IDS.length} entries, ${retired.size} ids`,
  );
}

console.log("\nthe fingerprint set matches what ships now");
{
  // Reconciliation only touches a skill whose body fingerprints to something
  // shipped. A set that has fallen behind the library means an untouched skill
  // reads as edited and never receives an update again.
  //
  // This used to check the oldest revision in git as well, because a workspace
  // could still be holding a body from any past version. Nothing out there
  // holds one now, and carrying every body ever shipped meant somebody's edit
  // could collide with a fingerprint from a version nobody remembers.
  const missing = shipped.filter(
    (skill) => !SHIPPED_SKILL_BODIES.has(promptFingerprint(skill.content)),
  );
  check(
    "every shipped body is in the set",
    missing.length === 0,
    `${missing.map((skill) => skill.name).join(", ")} — run: npm run skills-fingerprint`,
  );
}

console.log("\nan up-to-date workspace is left alone");
{
  // Reconciliation runs on every load, so a workspace already holding the
  // current library has to produce no writes at all. Otherwise every page
  // load costs a round trip and bumps updatedAt on skills nothing changed.
  const ops = skillReconciliation(shipped, shipped, additions, NOW);
  check("no writes at all", ops.length === 0, JSON.stringify(ops).slice(0, 160));
}

console.log("\na stale skill is rewritten, an edited one is not");
{
  // Any shipped skill will do; naming one tied this to a library that has
  // since been cut down, and the rule under test is not about which skill.
  const target = shipped[0];
  if (!target) throw new Error("the shipped library is empty");

  // Any other shipped body stands in for an older version of this skill: it
  // fingerprints as never edited and differs from what ships now, which is the
  // only thing the rule keys on. Reading a real one out of git would tie this
  // to how many commits ago the library last changed.
  const asShippedBefore = shipped.find((s) => s.id !== target.id)!.content;

  // The workspace already holds everything addable, so the only rows that can
  // come back are rewrites of the one skill under test.
  const settled = shipped.filter((s) => s.id !== target.id);

  const stale: Skill[] = [...settled, { ...target, content: asShippedBefore }];
  const rows = upserted(skillReconciliation(stale, shipped, additions, NOW));
  check("it is rewritten to the current version", rows.length === 1 && rows[0]?.content === target.content);
  check("keeping its id", rows[0]?.id === target.id);
  check("and stamped as updated", rows[0]?.updatedAt === NOW);

  const mine: Skill[] = [...settled, { ...target, content: "My own notes on the mod, entirely rewritten." }];
  const ops = skillReconciliation(mine, shipped, additions, NOW);
  check("an edited body is left alone", upserted(ops).length === 0, `${upserted(ops).length} rows`);
  check("and nothing is deleted for it", deleted(ops).length === 0);
}

console.log("\nretired skills are removed, unless edited");
{
  // RETIRED_SKILL_IDS is empty in the normal case, so the rule is exercised
  // against an id standing in for one, rather than only during a withdrawal.
  const retiredId = RETIRED_SKILL_IDS[0]?.[0] ?? "skill_seed_ceo_withdrawn-example";
  const asShipped: Skill = {
    id: retiredId,
    departmentId: "ceo",
    name: "Which One This Month",
    description: "A trigger line long enough to look real.",
    // A real shipped body, so it fingerprints as untouched.
    content: shipped[0]!.content,
    enabled: true,
    createdAt: 1,
    updatedAt: 1,
  };
  const withdrawn: [string, string][] = [[retiredId, "nothing"]];
  check(
    "a retired skill is deleted",
    deleted(skillReconciliation([asShipped], shipped, additions, NOW, withdrawn)).includes(retiredId),
  );

  const edited: Skill = { ...asShipped, content: "I rewrote this one and want to keep it." };
  check(
    "an edited retired skill survives",
    !deleted(skillReconciliation([edited], shipped, additions, NOW, withdrawn)).includes(retiredId),
  );
}

console.log("\nnothing deleted comes back");
{
  // Seed skills are delivered by seeding, never by reconciliation, so one the
  // owner deleted must stay gone. Only genuinely new skills are added.
  const withoutSeeded = shipped.filter((s) => !s.id.startsWith("skill_seed_"));
  const ops = skillReconciliation(withoutSeeded, shipped, additions, NOW);
  check("a deleted seed skill is not re-added", upserted(ops).length === 0, `${upserted(ops).length} rows`);

  const empty = skillReconciliation([], shipped, additions, NOW);
  check("a workspace with none gets the new ones", upserted(empty).length === additions.length);
}

const chars = shipped.reduce((n, s) => n + s.content.length, 0);
console.log(
  `\n  ${shipped.length} skills, ${chars.toLocaleString()} chars, ~${Math.round(chars / 3.7).toLocaleString()} tokens`,
);
console.log(`  ${RETIRED_SKILL_IDS.length} retired, ${SHIPPED_SKILL_BODIES.size} fingerprints`);

console.log(failures ? "\nFAILURES ABOVE" : "\nall checks passed");
process.exit(failures ? 1 : 0);
