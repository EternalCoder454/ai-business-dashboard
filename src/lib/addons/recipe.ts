/**
 * What an addon is allowed to say.
 *
 * An addon is a recipe, not a program. There is no expression to evaluate, no
 * loop, no variable, no way to reach a value that is not on the list below, and
 * nothing anywhere in this system calls eval, new Function, or a template
 * engine. That is the whole security argument: an addon cannot do something bad
 * because it cannot say anything that is not one of the verbs we wrote.
 *
 * The cost is real and worth stating. An addon can only ever do what has been
 * implemented here, so every new capability is a deliberate decision by us
 * rather than something a business can add for itself. That is the trade we are
 * making on purpose, because the alternative is running code an AI wrote
 * against other people's businesses.
 *
 * The shape is also the reason the AI can be trusted to write one. A model
 * producing JSON that then fails a strict schema is a rejected addon, not a
 * compromised one, and the failure happens before anything is stored.
 */
import { z } from "zod";

/** How much of anything an addon may carry, so a recipe cannot be a payload. */
export const LIMITS = {
  name: 60,
  description: 200,
  steps: 5,
  conditions: 5,
  hosts: 3,
  /** A rendered value going out. Generous for a message, far short of a dump. */
  value: 2_000,
  /** Everything sent in one outbound call, after rendering. */
  body: 8_000,
  fields: 10,
} as const;

/* -------------------------------------------------------------------------
 * Triggers
 *
 * What makes an addon run. Deliberately few: each one is a place in the code
 * where we call the runtime, so the list cannot grow by accident.
 * ---------------------------------------------------------------------- */

export const TRIGGERS = [
  "task.created",
  "task.completed",
  "schedule.daily",
] as const;
export type TriggerName = (typeof TRIGGERS)[number];

/** Said in the owner's words, for the approval screen and the addon list. */
export const TRIGGER_LABEL: Record<TriggerName, string> = {
  "task.created": "A task is added",
  "task.completed": "A task is marked done",
  "schedule.daily": "Once a day",
};

/* -------------------------------------------------------------------------
 * The context an addon can read
 *
 * A flat map of strings, built fresh by the runtime for each run. Flat rather
 * than an object graph on purpose: a template can only ever name one of these
 * keys, so there is no traversal, no prototype to walk, and no way to reach a
 * field nobody listed. A name that is not here renders as empty.
 * ---------------------------------------------------------------------- */

export const READABLE: Record<TriggerName, readonly string[]> = {
  "task.created": ["task.title", "task.status", "task.department", "company.name", "today"],
  "task.completed": ["task.title", "task.status", "task.department", "company.name", "today"],
  "schedule.daily": ["company.name", "today", "tasks.open_count", "tasks.done_today_count"],
};

/**
 * Nothing in that list is a secret, a credential, or another person's message.
 *
 * Worth saying out loud, because this is the line an addon cannot cross: it can
 * be told a task's title, and it can never be told an API key, a model key, a
 * colleague's inbox, a file, or anything belonging to another workspace. Adding
 * a key here would hand every approved addon a way to post it to its own host.
 */
export const NEVER_READABLE = ["any credential", "inbox messages", "files", "another workspace"];

/* -------------------------------------------------------------------------
 * Conditions
 * ---------------------------------------------------------------------- */

export const OPS = ["is", "is not", "contains", "does not contain"] as const;

const conditionSchema = z
  .object({
    field: z.string().max(40),
    op: z.enum(OPS),
    value: z.string().max(200),
  })
  .strict();

/* -------------------------------------------------------------------------
 * Steps
 *
 * Every action an addon can take. Each one maps to a function we wrote, with
 * arguments we validate. There is no generic "call this" step, which is what
 * keeps the list of things an addon can do equal to the list below.
 * ---------------------------------------------------------------------- */

const templated = (max: number) => z.string().max(max);

const stepSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("create_task"),
      title: templated(LIMITS.value),
      status: z.enum(["todo", "doing", "done"]).default("todo"),
    })
    .strict(),
  z
    .object({
      action: z.literal("save_note"),
      title: templated(120),
      body: templated(LIMITS.value),
    })
    .strict(),
  z
    .object({
      /*
       * The only step that leaves the building, and the reason the host list
       * exists. The body is a map of names to values rather than a string,
       * so the addon never writes JSON itself: we render each value and then
       * serialise the object. An addon cannot break out of a value into the
       * structure around it, because it never touches the structure.
       */
      action: z.literal("http_post"),
      url: z.string().max(300),
      fields: z.record(z.string().max(40), templated(LIMITS.value)),
    })
    .strict(),
]);

export type Step = z.infer<typeof stepSchema>;
export type Condition = z.infer<typeof conditionSchema>;

/** Said in the owner's words. Used on the approval screen. */
export function describeStep(step: Step): string {
  switch (step.action) {
    case "create_task":
      return `Add a task: ${step.title}`;
    case "save_note":
      return `Save a note: ${step.title}`;
    case "http_post":
      return `Send a message to ${hostOf(step.url) ?? "an outside service"}`;
  }
}

/* -------------------------------------------------------------------------
 * The recipe
 * ---------------------------------------------------------------------- */

export const recipeSchema = z
  .object({
    trigger: z.enum(TRIGGERS),
    conditions: z.array(conditionSchema).max(LIMITS.conditions).default([]),
    steps: z.array(stepSchema).min(1).max(LIMITS.steps),
  })
  .strict();

export type Recipe = z.infer<typeof recipeSchema>;

/** The host of a URL, lowercased, or null if it will not parse. */
export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export interface Rejected {
  ok: false;
  /** Said plainly, because the model reads this and tries again. */
  problems: string[];
}
export interface Accepted {
  ok: true;
  recipe: Recipe;
  /** Every outside host this recipe needs, for an administrator to approve. */
  hosts: string[];
}

/**
 * Turns whatever arrived into a recipe, or says why not.
 *
 * Everything is checked here rather than at the point of use, so a stored
 * recipe is one that has already passed. The checks that are not just shape:
 *
 * - A template may only name a field the trigger actually provides. Without
 *   this, an addon could name a field we add later and quietly start reading
 *   it, which is how a capability gets granted by accident.
 * - Conditions may only test those same fields.
 * - An outbound URL must be https with no credentials in it, and its host is
 *   collected for approval. The network checks proper happen again at call
 *   time in outbound.ts, because a host that resolved somewhere safe when it
 *   was approved can resolve somewhere else later.
 */
export function readRecipe(input: unknown): Accepted | Rejected {
  const parsed = recipeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      problems: parsed.error.issues.map((issue) =>
        issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message,
      ),
    };
  }

  const recipe = parsed.data;
  const allowed = new Set(READABLE[recipe.trigger]);
  const problems: string[] = [];

  for (const condition of recipe.conditions) {
    if (!allowed.has(condition.field)) {
      problems.push(
        `"${condition.field}" is not something ${TRIGGER_LABEL[recipe.trigger].toLowerCase()} ` +
          `can tell you about. Available: ${[...allowed].join(", ")}.`,
      );
    }
  }

  const hosts = new Set<string>();
  let bodyTotal = 0;

  for (const step of recipe.steps) {
    for (const value of valuesOf(step)) {
      bodyTotal += value.length;
      for (const name of namesIn(value)) {
        if (!allowed.has(name)) {
          problems.push(
            `{{${name}}} is not available here. Available: ${[...allowed].join(", ")}.`,
          );
        }
      }
    }

    if (step.action === "http_post") {
      if (Object.keys(step.fields).length > LIMITS.fields) {
        problems.push(`A message may carry at most ${LIMITS.fields} fields.`);
      }
      const problem = checkOutboundUrl(step.url);
      if (problem) problems.push(problem);
      else hosts.add(hostOf(step.url)!);
    }
  }

  if (bodyTotal > LIMITS.body) {
    problems.push(`An addon may carry at most ${LIMITS.body} characters in total.`);
  }
  if (hosts.size > LIMITS.hosts) {
    problems.push(`An addon may reach at most ${LIMITS.hosts} outside services.`);
  }

  if (problems.length) return { ok: false, problems };
  return { ok: true, recipe, hosts: [...hosts].sort() };
}

/**
 * The shape of a URL an addon may name, checked before anything is stored.
 *
 * Shape only. Where the host actually resolves is checked again at call time,
 * because that answer can change between approval and the run.
 */
export function checkOutboundUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return `"${url}" is not a web address.`;
  }

  if (parsed.protocol !== "https:") return "An addon may only send over https.";
  // user:pass@host is a way to make a URL look like one host and reach another,
  // and nothing legitimate needs it.
  if (parsed.username || parsed.password) return "A web address may not carry a sign-in in it.";
  if (parsed.port && parsed.port !== "443") return "An addon may only send to the standard port.";

  /*
   * A real name, not something assembled. The URL is never rendered, so braces
   * in it would be sent literally and could never resolve, but storing
   * "{{task.title}}.example.com" for an administrator to approve is a confusing
   * way to fail. Refusing it here says so at the point the addon is written.
   */
  if (!isHostname(parsed.hostname)) return "That is not a public web address.";
  return null;
}

/**
 * A name the DNS could actually answer for.
 *
 * Letters, digits and hyphens in each label, at least two labels, and no label
 * starting or ending with a hyphen. Deliberately stricter than what a URL will
 * parse: a URL happily accepts a hostname full of braces or underscores, and an
 * addon has no reason to name one.
 */
function isHostname(hostname: string): boolean {
  if (hostname.length > 253) return false;
  const labels = hostname.toLowerCase().split(".");
  if (labels.length < 2) return false;
  // A trailing dot is legal in DNS but nothing here needs one, and allowing it
  // means "example.com" and "example.com." approve as two different hosts.
  return labels.every(
    (label) =>
      label.length > 0 &&
      label.length <= 63 &&
      /^[a-z0-9-]+$/.test(label) &&
      !label.startsWith("-") &&
      !label.endsWith("-"),
  );
}

/** Every rendered string in a step, which is everything a template can hide in. */
function valuesOf(step: Step): string[] {
  switch (step.action) {
    case "create_task":
      return [step.title];
    case "save_note":
      return [step.title, step.body];
    case "http_post":
      // The URL is deliberately absent: it is not rendered, so a template
      // cannot move a request to a different host than the one approved.
      return Object.values(step.fields);
  }
}

/**
 * The field names a string asks for.
 *
 * One expression, no nesting, no alternatives. Anything that is not exactly
 * `{{ name }}` is left alone as text, so a string full of braces is a string
 * full of braces rather than an injection attempt.
 */
const NAME = /\{\{\s*([a-z0-9_.]+)\s*\}\}/gi;

export function namesIn(value: string): string[] {
  return [...value.matchAll(NAME)].map((match) => match[1].toLowerCase());
}

/**
 * Fills a template from the flat context, and never from anything else.
 *
 * A name that is not in the context renders as empty rather than throwing or
 * leaving the braces visible, because a missing value is not worth failing a
 * run over. Lookup is on a null-prototype copy, so a template naming
 * "constructor" or "__proto__" finds nothing at all rather than a function.
 */
export function render(template: string, context: Record<string, string>): string {
  const safe = Object.assign(Object.create(null) as Record<string, string>, context);
  return template.replace(NAME, (_, name: string) => {
    const value = safe[name.toLowerCase()];
    return typeof value === "string" ? value : "";
  });
}
