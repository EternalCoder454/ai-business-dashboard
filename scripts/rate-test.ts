/**
 * Whether a limit means the number it says.
 *
 * This is the whole reason the limiter moved into Postgres, so it is the thing
 * to prove rather than assume. The old one was a Map in the process: every
 * check below except the first would have passed against it while the product
 * was running twelve instances and honouring twelve times every limit.
 *
 * Runs against the real database, because the bug was never in the arithmetic.
 *
 * Run with: npm run rate-test
 */
import { rateLimit, rateLimitPrune, withinRate } from "../src/lib/rateLimit";
import { db } from "../src/db/client";
import { sql } from "drizzle-orm";

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!condition) failures += 1;
}

const key = () => `test:${Date.now()}:${Math.random().toString(36).slice(2)}`;

async function main() {
  if (!db) throw new Error("This needs DATABASE_URL, since counting is the point.");

  console.log("counting up to a limit");
  const k = key();
  let allowed = 0;
  for (let i = 0; i < 5; i += 1) if (await withinRate(k, 3, 60_000)) allowed += 1;
  check("stops at the limit", allowed === 3, `${allowed} allowed`);
  check("a different key is unaffected", await withinRate(`${k}:other`, 3, 60_000));

  console.log("\nwhat it reports");
  const fresh = await rateLimit(key(), 10, 60_000);
  check("the first call is allowed", fresh.allowed);
  check("nine are left after it", fresh.remaining === 9, String(fresh.remaining));
  check("it says when the window frees up", fresh.resetAt > Math.floor(Date.now() / 1000));
  check("and asks for no wait", fresh.retryAfter === 0);

  const spent = key();
  for (let i = 0; i < 3; i += 1) await rateLimit(spent, 3, 60_000);
  const refused = await rateLimit(spent, 3, 60_000);
  check("a refusal says so", !refused.allowed);
  check("with nothing left", refused.remaining === 0);
  check("and a whole number of seconds to wait", refused.retryAfter >= 1);

  console.log("\nall at once, which is the case that used to leak");
  /*
   * Ten calls in flight together against a limit of three. Each is a separate
   * round trip, so this is the same shape as ten instances answering ten
   * requests, and the answer has to be three whichever order they land in.
   */
  const together = key();
  const results = await Promise.all(
    Array.from({ length: 10 }, () => withinRate(together, 3, 60_000)),
  );
  const passed = results.filter(Boolean).length;
  check("exactly three got through", passed === 3, `${passed} of 10`);

  console.log("\nthe count is shared, not per caller");
  // Two independent calls, as two instances would make them, against one key.
  const shared = key();
  await rateLimit(shared, 2, 60_000);
  const second = await rateLimit(shared, 2, 60_000);
  const third = await rateLimit(shared, 2, 60_000);
  check("the second call sees the first", second.remaining === 0, String(second.remaining));
  check("the third is refused", !third.allowed);

  console.log("\nwindows move on");
  /*
   * Two windows of waiting, not one.
   *
   * The window before the current one is still weighted in, and a refused
   * attempt counts like any other, so one quiet window does not clear a key
   * that was hammered. Two does, because the window holding those hits is no
   * longer next to the current one. Waited out rather than faked, since the
   * boundary arithmetic is the part worth checking.
   */
  const rolling = key();
  const WINDOW = 600;
  await rateLimit(rolling, 1, WINDOW);
  check("spent within the window", !(await withinRate(rolling, 1, WINDOW)));
  await new Promise((resolve) => setTimeout(resolve, WINDOW * 2 + 150));
  check("open again two windows later", await withinRate(rolling, 1, WINDOW));

  console.log("\nolder windows are cleared");
  const old = key();
  await rateLimit(old, 5, 60_000);
  const [{ count: before }] = await db.execute<{ count: number }>(
    sql`SELECT COUNT(*)::int AS count FROM rate_limits WHERE bucket = ${old}`,
  );
  check("the row is there", Number(before) === 1);
  await rateLimitPrune(0);
  const [{ count: after }] = await db.execute<{ count: number }>(
    sql`SELECT COUNT(*)::int AS count FROM rate_limits WHERE bucket = ${old}`,
  );
  check("and pruning removes it", Number(after) === 0);

  // Everything above wrote rows with a test bucket. None of them are read
  // again and pruning only runs nightly, so they go now.
  await db.execute(sql`DELETE FROM rate_limits WHERE bucket LIKE 'test:%'`);

  console.log(failures === 0 ? "\nall checks passed" : `\n${failures} failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
