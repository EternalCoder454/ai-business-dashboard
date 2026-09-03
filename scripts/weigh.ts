/**
 * What one workspace snapshot weighs, section by section. Reads only.
 *
 * Run with: npm run weigh
 */
import { requireDb } from "../src/db/client";
import * as t from "../src/db/schema";
import { loadWorkspace } from "../src/db/repo";
import { sql } from "drizzle-orm";

const kb = (n: number) => `${(n / 1000).toFixed(1)} kB`;

async function main() {
  const db = requireDb();
  const spaces = await db.select({ id: t.workspaces.id, name: t.workspaces.name }).from(t.workspaces);
  console.log(`${spaces.length} workspaces\n`);

  // Row counts and column weights straight from Postgres, which knows.
  const heavy = await db.execute<{ label: string; rows: string; bytes: string }>(sql`
    SELECT 'all_hands_rounds.responses' AS label, count(*)::text AS rows,
           coalesce(sum(pg_column_size(responses)),0)::text AS bytes FROM all_hands_rounds
    UNION ALL SELECT 'files.text_content', count(*)::text,
           coalesce(sum(pg_column_size(text_content)),0)::text FROM files
    UNION ALL SELECT 'files.data', count(*)::text,
           coalesce(sum(pg_column_size(data)),0)::text FROM files
    UNION ALL SELECT 'skills.content', count(*)::text,
           coalesce(sum(pg_column_size(content)),0)::text FROM skills
    UNION ALL SELECT 'wiki_pages.body+blocks', count(*)::text,
           coalesce(sum(pg_column_size(body) + pg_column_size(blocks)),0)::text FROM wiki_pages
    UNION ALL SELECT 'messages.content', count(*)::text,
           coalesce(sum(pg_column_size(content)),0)::text FROM messages
    UNION ALL SELECT 'deliverables.body', count(*)::text,
           coalesce(sum(pg_column_size(body)),0)::text FROM deliverables
    UNION ALL SELECT 'memory.detail', count(*)::text,
           coalesce(sum(pg_column_size(detail)),0)::text FROM memory
  `);
  console.log("across every workspace, what the big columns hold");
  for (const row of heavy) {
    console.log(`  ${row.label.padEnd(28)} ${String(row.rows).padStart(6)} rows  ${kb(Number(row.bytes)).padStart(12)}`);
  }

  for (const space of spaces) {
    const started = Date.now();
    const snap = await loadWorkspace(space.id, "weigh@example.invalid");
    const took = Date.now() - started;
    const whole = Buffer.byteLength(JSON.stringify(snap), "utf8");
    console.log(`\n${space.name} — ${kb(whole)} in ${took} ms`);
    const parts = Object.entries(snap)
      .map(([key, value]) => [key, Buffer.byteLength(JSON.stringify(value ?? null), "utf8")] as const)
      .sort((a, b) => b[1] - a[1]);
    for (const [key, bytes] of parts) {
      if (bytes < 200) continue;
      console.log(`  ${key.padEnd(18)} ${kb(bytes).padStart(12)}`);
    }
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
