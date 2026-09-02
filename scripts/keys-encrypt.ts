/**
 * Encrypts credentials that were stored before encryption was switched on.
 *
 * Safe to run more than once: a value already in the new format is left alone.
 * Every row is verified before it is written, by decrypting the ciphertext and
 * comparing it to what it replaces, so a bug here cannot quietly destroy a key
 * that a business would then have to find again.
 *
 * Run with: npm run keys-encrypt
 */
import { eq } from "drizzle-orm";
import { requireDb } from "../src/db/client";
import * as t from "../src/db/schema";
import {
  decryptSecret,
  encryptSecret,
  encryptionEnabled,
  isEncrypted,
  sameSecret,
} from "../src/db/secrets";

const COLUMNS = ["anthropicKey", "openaiKey", "googleKey"] as const;

async function main() {
  if (!encryptionEnabled()) {
    console.error(
      "KEY_ENCRYPTION_KEY is not set, or is not 32 bytes of base64.\n" +
        "Generate one with:\n" +
        "  node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
    process.exit(1);
  }

  const db = requireDb();
  const rows = await db
    .select({
      workspaceId: t.settings.workspaceId,
      anthropicKey: t.settings.anthropicKey,
      openaiKey: t.settings.openaiKey,
      googleKey: t.settings.googleKey,
    })
    .from(t.settings);

  let encrypted = 0;
  let already = 0;
  let empty = 0;

  for (const row of rows) {
    const patch: Record<string, string> = {};

    for (const column of COLUMNS) {
      const value = row[column]?.trim() ?? "";
      if (!value) {
        empty += 1;
        continue;
      }
      if (isEncrypted(value)) {
        already += 1;
        continue;
      }

      const sealed = encryptSecret(value, row.workspaceId, column);
      // Read it back before trusting it. The alternative is finding out that
      // this loop was wrong once every key in the table is unreadable.
      const check = decryptSecret(sealed, row.workspaceId, column);
      if (!sameSecret(check, value)) {
        console.error(
          `REFUSED ${row.workspaceId} ${column}: the round trip did not match. Nothing written.`,
        );
        process.exit(1);
      }
      patch[column] = sealed;
      encrypted += 1;
    }

    if (Object.keys(patch).length > 0) {
      await db
        .update(t.settings)
        .set(patch)
        .where(eq(t.settings.workspaceId, row.workspaceId));
      console.log(
        `  ${row.workspaceId}: ${Object.keys(patch).join(", ")}`,
      );
    }
  }

  console.log(
    `\n${rows.length} settings rows. ${encrypted} encrypted, ${already} already were, ${empty} empty.`,
  );

  // Prove it, rather than report it. Every non-empty value should now be in the
  // new format and decrypt to something.
  const after = await db
    .select({
      workspaceId: t.settings.workspaceId,
      anthropicKey: t.settings.anthropicKey,
      openaiKey: t.settings.openaiKey,
      googleKey: t.settings.googleKey,
    })
    .from(t.settings);

  let plaintextLeft = 0;
  let unreadable = 0;
  for (const row of after) {
    for (const column of COLUMNS) {
      const value = row[column]?.trim() ?? "";
      if (!value) continue;
      if (!isEncrypted(value)) plaintextLeft += 1;
      else if (!decryptSecret(value, row.workspaceId, column)) unreadable += 1;
    }
  }

  console.log(`plaintext left: ${plaintextLeft}`);
  console.log(`encrypted but unreadable: ${unreadable}`);
  process.exit(plaintextLeft === 0 && unreadable === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("keys-encrypt threw:", error);
  process.exit(1);
});
