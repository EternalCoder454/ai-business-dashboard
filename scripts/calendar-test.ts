/**
 * The difference between an empty calendar and no calendar.
 *
 * This has now been reported twice. The first time a head could not see the
 * calendar at all; the second time the calendar was connected, the Google
 * project had the Calendar API switched off, every read came back 403, and the
 * head said "I do not have access to your calendar" to somebody who had
 * connected one and could see it in Settings.
 *
 * The cause both times was the same: three different situations arriving at the
 * prompt as one empty array. Nobody connected a calendar, somebody has a free
 * week, and somebody has a calendar we cannot read are three different answers
 * and only one of them is "I cannot see it".
 *
 * Run with: npm run calendar-test
 */
import { buildCalendarBlock, type PromptCalendarEvent } from "../src/lib/prompts";

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!condition) failures += 1;
}

const at = (hours: number) => Date.now() + hours * 3_600_000;
const events: PromptCalendarEvent[] = [
  { title: "Board review", start: at(2), end: at(3), allDay: false },
  { title: "Supplier call", start: at(26), end: at(27), allDay: false },
];

console.log("nobody has connected one");
const none = buildCalendarBlock([], "not-connected");
check("no block at all", none === "");
check("the default is the same", buildCalendarBlock([]) === "");

console.log("\nconnected, and the week is genuinely clear");
const empty = buildCalendarBlock([], "connected");
check("there is a block", empty.length > 0);
check("it says the calendar is connected", /connected/i.test(empty));
check("it says there is nothing booked", /nothing booked/i.test(empty));
// The whole point. Without this the head reports the wrong reason.
check(
  "it tells the head to say the diary is clear rather than unreadable",
  /clear/i.test(empty) && /cannot see it/i.test(empty),
);

console.log("\nconnected, and we could not read it");
const broken = buildCalendarBlock([], "unavailable");
check("there is a block", broken.length > 0);
check("it does not claim the diary is empty", !/nothing booked/i.test(broken));
// The dangerous answer is not "I cannot see it", it is a confident "you are free".
check("it forbids saying the week is clear", /do\s+not say/i.test(broken));
check("it names the state", /unavailable/i.test(broken));

console.log("\nconnected, with events");
const full = buildCalendarBlock(events, "connected");
check("the titles are there", full.includes("Board review") && full.includes("Supplier call"));
check("today is named as today", /Today/.test(full));
check("tomorrow is named as tomorrow", /Tomorrow/.test(full));
check("it does not claim to be empty", !/nothing booked/i.test(full));
check("it does not claim to be unreadable", !/unavailable/i.test(full));

console.log("\nthe three states are actually different");
const all = [none, empty, broken, full];
check("no two are the same text", new Set(all).size === 4);

console.log("\nnothing but titles and times leaves the calendar");
const withGuests: PromptCalendarEvent[] = [
  { title: "Standup", start: at(1), end: at(2), allDay: false },
];
const block = buildCalendarBlock(withGuests, "connected");
// The type carries no guest list, description or link, so there is nothing to
// leak; this fails if a field is ever added and rendered without thinking.
check("the block is titles and times only", !/@|http|meet\.google|zoom/i.test(block));

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
