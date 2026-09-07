/**
 * That the generated id list still matches the changelog it came from.
 *
 * The list exists so the shell can count unread entries without carrying the
 * changelog: ProfileMenu is on every screen, and importing the entries put
 * 316KB of prose in the chunk every visitor downloads on every page in order to
 * draw a dot. Splitting them is only safe while the two agree, and a generated
 * file that has quietly stopped matching its source is worse than no split: the
 * badge would count against a history that no longer exists.
 *
 *   npm run changelog-test
 */
import { CHANGELOG, LATEST } from "../src/lib/changelog.data";
import { CHANGELOG_IDS, LATEST as GENERATED_LATEST } from "../src/lib/changelog.ids";

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures += 1;
}

console.log("\nthe generated ids match the changelog");
{
  const fromData = CHANGELOG.map((entry) => entry.id);

  check(
    "same number of entries",
    CHANGELOG_IDS.length === fromData.length,
    `${CHANGELOG_IDS.length} against ${fromData.length}`,
  );

  /*
   * Order matters as much as membership. The count is an index into this list,
   * so a list holding the right ids in the wrong order would report a plausible
   * number that is wrong, which is the failure nobody notices.
   */
  const firstDifference = fromData.findIndex((id, i) => CHANGELOG_IDS[i] !== id);
  check(
    "same ids in the same order",
    firstDifference === -1,
    firstDifference === -1
      ? ""
      : `position ${firstDifference}: ${CHANGELOG_IDS[firstDifference] ?? "missing"} against ${fromData[firstDifference]}`,
  );

  check("same latest", GENERATED_LATEST === LATEST, `${GENERATED_LATEST} against ${LATEST}`);
  check(
    "and latest is the newest entry",
    LATEST === fromData[0],
    `${LATEST} against ${fromData[0]}`,
  );
}

console.log("\nthe changelog itself is still well formed");
{
  const ids = CHANGELOG.map((entry) => entry.id);
  check("no duplicate ids", new Set(ids).size === ids.length);
  check("every entry has an id", ids.every((id) => typeof id === "string" && id.length > 0));
  /*
   * Position, not date, because position is what the badge actually uses: the
   * count is an index into this array, so the array's order is the contract and
   * the dates are a label on it.
   *
   * The first version of this check asserted the dates descend and found two
   * entries at index 171 and 173 that do not. That is history from before any
   * of this, and reordering it to satisfy a new test would change what every
   * existing badge counts, in exchange for nothing. So the check is the one the
   * product depends on, and the disorder is written down here rather than
   * quietly tidied away.
   */
  check(
    "every entry has a date",
    CHANGELOG.every((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry.date)),
  );
  check(
    "the newest entry is first",
    CHANGELOG[0].date >= CHANGELOG[CHANGELOG.length - 1].date,
  );
}

console.log(
  failures === 0
    ? "\nall checks passed"
    : `\n${failures} FAILURES ABOVE. Run npm run changelog-ids.`,
);
process.exit(failures === 0 ? 0 : 1);
