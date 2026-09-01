import { CEO_ID, COMPANY_ID } from "./seed";

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
      "Save a piece of work you have produced so it can be found later. Use for something finished and worth keeping, not for an explanation.",
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
    departments: ["operations", CEO_ID],
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

/** The tools one department may call. */
export function toolsFor(departmentId: string): ToolDefinition[] {
  return allTools().filter(
    (tool) => !tool.departments?.length || tool.departments.includes(departmentId),
  );
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
