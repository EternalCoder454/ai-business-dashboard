/**
 * What the API refuses to accept.
 *
 * Every route used to cast its body and trust the result, so a number where a
 * string belonged reached the handler and became a 500 somewhere further in.
 * These check the refusals, which are the half nobody exercises by using the
 * product normally.
 *
 * Run with: npm run schema-test
 */
import {
  adminDeleteBody,
  apiKeysBody,
  email,
  feedbackBody,
  keysBody,
  membersBody,
  messagesBody,
  operatorBody,
  reportsBody,
  schedulesBody,
  telemetryBody,
  titleBody,
} from "../src/lib/schemas";

let failures = 0;
function accepts(label: string, schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) {
  const ok = schema.safeParse(value).success;
  console.log(`  ${ok ? "ok  " : "FAIL"} accepts ${label}`);
  if (!ok) failures += 1;
}
function refuses(label: string, schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) {
  const ok = !schema.safeParse(value).success;
  console.log(`  ${ok ? "ok  " : "FAIL"} refuses ${label}`);
  if (!ok) failures += 1;
}

console.log("addresses");
accepts("an ordinary one", email, "ada@example.com");
accepts("one with capitals and spaces", email, "  Ada@Example.com  ");
refuses("no at sign", email, "ada.example.com");
refuses("nothing after the dot", email, "ada@example.");
refuses("a space inside", email, "ada lovelace@example.com");
refuses("a number", email, 42);
refuses("null", email, null);
refuses("something enormous", email, `${"a".repeat(400)}@example.com`);

console.log("\nlowercasing happens in the schema, not the handler");
const lowered = email.safeParse("  ADA@Example.COM ");
const value = lowered.success ? lowered.data : "";
console.log(`  ${value === "ada@example.com" ? "ok  " : "FAIL"} normalised to ${JSON.stringify(value)}`);
if (value !== "ada@example.com") failures += 1;

console.log("\nchanging a colleague");
accepts("an invitation", membersBody, { action: "invite", email: "ada@example.com" });
accepts("setting permissions", membersBody, {
  action: "permissions",
  email: "ada@example.com",
  permissions: { denied: ["calendar"] },
});
refuses("an action nobody wrote", membersBody, { action: "promote", email: "ada@example.com" });
refuses("no address at all", membersBody, { action: "remove" });
refuses("permissions sent as a string", membersBody, {
  action: "permissions",
  email: "ada@example.com",
  permissions: "admin",
});
refuses("permissions sent as an array", membersBody, {
  action: "permissions",
  email: "ada@example.com",
  permissions: ["calendar"],
});

console.log("\nthe operator screen");
accepts("creating a business", operatorBody, { action: "createWorkspace", name: "Acme" });
refuses("an unknown action", operatorBody, { action: "dropEverything" });
refuses("a missing action", operatorBody, { name: "Acme" });

console.log("\nreports");
accepts("running a pass", reportsBody, { action: "run" });
accepts("scoped to one business", reportsBody, { action: "run", scope: "workspace" });
refuses("a status nobody defined", reportsBody, { action: "status", id: "r1", status: "burned" });
refuses("a scope nobody defined", reportsBody, { action: "run", scope: "everything" });

console.log("\nkeys");
accepts("setting one", keysBody, { provider: "anthropic", key: "sk-test" });
accepts("clearing one", keysBody, { provider: "openai", key: "" });
refuses("a provider we do not have", keysBody, { provider: "cohere", key: "x" });
refuses("a key longer than any key", keysBody, { provider: "anthropic", key: "x".repeat(501) });

console.log("\nschedules");
accepts("saving one", schedulesBody, {
  action: "save",
  cadence: "weekly",
  weekday: 3,
  prompt: "How did the week go",
});
refuses("a weekday that does not exist", schedulesBody, { action: "save", weekday: 9 });
refuses("a fractional weekday", schedulesBody, { action: "save", weekday: 2.5 });
refuses("a day of month past the end", schedulesBody, { action: "save", dayOfMonth: 40 });

console.log("\nbounds, which is what stops a body becoming a column");
refuses("feedback past the cap", feedbackBody, { body: "x".repeat(4_001) });
accepts("feedback at the cap", feedbackBody, { body: "x".repeat(4_000) });
refuses("a title question past the cap", titleBody, { question: "x".repeat(20_001) });
refuses("a message past the cap", messagesBody, { to: "a@b.co", body: "x".repeat(4_001) });
refuses("too many scopes on a key", apiKeysBody, {
  action: "create",
  scopes: Array.from({ length: 21 }, () => "read"),
});

console.log("\ntelemetry from a browser, which is the least trusted input there is");
accepts("a plain measurement", telemetryBody, { operation: "chat.stream", ms: 120, ok: true });
refuses("a duration that is not finite", telemetryBody, { operation: "x", ms: Infinity });
refuses("a negative duration", telemetryBody, { operation: "x", ms: -1 });
refuses("a duration beyond any request", telemetryBody, { operation: "x", ms: 999_999 });
refuses("an error note long enough to be a payload", telemetryBody, {
  operation: "x",
  errorNote: "x".repeat(301),
});

console.log("\ndeleting a business asks twice");
accepts("both fields", adminDeleteBody, { person: "ada@example.com", confirm: "ada@example.com" });
refuses("a person sent as an object", adminDeleteBody, { person: { drop: true } });

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
