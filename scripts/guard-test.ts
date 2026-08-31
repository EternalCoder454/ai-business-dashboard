/**
 * Checks the request guards without needing a signed-in browser.
 *
 * readJsonWithin sits in front of every chat and workspace request now, so a
 * mistake in its byte accounting would break the app for the one person allowed
 * to use it. These run against real Request objects rather than mocks.
 *
 * Run with: npm run guard-test
 */
import { readJsonWithin, withinRate } from "../src/lib/guard";

let failures = 0;

function check(label: string, condition: boolean, detail = "") {
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!condition) failures += 1;
}

function post(body: string, headers: Record<string, string> = {}) {
  return new Request("https://example.invalid/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

async function main() {
  console.log("reading a body within the limit");
  const small = await readJsonWithin<{ hello: string }>(post(JSON.stringify({ hello: "world" })), 1000);
  check("accepted", small.ok);
  check("parsed correctly", small.ok && small.body.hello === "world");

  console.log("\nunicode is measured in bytes, not characters");
  // Four characters, twelve bytes. A length check on the string would pass.
  const emoji = JSON.stringify({ t: "🙂🙂" });
  const tight = await readJsonWithin(post(emoji), 12);
  check("rejected on byte length", !tight.ok);
  const roomy = await readJsonWithin(post(emoji), 200);
  check("accepted with room", roomy.ok);

  console.log("\na body past the limit is refused");
  const big = JSON.stringify({ data: "x".repeat(5000) });
  const rejected = await readJsonWithin(post(big), 1000);
  check("rejected", !rejected.ok);
  check("status is 413", !rejected.ok && rejected.status === 413);

  console.log("\na lying content-length does not get through");
  // The header claims it is tiny; only measuring the stream catches it.
  const liar = await readJsonWithin(post(big, { "content-length": "10" }), 1000);
  check("still rejected", !liar.ok, liar.ok ? "let through" : "");

  console.log("\nmalformed json is a 400, not a crash");
  const broken = await readJsonWithin(post("{not json"), 1000);
  check("rejected", !broken.ok);
  check("status is 400", !broken.ok && broken.status === 400);

  console.log("\nrate limiting counts per key and expires");
  const key = `test:${Math.random()}`;
  let allowed = 0;
  for (let i = 0; i < 5; i += 1) if (withinRate(key, 3, 60_000)) allowed += 1;
  check("stopped at the limit", allowed === 3, String(allowed));
  check("a different key is unaffected", withinRate(`${key}:other`, 3, 60_000));
  // A window that has already closed lets the next call through.
  check("expired window reopens", withinRate(key, 3, -1));

  console.log(failures ? "\nFAILURES ABOVE" : "\nall checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error("guard test threw:", error);
  process.exit(1);
});
