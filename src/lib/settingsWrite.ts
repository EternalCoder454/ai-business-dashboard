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
  "monthlyBudget",
  "companyLogoUrl",
  "sidebarSide",
  "searchShortcut",
  "wikiTitle",
  "wikiSubtitle",
] as const;

/**
 * Settings that belong to the business rather than to the person changing them.
 *
 * Everything here is seen by everybody: the company's name and mark are on
 * every screen and on the invitation emails, the writing rules are appended to
 * every head's prompt and beat any instruction that disagrees with them, and
 * the budget is a spending control. A member could rewrite all of it, which is
 * the kind of permission nobody notices is missing until somebody uses it.
 *
 * Refused on the server rather than only hidden on the screen, because a hidden
 * field is not a permission. The Settings page hides them too, so a member is
 * not shown a control that silently does nothing.
 */
export const ADMIN_ONLY_SETTINGS = new Set<string>([
  "companyName",
  "companySubtitle",
  "companyMark",
  "companyLogoUrl",
  "wikiTitle",
  "wikiSubtitle",
  "writingRules",
  "monthlyBudget",
]);

/** The fields that may be set back to empty rather than only changed. */
const CLEARABLE = new Set<string>(["companyLogoUrl"]);

/**
 * The ones that are a number rather than a string, and their ceiling.
 *
 * Named one at a time rather than by loosening the type check for everything.
 * Every other column here is text, and a rule that accepted any number would
 * let one into a text column where it would read back as something nobody
 * wrote. The first numeric setting was silently dropped by exactly this filter:
 * it wrote and the field read back as it was, with nothing anywhere saying why.
 *
 * The ceiling is not a policy about how much anybody may spend. It is a guard
 * against a typo becoming a budget of a hundred million, which would read as
 * "no budget" while claiming to be one.
 */
const NUMERIC: Record<string, number> = {
  monthlyBudget: 1_000_000,
};

/**
 * The subset of a sent row that may actually be written.
 *
 * Absent and undefined both mean "leave this alone", so a save of one field
 * cannot blank the rest. Null means "clear this", which only the logo allows:
 * every other column here is a string the interface always has a value for, and
 * a null arriving in one of them is a bug rather than an intention.
 */
export function writableSettings(
  row: Record<string, unknown>,
  /** Anything in ADMIN_ONLY_SETTINGS is dropped for anybody else. */
  isAdmin: boolean,
): Record<string, unknown> {
  const sent: Record<string, unknown> = {};

  for (const field of WRITABLE_SETTINGS) {
    const value = row[field];
    if (value === undefined) continue;
    // Dropped rather than refused: the rest of the same save is legitimate,
    // and failing all of it would lose a change the person was allowed to make.
    if (!isAdmin && ADMIN_ONLY_SETTINGS.has(field)) continue;
    if (value === null) {
      if (CLEARABLE.has(field)) sent[field] = null;
      continue;
    }
    if (field in NUMERIC) {
      // Whole, positive, and inside the ceiling. Anything else is discarded
      // rather than clamped: a budget somebody did not type is not a budget.
      const asNumber = typeof value === "number" ? value : Number(value);
      if (Number.isFinite(asNumber) && asNumber >= 0 && asNumber <= NUMERIC[field]) {
        sent[field] = Math.round(asNumber);
      }
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
