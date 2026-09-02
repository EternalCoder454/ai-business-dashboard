/**
 * A model key never comes back out.
 *
 * Written the way an attacker would check rather than the way the code reads:
 * plant a key with a recognisable value, run everything that builds a payload a
 * browser or another tenant could see, serialise the result, and search it for
 * the key. Reading the code proves nobody wrote a leak on purpose. This proves
 * nothing serialises one by accident, which is how it would actually happen:
 * somebody adds a column to a select, or returns a row instead of naming
 * fields, and the leak ships silently because nothing failed.
 *
 * Run with: npm run keys-test
 */
import { eq } from "drizzle-orm";
import { requireDb } from "../src/db/client";
import * as t from "../src/db/schema";
import { loadWorkspace, applyMutations } from "../src/db/repo";
import { keySummaries, workspaceKey, setWorkspaceKey } from "../src/db/keys";
import { detailFor, listPeople, overview } from "../src/db/admin";
import { listMembers } from "../src/db/tenancy";
import { listKeys, createKey, resolveBearer } from "../src/db/apiKeys";
import {
  decryptSecret,
  encryptSecret,
  encryptionEnabled,
  isEncrypted,
} from "../src/db/secrets";

const WS = "keys-test-workspace";
const WHO = "keys-test@example.invalid";

// Distinctive enough that a substring search cannot miss it or match by chance.
const ANTHROPIC = "sk-ant-KEYTESTCANARY-anthropic-3f9a2b";
const OPENAI = "sk-proj-KEYTESTCANARY-openai-77c1de";
const GOOGLE = "AIzaKEYTESTCANARY-google-0b4e6a";
const CANARIES = [ANTHROPIC, OPENAI, GOOGLE];

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!condition) failures += 1;
}

/** Serialise anything and look for a key inside it, however deeply buried. */
function leaks(payload: unknown): string | null {
  const text = JSON.stringify(payload ?? null);
  for (const canary of CANARIES) {
    if (text.includes(canary)) return canary;
    // A key split across fields, or partially printed, still counts. The last
    // four characters are shown on purpose, so anything longer is a leak.
    const tooMuch = canary.slice(-12);
    if (text.includes(tooMuch)) return `${tooMuch} (partial)`;
  }
  return null;
}

function clean(label: string, payload: unknown) {
  const found = leaks(payload);
  check(label, found === null, found ?? "");
}

async function main() {
  const db = requireDb();
  await db.insert(t.workspaces).values({ id: WS, name: "Key Test" }).onConflictDoNothing();
  await db
    .insert(t.access)
    .values({ email: WHO, workspaceId: WS, role: "admin", invitedBy: WHO })
    .onConflictDoNothing();

  await setWorkspaceKey(WS, "anthropic", ANTHROPIC);
  await setWorkspaceKey(WS, "openai", OPENAI);
  await setWorkspaceKey(WS, "google", GOOGLE);

  console.log("the keys really are stored");
  check("anthropic reads back server side", (await workspaceKey(WS, "anthropic")) === ANTHROPIC);
  check("openai reads back server side", (await workspaceKey(WS, "openai")) === OPENAI);
  check("google reads back server side", (await workspaceKey(WS, "google")) === GOOGLE);

  console.log("\nnothing a browser receives contains one");
  clean("the workspace snapshot", await loadWorkspace(WS, WHO));
  clean("the key summary", await keySummaries(WS));
  clean("the member list", await listMembers(WS));
  clean("the API key list", await listKeys(WS));

  console.log("\nnor anything the operator screen receives");
  clean("listPeople", await listPeople());
  clean("detailFor", await detailFor(WS));
  clean("overview", await overview());

  console.log("\nthe summary shows only what it should");
  const summary = await keySummaries(WS);
  check("it says a key is set", summary.anthropic.set === true);
  check("and shows four characters", summary.anthropic.tail === ANTHROPIC.slice(-4));
  check("and no more than four", summary.anthropic.tail.length === 4);

  console.log("\na settings save cannot carry one in or out");
  await applyMutations(WS, WHO, [
    {
      table: "settings",
      action: "upsert",
      row: { companyName: "Key Test", anthropicKey: "sk-ant-ATTACKER" },
    } as never,
  ]);
  check("the real key survived", (await workspaceKey(WS, "anthropic")) === ANTHROPIC);
  clean("and the snapshot after it", await loadWorkspace(WS, WHO));

  console.log("\ndeveloper API keys are stored as hashes, not keys");
  const minted = await createKey({
    workspaceId: WS,
    name: "canary",
    scopes: ["tasks:read"],
    createdBy: WHO,
  });
  const [row] = await db.select().from(t.apiKeys).where(eq(t.apiKeys.id, minted.key.id));
  check("the token is not in the row", !JSON.stringify(row).includes(minted.token));
  check("the hash is not the token", row.tokenHash !== minted.token);
  check("only the last four are kept", row.last4 === minted.token.slice(-4));
  check("and it still authenticates", (await resolveBearer(minted.token))?.workspaceId === WS);
  check("while a near miss does not", (await resolveBearer(minted.token + "x")) === null);
  clean("the key list", await listKeys(WS));

  console.log("\nat rest the row holds ciphertext, not the key");
  if (!encryptionEnabled()) {
    console.log("  ..   skipped: KEY_ENCRYPTION_KEY is not set on this machine");
  } else {
    const [stored] = await db
      .select({
        anthropicKey: t.settings.anthropicKey,
        openaiKey: t.settings.openaiKey,
        googleKey: t.settings.googleKey,
      })
      .from(t.settings)
      .where(eq(t.settings.workspaceId, WS));

    check("the stored value is in the new format", isEncrypted(stored.anthropicKey));
    clean("and the raw row itself", stored);
    check(
      "it decrypts back to the key",
      decryptSecret(stored.anthropicKey, WS, "anthropicKey") === ANTHROPIC,
    );

    // A ciphertext is bound to its workspace and its column, so lifting one
    // into another business's row buys nothing.
    check(
      "it will not decrypt for another workspace",
      decryptSecret(stored.anthropicKey, "some-other-workspace", "anthropicKey") === "",
    );
    check("nor in another column", decryptSecret(stored.anthropicKey, WS, "openaiKey") === "");

    // GCM authenticates, so a changed byte fails rather than decrypting to
    // something else.
    const parts = stored.anthropicKey.split(".");
    const body = Buffer.from(parts[3], "base64url");
    body[0] ^= 0xff;
    parts[3] = body.toString("base64url");
    check("a tampered value fails", decryptSecret(parts.join("."), WS, "anthropicKey") === "");

    // Anything written before encryption was switched on still reads.
    await db
      .update(t.settings)
      .set({ openaiKey: "sk-proj-LEGACY-plaintext" })
      .where(eq(t.settings.workspaceId, WS));
    check(
      "a legacy plaintext value still reads",
      (await workspaceKey(WS, "openai")) === "sk-proj-LEGACY-plaintext",
    );

    // And is replaced by ciphertext the next time it is set.
    await setWorkspaceKey(WS, "openai", OPENAI);
    const [again] = await db
      .select({ openaiKey: t.settings.openaiKey })
      .from(t.settings)
      .where(eq(t.settings.workspaceId, WS));
    check("and is encrypted once it is set again", isEncrypted(again.openaiKey));
    check("still reading correctly", (await workspaceKey(WS, "openai")) === OPENAI);

    check("an empty key stays empty rather than encrypting", encryptSecret("", WS, "x") === "");
  }

  console.log("\ncleaning up");
  await db.delete(t.apiKeys).where(eq(t.apiKeys.workspaceId, WS));
  await db.delete(t.settings).where(eq(t.settings.workspaceId, WS));
  await db.delete(t.profiles).where(eq(t.profiles.workspaceId, WS));
  await db.delete(t.departments).where(eq(t.departments.workspaceId, WS));
  await db.delete(t.access).where(eq(t.access.email, WHO));
  await db.delete(t.workspaces).where(eq(t.workspaces.id, WS));
  check("nothing left", (await workspaceKey(WS, "anthropic")) === "");

  console.log(failures ? "\nFAILURES ABOVE" : "\nall checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error("keys test threw:", error);
  process.exit(1);
});
