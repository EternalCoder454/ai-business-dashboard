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
    scopes: ["tasks:read", "tasks:write", "departments:read"],
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

  console.log("\nrevoking");
  await revokeKey(WS, full.key.id);
  const afterRevoke = await call("/api/v1/me", {}, full.token);
  check("a revoked key stops working", afterRevoke.status === 401, String(afterRevoke.status));

  console.log("\ncleaning up");
  await revokeKey(WS, readOnly.key.id);
  await db.delete(t.tasks).where(eq(t.tasks.workspaceId, WS));
  await db.delete(t.tasks).where(eq(t.tasks.workspaceId, OTHER));
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
