/**
 * That "two fewer than last week" is a fact rather than a decoration.
 *
 * The four task counts on the dashboard now say how they have moved, and
 * nothing stores last week's numbers: they are reconstructed from when each
 * task was made and when it was finished. That is a reasonable thing to do and
 * a very easy thing to get quietly wrong, and wrong here is worse than absent,
 * because a number under a heading is read as measured.
 *
 * So the cases that matter are the ones where a task's own history decides
 * which side of the line it falls: made since, finished since, finished before,
 * finished and reopened, and done with no stamp to read.
 *
 *   npm run task-counts-test
 */
import { dueCounts, openAt, splitByDue } from "../src/lib/taskCounts";
import type { Task } from "../src/lib/types";

const DAY = 86_400_000;
const NOW = new Date("2026-09-15T11:00:00Z").getTime();
const MIDNIGHT = new Date(NOW).setHours(0, 0, 0, 0);
const THEN = MIDNIGHT - 7 * DAY;

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures += 1;
}

function task(over: Partial<Task> & { id: string }): Task {
  return {
    title: over.id,
    notes: "",
    status: "todo",
    departmentId: "marketing",
    order: 0,
    createdAt: MIDNIGHT - 30 * DAY,
    updatedAt: MIDNIGHT,
    ...over,
  } as Task;
}

console.log("\nthe windows themselves, from one midnight");
{
  const counts = splitByDue(
    [
      task({ id: "yesterday", dueAt: MIDNIGHT - DAY }),
      task({ id: "today", dueAt: MIDNIGHT }),
      task({ id: "in six days", dueAt: MIDNIGHT + 6 * DAY }),
      task({ id: "in eight days", dueAt: MIDNIGHT + 8 * DAY }),
      task({ id: "in a month", dueAt: MIDNIGHT + 30 * DAY }),
      task({ id: "no date" }),
    ],
    MIDNIGHT,
  );
  check("yesterday is overdue", counts.overdue === 1, `${counts.overdue}`);
  // Today is due this week rather than overdue, which is the whole reason the
  // boundary is midnight and not the current time.
  check("today and six days out are this week", counts.week === 2, `${counts.week}`);
  check("eight days out is next week", counts.next === 1, `${counts.next}`);
  check("a month out is later", counts.later === 1, `${counts.later}`);
  check("and no date is its own column", counts.undated === 1, `${counts.undated}`);
}

console.log("\nwhich tasks were open a week ago");
{
  const tasks = [
    task({ id: "still open", createdAt: THEN - DAY }),
    task({ id: "made since", createdAt: THEN + DAY }),
    task({
      id: "finished since",
      status: "done",
      createdAt: THEN - DAY,
      completedAt: THEN + DAY,
    }),
    task({
      id: "finished before",
      status: "done",
      createdAt: THEN - 5 * DAY,
      completedAt: THEN - DAY,
    }),
    // Reopened: the stamp is cleared when a task leaves done, so it reads as
    // open now and as open then, which is the truth on both counts.
    task({ id: "reopened", status: "doing", createdAt: THEN - DAY }),
    task({ id: "done, no stamp", status: "done", createdAt: THEN - DAY }),
  ];
  const open = openAt(tasks, THEN).map((t) => t.id);

  check("one still open counts", open.includes("still open"));
  check("one made since does not", !open.includes("made since"), open.join(","));
  check("one finished since was open then", open.includes("finished since"));
  check("one finished before was not", !open.includes("finished before"));
  check("a reopened one counts", open.includes("reopened"));
  check("and done with no stamp is left out", !open.includes("done, no stamp"));
  check("three in total", open.length === 3, `${open.length}`);
}

console.log("\nand the pair the dashboard actually draws");
{
  const tasks = [
    // Overdue now, and was already overdue a week ago.
    task({ id: "long overdue", createdAt: THEN - 10 * DAY, dueAt: MIDNIGHT - 10 * DAY }),
    // Overdue now, but a week ago it was still due this week.
    task({ id: "just tipped", createdAt: THEN - 10 * DAY, dueAt: MIDNIGHT - DAY }),
    // Made three days ago, so it did not exist a week ago at all.
    task({ id: "new", createdAt: MIDNIGHT - 3 * DAY, dueAt: MIDNIGHT + 2 * DAY }),
    // Finished yesterday: gone from now, present a week ago.
    task({
      id: "finished",
      status: "done",
      createdAt: THEN - 10 * DAY,
      completedAt: MIDNIGHT - DAY,
      dueAt: MIDNIGHT + 3 * DAY,
    }),
  ];
  const counts = dueCounts(tasks, NOW);

  check("two are overdue now", counts.overdue === 2, `${counts.overdue}`);
  check("one is due this week now", counts.week === 1, `${counts.week}`);
  check("one was overdue a week ago", counts.was.overdue === 1, `${counts.was.overdue}`);
  /*
   * Three were open then: long overdue, just tipped and finished.
   *
   * "just tipped" is due a day before this midnight, which is six days after
   * the earlier one, so it was due that week. "finished" is due three days
   * after this midnight, which is ten days after the earlier one, so it was
   * next week rather than that one. Worth spelling out because the first draft
   * of this test got it wrong and the code was right.
   */
  check("one was due that week", counts.was.week === 1, `${counts.was.week}`);
  check("and one the week after", counts.was.next === 1, `${counts.was.next}`);
  check("the finished one is not counted now", counts.later + counts.next === 0);
}

console.log(
  failures === 0
    ? "\nall checks passed"
    : `\n${failures} FAILURES ABOVE. A count that is wrong about last week is worse than no count.`,
);
process.exit(failures === 0 ? 0 : 1);
