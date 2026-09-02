import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Encrypting the credentials a business hands us.
 *
 * A model key cannot be hashed the way a password or a bearer token can, because
 * we have to send the real value to the provider on every request. So the choice
 * is plaintext or reversible encryption, and reversible encryption is worth
 * having: it moves the secret out of the database and into an environment
 * variable, so a leaked connection string, a stolen backup, or a dump handed to
 * the wrong person is a file full of ciphertext rather than a file full of
 * working credentials.
 *
 * It is not protection against somebody who has the running server. They can
 * read the master key out of its environment, which is the point of the master
 * key being there. What it buys is that the database alone is no longer enough,
 * and the database is the thing that gets copied.
 *
 * AES-256-GCM: authenticated, so a tampered ciphertext fails to decrypt rather
 * than decrypting to something else. A fresh 12-byte IV per value, because
 * reusing one under the same key in GCM is the mistake that breaks it outright.
 */

const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * The master key, from the environment.
 *
 * Read on each call rather than cached at import time, so a test can set it,
 * and so a missing one is reported at the moment it matters instead of
 * crashing the process on boot.
 */
function masterKey(): Buffer | null {
  const raw = process.env.KEY_ENCRYPTION_KEY?.trim();
  if (!raw) return null;

  const bytes = Buffer.from(raw, "base64");
  if (bytes.length !== 32) {
    // Loudly, and only once per request: a master key of the wrong length
    // means every write is about to be stored in plaintext, and a warning
    // buried in a log is the only way anybody finds out before a breach does.
    console.error(
      `[secrets] KEY_ENCRYPTION_KEY decodes to ${bytes.length} bytes, not 32. ` +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
    return null;
  }
  return bytes;
}

export const encryptionEnabled = () => masterKey() !== null;

/**
 * Ties a ciphertext to the row it belongs in.
 *
 * Passed to GCM as additional authenticated data, so a value lifted out of one
 * workspace's row and pasted into another's does not decrypt. Without it,
 * anybody who could write to the settings table could move a competitor's key
 * onto their own workspace and spend it, never seeing the key but using it all
 * the same.
 */
function aad(workspaceId: string, field: string): Buffer {
  return Buffer.from(`${VERSION}:${workspaceId}:${field}`, "utf8");
}

/** Recognises our own format, so anything else is treated as it was left. */
export function isEncrypted(value: string): boolean {
  return value.startsWith(VERSION + ".");
}

export function encryptSecret(
  plaintext: string,
  workspaceId: string,
  field: string,
): string {
  const key = masterKey();
  // Empty means cleared, and an encrypted empty string would make "no key" and
  // "a key I cannot read" look the same to every caller.
  if (!plaintext) return "";
  if (!key) {
    console.warn(
      "[secrets] KEY_ENCRYPTION_KEY is not set, so this credential is being " +
        "stored in plaintext. Set it and run: npm run keys-encrypt",
    );
    return plaintext;
  }

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad(workspaceId, field));
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    body.toString("base64url"),
  ].join(".");
}

/**
 * Returns the credential, or an empty string.
 *
 * Never throws. A key that cannot be decrypted is, to everything upstream, the
 * same as a key that is not there: the request says no key is configured and
 * the administrator sets it again. Throwing would turn a rotated master key
 * into a stack trace in somebody's chat window.
 */
export function decryptSecret(
  stored: string | null | undefined,
  workspaceId: string,
  field: string,
): string {
  const value = stored?.trim() ?? "";
  if (!value) return "";

  // Anything written before encryption was switched on is still exactly what
  // it was. It is re-encrypted the next time it is set, and `keys-encrypt`
  // sweeps up the rest.
  if (!isEncrypted(value)) return value;

  const key = masterKey();
  if (!key) {
    console.error(
      "[secrets] a stored credential is encrypted but KEY_ENCRYPTION_KEY is " +
        "not set. It cannot be read until the master key is restored.",
    );
    return "";
  }

  try {
    const [, ivPart, tagPart, bodyPart] = value.split(".");
    const iv = Buffer.from(ivPart, "base64url");
    const tag = Buffer.from(tagPart, "base64url");
    const body = Buffer.from(bodyPart, "base64url");
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) return "";

    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(aad(workspaceId, field));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
  } catch {
    // Wrong master key, a tampered value, or one moved between workspaces.
    // Which of those it was is not something to report to a caller.
    console.error("[secrets] a stored credential could not be decrypted");
    return "";
  }
}

/**
 * Whether two keys are the same, without leaking how nearly.
 *
 * Only used by the migration, to confirm a re-encrypted value still decrypts to
 * what it replaced before the plaintext is overwritten.
 */
export function sameSecret(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}
