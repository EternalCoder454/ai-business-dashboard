import { ORCHESTRATOR_ID, COMPANY_ID } from "./seed";
import type { WebSearchMode } from "./types";

/**
 * What a department is allowed to do, beyond writing a reply.
 *
 * Every tool is declared here rather than wired into the chat route, so adding
 * one is a matter of adding an entry. That is deliberate: the same registry is
 * what an addon will extend, and a shape that only works for the built-ins
 * would have to be rebuilt the first time something outside this file needs to
 * register a tool.
 *
 * Nothing here executes on the server. The model proposes a call, the person
 * reading approves it, and the browser runs it against the workspace store,
 * which is the only place that knows how to write to either storage mode.
 */

/** JSON Schema, kept loose because it is handed to three different providers. */
export type ToolSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
};

export interface ToolDefinition {
  name: string;
  /** What the model reads to decide whether this is the right tool. */
  description: string;
  schema: ToolSchema;
  /**
   * Which departments may call it. An empty list means every department,
   * which is the normal case; a tool that only makes sense somewhere specific
   * names the ids it belongs to.
   */
  departments?: string[];
  /**
   * True when running it changes stored data. Writes are always confirmed
   * before they run, so this decides whether a card appears or not.
   */
  writes: boolean;
  /**
   * Offered only to an administrator.
   *
   * Hiding a tool is not a permission check: this decides what a department is
   * told it can do, and the server decides what it may actually do. Both are
   * needed. Without this the model offers something a member cannot use and the
   * conversation ends in a refusal; without the server check, hiding it would
   * be the only thing stopping a crafted request.
   */
  adminOnly?: boolean;
  /**
   * Offered only when the business has turned on Perplexity search.
   *
   * Not a permission. A head offered a tool the workspace cannot run would
   * propose a lookup that fails, which reads as the product being broken
   * rather than as a setting being off.
   */
  searchOnly?: boolean;
  /**
   * Offered wherever the business allows the web at all, either engine.
   *
   * Distinct from searchOnly, which names a tool that only exists because the
   * business chose Perplexity. Opening a page uses neither engine, so the only
   * question is whether this business reaches the web, and off is the one
   * answer that means no.
   */
  webOnly?: boolean;
  /**
   * Offered only when this head can see at least one readable document.
   *
   * Same reasoning as searchOnly, and not a permission either. What a head may
   * read is decided by libraryFor at the point of the read, not by whether the
   * tool was offered.
   */
  libraryOnly?: boolean;
  /** Offered only where this head has produced something to revise. */
  deliverablesOnly?: boolean;
  /** Shown on the confirmation card, in the person's words rather than JSON. */
  summarise: (input: Record<string, unknown>) => string;
}

const str = (description: string) => ({ type: "string", description });

export const BUILT_IN_TOOLS: ToolDefinition[] = [
  {
    name: "create_task",
    description:
      "Add a task to the board. Use when the user agrees something needs doing, or asks you to write it down. One task per call: two things is two calls.",
    schema: {
      type: "object",
      properties: {
        title: str("What needs doing, in one line."),
        notes: str("Links, constraints, or what finished looks like. Optional."),
        dueOn: str("A due date as yyyy-mm-dd. Omit when there is no real date."),
        departmentId: str(
          "The department it belongs to. Omit for your own, or use 'company' for work that is everyone's.",
        ),
      },
      required: ["title"],
    },
    writes: true,
    summarise: (input) =>
      `Create task “${input.title}”${input.dueOn ? `, due ${input.dueOn}` : ""}`,
  },
  {
    name: "record_decision",
    description:
      "Write down something that has been settled, so it is not reopened later. Use when the user makes a call, not when they are still weighing one.",
    schema: {
      type: "object",
      properties: {
        label: str("The decision in one line, in the past tense."),
        detail: str("The reasoning worth keeping."),
        revisitWhen: str("What would reopen this. Omit if it is permanent."),
        departmentId: str(
          "Whose decision it is. Omit for your own, or use 'company' when it binds every department.",
        ),
      },
      required: ["label"],
    },
    writes: true,
    summarise: (input) => `Record decision “${input.label}”`,
  },
  {
    name: "record_figure",
    description:
      "Write down a measurement and the date it was true, so nobody has to retype it. Use the same label each time so readings read as a trend.",
    schema: {
      type: "object",
      properties: {
        label: str("What it measures, written the same way every time."),
        value: str("The reading, including the unit."),
        measuredOn: str("The date it was true, as yyyy-mm-dd. Defaults to today."),
        departmentId: str("Whose figure it is. Omit for your own, or 'company' for everyone."),
      },
      required: ["label", "value"],
    },
    writes: true,
    summarise: (input) => `Record ${input.label} = ${input.value}`,
  },
  {
    name: "save_deliverable",
    description:
      "Save a new piece of work you have produced so it can be found later. Use for " +
      "something finished and worth keeping, not for an explanation. If a version of " +
      "this already exists under YOUR DELIVERABLES, use update_deliverable instead: a " +
      "second copy with no way to tell which is current is worse than no copy.",
    schema: {
      type: "object",
      properties: {
        title: str("A short name for it."),
        body: str("The work itself, in markdown."),
      },
      required: ["title", "body"],
    },
    writes: true,
    summarise: (input) => `Save deliverable “${input.title}”`,
  },
  {
    name: "create_project",
    description:
      "Start a project to group work that spans departments. Use when a piece of work is clearly bigger than one conversation.",
    // Operations owns how work is organised, and the Chief of Staff sets what
    // is being worked on. Nobody else should be filing the company's work.
    departments: ["operations", ORCHESTRATOR_ID],
    schema: {
      type: "object",
      properties: {
        name: str("What the project is called."),
        summary: str("One line on what it covers."),
      },
      required: ["name"],
    },
    writes: true,
    summarise: (input) => `Create project “${input.name}”`,
  },
  {
    /*
     * The one tool that produces something which later runs on its own.
     *
     * Everything else here writes a row a person can read. This writes a recipe
     * the panel will carry out unattended, which is why it is the only tool
     * that is administrator only, why what it makes is never live when it is
     * made, and why the schema below is narrow: the model is choosing from a
     * fixed vocabulary, not writing a program.
     *
     * @see lib/addons/recipe for what each field may contain.
     */
    name: "create_addon",
    description:
      "Build an addon: something the panel does by itself when a trigger happens, such as posting to a webhook when a task is completed. " +
      "Use when the user asks for an automation or an integration with an outside service. " +
      "It is saved switched off and an administrator has to approve it, so say that. " +
      "You may only use the triggers, fields and actions listed in the schema: anything else will be refused. " +
      "A template like {{task.title}} may only name a field the chosen trigger offers.",
    departments: ["engineering"],
    adminOnly: true,
    schema: {
      type: "object",
      properties: {
        name: str("A short name for it, such as “Post to Slack when a task is done”."),
        description: str("One line on what it does, for the person approving it."),
        trigger: {
          type: "string",
          enum: ["task.created", "task.completed", "schedule.daily"],
          description: "What makes it run.",
        },
        conditions: {
          type: "array",
          description:
            "Optional. All must hold for it to run. Only fields the trigger offers: " +
            "task.title, task.status, task.department, company.name, today for a task trigger; " +
            "company.name, today, tasks.open_count, tasks.done_today_count for schedule.daily.",
          items: {
            type: "object",
            properties: {
              field: str("The field to test."),
              op: {
                type: "string",
                enum: ["is", "is not", "contains", "does not contain"],
              },
              value: str("What to compare it against."),
            },
            required: ["field", "op", "value"],
          },
        },
        steps: {
          type: "array",
          description: "What it does, in order. At most five.",
          items: {
            type: "object",
            properties: {
              action: {
                type: "string",
                enum: ["create_task", "save_note", "search_web", "http_post"],
              },
              title: str(
                "For create_task, save_note and search_web. May contain {{field}} templates. " +
                  "On search_web it titles the note the answer is saved to.",
              ),
              status: { type: "string", enum: ["todo", "doing", "done"] },
              body: str("For save_note. May contain {{field}} templates."),
              query: str(
                "For search_web. The question to look up, which may contain {{field}} " +
                  "templates. Whatever this renders to is sent to the search provider, so " +
                  "keep it to what the question needs. One search per addon.",
              ),
              url: str("For http_post. A full https address. Never a template."),
              fields: {
                type: "object",
                description:
                  "For http_post. Names to values, each of which may contain templates. " +
                  "Do not write JSON: give the fields and they are serialised for you. " +
                  "A Slack webhook wants a single field called text.",
              },
            },
            required: ["action"],
          },
        },
      },
      required: ["name", "trigger", "steps"],
    },
    writes: true,
    summarise: (input) => `Build the addon “${input.name}”, switched off until approved`,
  },
  {
    /*
     * Offered only when the business has chosen Perplexity.
     *
     * Native search is not here because it is not a tool the model asks us to
     * run: the provider does it upstream and hands back the result inside its
     * own answer. This one is a real round trip through our server, because the
     * key lives there and Perplexity has no tool calling of its own.
     */
    name: "web_search",
    description:
      "Search the web. Returns ranked results, each with a title, an address and " +
      "an extract, and no answer: reading them and writing the answer is your job. " +
      "Use when what you need depends on something current: a price, a rule, a " +
      "competitor, anything that changed after you were trained. Do not use it for " +
      "what you already know. One search per question. Say what you searched for, " +
      "cite the results you actually used, and say so when they disagree.",
    schema: {
      type: "object",
      properties: {
        query: str(
          "What to look up. Specific beats broad: include the terms, the place and " +
          "the time frame that matter, as you would type them into a search box.",
        ),
      },
      required: ["query"],
    },
    // Reads rather than writes, so it runs without a confirmation card. It
    // spends a little money, which the business turned on deliberately, and
    // stopping mid answer to approve a lookup would make it useless.
    writes: false,
    searchOnly: true,
    summarise: (input) => `Look up “${input.query}”`,
  },
  {
    /*
     * Offered only when the head can actually see a document, so a business
     * with an empty Library never has a head announcing it will go and read
     * something and then finding nothing.
     */
    name: "read_document",
    description:
      "Read one of this business's own documents from the Library. " +
      "Use it whenever the answer depends on what this business actually agreed, charges, " +
      "or recorded, rather than on how such things usually work. The titles you can read are " +
      "listed under THE LIBRARY. Give the title exactly as it appears there.",
    schema: {
      type: "object",
      properties: {
        title: str("The document's title, exactly as it appears in THE LIBRARY."),
      },
      required: ["title"],
    },
    // A read of something the business already owns and already showed this
    // head the title of. Nothing leaves the panel and nothing is written, so
    // stopping to approve it would only interrupt the answer.
    writes: false,
    libraryOnly: true,
    summarise: (input) => `Read “${input.title}”`,
  },
  {
    name: "fetch_url",
    description:
      "Open a web page you have been given the address of and read it. Use when " +
      "somebody names a site, or when a search result is worth reading properly " +
      "rather than from its extract. Searching finds pages; this opens one. Https " +
      "only, and it does not follow redirects: if it reports one, ask for that " +
      "address instead.",
    schema: {
      type: "object",
      properties: {
        url: str("The full address, as it was given to you."),
      },
      required: ["url"],
    },
    // Reads a page anyone could open. Nothing is written and nothing of this
    // business is sent, so stopping to approve it would only interrupt.
    writes: false,
    webOnly: true,
    summarise: (input) => `Open ${input.url}`,
  },
  {
    name: "read_department",
    description:
      "Read what another head has recently been asked and what it answered. Use this " +
      "before summarising across the business, or when a question depends on work that " +
      "belongs to somebody else: you are the one head who can. Give the department's " +
      "name, for example Marketing or Finance.",
    schema: {
      type: "object",
      properties: {
        department: str("The department to read, by name, for example Marketing."),
      },
      required: ["department"],
    },
    /*
     * A read, so it happens without stopping to ask.
     *
     * The distinction the whole tool list is built on: reading something the
     * person could open themselves is not a thing to interrupt them for, and
     * writing is. This reads conversations inside their own workspace that
     * they can already open, so approving it would only add a click to a
     * question they had just asked.
     */
    writes: false,
    /*
     * The orchestrator alone.
     *
     * Every other head answers in its own area and should not be reading its
     * colleagues' conversations to do it. This one is asked to judge across all
     * of them, and could not: asked to summarise the business it said it had no
     * visibility into each department's work unless it had come up already,
     * which was true and made the head that exists to see across everything the
     * one head that could not.
     */
    departments: [ORCHESTRATOR_ID],
    summarise: (input) => `Read ${input.department}'s conversations`,
  },
  {
    name: "read_deliverable",
    description:
      "Read back something you produced earlier, in full. Do this before revising one, " +
      "so the update is the whole corrected document rather than a rewrite from memory. " +
      "The titles you can read are listed under YOUR DELIVERABLES.",
    schema: {
      type: "object",
      properties: {
        title: str("The title, exactly as it appears in YOUR DELIVERABLES."),
      },
      required: ["title"],
    },
    // Reading back your own work. Nothing leaves the panel and nothing changes.
    writes: false,
    deliverablesOnly: true,
    summarise: (input) => `Read “${input.title}”`,
  },
  {
    name: "update_deliverable",
    description:
      "Replace something you produced earlier with a corrected version. Use whenever a " +
      "change is asked for to work that already exists, rather than saving another copy. " +
      "Read it first, and send the whole document: this replaces the body entirely, so " +
      "anything you leave out is deleted.",
    schema: {
      type: "object",
      properties: {
        title: str("The title of the one to replace, as it appears in YOUR DELIVERABLES."),
        body: str("The complete revised document, in markdown. Not a fragment or a diff."),
      },
      required: ["title", "body"],
    },
    /*
     * Waits to be approved, unlike the read beside it. This overwrites a
     * document somebody may be about to send a client, and the old version is
     * not kept anywhere: the card is the only thing between a misread
     * instruction and work that no longer exists.
     */
    writes: true,
    deliverablesOnly: true,
    summarise: (input) => `Rewrite deliverable “${input.title}”`,
  },
];

/**
 * Everything registered, built-in and otherwise.
 *
 * An addon registers by pushing into this list at startup. Kept as a function
 * rather than a constant so a later registration is picked up rather than
 * captured at import time.
 */
const registered: ToolDefinition[] = [];

export function registerTool(tool: ToolDefinition): void {
  const clash = allTools().find((existing) => existing.name === tool.name);
  if (clash) {
    throw new Error(`A tool named "${tool.name}" is already registered.`);
  }
  registered.push(tool);
}

export function allTools(): ToolDefinition[] {
  return [...BUILT_IN_TOOLS, ...registered];
}

/**
 * The tools one department may call.
 *
 * `admin` decides whether the administrator-only ones are offered. It defaults
 * to false so a caller that has not thought about it offers fewer tools rather
 * than more.
 */
/**
 * Whether this head searches the web, out of two switches that both apply.
 *
 * The business's is the outer one, and it is a switch rather than a default:
 * an administrator decides whether the company searches at all and pays for the
 * keys, and off there is off for every head. Inside that, a head may be pointed
 * at a different engine from the rest, or switched off on its own.
 *
 * Written here rather than inline in the composer because it is a spending
 * control, and a spending control that lives in a JSX expression is one nobody
 * can test.
 *
 * Undefined on the department means whatever the business chose. Every head
 * predates this and none should change behaviour for having been asked a new
 * question.
 */
export function searchModeFor(
  businessMode: WebSearchMode | undefined,
  department: { webSearch?: WebSearchMode } | undefined,
): WebSearchMode {
  const business = businessMode ?? "off";
  // The master switch, not a default. Off here is off everywhere, whatever a
  // head has been set to, because this is the control that decides whether the
  // company spends anything on searching at all.
  if (business === "off") return "off";
  return department?.webSearch ?? business;
}

export function toolsFor(
  departmentId: string,
  options: {
    admin?: boolean;
    webSearch?: string;
    documents?: number;
    deliverables?: number;
  } = {},
): ToolDefinition[] {
  return allTools().filter((tool) => {
    if (tool.adminOnly && !options.admin) return false;
    if (tool.searchOnly && options.webSearch !== "perplexity") return false;
    if (tool.webOnly && (options.webSearch ?? "off") === "off") return false;
    // Offered only when there is something to read. A head told it can read
    // documents, in a business with none, will offer to go and read one.
    if (tool.libraryOnly && !options.documents) return false;
    // Same reasoning: a head told it can revise its work, in a department that
    // has produced none, will offer to go and revise something.
    if (tool.deliverablesOnly && !options.deliverables) return false;
    return !tool.departments?.length || tool.departments.includes(departmentId);
  });
}

export function findTool(name: string): ToolDefinition | undefined {
  return allTools().find((tool) => tool.name === name);
}

/**
 * Where a tool call writes to, given what the model asked for.
 *
 * A department can file something under itself or under the whole company, and
 * nothing else. Left open, a department could quietly write into another one's
 * record, which is the one thing scoping is meant to prevent.
 */
export function resolveScope(
  requested: unknown,
  callerDepartmentId: string,
): string {
  return requested === COMPANY_ID ? COMPANY_ID : callerDepartmentId;
}

/** A date from the model, or today when it gave one that is not a date. */
export function parseDay(value: unknown): number | undefined {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  // Midday local, so a zone shift either way never moves it a day.
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.getTime();
}
