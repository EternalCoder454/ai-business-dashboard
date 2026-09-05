/**
 * Moves one person's address to another, everywhere it is recorded.
 *
 * An address is the identity in this product: it is what access rows are keyed
 * on, what an account row belongs to, and half of what a message thread is
 * named after. So changing it is not one update, it is six, and one of them is
 * not obvious.
 *
 * The thread key is the catch. A direct message thread is keyed by both
 * addresses sorted and joined, so that A writing to B and B writing to A land
 * in the same place. Updating from_email and to_email without rebuilding that
 * key leaves every thread pointing at an address nobody has any more: the
 * inbox would still list the old one as the other party, and opening the thread
 * would find nothing, because the lookup builds the key from the new address
 * and no row carries it.
 *
 * Runs in one transaction and checks itself before committing. If the counts do
 * not come out right, nothing is written.
 *
 *   npm run rename-address old@example.com new@example.com
 */
import { db, requireDb } from "../src/db/client";
import { sql } from "drizzle-orm";

async function main() {
  const from = (process.argv[2] ?? "").trim().toLowerCase();
  const to = (process.argv[3] ?? "").trim().toLowerCase();

  if (!from.includes("@") || !to.includes("@")) {
    console.error("Usage: npm run rename-address old@example.com new@example.com");
    process.exit(1);
  }
  if (from === to) {
    console.error("Those are the same address.");
    process.exit(1);
  }

  const database = requireDb();

  const count = async (text: string) => {
    const rows = (await db!.execute(sql.raw(text))) as unknown as { n: number }[];
    return Number(rows[0]?.n ?? 0);
  };

  // Refuse rather than merge. Two access rows for one person in one business
  // cannot both exist, and silently dropping one is not a decision a script
  // should make on somebody's behalf.
  const clash = await count(`
    SELECT count(*)::int AS n FROM access a
    WHERE a.email = '${from}'
      AND EXISTS (SELECT 1 FROM access b WHERE b.email = '${to}' AND b.workspace_id = a.workspace_id)`);
  if (clash > 0) {
    console.error(`${to} is already in ${clash} of the same businesses. Merge those by hand first.`);
    process.exit(1);
  }
  const accountClash = await count(
    `SELECT count(*)::int AS n FROM accounts WHERE user_email = '${to}'`,
  );
  if (accountClash > 0) {
    console.error(`${to} already has an account row. Merge that by hand first.`);
    process.exit(1);
  }

  const before = {
    access: await count(`SELECT count(*)::int AS n FROM access WHERE email = '${from}'`),
    invitedBy: await count(`SELECT count(*)::int AS n FROM access WHERE invited_by = '${from}'`),
    accounts: await count(`SELECT count(*)::int AS n FROM accounts WHERE user_email = '${from}'`),
    workspaces: await count(`SELECT count(*)::int AS n FROM workspaces WHERE created_by = '${from}'`),
    dmFrom: await count(`SELECT count(*)::int AS n FROM direct_messages WHERE from_email = '${from}'`),
    dmTo: await count(`SELECT count(*)::int AS n FROM direct_messages WHERE to_email = '${from}'`),
  };

  console.log(`moving ${from} to ${to}`);
  for (const [k, v] of Object.entries(before)) console.log(`  ${k.padEnd(12)} ${v}`);

  await database.transaction(async (tx) => {
    await tx.execute(sql.raw(`UPDATE access SET email = '${to}' WHERE email = '${from}'`));
    await tx.execute(sql.raw(`UPDATE access SET invited_by = '${to}' WHERE invited_by = '${from}'`));
    await tx.execute(sql.raw(`UPDATE accounts SET user_email = '${to}' WHERE user_email = '${from}'`));
    await tx.execute(sql.raw(`UPDATE workspaces SET created_by = '${to}' WHERE created_by = '${from}'`));
    await tx.execute(sql.raw(`UPDATE direct_messages SET from_email = '${to}' WHERE from_email = '${from}'`));
    await tx.execute(sql.raw(`UPDATE direct_messages SET to_email = '${to}' WHERE to_email = '${from}'`));

    /*
     * Rebuilt from the addresses the rows now carry, rather than by editing the
     * old key as text. Sorted and joined the same way threadKeyFor does it, so
     * the value matches what the lookup will build.
     */
    await tx.execute(sql.raw(`
      UPDATE direct_messages SET thread_key = sub.rebuilt
      FROM (
        SELECT id,
               (SELECT string_agg(e, '|' ORDER BY e)
                  FROM (VALUES (lower(from_email)), (lower(to_email))) AS v(e)) AS rebuilt
        FROM direct_messages
        WHERE thread_key LIKE '%${from}%'
      ) AS sub
      WHERE direct_messages.id = sub.id`));

    /*
     * The calendar connection is keyed on the sign-in address too, and missing
     * it leaves the row attached to somebody who no longer exists: the card
     * disappears from their settings and the connection cannot be disconnected
     * because nothing can find it. google_email is deliberately left alone,
     * because that is a record of which Google account was authorised, which a
     * rename here does not change.
     */
    await tx.execute(
      sql.raw(`UPDATE google_connections SET user_email = '${to}' WHERE user_email = '${from}'`),
    );

    // Optional columns: present only on newer deployments.
    for (const [table, column] of [
      ["addons", "created_by"],
      ["addons", "approved_by"],
      ["api_keys", "created_by"],
    ]) {
      try {
        await tx.execute(sql.raw(`UPDATE ${table} SET ${column} = '${to}' WHERE ${column} = '${from}'`));
      } catch {
        // That table or column is not on this deployment.
      }
    }
  });

  const after = {
    oldAccess: await count(`SELECT count(*)::int AS n FROM access WHERE email = '${from}'`),
    newAccess: await count(`SELECT count(*)::int AS n FROM access WHERE email = '${to}'`),
    oldAnywhereInThreads: await count(
      `SELECT count(*)::int AS n FROM direct_messages WHERE thread_key LIKE '%${from}%'`,
    ),
    orphanedCalendar: await count(
      `SELECT count(*)::int AS n FROM google_connections WHERE user_email = '${from}'`,
    ),
    danglingThreadKeys: await count(`
      SELECT count(*)::int AS n FROM direct_messages
      WHERE thread_key <> (
        SELECT string_agg(e, '|' ORDER BY e)
          FROM (VALUES (lower(from_email)), (lower(to_email))) AS v(e))`),
  };

  console.log("\nafter:");
  console.log(`  access rows still on the old address   ${after.oldAccess}`);
  console.log(`  access rows on the new address         ${after.newAccess}`);
  console.log(`  threads still naming the old address   ${after.oldAnywhereInThreads}`);
  console.log(`  message rows whose thread key is wrong ${after.danglingThreadKeys}`);
  console.log(`  calendar connections left orphaned     ${after.orphanedCalendar}`);

  const ok =
    after.oldAccess === 0 &&
    after.newAccess === before.access &&
    after.oldAnywhereInThreads === 0 &&
    after.orphanedCalendar === 0 &&
    after.danglingThreadKeys === 0;

  console.log(ok ? "\nmoved, and every thread key rebuilt" : "\nSOMETHING IS OFF, check the numbers above");
  process.exit(ok ? 0 : 1);
}

void main();
