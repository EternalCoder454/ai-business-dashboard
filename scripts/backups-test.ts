/**
 * That a backup covers the whole workspace, and keeps covering it.
 *
 * The failure this exists to prevent is silent and total: somebody adds a table
 * next month, every screen works, backups keep succeeding, and the day one is
 * restored the new table comes back empty. A backup that is quietly incomplete
 * is worse than no backup, because it is the thing being relied on at exactly
 * the moment it matters.
 *
 * So the schema is read rather than trusted. Every workspace scoped table has
 * to be named in one of the two lists, and adding a table without deciding
 * which one fails here rather than in front of somebody restoring.
 *
 *   npm run backups-test
 */
import { readFileSync } from "node:fs";
import { BACKED_UP, KEEP, NOT_BACKED_UP, MAX_BACKUP_BYTES, REDACTED } from "../src/db/backups";

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures += 1;
}

/**
 * Every table in the schema that belongs to a workspace.
 *
 * Read from the source rather than from the imported module, because a table
 * object gives no reliable way to ask whether it has a workspace_id column
 * without depending on drizzle's internals, and this check has to keep working
 * when those change.
 */
function workspaceScopedTables(): string[] {
  const source = readFileSync("src/db/schema.ts", "utf8");
  const found: string[] = [];
  const declaration = /export const ([a-zA-Z]+) = pgTable\(/g;

  for (let match = declaration.exec(source); match; match = declaration.exec(source)) {
    // From this declaration to the next one, which is the table's own body.
    const next = source.indexOf("export const ", match.index + 1);
    const body = source.slice(match.index, next === -1 ? source.length : next);
    /*
     * Either spelling of the column. Most tables reach for the shared
     * `workspace()` helper, but profiles and settings hold exactly one row per
     * workspace and declare workspace_id as their own primary key instead.
     *
     * Both halves are load bearing, and each was wrong on its own first: the
     * helper alone reported profiles and settings as missing from the schema
     * while they sat in the backup list, and the literal alone found only the
     * five tables that spell it out and called the other twenty undecided.
     */
    if (/workspaceId: workspace\(\)|workspace_id/.test(body)) found.push(match[1]);
  }
  return found;
}

const covered = BACKED_UP.map(([name]) => name);
const excluded = Object.keys(NOT_BACKED_UP);
const scoped = workspaceScopedTables();

console.log(`\nevery workspace table is decided one way or the other (${scoped.length} tables)`);
{
  check("the schema was actually read", scoped.length > 5, `${scoped.length} found`);

  const undecided = scoped.filter(
    (name) => !covered.includes(name as never) && !excluded.includes(name),
  );
  check(
    "none is left out by accident",
    undecided.length === 0,
    undecided.join(", ") || "none",
  );

  const both = covered.filter((name) => excluded.includes(name));
  check("and none is in both lists", both.length === 0, both.join(", ") || "none");
}

console.log("\nthe lists still describe tables that exist");
{
  const goneFromBackup = covered.filter((name) => !scoped.includes(name));
  check(
    "every backed up table is still in the schema",
    goneFromBackup.length === 0,
    goneFromBackup.join(", ") || "none",
  );

  const goneFromExcluded = excluded.filter((name) => !scoped.includes(name));
  check(
    "every excluded table is still in the schema",
    goneFromExcluded.length === 0,
    goneFromExcluded.join(", ") || "none",
  );

  check(
    "and every exclusion says why",
    excluded.every((name) => (NOT_BACKED_UP[name] ?? "").length > 10),
    excluded.filter((name) => (NOT_BACKED_UP[name] ?? "").length <= 10).join(", ") || "none",
  );
}

console.log("\nand what is left out is left out on purpose");
for (const name of excluded) console.log(`  ..   ${name}: ${NOT_BACKED_UP[name]}`);

console.log("\na restore inserts rows before the rows that point at them");
{
  /*
   * Nothing here declares a foreign key, so the database will not complain if
   * this is wrong. It would simply leave the workspace inconsistent partway
   * through, which is only visible to somebody watching at that moment.
   */
  const order = (name: string) => covered.indexOf(name as never);
  check("conversations before messages", order("conversations") < order("messages"));
  check("runs before their rounds", order("meetings") < order("meetingRounds"));
  check("departments first of all", order("departments") === 0);
}

console.log("\nno credential travels in a backup");
{
  /*
   * The provider keys sit on the settings row, which is otherwise worth backing
   * up in full: the model, the effort, the theme, the budget, the link policy.
   * Excluding the whole table to protect five columns would mean a restore that
   * reverted none of a workspace's settings, so the table is covered and the
   * columns are stripped.
   *
   * Read from the schema rather than listed here, so a sixth provider added
   * next year is caught by this instead of quietly ending up in every backup.
   */
  const schema = readFileSync("src/db/schema.ts", "utf8");
  const settingsStart = schema.indexOf("export const settings = pgTable(");
  const settingsBody = schema.slice(settingsStart, schema.indexOf("export const ", settingsStart + 1));
  const keyColumns = [...settingsBody.matchAll(/^\s+([a-zA-Z]+Key):/gm)].map((m) => m[1]);

  check("the schema still has key columns to protect", keyColumns.length > 0, keyColumns.join(", "));

  const stripped = REDACTED.settings ?? [];
  const exposed = keyColumns.filter((name) => !stripped.includes(name));
  check(
    "every one of them is stripped from the payload",
    exposed.length === 0,
    exposed.join(", ") || "none",
  );

  check(
    "and the table itself is still backed up",
    covered.includes("settings" as never),
    "otherwise a restore would revert no settings at all",
  );

  const unknown = Object.keys(REDACTED).filter((name) => !covered.includes(name as never));
  check(
    "nothing is stripped from a table that is not backed up",
    unknown.length === 0,
    unknown.join(", ") || "none",
  );
}

console.log("\nthe things that stop a backup growing without limit");
{
  check("there is a size ceiling", MAX_BACKUP_BYTES > 0);
  check(
    "and it is not so small that an ordinary workspace hits it",
    MAX_BACKUP_BYTES >= 8 * 1024 * 1024,
    `${(MAX_BACKUP_BYTES / 1048576).toFixed(0)}MB`,
  );

  /*
   * Counted per kind so a run of automatic backups can never push out the one
   * somebody took by hand before doing something they were unsure about, which
   * is the one most likely to be wanted.
   */
  check("every kind has a retention limit", Object.values(KEEP).every((n) => n > 0));
  check(
    "the manual ones are kept longest",
    KEEP.manual >= KEEP.automatic && KEEP.manual >= KEEP["before-restore"],
    JSON.stringify(KEEP),
  );
  check(
    "and the one taken before a restore is kept",
    KEEP["before-restore"] > 0,
    `${KEEP["before-restore"]}`,
  );
}

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} FAILURES ABOVE`);
process.exit(failures === 0 ? 0 : 1);
