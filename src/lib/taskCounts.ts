import type { Task } from "./types";

const DAY = 86_400_000;

/** Open tasks split by when they are due, from a given midnight. */
export interface DueCounts {
  overdue: number;
  week: number;
  next: number;
  later: number;
  undated: number;
}

/**
 * The four windows the dashboard counts, from one moment.
 *
 * Rolling rather than calendar: on a Friday, "due this week" meaning the next
 * twenty four hours is right and useless. No date is its own column, since a
 * task nobody dated is the one that quietly never gets done.
 */
export function splitByDue(open: Task[], from: number): DueCounts {
  const counts: DueCounts = { overdue: 0, week: 0, next: 0, later: 0, undated: 0 };
  for (const task of open) {
    if (task.dueAt === undefined) counts.undated += 1;
    else if (task.dueAt < from) counts.overdue += 1;
    else if (task.dueAt < from + 7 * DAY) counts.week += 1;
    else if (task.dueAt < from + 14 * DAY) counts.next += 1;
    else counts.later += 1;
  }
  return counts;
}

/**
 * Which tasks were open at a moment in the past.
 *
 * Reconstructed rather than remembered: nothing stores yesterday's numbers, but
 * every task carries when it was made and when it was finished, so the set that
 * was open at a given moment can be worked out. A task was open then if it
 * existed by then and was either never finished or finished afterwards.
 *
 * Tasks marked done before completedAt was recorded have no stamp to read.
 * They are treated as finished before the moment rather than counted into a
 * past they may not have been in, which is the conservative way round: it can
 * understate what was open, never invent it.
 */
export function openAt(tasks: Task[], at: number): Task[] {
  return tasks.filter((task) => {
    if (task.createdAt > at) return false;
    if (task.completedAt !== undefined) return task.completedAt > at;
    return task.status !== "done";
  });
}

/**
 * The counts now, and the same counts a week ago.
 *
 * One thing this cannot know, and it is the honest limit of it: dueAt is
 * today's due date. A task somebody pushed back on Wednesday is counted against
 * the window its new date falls in, not the one it was in on Monday. So it
 * answers how the tasks you have now would have looked a week ago, which is the
 * useful question, rather than photographing the screen. It is right about
 * anything created, finished or left alone, and that is nearly all of it.
 */
export function dueCounts(
  tasks: Task[],
  now: number,
): DueCounts & { was: DueCounts } {
  const midnight = new Date(now).setHours(0, 0, 0, 0);
  const then = midnight - 7 * DAY;
  const open = tasks.filter((task) => task.status !== "done");
  return { ...splitByDue(open, midnight), was: splitByDue(openAt(tasks, then), then) };
}
