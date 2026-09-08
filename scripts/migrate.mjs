/**
 * Brings the schema up to whatever the code beside it expects.
 *
 * Plain JavaScript and no tsx, because this is the one script that runs inside
 * the runtime image rather than from a checkout. The image carries the app, the
 * SQL files, and this: a deploy that ships code expecting a column has to be
 * able to add the column, and reaching for a second toolchain to do it is how
 * that ends up being done by hand at the wrong moment.
 *
 * Applied files are recorded, so running it twice is nothing. Each file is one
 * transaction, so a file either lands or does not: a half applied schema change
 * is the worst of the three outcomes.
 *
 *   node scripts/migrate.mjs
 *
 * `npm run db:apply` still exists and still applies one named file against
 * whatever DATABASE_URL points at. That is for writing a migration. This is for
 * deploying one.
 */
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.error("No DATABASE_URL_UNPOOLED or DATABASE_URL.");
  process.exit(1);
}

const dir = fileURLToPath(new URL("../drizzle/", import.meta.url));

async function main() {
  const files = (await readdir(dir)).filter((name) => name.endsWith(".sql")).sort();
  if (files.length === 0) {
    console.error(`No .sql files in ${dir}`);
    process.exit(1);
  }

  // One connection, no pooling, and never through a pooler: a transaction
  // pooler refuses some DDL outright, and altering a primary key is exactly the
  // kind it refuses.
  const sql = postgres(url, { max: 1, idle_timeout: 10, onnotice: () => {} });

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS "panel_migrations" (
        "file" text PRIMARY KEY,
        "applied_at" timestamptz NOT NULL DEFAULT now()
      )
    `;

    const done = new Set(
      (await sql`SELECT file FROM "panel_migrations"`).map((row) => row.file),
    );

    let applied = 0;
    for (const file of files) {
      if (done.has(file)) continue;

      const text = await readFile(dir + file, "utf8");
      const started = Date.now();
      try {
        await sql.begin(async (tx) => {
          await tx.unsafe(text);
          await tx`INSERT INTO "panel_migrations" (file) VALUES (${file})`;
        });
        console.log(`  applied ${file} (${Date.now() - started}ms)`);
        applied += 1;
      } catch (error) {
        console.error(`  FAILED  ${file}`);
        console.error(`  ${error.message}`);
        process.exitCode = 1;
        return;
      }
    }

    console.log(
      applied === 0
        ? `  nothing to do, ${files.length} already applied`
        : `  ${applied} applied, ${files.length} in total`,
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
