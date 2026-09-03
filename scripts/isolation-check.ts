/**
 * Whether one business's rows can reach another's, checked against the real
 * database rather than against the code that writes them.
 *
 * The tenancy audit reads every query and proves each one names a workspace.
 * This is the other half: that the data those queries fence actually holds the
 * shape they assume. A row with no workspace, or one pointing at a parent in a
 * different business, is invisible to a code audit and is exactly what a
 * cross-tenant leak looks like from the inside.
 *
 * Read only. Nothing here writes.
 *
 * Run with: npm run isolation-check
 */
import { sql } from "drizzle-orm";
import { db } from "../src/db/client";

let failures = 0;
let warnings = 0;

function check(label: string, count: number, detail = "") {
  const ok = count === 0;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${ok ? "" : `: ${count}`}${detail ? ` ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function note(label: string, value: string) {
  console.log(`  ..   ${label}: ${value}`);
}

/** Tables carrying a workspace_id, and the parent each row hangs from. */
const SCOPED = [
  "departments", "projects", "conversations", "messages", "skills",
  "wiki_pages", "tasks", "memory", "deliverables", "files",
  "all_hands_runs", "all_hands_rounds", "profiles", "settings",
  "direct_messages", "schedules", "briefings", "reports", "telemetry",
  "api_keys", "link_allowlist",
];

/** child table, child column, parent table. Both sides must agree. */
const PARENTS: [string, string, string][] = [
  ["conversations", "department_id", "departments"],
  ["messages", "conversation_id", "conversations"],
  ["all_hands_rounds", "run_id", "all_hands_runs"],
  ["deliverables", "department_id", "departments"],
  ["skills", "department_id", "departments"],
  ["tasks", "department_id", "departments"],
];

async function count(query: ReturnType<typeof sql>): Promise<number> {
  const rows = await db!.execute<{ n: number }>(query);
  return Number(rows[0]?.n ?? 0);
}

async function main() {
  if (!db) throw new Error("This needs DATABASE_URL. Nothing is written.");

  console.log("the businesses on this deployment");
  const spaces = await db.execute<{ id: string; name: string }>(
    sql`SELECT id, name FROM workspaces ORDER BY created_at`,
  );
  for (const space of spaces) note(space.id, space.name);
  console.log(`  ${spaces.length} in total\n`);

  console.log("every scoped row names a business");
  for (const table of SCOPED) {
    const exists = await count(
      sql`SELECT COUNT(*)::int AS n FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = ${table}`,
    );
    if (!exists) {
      console.log(`  ..   ${table} does not exist yet`);
      warnings += 1;
      continue;
    }
    check(
      `${table} rows with no workspace`,
      await count(
        sql`SELECT COUNT(*)::int AS n FROM ${sql.identifier(table)}
            WHERE workspace_id IS NULL OR workspace_id = ''`,
      ),
    );
  }

  console.log("\nevery scoped row names a business that exists");
  for (const table of SCOPED) {
    const exists = await count(
      sql`SELECT COUNT(*)::int AS n FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = ${table}`,
    );
    if (!exists) continue;
    check(
      `${table} rows pointing at a deleted business`,
      await count(
        sql`SELECT COUNT(*)::int AS n FROM ${sql.identifier(table)} c
            WHERE NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = c.workspace_id)`,
      ),
    );
  }

  console.log("\na child never belongs to a different business than its parent");
  for (const [child, column, parent] of PARENTS) {
    check(
      `${child}.${column} crossing into another business`,
      await count(
        sql`SELECT COUNT(*)::int AS n
            FROM ${sql.identifier(child)} c
            JOIN ${sql.identifier(parent)} p ON p.id = c.${sql.identifier(column)}
            WHERE p.workspace_id <> c.workspace_id`,
      ),
    );
  }

  console.log("\na direct message never crosses a business");
  // Both ends of a thread have to be in the workspace the row is stored under,
  // or somebody moved between businesses and took a conversation with them.
  check(
    "senders outside the workspace the message is filed in",
    await count(
      sql`SELECT COUNT(*)::int AS n FROM direct_messages m
          WHERE NOT EXISTS (
            SELECT 1 FROM access a
            WHERE a.email = m.sender_email AND a.workspace_id = m.workspace_id
          )`,
    ),
    "(an ex-colleague removed from the business also counts here)",
  );

  console.log("\nwho can sign in");
  const access = await db.execute<{
    email: string;
    workspace_id: string;
    role: string;
    revoked_at: string | null;
  }>(sql`SELECT email, workspace_id, role, revoked_at FROM access ORDER BY created_at`);
  for (const row of access) {
    note(row.email, `${row.role} in ${row.workspace_id}${row.revoked_at ? " (revoked)" : ""}`);
  }
  check(
    "access rows naming a business that does not exist",
    await count(
      sql`SELECT COUNT(*)::int AS n FROM access a
          WHERE NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = a.workspace_id)`,
    ),
  );

  console.log("\nthe first run window");
  const live = await count(
    sql`SELECT COUNT(*)::int AS n FROM access WHERE revoked_at IS NULL`,
  );
  // An empty access table plus no OPERATOR_EMAILS lets the next person to sign
  // in adopt the deployment. One live row closes it whatever the environment
  // says, which is the state to be in before strangers have the URL.
  check("live access rows, which must not be zero", live === 0 ? 1 : 0, `(${live} rows)`);

  console.log("\nsettings rows hold one business each");
  check(
    "businesses with more than one settings row",
    await count(
      sql`SELECT COUNT(*)::int AS n FROM (
            SELECT workspace_id FROM settings GROUP BY workspace_id HAVING COUNT(*) > 1
          ) AS duplicated`,
    ),
  );

  console.log(
    failures === 0
      ? `\nall checks passed${warnings ? ` (${warnings} tables not created yet)` : ""}`
      : `\n${failures} failed`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
