/**
 * Checks the request guards without needing a signed-in browser.
 *
 * readJsonWithin sits in front of every chat and workspace request now, so a
 * mistake in its byte accounting would break the app for the one person allowed
 * to use it. These run against real Request objects rather than mocks.
 *
 * Run with: npm run guard-test
 */
import { readFileSync } from "node:fs";

import { readJsonWithin, withinRate } from "../src/lib/guard";
import { safeDestination } from "../src/app/signin/page";
import { applyOp, emptyWorkspace } from "../src/lib/workspace";
import { filesForDepartment } from "../src/lib/files";
import {
  COACH_ID,
  COMPANY_ID,
  DEPARTMENT_ACCENTS,
  departmentAccent,
  leadershipCoach,
  seedDepartments,
} from "../src/lib/seed";
import { handbookSkills } from "../src/lib/handbookSkills";
import { seedSkills } from "../src/lib/seedSkills";
import {
  SHIPPED_COACH_PROMPTS,
  promptFingerprint,
  seedCoachSkills,
} from "../src/lib/coachSkills";

let failures = 0;

function check(label: string, condition: boolean, detail = "") {
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!condition) failures += 1;
}

function post(body: string, headers: Record<string, string> = {}) {
  return new Request("https://example.invalid/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

async function main() {
  console.log("reading a body within the limit");
  const small = await readJsonWithin<{ hello: string }>(post(JSON.stringify({ hello: "world" })), 1000);
  check("accepted", small.ok);
  check("parsed correctly", small.ok && small.body.hello === "world");

  console.log("\nunicode is measured in bytes, not characters");
  // Four characters, twelve bytes. A length check on the string would pass.
  const emoji = JSON.stringify({ t: "🙂🙂" });
  const tight = await readJsonWithin(post(emoji), 12);
  check("rejected on byte length", !tight.ok);
  const roomy = await readJsonWithin(post(emoji), 200);
  check("accepted with room", roomy.ok);

  console.log("\na body past the limit is refused");
  const big = JSON.stringify({ data: "x".repeat(5000) });
  const rejected = await readJsonWithin(post(big), 1000);
  check("rejected", !rejected.ok);
  check("status is 413", !rejected.ok && rejected.status === 413);

  console.log("\na lying content-length does not get through");
  // The header claims it is tiny; only measuring the stream catches it.
  const liar = await readJsonWithin(post(big, { "content-length": "10" }), 1000);
  check("still rejected", !liar.ok, liar.ok ? "let through" : "");

  console.log("\nmalformed json is a 400, not a crash");
  const broken = await readJsonWithin(post("{not json"), 1000);
  check("rejected", !broken.ok);
  check("status is 400", !broken.ok && broken.status === 400);

  console.log("\nrate limiting counts per key and expires");
  const key = `test:${Math.random()}`;
  let allowed = 0;
  for (let i = 0; i < 5; i += 1) if (withinRate(key, 3, 60_000)) allowed += 1;
  check("stopped at the limit", allowed === 3, String(allowed));
  check("a different key is unaffected", withinRate(`${key}:other`, 3, 60_000));
  // A window that has already closed lets the next call through.
  check("expired window reopens", withinRate(key, 3, -1));

  console.log("\nonly same-site paths survive the sign-in redirect");
  check("a normal path passes through", safeDestination("/projects") === "/projects");
  check("a path with a query survives", safeDestination("/dept/x?c=1") === "/dept/x?c=1");
  check("absolute url is dropped", safeDestination("https://example.com") === "/");
  check("protocol-relative is dropped", safeDestination("//example.com") === "/");
  check("backslash form is dropped", safeDestination("/\\example.com") === "/");
  check("javascript scheme is dropped", safeDestination("javascript:alert(1)") === "/");
  check("missing value becomes root", safeDestination(undefined) === "/");


/**
 * The shape of the bug that made a first message vanish.
 *
 * send() created a conversation and immediately saved a message into it. Both
 * calls came from the same render, so the second one looked the conversation up
 * in a list captured before the first had happened, missed, and returned
 * without writing. Applying the two operations in sequence is exactly what the
 * store now does through its ref, and this proves the second one can see the
 * first.
 */
console.log("\na write immediately after a create can see it");
{
  const blank = emptyWorkspace(
    { model: "claude-sonnet-5", effort: "medium", theme: "dark", companyName: "T", companySubtitle: "", writingRules: "", roomBrevity: "tight", companyMark: "T", sidebarSide: "left", searchShortcut: "slash", wikiTitle: "Internal Wiki", wikiSubtitle: "2 minute read" },
    { mission: "", audience: "", brandVoice: "", keyFacts: "", products: "", stage: "", competitors: "", constraints: "", goals: "" },
    { displayName: "", roleTitle: "", pronouns: "", timezone: "", expertise: "", preferences: "", currentFocus: "", notes: "", updatedAt: 0 },
  );

  const created = {
    id: "conv_new",
    departmentId: "ceo",
    title: "New conversation",
    messages: [],
    createdAt: 1,
    updatedAt: 1,
  };

  const afterCreate = applyOp(blank, {
    table: "conversations",
    action: "upsert",
    rows: [created],
  });
  check("the create landed", afterCreate.conversations.length === 1);

  // The lookup the store performs before saving a message. Against the stale
  // snapshot it finds nothing, which is precisely how the message was lost.
  check("a stale snapshot cannot find it", !blank.conversations.some((c) => c.id === "conv_new"));

  const found = afterCreate.conversations.find((c) => c.id === "conv_new");
  check("the fresh one can", Boolean(found));

  const afterSave = applyOp(afterCreate, {
    table: "conversations",
    action: "upsert",
    rows: [{ ...found!, messages: [{ id: "m1", role: "user", content: "hello", timestamp: 2 }], updatedAt: 2 }],
  });
  check("the message survived", afterSave.conversations[0]?.messages.length === 1);
  check("and the title was not lost", afterSave.conversations[0]?.title === "New conversation");
}
  console.log("\na library file reaches only the departments it is scoped to");
  {
    const base = { kind: "image" as const, mediaType: "image/png", data: "", width: 0, height: 0, createdAt: 0, updatedAt: 0 };
    const library = [
      { ...base, id: "f1", name: "brand.png", departmentId: "marketing" },
      { ...base, id: "f2", name: "logo.png", departmentId: COMPANY_ID },
      { ...base, id: "f3", name: "private.png" },
      { ...base, id: "f4", name: "wireframe.png", departmentId: "design" },
    ];

    const marketing = filesForDepartment(library, "marketing").map((f) => f.id);
    check("its own file", marketing.includes("f1"));
    check("plus anything company wide", marketing.includes("f2"));
    check("not an untagged file", !marketing.includes("f3"));
    check("not another department's", !marketing.includes("f4"), marketing.join(","));

    const design = filesForDepartment(library, "design").map((f) => f.id);
    check("a second department sees its own plus company", design.join(",") === "f2,f4", design.join(","));

    const stranger = filesForDepartment(library, "nobody");
    check("an unknown department sees only company wide", stranger.length === 1);
  }

  console.log("\nthe coach upgrades only while she has never been edited");
  {
    const shipped = leadershipCoach(9).systemPrompt;
    check("the current prompt is stable under hashing",
      promptFingerprint(shipped) === promptFingerprint(shipped));
    check("a different prompt hashes differently",
      promptFingerprint(shipped) !== promptFingerprint(shipped + " "));
    check("the previous shipped version is recognised",
      SHIPPED_COACH_PROMPTS.has("1q6yu07"));
    check("an edited prompt is not",
      !SHIPPED_COACH_PROMPTS.has(promptFingerprint("I rewrote this myself.")));

    const skills = seedCoachSkills();
    check("she has playbooks", skills.length >= 8, String(skills.length));
    check("all scoped to her", skills.every((s) => s.departmentId === COACH_ID));
    check("ids are stable across runs",
      seedCoachSkills().map((s) => s.id).join() === skills.map((s) => s.id).join());
    check("ids are unique", new Set(skills.map((s) => s.id)).size === skills.length);
    check("every one has a trigger line", skills.every((s) => s.description.length > 20));
    check("none quotes a vendor statistic",
      !skills.some((s) => /[0-9]+ ?(%|per cent of cases)/.test(s.content)));
  }

  console.log("\nthe handbook skills are well formed and land on real departments");
  {
    const hb = handbookSkills();
    const departments = new Set(seedDepartments().map((d) => d.id));
    check("there are skills", hb.length >= 10, String(hb.length));
    check("ids are unique", new Set(hb.map((s) => s.id)).size === hb.length);
    check("ids are stable across runs",
      handbookSkills().map((s) => s.id).join() === hb.map((s) => s.id).join());
    check("every one targets a seeded department",
      hb.every((s) => departments.has(s.departmentId)),
      hb.filter((s) => !departments.has(s.departmentId)).map((s) => s.departmentId).join(","));
    check("every one has a trigger line", hb.every((s) => s.description.length > 25));
    check("every one has a body", hb.every((s) => s.content.length > 300));
    check("none collides with a seeded skill id",
      !seedSkills().some((s) => hb.some((h) => h.id === s.id)));

    // Coverage is a property of the whole library rather than of this file.
    // Consolidation folded fourteen handbook skills into the seeded ones they
    // duplicated, so a department can be fully covered and have nothing left
    // here. What must stay true is that no head is left with no playbook.
    const covered = new Set(
      [...seedSkills(), ...hb].map((s) => s.departmentId),
    );
    const bare = [...departments].filter((id) => !covered.has(id));
    check("every department has at least one skill", bare.length === 0, bare.join(","));
  }

  console.log("\nevery head is a different colour in All Hands");
  {
    // The whole point of the accent is telling replies apart, so two heads
    // sharing one is a bug rather than a cosmetic detail. Adding a department
    // without assigning it an accent is the way this regresses.
    const heads = [...seedDepartments(), leadershipCoach(99)];
    const used = new Map<string, string[]>();
    for (const head of heads) {
      const { label } = departmentAccent(head.id);
      used.set(label, [...(used.get(label) ?? []), head.personaName]);
    }
    const shared = [...used].filter(([, who]) => who.length > 1);
    check(
      "no two share an accent",
      shared.length === 0,
      shared.map(([colour, who]) => `${colour}: ${who.join(" + ")}`).join("; "),
    );
    check(
      "there are enough accents to go round",
      DEPARTMENT_ACCENTS.length >= heads.length,
      `${DEPARTMENT_ACCENTS.length} accents for ${heads.length} heads`,
    );
    check(
      "accent keys are unique",
      new Set(DEPARTMENT_ACCENTS.map((a) => a.key)).size === DEPARTMENT_ACCENTS.length,
    );
    // Accents resolve per theme now, so the check is that each one points at
    // its own token and that both themes actually define it. A dangling var()
    // renders as nothing at all, which is worse than the wrong colour.
    const css = readFileSync("src/app/globals.css", "utf8");
    const dangling = DEPARTMENT_ACCENTS.filter((a) => {
      if (a.dot !== `var(--md-accent-${a.key})`) return true;
      const declared = css.match(new RegExp(`--md-accent-${a.key}:`, "g")) ?? [];
      return declared.length < 2;
    });
    check(
      "every accent is a token defined in both themes",
      dangling.length === 0,
      dangling.map((a) => a.key).join(","),
    );
  }

  console.log(failures ? "\nFAILURES ABOVE" : "\nall checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error("guard test threw:", error);
  process.exit(1);
});
