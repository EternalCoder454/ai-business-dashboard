import { COMPANY_ID } from "./seed";
import type { MemoryEntry } from "./types";

/**
 * The studio's record, turned into the block every head reads.
 *
 * The panel used to start every conversation from the same static Company
 * Profile, which meant a head could contradict a decision made last month and
 * had no figure to reason from. Skills like "Game Revenue Forecast" and
 * "Weekly Priority Call" are written to demand real inputs, so without this
 * they were asking for the same numbers every time.
 */

/** How many of each kind reach the prompt, newest first. */
const MAX_DECISIONS = 24;
const MAX_SERIES = 20;
/** Readings kept per figure, so a direction is visible without a chart. */
const MAX_READINGS = 3;

/** A date a model can reason about, and that only changes once a day. */
function on(occurredAt: number): string {
  return new Date(occurredAt).toISOString().slice(0, 10);
}

/**
 * What one head sees: its own entries plus everything company-wide.
 *
 * Archived entries never appear. They are kept so the history of a decision
 * survives being overtaken, which is not the same as still being true.
 */
export function memoryFor(entries: MemoryEntry[], departmentId: string): MemoryEntry[] {
  return entries.filter(
    (entry) =>
      !entry.archived &&
      (entry.departmentId === departmentId || entry.departmentId === COMPANY_ID),
  );
}

/**
 * Figures grouped into series by label, newest reading first.
 *
 * Readings share a label deliberately: "Wishlists" written the same way each
 * time reads as a trend, where one entry per measurement would read as a pile
 * of unrelated numbers.
 */
export function figureSeries(entries: MemoryEntry[]): Map<string, MemoryEntry[]> {
  const series = new Map<string, MemoryEntry[]>();
  for (const entry of entries) {
    if (entry.kind !== "figure") continue;
    series.set(entry.label, [...(series.get(entry.label) ?? []), entry]);
  }
  for (const readings of series.values()) {
    readings.sort((a, b) => b.occurredAt - a.occurredAt);
  }
  return series;
}

/**
 * The prompt block, or an empty string when there is nothing to say.
 *
 * Placed late in the system prompt on purpose. The whole prompt is one cached
 * prefix, so a change invalidates everything after it but nothing before it,
 * and this is the part that changes most often.
 */
export function buildMemoryBlock(entries: MemoryEntry[], departmentId: string): string {
  const mine = memoryFor(entries, departmentId);
  if (mine.length === 0) return "";

  const lines: string[] = ["=== WHAT THIS STUDIO HAS DECIDED AND MEASURED ==="];

  const decisions = mine
    .filter((entry) => entry.kind === "decision")
    .sort((a, b) => b.occurredAt - a.occurredAt)
    .slice(0, MAX_DECISIONS);

  if (decisions.length) {
    lines.push("", "Standing decisions. These are settled: work from them rather than reopening them.");
    for (const entry of decisions) {
      const parts = [`- ${on(entry.occurredAt)}: ${entry.label.trim()}`];
      if (entry.detail.trim()) parts.push(`  Why: ${entry.detail.trim()}`);
      if (entry.revisitWhen.trim()) parts.push(`  Revisit when: ${entry.revisitWhen.trim()}`);
      lines.push(...parts);
    }
  }

  const series = figureSeries(mine);
  if (series.size) {
    lines.push("", "Figures, most recent first. Use these instead of asking for them.");
    for (const [label, readings] of [...series].slice(0, MAX_SERIES)) {
      const shown = readings
        .slice(0, MAX_READINGS)
        .map((entry) => `${entry.value.trim()} (${on(entry.occurredAt)})`)
        .join(", then ");
      lines.push(`- ${label.trim()}: ${shown}`);
    }
  }

  lines.push(
    "",
    "Everything above is established fact about this business, written down by the person you are talking to.",
    "Do not contradict it and do not ask them to restate it.",
    "A figure with only one reading is a snapshot, not a trend, so do not describe it as rising or falling.",
    "If something here looks stale or wrong for the question, say so plainly rather than quietly working around it.",
    "=== END RECORD ===",
  );

  return lines.join("\n");
}
