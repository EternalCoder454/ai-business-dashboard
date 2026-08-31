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
import { safeDestination } from "../src/app/signin/page";
import { applyOp, emptyWorkspace } from "../src/lib/workspace";

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

  console.log("\nonly same-site paths survive the sign-in redirect");
  check("a normal path passes through", safeDestination("/projects") === "/projects");
  check("a path with a query survives", safeDestination("/dept/x?c=1") === "/dept/x?c=1");
  check("absolute url is dropped", safeDestination("https://example.com") === "/");
  check("protocol-relative is dropped", safeDestination("//example.com") === "/");
  check("backslash form is dropped", safeDestination("/\\example.com") === "/");
  check("javascript scheme is dropped", safeDestination("javascript:alert(1)") === "/");
  check("missing value becomes root", safeDestination(undefined) === "/");


/**
 * The shape of the bug that made a first message vanish.
 *
 * send() created a conversation and immediately saved a message into it. Both
 * calls came from the same render, so the second one looked the conversation up
 * in a list captured before the first had happened, missed, and returned
 * without writing. Applying the two operations in sequence is exactly what the
 * store now does through its ref, and this proves the second one can see the
 * first.
 */
console.log("\na write immediately after a create can see it");
{
  const blank = emptyWorkspace(
    { model: "claude-sonnet-5", effort: "medium", theme: "dark", companyName: "T", companySubtitle: "", writingRules: "", roomBrevity: "tight" },
    { mission: "", audience: "", brandVoice: "", keyFacts: "" },
    { displayName: "", roleTitle: "", pronouns: "", timezone: "", updatedAt: 0 },
  );

  const created = {
    id: "conv_new",
    departmentId: "ceo",
    title: "New conversation",
    messages: [],
    createdAt: 1,
    updatedAt: 1,
  };

  const afterCreate = applyOp(blank, {
    table: "conversations",
    action: "upsert",
    rows: [created],
  });
  check("the create landed", afterCreate.conversations.length === 1);

  // The lookup the store performs before saving a message. Against the stale
  // snapshot it finds nothing, which is precisely how the message was lost.
  check("a stale snapshot cannot find it", !blank.conversations.some((c) => c.id === "conv_new"));

  const found = afterCreate.conversations.find((c) => c.id === "conv_new");
  check("the fresh one can", Boolean(found));

  const afterSave = applyOp(afterCreate, {
    table: "conversations",
    action: "upsert",
    rows: [{ ...found!, messages: [{ id: "m1", role: "user", content: "hello", timestamp: 2 }], updatedAt: 2 }],
  });
  check("the message survived", afterSave.conversations[0]?.messages.length === 1);
  check("and the title was not lost", afterSave.conversations[0]?.title === "New conversation");
}

  console.log(failures ? "\nFAILURES ABOVE" : "\nall checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error("guard test threw:", error);
  process.exit(1);
});
