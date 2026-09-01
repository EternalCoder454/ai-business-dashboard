/**
 * Checks the studio record and the prompt block built from it.
 *
 * This block is injected into every head on every message, so a mistake here
 * is paid for on each request and can put a stale decision in front of the
 * model as though it were current.
 *
 *   npm run memory-test
 */
import { buildMemoryBlock, figureSeries, memoryFor } from "../src/lib/memory";
import { buildSystemPrompt, buildTasksBlock } from "../src/lib/prompts";
import { COMPANY_ID, seedDepartments } from "../src/lib/seed";
import { applyOp, emptyWorkspace } from "../src/lib/workspace";
import type { CompanyProfile, MemoryEntry, Task, UserAccount } from "../src/lib/types";
import type { StoredSettings } from "../src/lib/workspace";

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures += 1;
}

const DAY = 86_400_000;
const T0 = 1_770_000_000_000;

/** Every field present and empty, which is what an unfilled profile really is. */
const EMPTY_PROFILE: CompanyProfile = {
  mission: "",
  audience: "",
  brandVoice: "",
  keyFacts: "",
  products: "",
  stage: "",
  competitors: "",
  constraints: "",
  goals: "",
};

function entry(over: Partial<MemoryEntry> & Pick<MemoryEntry, "kind" | "label">): MemoryEntry {
  return {
    id: `mem_${over.label.replace(/\W+/g, "").toLowerCase()}_${over.occurredAt ?? T0}`,
    value: "",
    detail: "",
    revisitWhen: "",
    departmentId: COMPANY_ID,
    occurredAt: T0,
    archived: false,
    createdAt: T0,
    updatedAt: T0,
    ...over,
  };
}

console.log("what one head sees");
{
  const entries = [
    entry({ kind: "decision", label: "Company wide call" }),
    entry({ kind: "decision", label: "Finance only", departmentId: "finance" }),
    entry({ kind: "decision", label: "Legal only", departmentId: "legal" }),
    entry({ kind: "decision", label: "Overtaken", archived: true }),
  ];

  const finance = memoryFor(entries, "finance").map((e) => e.label);
  check("its own entries", finance.includes("Finance only"));
  check("plus everything company wide", finance.includes("Company wide call"));
  check("not another head's", !finance.includes("Legal only"), finance.join(", "));
  check("and nothing archived", !finance.includes("Overtaken"));
}

console.log("\nfigures group into series by label");
{
  const entries = [
    entry({ kind: "figure", label: "Wishlists", value: "800", occurredAt: T0 - 30 * DAY }),
    entry({ kind: "figure", label: "Wishlists", value: "1,240", occurredAt: T0 }),
    entry({ kind: "figure", label: "Downloads", value: "14k", occurredAt: T0 }),
  ];
  const series = figureSeries(entries);
  check("one series per label", series.size === 2, String(series.size));
  check("readings collected", series.get("Wishlists")?.length === 2);
  check(
    "newest reading first",
    series.get("Wishlists")?.[0]?.value === "1,240",
    series.get("Wishlists")?.[0]?.value,
  );
}

console.log("\nthe prompt block");
{
  check("is empty when there is nothing to say", buildMemoryBlock([], "finance") === "");
  check(
    "is empty when everything is archived",
    buildMemoryBlock([entry({ kind: "decision", label: "Gone", archived: true })], "finance") === "",
  );

  const block = buildMemoryBlock(
    [
      entry({
        kind: "decision",
        label: "No new client sites until the game ships",
        detail: "Splitting attention was costing both.",
        revisitWhen: "Frontier Assembly ships",
      }),
      entry({ kind: "figure", label: "Wishlists", value: "800", occurredAt: T0 - 30 * DAY }),
      entry({ kind: "figure", label: "Wishlists", value: "1,240", occurredAt: T0 }),
      entry({ kind: "decision", label: "Legal only", departmentId: "legal" }),
      entry({ kind: "decision", label: "Overtaken", archived: true }),
    ],
    "finance",
  );

  check("carries the decision", block.includes("No new client sites until the game ships"));
  check("with its reasoning", block.includes("Splitting attention"));
  check("and its trigger", block.includes("Revisit when: Frontier Assembly ships"));
  check("carries the figure", block.includes("1,240"));
  check("and the reading before it, so a direction is visible", block.includes("800"));
  check("newest reading first", block.indexOf("1,240") < block.indexOf("800"));
  check("leaves out another head's decision", !block.includes("Legal only"));
  check("leaves out anything archived", !block.includes("Overtaken"));
  check("tells the model not to ask for what it already has", block.includes("instead of asking"));
  check(
    "warns against reading a trend into one reading",
    block.includes("snapshot, not a trend"),
  );
  check("dates every entry", /\d{4}-\d{2}-\d{2}/.test(block));
}

console.log("\nit reaches the system prompt, late enough to protect the cache");
{
  const profile: CompanyProfile = {
    mission: "Make things worth playing.",
    audience: "",
    brandVoice: "",
    keyFacts: "",
    products: "",
    stage: "",
    competitors: "",
    constraints: "",
    goals: "",
  };
  const finance = seedDepartments().find((d) => d.id === "finance")!;
  const entries = [entry({ kind: "figure", label: "Wishlists", value: "1,240" })];

  const without = buildSystemPrompt(finance, profile, "Eterneon", [], "rules", undefined, []);
  const withMemory = buildSystemPrompt(finance, profile, "Eterneon", [], "rules", undefined, entries);

  check("the block is present", withMemory.includes("1,240"));
  check("and absent when there is nothing", !without.includes("WHAT THIS STUDIO HAS DECIDED"));

  // The prompt is one cached prefix, so everything before the block has to be
  // byte-identical or adding an entry re-bills the whole system block.
  const shared = withMemory.slice(0, withMemory.indexOf("=== WHAT THIS STUDIO"));
  check(
    "everything above it is unchanged",
    without.startsWith(shared),
    `${shared.length} chars of prefix`,
  );
  check(
    "the company profile still comes first",
    withMemory.indexOf("COMPANY PROFILE") < withMemory.indexOf("WHAT THIS STUDIO"),
  );
  check(
    "and the writing rules still come last",
    withMemory.lastIndexOf("rules") > withMemory.indexOf("WHAT THIS STUDIO"),
  );
}

console.log("\nthe workspace reducer");
{
  const settings = { companyName: "Eterneon" } as unknown as StoredSettings;
  const blank = emptyWorkspace(settings, {} as CompanyProfile, {} as UserAccount);
  check("starts empty", blank.memory.length === 0);

  const older = entry({ kind: "figure", label: "Wishlists", value: "800", occurredAt: T0 - DAY });
  const newer = entry({ kind: "figure", label: "Wishlists", value: "1,240", occurredAt: T0 });

  const added = applyOp(applyOp(blank, { table: "memory", action: "upsert", rows: [older] }), {
    table: "memory",
    action: "upsert",
    rows: [newer],
  });
  check("holds both readings", added.memory.length === 2);
  check("newest first", added.memory[0]?.value === "1,240", added.memory[0]?.value);

  const edited = applyOp(added, {
    table: "memory",
    action: "upsert",
    rows: [{ ...newer, value: "1,300" }],
  });
  check("an edit replaces rather than duplicates", edited.memory.length === 2);
  check("with the new value", edited.memory[0]?.value === "1,300");

  const removed = applyOp(edited, { table: "memory", action: "delete", ids: [newer.id] });
  check("delete takes one", removed.memory.length === 1);

  // A project is a folder. Deleting it must never destroy what was filed in it.
  const filed = applyOp(blank, {
    table: "memory",
    action: "upsert",
    rows: [entry({ kind: "decision", label: "Filed under a project", projectId: "proj_1" })],
  });
  const unlinked = applyOp(filed, { table: "projects", action: "delete", ids: ["proj_1"] });
  check("deleting a project keeps the entry", unlinked.memory.length === 1);
  check("and releases it", unlinked.memory[0]?.projectId === undefined);
}

console.log("\nopen work reaches the prompt, finished work does not");
{
  const task = (over: Partial<Task> & Pick<Task, "title">): Task => ({
    id: `task_${over.title.replace(/\W+/g, "").toLowerCase()}`,
    notes: "",
    status: "todo",
    departmentId: COMPANY_ID,
    order: 0,
    createdAt: T0,
    updatedAt: T0,
    ...over,
  });

  const tasks = [
    task({ title: "Write the Steam short description", departmentId: "marketing" }),
    task({ title: "Company wide thing" }),
    task({ title: "Finished already", status: "done" }),
    task({ title: "Legal only", departmentId: "legal" }),
    task({ title: "Dated one", departmentId: "marketing", dueAt: T0 + DAY, status: "doing" }),
  ];

  const block = buildTasksBlock(tasks, "marketing");
  check("carries its own open work", block.includes("Steam short description"));
  check("plus company wide work", block.includes("Company wide thing"));
  check("leaves out finished work", !block.includes("Finished already"));
  check("leaves out another head's", !block.includes("Legal only"));
  check("marks what is in progress", block.includes("in progress"));
  check("dated work comes first", block.indexOf("Dated one") < block.indexOf("Steam short"));
  check("says what to do with it", block.includes("Weigh it before proposing anything new"));
  check(
    "is empty when nothing is open",
    buildTasksBlock([task({ title: "x", status: "done" })], "marketing") === "",
  );

  const finance = seedDepartments().find((d) => d.id === "finance")!;
  const withTasks = buildSystemPrompt(
    finance,
    EMPTY_PROFILE,
    "Eterneon",
    [],
    "house rules",
    undefined,
    [],
    [task({ title: "Chase the invoice", departmentId: "finance" })],
  );
  check("reaches the system prompt", withTasks.includes("Chase the invoice"));
  check(
    "and the writing rules still come last",
    withTasks.lastIndexOf("house rules") > withTasks.indexOf("OPEN WORK"),
  );

  // Adding a task must not re-bill everything above it in the cached prefix.
  const without = buildSystemPrompt(
    finance,
    EMPTY_PROFILE,
    "Eterneon",
    [],
    "house rules",
    undefined,
    [],
    [],
  );
  const shared = withTasks.slice(0, withTasks.indexOf("=== OPEN WORK"));
  check("everything above it is unchanged", without.startsWith(shared), `${shared.length} chars`);
}

console.log("\nthe task reducer");
{
  const bare = { companyName: "Eterneon" } as unknown as StoredSettings;
  const blank = emptyWorkspace(bare, EMPTY_PROFILE, {} as UserAccount);
  check("starts empty", blank.tasks.length === 0);

  const one: Task = {
    id: "task_1",
    title: "First",
    notes: "",
    status: "todo",
    departmentId: COMPANY_ID,
    order: 0,
    createdAt: T0,
    updatedAt: T0,
  };
  const added = applyOp(blank, { table: "tasks", action: "upsert", rows: [one] });
  check("holds it", added.tasks.length === 1);

  const closed = applyOp(added, {
    table: "tasks",
    action: "upsert",
    rows: [{ ...one, status: "done", completedAt: T0 + DAY }],
  });
  check("an edit replaces rather than duplicates", closed.tasks.length === 1);
  check("with the new status", closed.tasks[0]?.status === "done");

  const filed = applyOp(blank, {
    table: "tasks",
    action: "upsert",
    rows: [{ ...one, projectId: "proj_1" }],
  });
  const unlinked = applyOp(filed, { table: "projects", action: "delete", ids: ["proj_1"] });
  check("deleting a project keeps the task", unlinked.tasks.length === 1);
  check("and releases it", unlinked.tasks[0]?.projectId === undefined);

  const gone = applyOp(added, { table: "tasks", action: "delete", ids: ["task_1"] });
  check("delete removes it", gone.tasks.length === 0);
}


console.log("\ncompany-wide entries are never crowded out by a cap");
{
  const shared = entry({
    kind: "decision",
    label: "No new client sites",
    occurredAt: T0 - 400 * DAY,
  });
  const crowd = Array.from({ length: 30 }, (_, i) =>
    entry({
      kind: "decision",
      label: `finance call ${i}`,
      departmentId: "finance",
      occurredAt: T0 - i * DAY,
    }),
  );

  // The failure this guards against: the company-wide entry passes the filter,
  // then sorts oldest and falls off the end of the cap, so it silently never
  // reaches the department it was written for.
  const block = buildMemoryBlock([shared, ...crowd], "finance");
  check("an old company-wide decision still reaches the prompt", block.includes("No new client sites"));
  check("and is marked as applying to everyone", block.includes("[company-wide]"));
  check("the department's own newest still gets in", block.includes("finance call 0"));
  check("and what did not fit is admitted to", /older decision\(s\) not listed/.test(block));

  // Figures were grouped into a Map and sliced in insertion order, so whether a
  // company-wide one survived depended on where it happened to be added.
  const figures = [
    ...Array.from({ length: 25 }, (_, i) =>
      entry({ kind: "figure", label: `metric ${i}`, value: String(i), departmentId: "finance" }),
    ),
    entry({ kind: "figure", label: "Runway", value: "4 months" }),
  ];
  check(
    "a company-wide figure added last still reaches the prompt",
    buildMemoryBlock(figures, "finance").includes("Runway"),
  );

  const tasks: Task[] = [
    {
      id: "shared",
      title: "Freeze new client work",
      notes: "",
      status: "todo",
      departmentId: COMPANY_ID,
      order: 0,
      createdAt: T0,
      updatedAt: T0,
    },
    ...Array.from({ length: 20 }, (_, i) => ({
      id: `own_${i}`,
      title: `finance task ${i}`,
      notes: "",
      status: "todo" as const,
      departmentId: "finance",
      order: i,
      dueAt: T0 + i * DAY,
      createdAt: T0,
      updatedAt: T0,
    })),
  ];
  // Dated work sorts first, so an undated company-wide task was cut every time.
  const taskBlock = buildTasksBlock(tasks, "finance");
  check("an undated company-wide task still reaches the prompt", taskBlock.includes("Freeze new client work"));
  check("and is marked company-wide", taskBlock.includes("company-wide"));
}


console.log(failures ? "\nFAILURES ABOVE" : "\nall checks passed");
process.exit(failures ? 1 : 0);
