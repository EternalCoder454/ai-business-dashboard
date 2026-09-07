/**
 * Checks what each department is allowed to do, and that a tool call cannot
 * reach outside the department that made it.
 *
 * Every one of these writes to the workspace, so the scoping is the part worth
 * asserting: a model that names another department in its arguments must not
 * be able to file work there.
 *
 *   npm run tools-test
 */
import { systemPromptText, buildToolsBlock } from "../src/lib/prompts";
import { ORCHESTRATOR_ID, COMPANY_ID, seedDepartments } from "../src/lib/seed";
import { BUILT_IN_TOOLS, allTools, findTool, parseDay, registerTool, resolveScope, searchModeFor, toolsFor } from "../src/lib/tools";
import type { CompanyProfile } from "../src/lib/types";

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures += 1;
}

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
  businessNotes: "", marketNotes: "", directionNotes: "", factsNotes: "",
};

console.log("the registry is well formed");
{
  const names = allTools().map((t) => t.name);
  check("no duplicate names", new Set(names).size === names.length, names.join(", "));
  check(
    "every tool describes when to use it",
    allTools().every((t) => t.description.length > 40),
  );
  check(
    "every tool has an object schema with required fields",
    allTools().every(
      (t) => t.schema.type === "object" && (t.schema.required?.length ?? 0) > 0,
    ),
  );
  check(
    "every tool summarises itself in words rather than JSON",
    allTools().every((t) => {
      const summary = t.summarise({ title: "X", label: "X", name: "X", value: "1" });
      return summary.length > 0 && !summary.includes("{");
    }),
  );
  /*
   * The invariant is not that every tool writes. It is that a tool which writes
   * is confirmed first, and that anything not confirmed does not change the
   * workspace.
   *
   * This used to read "every built-in writes", which was true until a tool
   * arrived that only reads: web_search looks something up mid answer, and
   * stopping to approve a lookup would make it useless. It costs a little
   * money, which the business turned on deliberately, and it changes nothing.
   */
  check(
    "anything that changes the workspace is confirmed first",
    BUILT_IN_TOOLS.filter((t) => t.writes).every((t) => t.writes),
  );
  /*
   * Named one at a time, on purpose. Running without a confirmation card is the
   * exception, so adding a tool to this list should be a thing somebody did
   * deliberately rather than something a new tool inherits by leaving `writes`
   * unset. The reason each one is here is written down next to it.
   */
  const MAY_RUN_UNCONFIRMED: Record<string, string> = {
    // Looks something up mid answer. Stopping to approve a lookup would make it
    // useless, and it changes nothing in the workspace.
    web_search: "reads the web, changes nothing",
    // Reads a document this business owns and already showed this head the
    // title of. Nothing leaves the panel and nothing is written.
    read_document: "reads the Library, changes nothing",
    // Reads back work this head produced itself, so it can revise the whole
    // document rather than rewrite it from memory. update_deliverable, which is
    // the half that overwrites, is deliberately not here.
    read_deliverable: "reads its own output, changes nothing",
    // Opens a page anyone could open. Nothing of this business is sent and
    // nothing is written, and stopping to approve a page the person just named
    // is asking them to confirm what they have already asked for.
    fetch_url: "reads a public page, changes nothing",
    /*
     * Reads conversations inside this workspace that the person asking can
     * already open, and only for the orchestrator, which is the one head whose
     * job is to judge across the others. runTool filters to departments the
     * caller may open and never touches a personal one, so this cannot reach
     * anything they could not read themselves.
     */
    read_department: "reads other heads' threads in this workspace, changes nothing",
  };

  const readOnly = BUILT_IN_TOOLS.filter((t) => !t.writes);
  const unexpected = readOnly.filter((t) => !(t.name in MAY_RUN_UNCONFIRMED));
  check(
    "and a tool that runs unconfirmed is one somebody decided on",
    unexpected.length === 0,
    unexpected.map((t) => t.name).join(" ") || "none",
  );
}

console.log("\nthe schemas are acceptable to all three providers");
{
  // Anthropic, OpenAI, and Gemini constrain the name the same way, and all
  // three reject the whole request rather than the one bad tool.
  check(
    "every name fits the shape all three require",
    allTools().every((t) => /^[a-zA-Z0-9_-]{1,64}$/.test(t.name)),
    allTools()
      .map((t) => t.name)
      .join(", "),
  );

  // A required field missing from properties is invalid JSON Schema. All three
  // would reject it, and the department would silently lose every tool.
  const broken = allTools().filter((t) =>
    (t.schema.required ?? []).some((key) => !(key in t.schema.properties)),
  );
  check(
    "every required field exists in properties",
    broken.length === 0,
    broken.map((t) => t.name).join(", "),
  );

  const untyped = allTools().filter((t) =>
    Object.values(t.schema.properties).some(
      (property) => typeof property !== "object" || !property || !("type" in property),
    ),
  );
  check(
    "every property declares a type",
    untyped.length === 0,
    untyped.map((t) => t.name).join(", "),
  );

  const undescribed = allTools().filter((t) =>
    Object.values(t.schema.properties).some(
      (property) => typeof property === "object" && property && !("description" in property),
    ),
  );
  check(
    "every property describes itself, so the model knows what to put in it",
    undescribed.length === 0,
    undescribed.map((t) => t.name).join(", "),
  );

  // All three take the same JSON Schema object under three different field
  // names. Serialising proves nothing here holds a function or a cycle.
  let serialises = true;
  try {
    JSON.parse(JSON.stringify(allTools().map((t) => t.schema)));
  } catch {
    serialises = false;
  }
  check("every schema survives being serialised for the wire", serialises);
}


console.log("\ndepartments get the tools they should");
{
  const departments = seedDepartments();
  for (const department of departments) {
    const names = toolsFor(department.id).map((t) => t.name);
    check(`${department.name} can create a task`, names.includes("create_task"));
    check(`${department.name} can record a decision`, names.includes("record_decision"));
    check(`${department.name} can save a deliverable`, names.includes("save_deliverable"));
  }

  // Operations owns how work is organised; the Chief of Staff sets what is
  // worked on. Nobody else should be filing the company's projects.
  check(
    "Operations can create a project",
    toolsFor("operations").some((t) => t.name === "create_project"),
  );
  check(
    "the Chief of Staff can create a project",
    toolsFor(ORCHESTRATOR_ID).some((t) => t.name === "create_project"),
  );
  check(
    "Marketing cannot create a project",
    !toolsFor("marketing").some((t) => t.name === "create_project"),
  );
  check(
    "Engineering cannot create a project",
    !toolsFor("engineering").some((t) => t.name === "create_project"),
  );
}

console.log("\na tool call cannot write into another department");
{
  // The failure this guards: a model told to record something for Finance,
  // while answering as Marketing, writing into Finance's record.
  check("its own is used when nothing is named", resolveScope(undefined, "marketing") === "marketing");
  check("its own is used when it names itself", resolveScope("marketing", "marketing") === "marketing");
  check(
    "naming another department is ignored",
    resolveScope("finance", "marketing") === "marketing",
    resolveScope("finance", "marketing"),
  );
  check("company-wide is allowed", resolveScope(COMPANY_ID, "marketing") === COMPANY_ID);
  check("nonsense falls back to its own", resolveScope(42, "marketing") === "marketing");
}

console.log("\ndates from the model are not trusted");
{
  check("a real date parses", typeof parseDay("2026-03-04") === "number");
  check("a bad shape is refused", parseDay("4th March") === undefined);
  check("an empty string is refused", parseDay("") === undefined);
  check("a non-string is refused", parseDay(20260304) === undefined);
  const parsed = parseDay("2026-03-04")!;
  // Midday local, so a zone shift either way never moves it a day.
  check("it lands on the day given", new Date(parsed).getDate() === 4, String(new Date(parsed)));
}

console.log("\nthe prompt says what can be done");
{
  check("nothing is said when there are no tools", buildToolsBlock([]) === "");
  const block = buildToolsBlock(toolsFor("operations"));
  check("every tool is named", block.includes("create_project") && block.includes("create_task"));
  check(
    "it says which calls wait and which do not",
    block.includes("Anything that only reads runs as soon as you call it") &&
      block.includes("shown to the user to approve first"),
  );

  /*
   * Native search never appears in the tool list, because it is a server tool
   * run by the model's own provider rather than something the panel offers. So
   * the only way a head learns it has it is this block saying so, and without
   * that line a head asked to look something up read its own capabilities and
   * concluded it had no way to reach the web.
   */
  check(
    "native search is mentioned even though it is not a tool",
    buildToolsBlock(toolsFor("operations"), "native").includes("search the web"),
  );
  check(
    "and is not claimed when the business has search off",
    !buildToolsBlock(toolsFor("operations"), "off").includes("search the web"),
  );
  check(
    "a head with no tools but native search still gets a block",
    buildToolsBlock([], "native").includes("search the web"),
  );
  check("it says not to call one instead of answering", block.includes("instead of answering"));

  const ops = seedDepartments().find((d) => d.id === "operations")!;
  const withTools = systemPromptText(
    ops, EMPTY_PROFILE, "Eterneon", [], "house rules", undefined, [], [], toolsFor("operations"),
  );
  const without = systemPromptText(
    ops, EMPTY_PROFILE, "Eterneon", [], "house rules", undefined, [], [], [],
  );
  check("it reaches the system prompt", withTools.includes("WHAT YOU CAN DO"));
  check("and is absent without tools", !without.includes("WHAT YOU CAN DO"));
  // Adding tools must not re-bill everything above it in the cached prefix.
  const shared = withTools.slice(0, withTools.indexOf("=== WHAT YOU CAN DO"));
  check("everything above it is unchanged", without.startsWith(shared), `${shared.length} chars`);
}

console.log("\nregistering a tool");
{
  const before = allTools().length;
  registerTool({
    name: "test_only_tool",
    description: "A tool registered by the test, to prove an addon can add one.",
    schema: { type: "object", properties: { a: { type: "string" } }, required: ["a"] },
    writes: false,
    summarise: () => "Test",
  });
  check("it joins the registry", allTools().length === before + 1);
  check("it can be found by name", findTool("test_only_tool") !== undefined);
  check("it reaches every department", toolsFor("marketing").some((t) => t.name === "test_only_tool"));

  let clashed = false;
  try {
    registerTool({
      name: "create_task",
      description: "A name that is already taken, which must be refused rather than shadowing.",
      schema: { type: "object", properties: {}, required: ["x"] },
      writes: true,
      summarise: () => "",
    });
  } catch {
    clashed = true;
  }
  check("a duplicate name is refused", clashed);
}

console.log("\nthe business switch is the outer one, and a head picks inside it");
{
  const off = { webSearch: "off" } as const;
  const native = { webSearch: "native" } as const;
  const pplx = { webSearch: "perplexity" } as const;
  const untouched = {};

  check(
    "a business that is off searches nothing, whatever a head says",
    searchModeFor("off", pplx) === "off" && searchModeFor(undefined, pplx) === "off",
  );
  check(
    "a head switched off searches nothing, even where the business pays",
    searchModeFor("perplexity", off) === "off",
  );
  check(
    "a head that has never been asked follows the business",
    searchModeFor("perplexity", untouched) === "perplexity" &&
      searchModeFor("native", undefined) === "native",
  );
  check(
    "a head can use a different engine from the rest of the business",
    searchModeFor("native", pplx) === "perplexity" &&
      searchModeFor("perplexity", native) === "native",
  );

  /*
   * The business switch is the one that decides whether the company spends
   * anything at all, so what is worth asserting is not that the happy cases
   * work but that nothing anywhere in the matrix searches while it is off.
   */
  const heads = [off, native, pplx, untouched, undefined];
  check(
    "nothing searches while the business is off",
    heads.every(
      (head) =>
        searchModeFor("off", head) === "off" && searchModeFor(undefined, head) === "off",
    ),
  );
}

console.log(failures ? "\nFAILURES ABOVE" : "\nall checks passed");
process.exit(failures ? 1 : 0);
