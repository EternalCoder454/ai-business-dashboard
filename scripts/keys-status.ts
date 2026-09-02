/**
 * Whether every stored credential is actually encrypted.
 *
 * The one question worth being able to ask on demand, because the answer
 * changes without anybody doing anything: a business saves a key on a
 * deployment where the master key is missing and it goes in as plaintext, with
 * only a line in a log to say so. This reads the rows and reports what is
 * really there.
 *
 * It never prints a credential, decrypted or otherwise. Only whether one
 * exists, and what form it is in.
 *
 * Run with: npm run keys-status
 */
import { requireDb } from "../src/db/client";
import * as t from "../src/db/schema";
import { decryptSecret, encryptionEnabled, isEncrypted } from "../src/db/secrets";

const COLUMNS = ["anthropicKey", "openaiKey", "googleKey"] as const;
const LABEL: Record<(typeof COLUMNS)[number], string> = {
  anthropicKey: "anthropic",
  openaiKey: "openai",
  googleKey: "google",
};

async function main() {
  const db = requireDb();

  const rows = await db
    .select({
      workspaceId: t.settings.workspaceId,
      anthropicKey: t.settings.anthropicKey,
      openaiKey: t.settings.openaiKey,
      googleKey: t.settings.googleKey,
    })
    .from(t.settings);

  const names = new Map(
    (await db.select({ id: t.workspaces.id, name: t.workspaces.name }).from(t.workspaces)).map(
      (w) => [w.id, w.name],
    ),
  );

  console.log(
    `master key on this machine: ${encryptionEnabled() ? "set" : "NOT SET"}\n`,
  );

  let plaintext = 0;
  let encrypted = 0;
  let unreadable = 0;

  for (const row of rows) {
    const parts: string[] = [];
    for (const column of COLUMNS) {
      const value = row[column]?.trim() ?? "";
      if (!value) continue;
      if (!isEncrypted(value)) {
        parts.push(`${LABEL[column]}=PLAINTEXT`);
        plaintext += 1;
      } else if (!decryptSecret(value, row.workspaceId, column)) {
        // Encrypted under a master key this machine does not have, or damaged.
        parts.push(`${LABEL[column]}=UNREADABLE`);
        unreadable += 1;
      } else {
        parts.push(`${LABEL[column]}=encrypted`);
        encrypted += 1;
      }
    }
    const name = names.get(row.workspaceId) ?? "(no workspace)";
    console.log(`  ${name}: ${parts.length ? parts.join("  ") : "no keys stored"}`);
  }

  console.log(
    `\n${encrypted} encrypted, ${plaintext} plaintext, ${unreadable} unreadable.`,
  );
  if (plaintext > 0) console.log("Run: npm run keys-encrypt");
  if (unreadable > 0) {
    console.log(
      "Unreadable means the master key here is not the one they were written with.",
    );
  }
  process.exit(plaintext === 0 && unreadable === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("keys-status threw:", error);
  process.exit(1);
});
