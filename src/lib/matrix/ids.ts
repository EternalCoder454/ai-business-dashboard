import { createHash } from "node:crypto";

/**
 * Turning a person into a Matrix user id, and doing it the same way every time.
 *
 * A Matrix localpart may hold lowercase letters, digits, and `. _ = - / +`, and
 * an email address holds neither the same characters nor the same guarantees.
 * So the address is hashed rather than mangled, which settles three things at
 * once:
 *
 *   It is always valid. No escaping scheme to get wrong, and no address that
 *   happens to contain a character the spec does not allow.
 *
 *   It is stable. The same address is the same user forever, which is what
 *   makes a room somebody was in last year still theirs.
 *
 *   It does not publish anybody's address. A user id is visible to everyone in
 *   a room and travels with the event over federation, so putting the address
 *   in it would hand out the company's email list to anybody ever invited in.
 *
 * The cost is that a user id cannot be read back to an address, which is why
 * the mapping is a table rather than a function. That is the right way round:
 * the table is the record, and this is only how a new row gets its name.
 *
 * The underscore prefix is what the application service spec asks for on an
 * exclusive namespace, so the homeserver can tell the panel's users from the
 * ones somebody registered by hand.
 */
const PREFIX = "_eterneon_";

/**
 * Twenty hex characters, which is eighty bits.
 *
 * Long enough that a collision is not a thing that happens, short enough that a
 * user id stays legible in a log line. The full sixty four would be neither
 * safer in any way that matters nor readable.
 */
const LENGTH = 20;

export function localpartFor(email: string): string {
  const normalised = email.trim().toLowerCase();
  const digest = createHash("sha256").update(normalised).digest("hex");
  return `${PREFIX}${digest.slice(0, LENGTH)}`;
}

/** The full id, which is the localpart and the server's own name. */
export function userIdFor(email: string, server: string): string {
  return `@${localpartFor(email)}:${server}`;
}

/**
 * The regex the homeserver is given, so it knows which users are the panel's.
 *
 * Anchored at both ends, because an unanchored namespace claims every user id
 * with the prefix anywhere in it, and a homeserver that has handed the panel
 * exclusive control of a namespace will refuse to register anybody who falls
 * inside it.
 */
export function userNamespaceRegex(server: string): string {
  // The server name goes in a regex, and a dot in a hostname is a dot.
  const escaped = server.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return `^@${PREFIX}[0-9a-f]{${LENGTH}}:${escaped}$`;
}

/** The bot has a name rather than a hash, since there is only ever one. */
export function botUserId(localpart: string, server: string): string {
  return `@${localpart}:${server}`;
}
