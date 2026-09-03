/**
 * Proves the upsert actually merges rather than overwrites.
 *
 * Two instances that never speak to each other both flush the same hour for
 * the same business. If the second one overwrites the first, every number here
 * is wrong in a way nothing would ever surface: the counts would simply be too
 * low, forever, and look plausible.
 *
 * Run against a temporary table that exists only for the length of this
 * connection, so it proves the statement without touching the real schema.
 *
 * Run with: npm run telemetry-merge-check
 */
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!condition) failures += 1;
}

/** The same statement db/telemetry.ts sends, against the temporary table. */
const UPSERT = `
  insert into t_check (id, workspace_id, operation, source, bucket, calls, errors,
                       total_ms, max_ms, slow, last_error_kind, last_error_note, last_error_at)
  values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
  on conflict (id) do update set
    calls = t_check.calls + excluded.calls,
    errors = t_check.errors + excluded.errors,
    total_ms = t_check.total_ms + excluded.total_ms,
    max_ms = greatest(t_check.max_ms, excluded.max_ms),
    slow = t_check.slow + excluded.slow,
    last_error_kind = coalesce(excluded.last_error_kind, t_check.last_error_kind),
    last_error_note = case when excluded.last_error_at is null
                           then t_check.last_error_note else excluded.last_error_note end,
    last_error_at = nullif(greatest(coalesce(excluded.last_error_at, 0),
                                    coalesce(t_check.last_error_at, 0)), 0)
`;

async function main() {
  const sql = postgres(url!, { max: 1, idle_timeout: 20 });

  /*
   * Dropped first. A transaction pooler hands out server connections that
   * outlive the client, so a temporary table from an earlier run of this check
   * is still on the connection the second run is given and the create fails.
   */
  await sql.unsafe(`drop table if exists t_check`);
  await sql.unsafe(`
    create temporary table t_check (
      id text primary key, workspace_id text not null, operation text not null,
      source text not null default 'server', bucket bigint not null,
      calls integer not null default 0, errors integer not null default 0,
      total_ms bigint not null default 0, max_ms integer not null default 0,
      slow integer not null default 0, last_error_kind text,
      last_error_note text not null default '', last_error_at bigint
    )
  `);

  const ID = "ws:workspace.load:server:100";
  const row = (
    calls: number, errors: number, totalMs: number, maxMs: number, slow: number,
    kind: string | null, note: string, at: number | null,
  ) => [ID, "ws", "workspace.load", "server", 100, calls, errors, totalMs, maxMs, slow, kind, note, at];

  // Instance A: 10 clean calls, slowest 120ms.
  await sql.unsafe(UPSERT, row(10, 0, 900, 120, 0, null, "", null));
  // Instance B, same hour: 5 calls, one of them a failure, slowest 2200ms.
  await sql.unsafe(UPSERT, row(5, 1, 3400, 2200, 1, "ECONNRESET", "connection lost", 1_700));

  const [merged] = await sql.unsafe(`select * from t_check where id = $1`, [ID]);

  check("one row, not two", Number((await sql.unsafe(`select count(*)::int n from t_check`))[0].n) === 1);
  check("calls add up", Number(merged.calls) === 15, `got ${merged.calls}, wanted 15`);
  check("errors add up", Number(merged.errors) === 1, `got ${merged.errors}`);
  check("time adds up", Number(merged.total_ms) === 4300, `got ${merged.total_ms}`);
  check("slowest is the larger, not the later", Number(merged.max_ms) === 2200, `got ${merged.max_ms}`);
  check("slow count adds up", Number(merged.slow) === 1, `got ${merged.slow}`);
  check("the error is kept", merged.last_error_kind === "ECONNRESET");
  check("the note is kept", merged.last_error_note === "connection lost");

  // Instance A again, still clean. The clean flush must not erase the failure
  // that another instance recorded, and must not lower the slowest.
  await sql.unsafe(UPSERT, row(7, 0, 500, 90, 0, null, "", null));
  const [after] = await sql.unsafe(`select * from t_check where id = $1`, [ID]);

  check("a later clean flush still adds", Number(after.calls) === 22, `got ${after.calls}`);
  check("it does not erase the error kind", after.last_error_kind === "ECONNRESET");
  check("it does not erase the note", after.last_error_note === "connection lost");
  check("it does not lower the slowest", Number(after.max_ms) === 2200, `got ${after.max_ms}`);
  check("it does not clear the error time", Number(after.last_error_at) === 1_700);

  // A different hour is a different row, which is what keeps this bounded.
  await sql.unsafe(UPSERT, [
    "ws:workspace.load:server:200", "ws", "workspace.load", "server", 200, 1, 0, 10, 10, 0, null, "", null,
  ]);
  const [{ n }] = await sql.unsafe(`select count(*)::int n from t_check`);
  check("a new hour is a new row", Number(n) === 2, `got ${n}`);

  // Not left behind on a connection somebody else will be handed.
  await sql.unsafe(`drop table if exists t_check`);
  await sql.end();
  console.log(failures === 0 ? "\nall checks passed" : `\n${failures} failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => { console.error(error); process.exit(1); });
