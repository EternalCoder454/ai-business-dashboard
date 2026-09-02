/**
 * When a schedule is owed a run.
 *
 * The whole feature turns on this one function, and it is the kind of thing
 * that is quietly wrong for a month: a weekly briefing that fires twice on a
 * Monday, or one that never fires because a retry moved the clock. So it is
 * tested against real dates rather than reasoned about.
 *
 * Run with: npm run schedules-test
 */
import { isDue } from "../src/lib/schedules";

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!condition) failures += 1;
}

const at = (iso: string) => new Date(iso);
const base = { cadence: "weekly", weekday: 1, dayOfMonth: 1, lastRunAt: null as Date | null };

// 2026-09-07 is a Monday, 2026-09-08 a Tuesday.
const MONDAY = at("2026-09-07T06:00:00Z");
const TUESDAY = at("2026-09-08T06:00:00Z");

console.log("daily");
check("runs when never run", isDue({ ...base, cadence: "daily" }, MONDAY));
check(
  "not twice in one day",
  !isDue({ ...base, cadence: "daily", lastRunAt: at("2026-09-07T03:00:00Z") }, MONDAY),
);
check(
  "runs again the next day",
  isDue({ ...base, cadence: "daily", lastRunAt: at("2026-09-06T06:00:00Z") }, MONDAY),
);
check(
  "a run five minutes later on the next day still counts",
  isDue({ ...base, cadence: "daily", lastRunAt: at("2026-09-06T05:55:00Z") }, MONDAY),
  "the drift that an interval check gets wrong",
);

console.log("\nweekly");
check("fires on its weekday", isDue({ ...base, weekday: 1 }, MONDAY));
check("not on another day", !isDue({ ...base, weekday: 1 }, TUESDAY));
check(
  "not twice on the same Monday",
  !isDue({ ...base, weekday: 1, lastRunAt: at("2026-09-07T02:00:00Z") }, MONDAY),
);
check(
  "fires again the following Monday",
  isDue({ ...base, weekday: 1, lastRunAt: at("2026-08-31T06:00:00Z") }, MONDAY),
);
check("Sunday is zero", isDue({ ...base, weekday: 0 }, at("2026-09-06T06:00:00Z")));

console.log("\nmonthly");
check(
  "fires on its day",
  isDue({ ...base, cadence: "monthly", dayOfMonth: 7 }, MONDAY),
);
check(
  "not on another day",
  !isDue({ ...base, cadence: "monthly", dayOfMonth: 8 }, MONDAY),
);
check(
  "fires again next month",
  isDue(
    { ...base, cadence: "monthly", dayOfMonth: 7, lastRunAt: at("2026-08-07T06:00:00Z") },
    MONDAY,
  ),
);
check(
  "a day of 28 exists in February",
  isDue({ ...base, cadence: "monthly", dayOfMonth: 28 }, at("2027-02-28T06:00:00Z")),
);

console.log("\nnonsense is not due");
check("an unknown cadence never fires", !isDue({ ...base, cadence: "hourly" }, MONDAY));

console.log(failures ? "\nFAILURES ABOVE" : "\nall checks passed");
process.exit(failures ? 1 : 0);
