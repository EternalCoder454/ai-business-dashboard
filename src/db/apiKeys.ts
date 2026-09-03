import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { databaseEnabled, db, requireDb } from "./client";
import * as t from "./schema";

/**
 * Keys for the developer API.
 *
 * The plaintext token is generated here, returned once, and never stored. What
 * goes in the table is its SHA-256, which is the right hash for this and not
 * for a password: the token is 32 bytes of `randomBytes`, so there is no
 * dictionary to run against it and nothing for bcrypt's work factor to buy.
 * Lookup has to be a single indexed read on every API request, which a slow
 * hash would make expensive on purpose.
 */

/** `ek_` for Eterneon key, then the random part. */
const PREFIX = "ek_";
/**
 * What a key can be given permission to do.
 *
 * Every entry has an endpoint behind it. There was a `chat:write` here for a
 * while with nothing to grant: an administrator could tick it, the key would
 * carry it, and no route would ever look. A scope that does nothing is worse
 * than a missing one, because it reads as a capability somebody has decided to
 * give away.
 */
const SCOPES = [
  "tasks:read",
  "tasks:write",
  "departments:read",
  "memory:read",
] as const;

export type Scope = (typeof SCOPES)[number];
export const ALL_SCOPES: readonly Scope[] = SCOPES;

export function isScope(value: unknown): value is Scope {
  return typeof value === "string" && (SCOPES as readonly string[]).includes(value);
}

function hash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface KeyRow {
  id: string;
  name: string;
  prefix: string;
  last4: string;
  scopes: Scope[];
  createdBy: string;
  createdAt: number;
  lastUsedAt: number | null;
}

function toRow(row: typeof t.apiKeys.$inferSelect): KeyRow {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    last4: row.last4,
    scopes: row.scopes.split(/\s+/).filter(isScope),
    createdBy: row.createdBy,
    createdAt: row.createdAt.getTime(),
    lastUsedAt: row.lastUsedAt?.getTime() ?? null,
  };
}

/** Every live key for one business. Never the tokens; there is no column for them. */
export async function listKeys(workspaceId: string): Promise<KeyRow[]> {
  if (!databaseEnabled || !db) return [];
  const rows = await db
    .select()
    .from(t.apiKeys)
    .where(and(eq(t.apiKeys.workspaceId, workspaceId), isNull(t.apiKeys.revokedAt)))
    .orderBy(desc(t.apiKeys.createdAt));
  return rows.map(toRow);
}

/**
 * Mints a key and hands back the only copy of it there will ever be.
 *
 * The caller shows `token` to the person once and then forgets it. Nothing
 * here, or anywhere else, can produce it again.
 */
export async function createKey(input: {
  workspaceId: string;
  name: string;
  scopes: Scope[];
  createdBy: string;
}): Promise<{ key: KeyRow; token: string }> {
  const token = PREFIX + randomBytes(32).toString("base64url");
  const row = {
    id: randomUUID(),
    workspaceId: input.workspaceId,
    name: input.name.trim().slice(0, 80),
    tokenHash: hash(token),
    prefix: token.slice(0, PREFIX.length + 6),
    last4: token.slice(-4),
    // Deduplicated and ordered, so two keys asking for the same thing store the
    // same string and a diff of the table is readable.
    scopes: [...new Set(input.scopes)].sort().join(" ") || "tasks:read",
    createdBy: input.createdBy,
  };
  await requireDb().insert(t.apiKeys).values(row);
  // tenancy-audit: reading back the row just inserted, by the uuid generated
  // for it a line ago.
  const [saved] = await requireDb()
    .select()
    .from(t.apiKeys)
    .where(eq(t.apiKeys.id, row.id))
    .limit(1);
  return { key: toRow(saved), token };
}

/** Revoking is a timestamp, not a delete, so an audit of who used what survives. */
export async function revokeKey(workspaceId: string, id: string): Promise<boolean> {
  const result = await requireDb()
    .update(t.apiKeys)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(t.apiKeys.id, id),
        eq(t.apiKeys.workspaceId, workspaceId),
        isNull(t.apiKeys.revokedAt),
      ),
    )
    .returning({ id: t.apiKeys.id });
  return result.length > 0;
}

export interface Bearer {
  keyId: string;
  workspaceId: string;
  scopes: Scope[];
}

/**
 * Turns a bearer token into the business it acts for, or null.
 *
 * The hash is compared in the database by an indexed equality, which is a
 * lookup rather than a secret comparison: it reveals which row was found, not
 * whether a guess was close. The second, constant-time check exists so that a
 * future change to the query (a prefix scan, say) cannot quietly turn this
 * into something an attacker can time.
 */
export async function resolveBearer(token: string | null): Promise<Bearer | null> {
  if (!token || !token.startsWith(PREFIX) || !databaseEnabled || !db) return null;

  const digest = hash(token);
  /*
   * tenancy-audit: found by the hash of the token, which is the credential
   * itself and is unique across every business. The workspace comes out of
   * this lookup; it cannot be an input to it.
   *
   * Joined to the business so a key cannot outlive it. Deleting a workspace
   * removes its keys, but a key written before that delete learned about the
   * table is still a live credential naming a business that is gone, and this
   * is what makes that inert rather than merely empty.
   */
  const [row] = await db
    .select({
      id: t.apiKeys.id,
      workspaceId: t.apiKeys.workspaceId,
      scopes: t.apiKeys.scopes,
      tokenHash: t.apiKeys.tokenHash,
    })
    .from(t.apiKeys)
    .innerJoin(t.workspaces, eq(t.workspaces.id, t.apiKeys.workspaceId))
    .where(and(eq(t.apiKeys.tokenHash, digest), isNull(t.apiKeys.revokedAt)))
    .limit(1);
  if (!row) return null;

  const a = Buffer.from(row.tokenHash, "hex");
  const b = Buffer.from(digest, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  return {
    keyId: row.id,
    workspaceId: row.workspaceId,
    scopes: row.scopes.split(/\s+/).filter(isScope),
  };
}

/**
 * Records that a key was used, without making every request wait for a write.
 *
 * Only moves the timestamp when it is more than a minute stale, so a busy
 * integration does not turn one row into a write-per-request hot spot.
 */
const lastWrite = new Map<string, number>();

export function touchKey(keyId: string): void {
  const now = Date.now();
  if (now - (lastWrite.get(keyId) ?? 0) < 60_000) return;
  lastWrite.set(keyId, now);
  // tenancy-audit: by the key's own id, which came from resolveBearer and so
  // is already the caller's own.
  void requireDb()
    .update(t.apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(t.apiKeys.id, keyId))
    .catch(() => {});
}
