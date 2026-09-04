import type { Step, TriggerName } from "./recipe";

/**
 * Saying what an addon does, in the owner's words.
 *
 * Split out from recipe.ts for one reason worth knowing before merging them
 * back: recipe.ts imports zod, and the approval screen is a client component.
 * Importing a label from there pulled the whole validator into the browser
 * bundle for that route, which was measured at 380KB of JavaScript shipped so
 * somebody could read the words "A task is marked done".
 *
 * The type imports above are erased at build time, so this file has no runtime
 * dependency on recipe.ts at all. Anything added here must stay that way: a
 * value imported from recipe.ts brings zod back with it.
 */

/** Said in the owner's words, for the approval screen and the addon list. */
export const TRIGGER_LABEL: Record<TriggerName, string> = {
  "task.created": "A task is added",
  "task.completed": "A task is marked done",
  "schedule.daily": "Once a day",
};

/** The host of a URL, lowercased, or null if it will not parse. */
export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * One step, as a sentence.
 *
 * Read off the stored recipe rather than off anything the addon said about
 * itself, so a flattering description cannot hide a step from the person
 * approving it.
 */
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
