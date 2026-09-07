/**
 * That every route checks who is asking, and that the exceptions are named.
 *
 * The other audits read behaviour. This one reads the surface: forty one route
 * files, each of which is a door, and a new one shipped without a guard looks
 * exactly like one shipped with a guard until somebody opens it. Nothing in the
 * type system, the linter or the test suite would have caught it, which is the
 * definition of a check worth writing down.
 *
 * The two public routes are named here with their reasons rather than detected,
 * so making a third route public is a thing somebody does on purpose, in this
 * file, where the next person reviewing it will see the reason next to it.
 *
 *   npm run surface-test
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures += 1;
}

/**
 * Anything that establishes who is calling.
 *
 * Deliberately a list of names rather than a regular expression over the word
 * "auth": a route that mentions authentication in a comment is not a route that
 * performs it.
 */
const GUARDS = [
  "await auth()",
  "requireSession",
  "membershipFor",
  "resolveSender",
  "authorize(",
  "isOperator",
  "requireAdmin",
  "reviewer(",
  "reader(",
  // The developer API's own key check, and the cron secret.
  "apiKeyFor",
  "CRON_SECRET",
];

/*
 * toNextJsHandler is deliberately not in that list, though the first version of
 * this file had it there. It is not a guard, it is the sign-in handler itself:
 * the one route that must answer somebody who has no session yet, because it is
 * how they get one. Counting it as a guard made the auth route both guarded and
 * listed as an exception, and the staleness check below caught that on its
 * first run, which is the check earning its place.
 */

/** Public on purpose, and why. Adding to this list is the deliberate act. */
const PUBLIC: Record<string, string> = {
  "v1/route.ts":
    "lists the API's own shapes and scopes, never any data; asking for a key " +
    "to find out how to send one is a loop",
  "v1/[...path]/route.ts":
    "answers a wrong path with JSON rather than an HTML 404; demanding a key " +
    "first would tell somebody with a typo to go and check their credentials",
  "auth/[...all]/route.ts": "better-auth's own handler, which is how anybody signs in at all",
};

function routes(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) routes(path, found);
    else if (entry === "route.ts") found.push(path);
  }
  return found;
}

const all = routes("src/app/api").map((path) => ({
  path,
  name: path.replace(/\\/g, "/").replace("src/app/api/", ""),
  source: readFileSync(path, "utf8"),
}));

console.log(`\nevery route establishes who is asking (${all.length} routes)`);
{
  const unguarded = all.filter(
    (route) => !GUARDS.some((guard) => route.source.includes(guard)),
  );
  const unexplained = unguarded.filter((route) => !(route.name in PUBLIC));

  check(
    "nothing is open by accident",
    unexplained.length === 0,
    unexplained.map((route) => route.name).join(", ") || "none",
  );

  /*
   * The other direction. A route listed as public that has since grown a guard
   * is not a problem, but the note beside it has stopped being true, and a
   * stale exception list is how the real ones stop being read.
   */
  const stale = Object.keys(PUBLIC).filter((name) =>
    all.some((route) => route.name === name && GUARDS.some((g) => route.source.includes(g))),
  );
  check("no exception is stale", stale.length === 0, stale.join(", ") || "none");

  const missing = Object.keys(PUBLIC).filter((name) => !all.some((r) => r.name === name));
  check("no exception names a route that is gone", missing.length === 0, missing.join(", "));
}

console.log("\nand the ones that are public are public for a reason");
for (const [name, why] of Object.entries(PUBLIC)) {
  console.log(`  ..   ${name}: ${why}`);
}

console.log("\nnothing hands a secret back to a caller");
{
  /*
   * Columns holding a credential. A route that selects one is not automatically
   * wrong, since /api/workspace/keys has to write them, but returning one in a
   * response is, and every one of these has been read back by mistake at least
   * once in some codebase.
   */
  const SECRETS = ["anthropicKey", "openaiKey", "googleKey", "deepseekKey", "perplexityKey"];
  const leaking = all.filter((route) =>
    SECRETS.some((column) =>
      // Selected into an object that is then returned, rather than merely named.
      new RegExp(`Response\\.json\\([^)]*${column}`).test(route.source.replace(/\s+/g, " ")),
    ),
  );
  check("no key column is returned in a response", leaking.length === 0,
    leaking.map((r) => r.name).join(", ") || "none");
}

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} FAILURES ABOVE`);
process.exit(failures === 0 ? 0 : 1);
