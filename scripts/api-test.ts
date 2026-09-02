/**
 * The developer API, end to end, against the running dev server.
 *
 * Mints a real key, drives every endpoint over HTTP the way an addon would,
 * and then revokes it. What matters here is not that the happy path works but
 * that the failures are the documented ones: a wrong key is 401 and not a
 * redirect to the sign-in page, a missing scope is 403 and says which scope
 * was needed, and a task belonging to another business is 404 rather than
 * somebody else's row.
 *
 * Run with: npm run api-test   (needs `npm run dev` on :3000)
 */
import { eq } from "drizzle-orm";
import { createKey, revokeKey } from "../src/db/apiKeys";
import { requireDb } from "../src/db/client";
import * as t from "../src/db/schema";

const BASE = process.env.API_TEST_BASE ?? "http://localhost:3000";
const WS = "api-test-workspace";
const OTHER = "api-test-other";

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!condition) failures += 1;
}

async function call(path: string, init: RequestInit = {}, token?: string) {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, body, headers: response.headers };
}

interface WireTask {
  id: string;
}

async function main() {
  const db = requireDb();
  await db.insert(t.workspaces).values({ id: WS, name: "API Test Co" }).onConflictDoNothing();
  await db
    .insert(t.workspaces)
    .values({ id: OTHER, name: "Somebody Else" })
    .onConflictDoNothing();

  const full = await createKey({
    workspaceId: WS,
    name: "test",
    scopes: ["tasks:read", "tasks:write", "departments:read", "memory:read"],
    createdBy: "api-test@example.invalid",
  });
  const readOnly = await createKey({
    workspaceId: WS,
    name: "read only",
    scopes: ["tasks:read"],
    createdBy: "api-test@example.invalid",
  });

  console.log("the door");
  const anon = await call("/api/v1/tasks");
  check("no key is 401, not a redirect", anon.status === 401, String(anon.status));
  check("and names the error type", anon.body?.error?.type === "authentication_error");
  check("with a request id", typeof anon.body?.request_id === "string");

  const bogus = await call("/api/v1/tasks", {}, "ek_not_a_real_key");
  check("a made up key is 401", bogus.status === 401, String(bogus.status));

  const discovery = await call("/api/v1");
  check("discovery needs no key", discovery.status === 200);

  console.log("\nscopes");
  const denied = await call(
    "/api/v1/tasks",
    { method: "POST", body: JSON.stringify({ title: "nope" }) },
    readOnly.token,
  );
  check("a read key cannot write", denied.status === 403, String(denied.status));
  check(
    "and is told which scope",
    String(denied.body?.error?.message).includes("tasks:write"),
  );
  const noDepts = await call("/api/v1/departments", {}, readOnly.token);
  check("nor read a scope it does not hold", noDepts.status === 403);

  console.log("\nme");
  const me = await call("/api/v1/me", {}, full.token);
  check("says which business", me.body?.data?.business?.id === WS, me.body?.data?.business?.id);
  check("and never echoes the token", !JSON.stringify(me.body).includes(full.token));

  console.log("\ntasks");
  const created = await call(
    "/api/v1/tasks",
    {
      method: "POST",
      body: JSON.stringify({ title: "Post the launch video", notes: "9am" }),
    },
    full.token,
  );
  check("create is 201", created.status === 201, String(created.status));
  const id = created.body?.data?.id as string;
  check("with an id", typeof id === "string");
  check("and a Location header", Boolean(created.headers.get("location")));
  check("status defaults to todo", created.body?.data?.status === "todo");

  const bad = await call(
    "/api/v1/tasks",
    { method: "POST", body: JSON.stringify({}) },
    full.token,
  );
  check("a missing title is 400", bad.status === 400, String(bad.status));
  check("and names the field", bad.body?.error?.param === "title", bad.body?.error?.param);

  const badJson = await call(
    "/api/v1/tasks",
    { method: "POST", body: "{not json", headers: { "Content-Type": "application/json" } },
    full.token,
  );
  check("broken JSON is 400, not 500", badJson.status === 400, String(badJson.status));

  const listed = await call("/api/v1/tasks?status=todo", {}, full.token);
  check(
    "list finds it",
    Boolean(listed.body?.data?.items?.some((task: WireTask) => task.id === id)),
  );
  check("and reports has_more", listed.body?.data?.has_more === false);

  const badStatus = await call("/api/v1/tasks?status=banana", {}, full.token);
  check("an unknown status is 400", badStatus.status === 400, String(badStatus.status));

  const patched = await call(
    `/api/v1/tasks/${id}`,
    { method: "PATCH", body: JSON.stringify({ status: "done" }) },
    full.token,
  );
  check("marking done works", patched.body?.data?.status === "done");
  check("and stamps the time", typeof patched.body?.data?.completed_at === "number");
  check("without wiping the notes", patched.body?.data?.notes === "9am");

  const reopened = await call(
    `/api/v1/tasks/${id}`,
    { method: "PATCH", body: JSON.stringify({ status: "todo" }) },
    full.token,
  );
  check("reopening clears the stamp", reopened.body?.data?.completed_at === null);

  console.log("\none business cannot see another");
  await db.insert(t.tasks).values({
    id: "api-test-foreign",
    workspaceId: OTHER,
    title: "Not yours",
    departmentId: "ceo",
  });
  const foreign = await call("/api/v1/tasks/api-test-foreign", {}, full.token);
  check("their task is 404 here", foreign.status === 404, String(foreign.status));

  const foreignPatch = await call(
    "/api/v1/tasks/api-test-foreign",
    { method: "PATCH", body: JSON.stringify({ title: "Taken" }) },
    full.token,
  );
  check("and cannot be written", foreignPatch.status === 404, String(foreignPatch.status));

  const [stillTheirs] = await db
    .select()
    .from(t.tasks)
    .where(eq(t.tasks.id, "api-test-foreign"));
  check("their row is untouched", stillTheirs?.title === "Not yours", stillTheirs?.title);

  const theirList = await call("/api/v1/tasks", {}, full.token);
  check(
    "and never appears in a list",
    !theirList.body?.data?.items?.some((task: WireTask) => task.id === "api-test-foreign"),
  );

  console.log("\nthe envelope holds at the edges");
  const badMethod = await call("/api/v1/me", { method: "DELETE" }, full.token);
  check("an unsupported method is 405", badMethod.status === 405, String(badMethod.status));
  check(
    "and answers in JSON, not an empty body",
    badMethod.body?.error?.type === "method_not_allowed_error",
  );
  check("with an Allow header", Boolean(badMethod.headers.get("allow")));

  const noSuch = await call("/api/v1/nope", {}, full.token);
  check("an unknown path is 404", noSuch.status === 404, String(noSuch.status));
  check(
    "and is JSON, not an HTML error page",
    noSuch.body?.error?.type === "not_found_error",
    String(noSuch.headers.get("content-type")),
  );

  console.log("\na client can pace itself");
  const paced = await call("/api/v1/tasks", {}, full.token);
  check("RateLimit-Limit is on a success", Boolean(paced.headers.get("ratelimit-limit")));
  check("so is Remaining", Boolean(paced.headers.get("ratelimit-remaining")));
  check("and Reset", Boolean(paced.headers.get("ratelimit-reset")));
  const firstLeft = Number(paced.headers.get("ratelimit-remaining"));
  const secondLeft = Number(
    (await call("/api/v1/tasks", {}, full.token)).headers.get("ratelimit-remaining"),
  );
  check("remaining counts down", secondLeft < firstLeft, `${firstLeft} then ${secondLeft}`);

  console.log("\nretrying a create does not create twice");
  const idem = { "Idempotency-Key": "retry-me-" + Date.now() };
  const sameBody = JSON.stringify({ title: "Post the video" });
  const once = await call(
    "/api/v1/tasks",
    { method: "POST", body: sameBody, headers: idem },
    full.token,
  );
  const twice = await call(
    "/api/v1/tasks",
    { method: "POST", body: sameBody, headers: idem },
    full.token,
  );
  check("the first attempt creates", once.status === 201, String(once.status));
  check("the second returns the same task", twice.body?.data?.id === once.body?.data?.id);
  check("and says it was a replay", twice.headers.get("idempotency-replayed") === "true");

  const listedAfter = await call("/api/v1/tasks?limit=200", {}, full.token);
  const sameTitle = (listedAfter.body?.data?.items ?? []).filter(
    (task: { title: string }) => task.title === "Post the video",
  );
  check("only one task exists", sameTitle.length === 1, `${sameTitle.length} found`);

  const reused = await call(
    "/api/v1/tasks",
    { method: "POST", body: JSON.stringify({ title: "Something else" }), headers: idem },
    full.token,
  );
  check("the key with a different body is 409", reused.status === 409, String(reused.status));
  check("named as a conflict", reused.body?.error?.type === "conflict_error");

  // Two identical attempts fired at once, which is what a retry storm looks
  // like. Exactly one may create.
  const raceKey = { "Idempotency-Key": "race-" + Date.now() };
  const raceBody = JSON.stringify({ title: "Raced" });
  const [raceA, raceB] = await Promise.all([
    call("/api/v1/tasks", { method: "POST", body: raceBody, headers: raceKey }, full.token),
    call("/api/v1/tasks", { method: "POST", body: raceBody, headers: raceKey }, full.token),
  ]);
  const madeIt = [raceA, raceB].filter((r) => r.status === 201);
  check("a simultaneous retry creates at most one", madeIt.length <= 1, `${madeIt.length}`);
  const racedList = await call("/api/v1/tasks?limit=200", {}, full.token);
  const raced = (racedList.body?.data?.items ?? []).filter(
    (task: { title: string }) => task.title === "Raced",
  );
  check("and only one row exists", raced.length <= 1, `${raced.length} found`);

  console.log("\na rejected create gives the key back");
  const freeAgain = { "Idempotency-Key": "reject-" + Date.now() };
  const rejected = await call(
    "/api/v1/tasks",
    { method: "POST", body: JSON.stringify({}), headers: freeAgain },
    full.token,
  );
  check("a bad body is 400", rejected.status === 400, String(rejected.status));
  const corrected = await call(
    "/api/v1/tasks",
    { method: "POST", body: JSON.stringify({ title: "Fixed" }), headers: freeAgain },
    full.token,
  );
  check("and the same key works once corrected", corrected.status === 201, String(corrected.status));

  console.log("\nmemory reads, and only with the scope");
  const noScope = await call("/api/v1/memory", {}, readOnly.token);
  check("a key without memory:read is 403", noScope.status === 403, String(noScope.status));
  const mem = await call("/api/v1/memory", {}, full.token);
  check("with it, 200", mem.status === 200, String(mem.status));
  check("and a page shape", Array.isArray(mem.body?.data?.items));

  console.log("\nrevoking");
  await revokeKey(WS, full.key.id);
  const afterRevoke = await call("/api/v1/me", {}, full.token);
  check("a revoked key stops working", afterRevoke.status === 401, String(afterRevoke.status));

  console.log("\ncleaning up");
  await revokeKey(WS, readOnly.key.id);
  await db.delete(t.tasks).where(eq(t.tasks.workspaceId, WS));
  await db.delete(t.tasks).where(eq(t.tasks.workspaceId, OTHER));
  await db.delete(t.idempotency).where(eq(t.idempotency.workspaceId, WS));
  await db.delete(t.apiKeys).where(eq(t.apiKeys.workspaceId, WS));
  await db.delete(t.workspaces).where(eq(t.workspaces.id, WS));
  await db.delete(t.workspaces).where(eq(t.workspaces.id, OTHER));
  check(
    "nothing left",
    (await db.select().from(t.apiKeys).where(eq(t.apiKeys.workspaceId, WS))).length === 0,
  );

  console.log(failures ? "\nFAILURES ABOVE" : "\nall checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error("api test threw:", error);
  process.exit(1);
});
