/**
 * Who may open what.
 *
 * Every check in this file is one an administrator will make in the UI and
 * then trust, and the failure mode is silent in both directions: too loose and
 * a restriction they set does nothing, too tight and a colleague quietly loses
 * a screen nobody meant to take away. Neither shows up as an error anywhere.
 *
 * The parser gets most of the attention, because it is the only thing standing
 * between a hand written jsonb column and every reader in the codebase.
 *
 * Run with: npm run permissions-test
 */
import {
  AREAS,
  allowsArea,
  allowsHead,
  allowsHref,
  areaOfTable,
  parsePermissions,
  unrestricted,
  type Permissions,
} from "../src/lib/permissions";

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!condition) failures += 1;
}

const NOTHING_SET: Permissions | null = null;
const NO_CALENDAR: Permissions = { denied: ["calendar"] };
const ONE_HEAD: Permissions = { heads: ["dept_ops"] };

function main() {
  console.log("a member with nothing set");
  check("opens every area", AREAS.every((a) => allowsArea("member", NOTHING_SET, a.key)));
  check("opens every head", allowsHead("member", NOTHING_SET, "dept_anything"));
  check("is reported as unrestricted", unrestricted(NOTHING_SET));

  console.log("\na member with the calendar switched off");
  check("cannot use the calendar", !allowsArea("member", NO_CALENDAR, "calendar"));
  check("still opens everything else", allowsArea("member", NO_CALENDAR, "tasks"));
  check("still opens every head", allowsHead("member", NO_CALENDAR, "dept_ops"));

  console.log("\na member given one head");
  check("opens that head", allowsHead("member", ONE_HEAD, "dept_ops"));
  check("does not open another", !allowsHead("member", ONE_HEAD, "dept_finance"));
  check("still opens every area", allowsArea("member", ONE_HEAD, "tasks"));

  console.log("\nan administrator");
  // The screen that sets these belongs to them, so a restriction they can lift
  // in one click is not a restriction. If this ever passes for an admin, the
  // last administrator of a business can lock themselves out of their own.
  const everything: Permissions = { heads: ["dept_ops"], denied: AREAS.map((a) => a.key) };
  check("is never restricted by an area", AREAS.every((a) => allowsArea("admin", everything, a.key)));
  check("is never restricted by a head", allowsHead("admin", everything, "dept_finance"));

  console.log("\nsomebody with no role at all");
  // Null role is a signed-in person the server has not answered about yet. It
  // must not be treated as an administrator.
  check("is not treated as an administrator", !allowsArea(null, NO_CALENDAR, "calendar"));

  console.log("\npaths");
  check("the inbox follows the messages area", !allowsHref("member", { denied: ["messages"] }, "/messages"));
  check("the dashboard belongs to no area", allowsHref("member", { denied: ["messages"] }, "/"));
  check("the account page belongs to no area", allowsHref("member", { denied: ["messages"] }, "/account"));

  console.log("\ntables");
  check("tasks", areaOfTable("tasks") === "tasks");
  check("the wiki", areaOfTable("wikiPages") === "wiki");
  check("files belong to the library", areaOfTable("files") === "library");
  check("a meeting is the meetings area", areaOfTable("allHands") === "meetings");
  // Conversations are deliberately not an area: which heads somebody may open
  // is asked separately, and mapping them here would deny every thread to
  // anyone missing a screen they never had.
  check("conversations belong to no area", areaOfTable("conversations") === null);
  check("settings belong to no area", areaOfTable("settings") === null);

  console.log("\nwhatever is in the column");
  check("null is no restrictions", parsePermissions(null) === null);
  check("a string is no restrictions", parsePermissions("admin") === null);
  check("an array is no restrictions", parsePermissions([1, 2]) === null);
  check("an empty object is no restrictions", parsePermissions({}) === null);
  check(
    "an unknown area is dropped rather than kept",
    parsePermissions({ denied: ["nonsense"] }) === null,
  );
  check(
    "a real area beside an unknown one survives",
    parsePermissions({ denied: ["calendar", "nonsense"] })?.denied?.join() === "calendar",
  );
  check(
    "an empty head list is no restrictions",
    parsePermissions({ heads: [] }) === null,
    "otherwise it means a person who may open nothing",
  );
  check(
    "heads that are not strings are dropped",
    parsePermissions({ heads: ["dept_ops", 7, null] })?.heads?.join() === "dept_ops",
  );
  check(
    "a real pair survives intact",
    JSON.stringify(parsePermissions({ heads: ["a"], denied: ["tasks"] })) ===
      JSON.stringify({ heads: ["a"], denied: ["tasks"] }),
  );

  console.log("\nround trip");
  // What the dialog saves has to read back as the same thing, or a restriction
  // set on Monday is gone on Tuesday.
  const saved: Permissions = { heads: ["dept_ops", "dept_ceo"], denied: ["calendar", "wiki"] };
  const back = parsePermissions(JSON.parse(JSON.stringify(saved)));
  check("survives the database", JSON.stringify(back) === JSON.stringify(saved));
  check("and still denies the calendar", !allowsArea("member", back, "calendar"));
  check("and still allows a named head", allowsHead("member", back, "dept_ceo"));

  console.log(failures === 0 ? "\nall checks passed" : `\n${failures} failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
