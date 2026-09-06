import type { Deliverable } from "./types";

/**
 * What a head can see and change about work it has already produced.
 *
 * A head could save a deliverable and nothing else, so every revision was a new
 * document: ask for a change to a proposal and you got a second proposal, then
 * a third, with nothing saying which was current. The Library has had the
 * answer to this since it shipped, a catalogue in the prompt and a read by
 * title, and this is that shape applied to the other half of the same problem.
 *
 * Scoped to one department, deliberately. A deliverable belongs to the head
 * that produced it, and Marketing rewriting Legal's contract is not a feature.
 */

export const DELIVERABLE_LIMITS = {
  /** Named in the catalogue. Beyond this the newest are listed. */
  catalogue: 30,
  /** How much of one comes back from a read. */
  excerpt: 12_000,
} as const;

/** This department's own work, newest first. */
export function deliverablesFor(
  deliverables: Deliverable[],
  departmentId: string,
): Deliverable[] {
  return deliverables
    .filter((item) => item.departmentId === departmentId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Finds the one a head asked for.
 *
 * The same rule the Library uses, and deliberately the same: exact title, then
 * case insensitively, then a unique partial match, and nothing at all when two
 * could match. Guessing is worse here than there, because the wrong answer is
 * not a misquote but an overwrite.
 */
export function findDeliverable(
  deliverables: Deliverable[],
  departmentId: string,
  title: string,
): Deliverable | undefined {
  const mine = deliverablesFor(deliverables, departmentId);
  const wanted = title.trim().toLowerCase();
  if (!wanted) return undefined;

  const exact = mine.find((item) => item.title === title.trim());
  if (exact) return exact;

  const insensitive = mine.filter((item) => item.title.toLowerCase() === wanted);
  if (insensitive.length === 1) return insensitive[0];

  const partial = mine.filter((item) => item.title.toLowerCase().includes(wanted));
  return partial.length === 1 ? partial[0] : undefined;
}

/** How long ago, in the coarsest unit that is still true. */
function when(timestamp: number, now: number): string {
  const days = Math.floor((now - timestamp) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  return months === 1 ? "a month ago" : `${months} months ago`;
}

/**
 * The catalogue, for the prompt.
 *
 * Titles and when each was last changed, and not the bodies. A head with forty
 * documents pasted into every message has no more capability than one with a
 * list, and it pays for them on every turn. The same reasoning as the Library
 * block, which learned it the expensive way.
 */
export function buildDeliverablesBlock(
  deliverables: Deliverable[],
  departmentId: string,
  now: number = Date.now(),
): string {
  const mine = deliverablesFor(deliverables, departmentId);
  if (mine.length === 0) return "";

  const listed = mine.slice(0, DELIVERABLE_LIMITS.catalogue);
  const lines = listed
    .map((item) => `- "${item.title}" (last changed ${when(item.updatedAt, now)})`)
    .join("\n");

  const more =
    mine.length > listed.length
      ? `\n\n${mine.length - listed.length} older ones are not listed. Ask for one by name and it will be found.`
      : "";

  return `=== YOUR DELIVERABLES ===
You have already produced ${mine.length} piece${mine.length === 1 ? "" : "s"} of work. You have their titles below, not their contents.

When somebody asks for a change to one of these, revise it rather than writing another. Read it with read_deliverable, then send the whole corrected document to update_deliverable under the same title. A second copy of a proposal with no way to tell which is current is worse than no copy.

Save a new one only when the work is genuinely new. If you are unsure whether something is a revision or a new piece, ask.

${lines}${more}
=== END DELIVERABLES ===`;
}

/** A body, capped, with the cap declared rather than silent. */
export function excerptOfDeliverable(body: string): string {
  const text = body.trim();
  if (text.length <= DELIVERABLE_LIMITS.excerpt) return text;
  return (
    `${text.slice(0, DELIVERABLE_LIMITS.excerpt)}\n\n` +
    `[This continues. You have read the first ${DELIVERABLE_LIMITS.excerpt.toLocaleString()} ` +
    `characters of ${text.length.toLocaleString()}. Do not send an update built on a part you have not read.]`
  );
}
