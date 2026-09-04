/**
 * Running a recipe.
 *
 * This is the whole interpreter, and it is a switch over four verbs. There is
 * no expression evaluator, no loop construct, and no way for a recipe to reach
 * a function: a step is one of three known actions, and each one calls code we
 * wrote with arguments a schema already checked. The recipe never becomes code
 * at any point, which is why there is nothing here to escape from.
 *
 * A run is bounded before it starts. The step count is capped by the schema,
 * every step is executed exactly once in order, and nothing a step returns can
 * change what the next step does. So the worst an addon can cost is its own
 * fixed number of steps, and the worst it can do is the union of what those
 * steps do, both of which are visible on the approval screen.
 */
import { LIMITS, describeStep, render, type Condition, type Recipe, type Step } from "./recipe";
import { send } from "./outbound";

/** One line of what happened, which is what an owner reads in the run log. */
export interface RunStep {
  did: string;
  ok: boolean;
  detail?: string;
}

export interface RunResult {
  /** False when the conditions did not match, which is not a failure. */
  ran: boolean;
  ok: boolean;
  steps: RunStep[];
}

/**
 * What a step is allowed to change inside the workspace.
 *
 * Passed in rather than imported so this file has no database of its own. The
 * caller has already decided which workspace it is acting on, so a step cannot
 * name a different one: there is nowhere in the recipe language to put a
 * workspace id, and nothing here that would read it if there were.
 */
export interface Effects {
  createTask(input: { title: string; status: "todo" | "doing" | "done" }): Promise<void>;
  saveNote(input: { title: string; body: string }): Promise<void>;
}

export interface RunInput {
  recipe: Recipe;
  /** The flat, already whitelisted values a template may name. */
  context: Record<string, string>;
  /** The hosts an administrator approved for this addon. */
  approvedHosts: readonly string[];
  effects: Effects;
}

/**
 * Whether the conditions hold.
 *
 * All of them, and there is no "or": a recipe cannot express one, which keeps
 * the meaning of a condition list something an owner can read off the approval
 * screen without being wrong about it. A field the context does not carry
 * compares as empty, so a condition on a missing value is false rather than an
 * error, except for "is not" and "does not contain" where empty legitimately
 * satisfies it.
 */
export function matches(conditions: Condition[], context: Record<string, string>): boolean {
  const safe = Object.assign(Object.create(null) as Record<string, string>, context);

  return conditions.every((condition) => {
    const actual = (safe[condition.field] ?? "").toLowerCase();
    const expected = condition.value.toLowerCase();

    switch (condition.op) {
      case "is":
        return actual === expected;
      case "is not":
        return actual !== expected;
      case "contains":
        return actual.includes(expected);
      case "does not contain":
        return !actual.includes(expected);
    }
  });
}

/**
 * Runs one recipe once.
 *
 * Never throws. A step that fails is recorded and the rest still run, because
 * an addon that posts to Slack and files a task should still file the task when
 * Slack is down, and because an owner reading the log needs to know which half
 * happened.
 */
export async function runRecipe({
  recipe,
  context,
  approvedHosts,
  effects,
}: RunInput): Promise<RunResult> {
  if (!matches(recipe.conditions, context)) {
    return { ran: false, ok: true, steps: [] };
  }

  const steps: RunStep[] = [];

  for (const step of recipe.steps.slice(0, LIMITS.steps)) {
    steps.push(await runStep(step, context, approvedHosts, effects));
  }

  return { ran: true, ok: steps.every((step) => step.ok), steps };
}

async function runStep(
  step: Step,
  context: Record<string, string>,
  approvedHosts: readonly string[],
  effects: Effects,
): Promise<RunStep> {
  const did = describeStep(step);

  try {
    switch (step.action) {
      case "create_task": {
        const title = render(step.title, context).trim();
        // An empty title is what a template full of missing values renders to,
        // and a blank task on somebody's board is worse than a skipped step.
        if (!title) return { did, ok: false, detail: "Nothing to add: the title came out empty." };
        await effects.createTask({ title: cap(title), status: step.status });
        return { did, ok: true };
      }

      case "save_note": {
        const title = render(step.title, context).trim();
        const body = render(step.body, context).trim();
        if (!title && !body) {
          return { did, ok: false, detail: "Nothing to save: the note came out empty." };
        }
        await effects.saveNote({ title: cap(title || "Note"), body: cap(body) });
        return { did, ok: true };
      }

      case "http_post": {
        /*
         * The addon supplied names and values, never JSON. We render each
         * value and serialise the object ourselves, so a value containing a
         * quote or a brace is escaped by JSON.stringify like any other string
         * and cannot add a field, close the object, or change the shape of
         * what is sent.
         */
        const payload: Record<string, string> = {};
        for (const [name, template] of Object.entries(step.fields)) {
          payload[name] = cap(render(template, context));
        }

        const result = await send({
          url: step.url,
          body: JSON.stringify(payload),
          approvedHosts,
        });
        return { did, ok: result.ok, detail: result.detail };
      }
    }
  } catch {
    // Deliberately not the thrown message: it can carry an internal path or a
    // connection string, and this line is shown to whoever reads the log.
    return { did, ok: false, detail: "That step could not be completed." };
  }
}

/** Keeps one rendered value from becoming a payload, however it was assembled. */
function cap(value: string): string {
  return value.length > LIMITS.value ? value.slice(0, LIMITS.value) : value;
}
