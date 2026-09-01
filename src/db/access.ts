import { and, eq, isNull, sql } from "drizzle-orm";
import { databaseEnabled, db } from "./client";
import * as t from "./schema";

export interface AccessRow {
  email: string;
  workspaceId: string;
  role: "member" | "admin";
  note: string | null;
  invitedBy: string | null;
  createdAt: number;
  revokedAt: number | null;
  lastSignedInAt: number | null;
  /** True for an address that comes from the environment rather than the table. */
  fromEnvironment?: boolean;
}

const clean = (email: string) => email.trim().toLowerCase();

/**
 * Whether this address may sign in.
 *
 * Never throws. A sign-in happening while the database is unreachable falls
 * back to the environment allowlist, which is the whole reason that list is
 * still honoured: locking the owner out of their own deployment because Neon
 * was briefly down is a worse failure than a beta tester waiting a minute.
 */
export async function isAllowed(email: string): Promise<boolean> {
  if (!databaseEnabled || !db) return false;
  try {
    const [row] = await db
      .select({ email: t.access.email })
      .from(t.access)
      .where(and(eq(t.access.email, clean(email)), isNull(t.access.revokedAt)))
      .limit(1);
    return Boolean(row);
  } catch (error) {
    console.error("[access] could not read the allowlist", error);
    return false;
  }
}

/** Whether this address has been granted admin in the table. */
export async function isAdminInDatabase(email: string): Promise<boolean> {
  if (!databaseEnabled || !db) return false;
  try {
    const [row] = await db
      .select({ role: t.access.role })
      .from(t.access)
      .where(and(eq(t.access.email, clean(email)), isNull(t.access.revokedAt)))
      .limit(1);
    return row?.role === "admin";
  } catch (error) {
    console.error("[access] could not read the allowlist", error);
    return false;
  }
}

/**
 * Records that this address just signed in.
 *
 * Best effort and deliberately not awaited by the caller's critical path: the
 * only thing it buys is telling an invite that was accepted from one that is
 * still sitting in someone's inbox, which is not worth failing a sign-in over.
 */
export async function markSignedIn(email: string): Promise<void> {
  if (!databaseEnabled || !db) return;
  try {
    await db
      .update(t.access)
      .set({ lastSignedInAt: new Date() })
      .where(eq(t.access.email, clean(email)));
  } catch (error) {
    console.error("[access] could not record a sign-in", error);
  }
}

export async function listAccess(): Promise<AccessRow[]> {
  if (!databaseEnabled || !db) return [];
  const rows = await db.select().from(t.access).orderBy(sql`${t.access.createdAt} desc`);
  return rows.map((row) => ({
    email: row.email,
    workspaceId: row.workspaceId,
    role: row.role === "admin" ? "admin" : "member",
    note: row.note,
    invitedBy: row.invitedBy,
    createdAt: row.createdAt.getTime(),
    revokedAt: row.revokedAt?.getTime() ?? null,
    lastSignedInAt: row.lastSignedInAt?.getTime() ?? null,
  }));
}

/**
 * Adds an address, or brings a revoked one back.
 *
 * Upsert rather than insert, because the obvious thing to do after revoking
 * someone by mistake is to add them again, and that should work rather than
 * collide with the row that is already there.
 */
export async function grantAccess(input: {
  email: string;
  workspaceId: string;
  role?: "member" | "admin";
  note?: string;
  invitedBy: string;
}): Promise<void> {
  if (!databaseEnabled || !db) throw new Error("No database.");
  const email = clean(input.email);
  const values = {
    email,
    workspaceId: input.workspaceId,
    role: input.role ?? "member",
    note: input.note?.trim() || null,
    invitedBy: clean(input.invitedBy),
    revokedAt: null,
  };
  await db
    .insert(t.access)
    .values(values)
    .onConflictDoUpdate({
      target: t.access.email,
      // createdAt and lastSignedInAt are left alone: when this address was
      // first invited, and whether they ever arrived, are still true.
      set: {
        workspaceId: values.workspaceId,
        role: values.role,
        note: values.note,
        revokedAt: null,
      },
    });
}

/**
 * Takes access away without losing the record of it.
 *
 * Their workspace is untouched. Deleting that is a separate, louder action in
 * Admin, because taking someone's sign-in away and destroying their work are
 * different decisions and should never be one click.
 */
export async function revokeAccess(email: string): Promise<void> {
  if (!databaseEnabled || !db) throw new Error("No database.");
  await db
    .update(t.access)
    .set({ revokedAt: new Date() })
    .where(eq(t.access.email, clean(email)));
}
