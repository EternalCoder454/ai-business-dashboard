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
import { handbookSkills } from "../src/lib/handbookSkills";
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

const shipped = [...seedSkills(), ...handbookSkills()];
const additions = handbookSkills();
const NOW = 1_700_000_000_000;

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

  // Each retired entry records where its content went, which is the only
  // record of that. A second round of merging could retire the destination.
  const live = new Set(shipped.map((s) => s.name));
  const orphans = RETIRED_SKILL_IDS.filter(([, into]) => !live.has(into));
  check(
    "every retired skill was folded into one still shipped",
    orphans.length === 0,
    orphans.map(([id, into]) => `${id} -> ${into}`).join(", "),
  );
}

console.log("\nthe fingerprint set covers what earlier versions shipped");
{
  // The whole safety argument rests on recognising an old body as unedited.
  // If the set were regenerated from the working tree alone, every workspace
  // still holding a previous version would look edited and never update.
  const previous = execFileSync("git", ["show", "HEAD:src/lib/handbookSkills.ts"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const old = [...previous.matchAll(/content:\s*`((?:[^`\\]|\\[\s\S])*)`/g)].map((m) =>
    m[1].replace(/\\([\s\S])/g, (_, c: string) => (c === "n" ? "\n" : c === "t" ? "\t" : c)),
  );
  const missed = old.filter((body) => !SHIPPED_SKILL_BODIES.has(promptFingerprint(body)));
  check(
    "last commit's handbook bodies are all recognised",
    old.length > 0 && missed.length === 0,
    `${missed.length} of ${old.length} unrecognised`,
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
  const target = shipped.find((s) => s.name === "Mod Architecture");
  if (!target) throw new Error("Mod Architecture is missing from the library");

  // A body this app shipped before, so it fingerprints as never edited.
  const shippedBefore = [...SHIPPED_SKILL_BODIES].length > 0;
  const oldBody = execFileSync("git", ["show", "HEAD:src/lib/seedSkills.ts"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const previousBody = [...oldBody.matchAll(/content:\s*`((?:[^`\\]|\\[\s\S])*)`/g)]
    .map((m) => m[1].replace(/\\([\s\S])/g, (_, c: string) => (c === "n" ? "\n" : c === "t" ? "\t" : c)))
    .find((body) => body.startsWith("NeoForge 1.21.1 is the baseline") || body.includes("Target matrix"));

  check("found the previous version of a merged skill", shippedBefore && Boolean(previousBody));

  // The workspace already holds everything addable, so the only rows that can
  // come back are rewrites of the one skill under test.
  const settled = shipped.filter((s) => s.id !== target.id);

  if (previousBody) {
    const stale: Skill[] = [...settled, { ...target, content: previousBody }];
    const rows = upserted(skillReconciliation(stale, shipped, additions, NOW));
    check("it is rewritten to the merged version", rows.length === 1 && rows[0]?.content === target.content);
    check("keeping its id", rows[0]?.id === target.id);
    check("and stamped as updated", rows[0]?.updatedAt === NOW);
  }

  const mine: Skill[] = [...settled, { ...target, content: "My own notes on the mod, entirely rewritten." }];
  const ops = skillReconciliation(mine, shipped, additions, NOW);
  check("an edited body is left alone", upserted(ops).length === 0, `${upserted(ops).length} rows`);
  check("and nothing is deleted for it", deleted(ops).length === 0);
}

console.log("\nretired skills are removed, unless edited");
{
  const [[retiredId]] = RETIRED_SKILL_IDS;
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
  check("a retired skill is deleted", deleted(skillReconciliation([asShipped], shipped, additions, NOW)).includes(retiredId));

  const edited: Skill = { ...asShipped, content: "I rewrote this one and want to keep it." };
  check(
    "an edited retired skill survives",
    !deleted(skillReconciliation([edited], shipped, additions, NOW)).includes(retiredId),
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
