/**
 * Whether one business's rows can reach another's, checked against the real
 * database rather than against the code that writes them.
 *
 * The tenancy audit reads every query and proves each one names a workspace.
 * This is the other half: that the data those queries fence actually holds the
 * shape they assume. A row with no workspace, one pointing at a business that
 * was deleted, or one whose parent lives in a different business is invisible
 * to a code audit and is what a cross-tenant leak looks like from the inside.
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

function warn(label: string, count: number, detail = "") {
  if (count === 0) {
    console.log(`  ok   ${label}`);
    return;
  }
  console.log(`  WARN ${label}: ${count}${detail ? ` ${detail}` : ""}`);
  warnings += 1;
}

function note(label: string, value: string) {
  console.log(`  ..   ${label}: ${value}`);
}

/** Tables carrying a workspace_id. */
const SCOPED = [
  "departments", "projects", "conversations", "messages", "skills",
  "wiki_pages", "tasks", "memory", "deliverables", "files",
  "all_hands_runs", "all_hands_rounds", "profiles", "settings",
  "direct_messages", "schedules", "briefings", "reports", "telemetry",
  "api_keys", "link_allowlist",
];

/**
 * A child, the column naming its parent, and the parent table.
 *
 * Joined on the workspace as well as the id, because an id is only unique
 * inside one business: departments are keyed `(workspace_id, id)`, so joining
 * on the id alone matches the same department in every business that has one
 * and reports a crossing that is not there. The question worth asking is
 * whether a child names a parent that does not exist in its own business.
 */
const PARENTS: [string, string, string][] = [
  ["conversations", "department_id", "departments"],
  ["messages", "conversation_id", "conversations"],
  ["all_hands_rounds", "run_id", "all_hands_runs"],
  ["deliverables", "department_id", "departments"],
  ["skills", "department_id", "departments"],
  ["tasks", "department_id", "departments"],
  ["memory", "department_id", "departments"],
  ["files", "department_id", "departments"],
];

/**
 * Ids that are not a row.
 *
 * `company` means the whole business and `ceo` is seeded per workspace but can
 * be removed, so neither dangling is a tenancy problem.
 */
const SENTINELS = ["", "company", "ceo"];

async function count(query: ReturnType<typeof sql>): Promise<number> {
  const rows = await db!.execute<{ n: number }>(query);
  return Number(rows[0]?.n ?? 0);
}

async function tableExists(name: string): Promise<boolean> {
  return (
    (await count(
      sql`SELECT COUNT(*)::int AS n FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = ${name}`,
    )) > 0
  );
}

async function main() {
  if (!db) throw new Error("This needs DATABASE_URL. Nothing is written.");

  console.log("the businesses on this deployment");
  const spaces = await db.execute<{ id: string; name: string }>(
    sql`SELECT id, name FROM workspaces ORDER BY created_at`,
  );
  for (const space of spaces) note(space.id, space.name);
  console.log(`  ${spaces.length} in total\n`);

  const present: string[] = [];
  for (const table of SCOPED) {
    if (await tableExists(table)) present.push(table);
    else {
      console.log(`  ..   ${table} does not exist yet`);
      warnings += 1;
    }
  }

  console.log("\nevery scoped row names a business");
  for (const table of present) {
    check(
      `${table}`,
      await count(
        sql`SELECT COUNT(*)::int AS n FROM ${sql.identifier(table)}
            WHERE workspace_id IS NULL OR workspace_id = ''`,
      ),
    );
  }

  console.log("\nevery scoped row names a business that still exists");
  for (const table of present) {
    const orphans = await count(
      sql`SELECT COUNT(*)::int AS n FROM ${sql.identifier(table)} c
          WHERE NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = c.workspace_id)`,
    );
    // Left behind by a delete that ran before the table was added to it. They
    // are unreachable rather than leaked, since every query names a workspace
    // that no longer exists, so this is a warning and not a failure. The one
    // exception is api_keys, checked on its own below, because a key is a
    // credential rather than a row.
    warn(`${table}`, orphans, "(left by a delete that predates the table)");
  }

  console.log("\na child names a parent inside its own business");
  for (const [child, column, parent] of PARENTS) {
    if (!present.includes(child) || !present.includes(parent)) continue;
    check(
      `${child}.${column}`,
      await count(
        sql`SELECT COUNT(*)::int AS n
            FROM ${sql.identifier(child)} c
            WHERE c.${sql.identifier(column)} IS NOT NULL
              AND c.${sql.identifier(column)} NOT IN (${sql.join(
                SENTINELS.map((value) => sql`${value}`),
                sql`, `,
              )})
              AND NOT EXISTS (
                SELECT 1 FROM ${sql.identifier(parent)} p
                WHERE p.id = c.${sql.identifier(column)}
                  AND p.workspace_id = c.workspace_id
              )`,
      ),
    );
  }

  console.log("\nno API key outlives the business it belongs to");
  // A key resolves by the hash of its token and hands back whatever workspace
  // its row names. A live key naming a deleted business authenticates against
  // nothing, which reads as empty rather than as somebody else's data, but it
  // is still a credential that should have died with the business.
  const liveOrphanKeys = await count(
    sql`SELECT COUNT(*)::int AS n FROM api_keys k
        WHERE k.revoked_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = k.workspace_id)`,
  );
  check("live keys for a deleted business", liveOrphanKeys);

  console.log("\na direct message stays inside one business");
  check(
    "messages whose sender is not in the business they are filed under",
    await count(
      sql`SELECT COUNT(*)::int AS n FROM direct_messages m
          WHERE NOT EXISTS (
            SELECT 1 FROM access a
            WHERE a.email = m.from_email AND a.workspace_id = m.workspace_id
          )`,
    ),
    "(somebody removed from the business also lands here)",
  );
  check(
    "messages whose recipient is not in the business they are filed under",
    await count(
      sql`SELECT COUNT(*)::int AS n FROM direct_messages m
          WHERE NOT EXISTS (
            SELECT 1 FROM access a
            WHERE a.email = m.to_email AND a.workspace_id = m.workspace_id
          )`,
    ),
  );
  // The thread key is what a poll reads. Two people in different businesses
  // sharing one would be the leak this whole check exists for.
  check(
    "thread keys used by more than one business",
    await count(
      sql`SELECT COUNT(*)::int AS n FROM (
            SELECT thread_key FROM direct_messages
            GROUP BY thread_key HAVING COUNT(DISTINCT workspace_id) > 1
          ) AS shared`,
    ),
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

  console.log("\nthe first run window is closed");
  const live = await count(
    sql`SELECT COUNT(*)::int AS n FROM access WHERE revoked_at IS NULL`,
  );
  // An empty access table with no OPERATOR_EMAILS lets the next person to sign
  // in adopt the deployment. One live row closes it whatever the environment
  // says, which is the state to be in before strangers have the URL.
  check("live access rows, which must not be zero", live === 0 ? 1 : 0, `(${live} rows)`);

  console.log("\none settings row per business");
  check(
    "businesses with more than one",
    await count(
      sql`SELECT COUNT(*)::int AS n FROM (
            SELECT workspace_id FROM settings GROUP BY workspace_id HAVING COUNT(*) > 1
          ) AS duplicated`,
    ),
  );
  check(
    "businesses with none, which cannot hold a key or a policy",
    await count(
      sql`SELECT COUNT(*)::int AS n FROM workspaces w
          WHERE NOT EXISTS (SELECT 1 FROM settings s WHERE s.workspace_id = w.id)`,
    ),
  );

  console.log(
    failures === 0
      ? `\nall checks passed${warnings ? `, ${warnings} warnings above` : ""}`
      : `\n${failures} failed${warnings ? `, ${warnings} warnings` : ""}`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
