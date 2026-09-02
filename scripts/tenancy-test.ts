/**
 * A write stays in the workspace the server resolved, whatever the row says.
 *
 * `applyMutations` takes the workspace id from the session and the row from the
 * client. Two cases used to merge them the wrong way round, as `{ workspaceId,
 * ...op.row }`, so a row carrying its own `workspaceId` chose the tenant it
 * landed in. That is the whole tenant boundary, decided by the request body.
 *
 * It was not theoretical: it renamed a real customer's business the first time
 * they opened it, because the seeded defaults carry an empty `workspaceId`.
 * The same shape let any signed-in account write into any other company's
 * settings row, which is also where the model keys live.
 *
 * Run with: npm run tenancy-test
 */
import { applyMutations, loadWorkspace } from "../src/db/repo";
import { requireDb } from "../src/db/client";
import * as t from "../src/db/schema";
import { eq } from "drizzle-orm";

const MINE = "tenancy-mine@example.invalid";
const THEIRS = "tenancy-theirs@example.invalid";

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!condition) failures += 1;
}

async function settingsFor(workspaceId: string) {
  const [row] = await requireDb()
    .select()
    .from(t.settings)
    .where(eq(t.settings.workspaceId, workspaceId))
    .limit(1);
  return row ?? null;
}

async function main() {
  console.log("a row cannot choose the workspace it lands in");

  await applyMutations(THEIRS, THEIRS, [
    { table: "settings", action: "upsert", row: { companyName: "Their Business" } },
  ]);
  await applyMutations(MINE, MINE, [
    { table: "settings", action: "upsert", row: { companyName: "My Business" } },
  ]);

  // The attack: my session, their workspace id in the body.
  await applyMutations(MINE, MINE, [
    {
      table: "settings",
      action: "upsert",
      row: { workspaceId: THEIRS, companyName: "Taken Over" },
    } as never,
  ]);

  const theirs = await settingsFor(THEIRS);
  const mine = await settingsFor(MINE);
  check("their name is untouched", theirs?.companyName === "Their Business", theirs?.companyName);
  check("the write landed in mine instead", mine?.companyName === "Taken Over", mine?.companyName);

  console.log("\nan empty workspaceId in the row does not escape the scope");
  await applyMutations(MINE, MINE, [
    {
      table: "settings",
      action: "upsert",
      row: { workspaceId: "", companyName: "Still Mine" },
    } as never,
  ]);
  check("no row was written to the empty scope", (await settingsFor("")) === null);
  check("mine took the change", (await settingsFor(MINE))?.companyName === "Still Mine");

  console.log("\na settings save cannot touch the model keys");
  await requireDb()
    .update(t.settings)
    .set({ anthropicKey: "sk-real-key" })
    .where(eq(t.settings.workspaceId, MINE));
  await applyMutations(MINE, MINE, [
    {
      table: "settings",
      action: "upsert",
      row: { companyName: "Still Mine", anthropicKey: "sk-attacker" },
    } as never,
  ]);
  check("the key survived the save", (await settingsFor(MINE))?.anthropicKey === "sk-real-key");

  console.log("\nthe same holds for the company profile");
  await applyMutations(THEIRS, THEIRS, [
    { table: "profile", action: "upsert", row: { mission: "Theirs" } } as never,
  ]);
  await applyMutations(MINE, MINE, [
    {
      table: "profile",
      action: "upsert",
      row: { workspaceId: THEIRS, mission: "Overwritten" },
    } as never,
  ]);
  check(
    "their mission is untouched",
    (await loadWorkspace(THEIRS, THEIRS)).profile.mission === "Theirs",
  );

  console.log("\ncleaning up");
  for (const scope of [MINE, THEIRS, ""]) {
    await requireDb().delete(t.settings).where(eq(t.settings.workspaceId, scope));
    await requireDb().delete(t.profiles).where(eq(t.profiles.workspaceId, scope));
  }
  check("nothing left", (await settingsFor(MINE)) === null && (await settingsFor(THEIRS)) === null);

  console.log(failures ? "\nFAILURES ABOVE" : "\nall checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error("tenancy test threw:", error);
  process.exit(1);
});
