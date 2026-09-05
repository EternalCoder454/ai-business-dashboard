/**
 * Which settings a workspace save is allowed to change, and how it clears one.
 *
 * Lives away from the repository so it can be run without a database. The rule
 * about null is the kind that is invisible until it is wrong: a logo somebody
 * removed came back on the next load for months, because the removal was sent
 * as undefined and undefined does not survive JSON.
 */

/**
 * The columns a settings save may write.
 *
 * An allow list rather than a spread, and both halves matter: spreading the row
 * lets it choose its own workspaceId and write into another company's settings,
 * and writing every column makes a partial save like `{ theme }` also write a
 * defaulted companyName, which renames the business.
 *
 * The three model keys are absent deliberately. /api/workspace/keys is their
 * only writer, because they are encrypted on the way in.
 */
export const WRITABLE_SETTINGS = [
  "model",
  "effort",
  "theme",
  "companyName",
  "companySubtitle",
  "writingRules",
  "roomBrevity",
  "companyMark",
  "webSearch",
  "companyLogoUrl",
  "sidebarSide",
  "searchShortcut",
  "wikiTitle",
  "wikiSubtitle",
] as const;

/** The fields that may be set back to empty rather than only changed. */
const CLEARABLE = new Set<string>(["companyLogoUrl"]);

/**
 * The subset of a sent row that may actually be written.
 *
 * Absent and undefined both mean "leave this alone", so a save of one field
 * cannot blank the rest. Null means "clear this", which only the logo allows:
 * every other column here is a string the interface always has a value for, and
 * a null arriving in one of them is a bug rather than an intention.
 */
export function writableSettings(row: Record<string, unknown>): Record<string, unknown> {
  const sent: Record<string, unknown> = {};

  for (const field of WRITABLE_SETTINGS) {
    const value = row[field];
    if (value === undefined) continue;
    if (value === null) {
      if (CLEARABLE.has(field)) sent[field] = null;
      continue;
    }
    if (typeof value === "string") sent[field] = value;
  }

  return sent;
}

/**
 * The image a tab or a mark should show for a workspace, or "" for the letters.
 *
 * Trimmed because a logo cleared to whitespace is not a logo, and a favicon set
 * to a blank data URL is a broken square rather than an absent one.
 */
export function logoOrNothing(companyLogoUrl: string | null | undefined): string {
  return companyLogoUrl?.trim() || "";
}
