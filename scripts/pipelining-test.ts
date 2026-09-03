/**
 * Guards the single most expensive fact about this database client.
 *
 * postgres.js will not put a second query on the wire while an earlier one is
 * still being described, and it describes any parameterised statement it has
 * not prepared before. Drizzle reaches the driver through `client.unsafe`,
 * which hardcodes `prepare: false`, so without the proxy in db/client.ts
 * nothing is ever cached, every query pays a describe, and `Promise.all` over
 * Drizzle queries runs one at a time while looking concurrent.
 *
 * It is invisible from the outside: nothing errors, nothing warns, the code
 * reads as parallel, and the page is simply slow forever. So it gets a test.
 *
 * Run with: npm run pipelining-test
 */
import { requireDb } from "../src/db/client";
import * as t from "../src/db/schema";
import { eq } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

const TABLES = [
  t.departments, t.projects, t.conversations, t.skills, t.memory, t.tasks,
  t.wikiPages, t.files, t.allHandsRuns, t.allHandsRounds, t.settings, t.deliverables,
];

async function main() {
  const db = requireDb();
  const [space] = await db.select({ id: t.workspaces.id }).from(t.workspaces).limit(1);
  if (!space) {
    console.log("no workspaces to measure against, skipping");
    process.exit(0);
  }

  const all = () =>
    Promise.all(
      // Every one of these carries workspaceId, but the union of a dozen
      // table types does not narrow to a single select signature.
      TABLES.map((table) => {
        const { workspaceId } = table as unknown as { workspaceId: PgColumn };
        return db.select().from(table).where(eq(workspaceId, space.id));
      }),
    );

  const one = async () => {
    const started = Date.now();
    await db.select().from(t.workspaces).limit(1);
    return Date.now() - started;
  };

  // Warm: the first request over a socket still describes each new statement.
  await all();
  await all();

  const single = Math.min(await one(), await one(), await one());
  const started = Date.now();
  await all();
  const together = Date.now() - started;

  console.log(`  one query on its own          ${String(single).padStart(6)} ms`);
  console.log(`  ${TABLES.length} queries in a Promise.all    ${String(together).padStart(6)} ms`);

  // Pipelined, the batch costs about one round trip. Serialised it costs
  // twelve. Four is comfortably between the two and not near either.
  const ceiling = Math.max(single * 4, 60);
  const ok = together < ceiling;
  console.log(
    `\n  ${ok ? "ok  " : "FAIL"} ${TABLES.length} queries cost ${(together / Math.max(single, 1)).toFixed(1)}x one query` +
      `${ok ? "" : `, expected under 4x. The prepare proxy in db/client.ts is not working`}`,
  );
  console.log(ok ? "\nall checks passed" : "\n1 failed");
  process.exit(ok ? 0 : 1);
}

main().catch((error) => { console.error(error); process.exit(1); });
