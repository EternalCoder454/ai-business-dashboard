/**
 * Runs a migration file against the database.
 *
 * `drizzle-kit migrate` cannot do this. Its journal lists one entry, 0000_init,
 * because drizzle-kit generate wants a TTY this project does not have, so every
 * migration since has been written by hand and applied by hand. Rather than
 * pretend otherwise, this applies the file it is given and says what happened.
 *
 * Goes direct rather than through the pooler. A transaction pooler refuses some
 * DDL outright, and altering a primary key is exactly the kind it refuses.
 *
 * Every statement runs in one transaction, so a file either applies or does
 * not: a half applied schema change is the worst of the three outcomes.
 *
 *   npm run db:apply drizzle/0008_file_blobs.sql
 *   npm run db:apply drizzle/0008_file_blobs.sql drizzle/0009_multi_workspace.sql
 */
import { readFileSync } from "node:fs";
import postgres from "postgres";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("Give it one or more .sql files.");
  process.exit(1);
}

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.error("No DATABASE_URL_UNPOOLED or DATABASE_URL.");
  process.exit(1);
}

async function main() {
  const sql = postgres(url!, { max: 1, idle_timeout: 5 });
  console.log(`  ${new URL(url!).host}\n`);

  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const started = Date.now();
    try {
      // begin() rolls the lot back if any statement in the file throws.
      await sql.begin(async (tx) => {
        await tx.unsafe(text);
      });
      console.log(`  ok   ${file}  (${Date.now() - started} ms)`);
    } catch (error) {
      console.error(`  FAIL ${file}`);
      console.error(`       ${(error as Error).message}`);
      await sql.end();
      process.exit(1);
    }
  }

  await sql.end();
  console.log("\napplied");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
