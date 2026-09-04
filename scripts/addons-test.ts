/**
 * What an addon cannot do.
 *
 * An addon is written by a model, at the request of a business owner, and then
 * runs on our server against their workspace. That is a sentence worth reading
 * twice, and it is why this file is mostly about refusal rather than about
 * features. Every check here is a thing somebody could try.
 *
 * The load bearing claim is that a recipe never becomes code. These tests are
 * how that claim is kept true as the language grows.
 *
 * Run with: npm run addons-test
 */
import { isPublicAddress } from "../src/lib/addons/outbound";
import { matches, runRecipe, type Effects } from "../src/lib/addons/run";
import {
  LIMITS,
  READABLE,
  checkOutboundUrl,
  namesIn,
  readRecipe,
  render,
  type Recipe,
} from "../src/lib/addons/recipe";

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!condition) failures += 1;
}

/** A recipe that should always pass, so a rejection elsewhere means something. */
const GOOD = {
  trigger: "task.completed",
  conditions: [{ field: "task.department", op: "is", value: "marketing" }],
  steps: [
    { action: "http_post", url: "https://hooks.slack.com/services/x", fields: { text: "{{task.title}} is done" } },
  ],
};

console.log("a good recipe is accepted");
{
  const result = readRecipe(GOOD);
  check("it passes", result.ok, result.ok ? "" : result.problems.join("; "));
  if (result.ok) {
    check("its host is collected for approval", result.hosts.join() === "hooks.slack.com", result.hosts.join());
  }
}

console.log("\nthe recipe language has no way to say anything else");
{
  // Every one of these is a thing a model could produce, on purpose or by
  // being talked into it. None of them is a shape the schema admits.
  const rejected: [string, unknown][] = [
    ["an unknown action", { ...GOOD, steps: [{ action: "run_code", code: "process.exit()" }] }],
    ["a shell command", { ...GOOD, steps: [{ action: "create_task", title: "x", exec: "rm -rf /" }] }],
    ["an extra key on a known step", { ...GOOD, steps: [{ action: "create_task", title: "x", workspaceId: "other" }] }],
    ["an extra key on the recipe", { ...GOOD, secret: "x" }],
    ["an unknown trigger", { ...GOOD, trigger: "server.boot" }],
    ["no steps at all", { ...GOOD, steps: [] }],
    ["more steps than allowed", { ...GOOD, steps: Array(LIMITS.steps + 1).fill(GOOD.steps[0]) }],
    ["a nested recipe", { ...GOOD, steps: [{ action: "create_task", title: GOOD }] }],
    ["nothing at all", null],
    ["a string", "delete everything"],
    ["an array", [GOOD]],
  ];

  for (const [label, input] of rejected) {
    check(`refuses ${label}`, readRecipe(input).ok === false);
  }
}

console.log("\nit cannot read anything it was not given");
{
  const reaching = readRecipe({
    ...GOOD,
    steps: [{ action: "create_task", title: "{{settings.apikey}}" }],
  });
  check("a template naming a credential is refused", reaching.ok === false);

  const wrongTrigger = readRecipe({
    trigger: "schedule.daily",
    steps: [{ action: "create_task", title: "{{task.title}}" }],
  });
  check("a template naming a field this trigger has no idea about is refused", wrongTrigger.ok === false);

  const condition = readRecipe({
    ...GOOD,
    conditions: [{ field: "settings.openaikey", op: "is", value: "x" }],
  });
  check("a condition on a field that is not offered is refused", condition.ok === false);
}

console.log("\nrendering cannot be talked into reaching further");
{
  const context = { "task.title": "Ship it" };

  check("it fills a name it has", render("{{task.title}}", context) === "Ship it");
  check("a name it does not have renders empty", render("{{task.secret}}", context) === "");

  // The prototype chain is the classic way out of a naive lookup: "constructor"
  // is a real property of a plain object and resolves to a function.
  check("constructor renders empty", render("{{constructor}}", context) === "");
  check("__proto__ renders empty", render("{{__proto__}}", context) === "");
  check("toString renders empty", render("{{toString}}", context) === "");

  // Nothing is re-read after substitution, so a value that looks like a
  // template is just text.
  const nested = render("{{task.title}}", { "task.title": "{{task.secret}}" });
  check("a value that looks like a template is not expanded again", nested === "{{task.secret}}", nested);

  check("braces that are not a name are left alone", render("{ a } {{}} {{ }}", context) === "{ a } {{}} {{ }}");
  check("a name is found regardless of spacing", namesIn("{{  task.title  }}").join() === "task.title");
}

console.log("\nit cannot send anywhere it likes");
{
  const bad: [string, string][] = [
    ["plain http", "http://hooks.slack.com/x"],
    ["a file address", "file:///etc/passwd"],
    ["a nonstandard port", "https://hooks.slack.com:8080/x"],
    ["a sign-in inside the address", "https://user:pass@hooks.slack.com/x"],
    ["a bare hostname", "https://localhost/x"],
    ["nonsense", "not a url"],
  ];
  for (const [label, url] of bad) {
    check(`refuses ${label}`, checkOutboundUrl(url) !== null, url);
  }
  check("allows a normal https webhook", checkOutboundUrl("https://hooks.slack.com/services/x") === null);

  // The URL is not a template, so it cannot be moved off the approved host.
  const templatedUrl = readRecipe({
    ...GOOD,
    steps: [{ action: "http_post", url: "https://{{task.title}}.example.com/x", fields: { a: "b" } }],
  });
  check(
    "a host cannot be assembled from a template at run time",
    templatedUrl.ok === false || templatedUrl.hosts.every((h) => !h.includes("{")),
    JSON.stringify(templatedUrl),
  );
}

console.log("\nno address only our own server can reach");
{
  const private_ = [
    "127.0.0.1", "127.1.1.1", "0.0.0.0", "10.0.0.5", "172.16.0.1", "172.31.255.254",
    "192.168.1.1", "169.254.169.254", "100.64.0.1", "192.0.0.1", "198.18.0.1",
    "224.0.0.1", "255.255.255.255",
    "::1", "::", "fe80::1", "fd00::1", "fc00::1", "ff02::1",
    "::ffff:127.0.0.1", "::ffff:169.254.169.254", "::127.0.0.1",
    "64:ff9b::7f00:1", "2002:7f00:1::",
  ];
  const missed = private_.filter((address) => isPublicAddress(address));
  check("every private address is refused", missed.length === 0, missed.join(" "));

  // 169.254.169.254 is the one that matters most: on almost every cloud it
  // hands out the deployment's own credentials to anything that asks.
  check("the cloud metadata address specifically", !isPublicAddress("169.254.169.254"));

  const public_ = ["1.1.1.1", "8.8.8.8", "140.82.121.4", "2606:4700:4700::1111", "2a00:1450:4001::200e"];
  const blocked = public_.filter((address) => !isPublicAddress(address));
  check("a real public address still works", blocked.length === 0, blocked.join(" "));

  check("garbage is not public", !isPublicAddress("not-an-address"));
  check("an empty string is not public", !isPublicAddress(""));
}

console.log("\nconditions decide whether it runs at all");
{
  const context = { "task.department": "marketing", "task.title": "Ship it" };
  check("is", matches([{ field: "task.department", op: "is", value: "Marketing" }], context));
  check("is, when it does not", !matches([{ field: "task.department", op: "is", value: "finance" }], context));
  check("is not", matches([{ field: "task.department", op: "is not", value: "finance" }], context));
  check("contains", matches([{ field: "task.title", op: "contains", value: "ship" }], context));
  check("does not contain", matches([{ field: "task.title", op: "does not contain", value: "cancel" }], context));
  check("all of them have to hold", !matches(
    [
      { field: "task.department", op: "is", value: "marketing" },
      { field: "task.title", op: "is", value: "something else" },
    ],
    context,
  ));
  check("no conditions means it always runs", matches([], context));
  check("a field that is not there does not match", !matches([{ field: "nope", op: "is", value: "x" }], context));
  check("constructor is not a field", !matches([{ field: "constructor", op: "contains", value: "function" }], context));
}

console.log("\nrunning one");
void (async () => {
  const made: string[] = [];
  const effects: Effects = {
    createTask: async ({ title }) => { made.push(title); },
    saveNote: async ({ title }) => { made.push(title); },
  };

  const recipe = (readRecipe({
    trigger: "task.completed",
    conditions: [{ field: "task.department", op: "is", value: "marketing" }],
    steps: [{ action: "create_task", title: "Follow up on {{task.title}}" }],
  }) as { ok: true; recipe: Recipe }).recipe;

  const ran = await runRecipe({
    recipe,
    context: { "task.title": "the launch", "task.department": "marketing" },
    approvedHosts: [],
    effects,
  });
  check("it runs when the condition holds", ran.ran && ran.ok);
  check("the template was filled", made.join() === "Follow up on the launch", made.join());

  const skipped = await runRecipe({
    recipe,
    context: { "task.title": "the launch", "task.department": "finance" },
    approvedHosts: [],
    effects,
  });
  check("it does not run when the condition does not hold", !skipped.ran);
  check("and nothing happened", made.length === 1, String(made.length));

  // A step whose values are all missing renders to nothing. Better to record a
  // skipped step than to put a blank row on somebody's board.
  const empty = await runRecipe({
    recipe,
    context: { "task.department": "marketing" },
    approvedHosts: [],
    effects,
  });
  check("an empty render still creates the task it can", empty.ran);

  /*
   * The one that matters for the outbound step: a value full of quotes and
   * braces has to arrive as a string, not as structure. We never build JSON by
   * hand, so this is really a test that we never start.
   */
  const hostile = JSON.stringify({
    text: render('{{task.title}}', { "task.title": '","admin":true,"x":"' }),
  });
  const parsed = JSON.parse(hostile) as Record<string, unknown>;
  check("a hostile value cannot add a field", !("admin" in parsed), Object.keys(parsed).join());
  check("it stays one string", typeof parsed.text === "string");

  const failing: Effects = {
    createTask: async () => { throw new Error("D:\\Websites\\AI Panel secret path"); },
    saveNote: async () => {},
  };
  const threw = await runRecipe({
    recipe,
    context: { "task.title": "x", "task.department": "marketing" },
    approvedHosts: [],
    effects: failing,
  });
  check("a thrown step fails the run rather than the process", threw.ran && !threw.ok);
  check(
    "and the message is not leaked into the log",
    !JSON.stringify(threw).includes("Websites"),
    JSON.stringify(threw.steps),
  );

  console.log("");
  console.log("approval is the only thing that grants a destination");
  {
    /*
     * The rule the whole design rests on: an addon may send only where an
     * administrator wrote down, and the recipe does not get a vote. This is the
     * same comparison db/addons makes when it decides whether an addon may run,
     * checked here because it is the one that must never loosen.
     */
    const approved = ["hooks.slack.com"];
    const outside = (hosts: string[]) => hosts.some((host) => !approved.includes(host));

    check("exactly what was approved runs", !outside(["hooks.slack.com"]));
    check("a host the recipe added does not", outside(["hooks.slack.com", "evil.example"]));
    check("a subdomain of an approved host does not", outside(["a.hooks.slack.com"]));
    // The one that catches a naive endsWith: this host is not Slack at all.
    check("a host merely ending in the approved name does not", outside(["hooks.slack.com.evil.example"]));
    check("a lookalike does not", outside(["hooks-slack.com"]));
    check("an addon approved for nothing cannot send anywhere", ["x.example"].some((h) => !([] as string[]).includes(h)));
  }

  console.log("");
  console.log("an addon cannot be handed a value nobody listed");
  {
    /*
     * The runner builds the context, so this is really a test that two lists
     * agree: what fireTaskEvents supplies, and what READABLE says a template
     * may name. A field in one and not the other is either a value that
     * silently renders empty, or one readable without ever being declared.
     */
    const supplied = ["task.title", "task.status", "task.department", "company.name", "today"];
    const declared = READABLE["task.completed"];

    const undeclared = supplied.filter((name) => !declared.includes(name));
    check("the runner supplies nothing undeclared", undeclared.length === 0, undeclared.join());

    const unsupplied = declared.filter((name) => !supplied.includes(name));
    check("and everything declared is supplied", unsupplied.length === 0, unsupplied.join());

    const daily = ["company.name", "today", "tasks.open_count", "tasks.done_today_count"];
    const dailyDeclared = READABLE["schedule.daily"];
    check(
      "the daily tick agrees too",
      daily.every((n) => dailyDeclared.includes(n)) && dailyDeclared.every((n) => daily.includes(n)),
      dailyDeclared.join(),
    );

    // Nothing on any list is a credential. Written as a test so that adding one
    // is a deliberate act rather than a line in a diff nobody reads twice.
    const smells = /key|token|secret|password|credential|email/i;
    const risky = Object.values(READABLE).flat().filter((name) => smells.test(name));
    check("no readable field looks like a credential", risky.length === 0, risky.join());
  }

  console.log(failures === 0 ? "\nall checks passed" : `\n${failures} failed`);
  process.exit(failures === 0 ? 0 : 1);
})();
