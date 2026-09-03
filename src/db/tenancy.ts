import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { databaseEnabled, db, requireDb } from "./client";
import * as t from "./schema";
import { parsePermissions, type Permissions } from "@/lib/permissions";

export interface Membership {
  workspaceId: string;
  role: "member" | "admin";
  /** What this person may open in it. Null means everything. */
  permissions: Permissions | null;
}

export interface WorkspaceRow {
  id: string;
  name: string;
  note: string | null;
  createdBy: string | null;
  createdAt: number;
  members: { email: string; role: "member" | "admin"; lastSignedInAt: number | null }[];
}

const clean = (email: string) => email.trim().toLowerCase();

/**
 * Two letters for the badge in the corner, from the business's own name.
 *
 * Initials of the first two words, or the first two letters of a single one.
 */
export function markFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "HQ";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Short, readable, and unguessable enough for something that is never a URL. */
function newWorkspaceId(): string {
  return `ws_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Which workspace this address opens, if any.
 *
 * The single question the whole tenancy model answers. Every route asks it
 * before touching a row, and a null means the person is signed in and belongs
 * to nothing, which is a state the operator has to fix rather than something
 * the app should paper over by inventing a workspace.
 */
export async function membershipFor(email: string): Promise<Membership | null> {
  if (!databaseEnabled || !db) return null;
  try {
    /*
     * The one they are currently in, out of however many they belong to. The
     * choice lives on their account row and is joined here rather than read
     * separately, since this runs on nearly every request.
     *
     * Ordered so the chosen one wins while it is still a membership they have
     * and their oldest wins when it is not, so somebody removed from the
     * business they were last in lands somewhere they still belong.
     */
    const [row] = await db
      .select({
        workspaceId: t.access.workspaceId,
        role: t.access.role,
        permissions: t.access.permissions,
      })
      .from(t.access)
      .leftJoin(t.accounts, eq(t.accounts.userEmail, t.access.email))
      .where(and(eq(t.access.email, clean(email)), isNull(t.access.revokedAt)))
      .orderBy(
        desc(sql`${t.access.workspaceId} = ${t.accounts.activeWorkspaceId}`),
        asc(t.access.createdAt),
      )
      .limit(1);
    if (!row) return null;
    return {
      workspaceId: row.workspaceId,
      role: row.role === "admin" ? "admin" : "member",
      permissions: parsePermissions(row.permissions),
    };
  } catch (error) {
    console.error("[tenancy] could not resolve a workspace", error);
    return null;
  }
}

/** Every business one address can open, oldest first. */
export async function membershipsFor(
  email: string,
): Promise<{ workspaceId: string; name: string; role: "member" | "admin" }[]> {
  if (!databaseEnabled || !db) return [];
  try {
    // tenancy-audit: by address across businesses on purpose. This is the list
    // of what one person may open, which is the question the switcher asks.
    const rows = await db
      .select({
        workspaceId: t.access.workspaceId,
        role: t.access.role,
        name: t.workspaces.name,
      })
      .from(t.access)
      .leftJoin(t.workspaces, eq(t.workspaces.id, t.access.workspaceId))
      .where(and(eq(t.access.email, clean(email)), isNull(t.access.revokedAt)))
      .orderBy(asc(t.access.createdAt));

    return rows.map((row) => ({
      workspaceId: row.workspaceId,
      name: row.name ?? "Untitled",
      role: row.role === "admin" ? "admin" : "member",
    }));
  } catch (error) {
    console.error("[tenancy] could not list workspaces", error);
    return [];
  }
}

/**
 * Moves somebody into one of their own businesses.
 *
 * Refuses anything they are not a member of, so the choice cannot be used to
 * reach a workspace by naming it. Returns whether it took.
 */
export async function chooseWorkspace(email: string, workspaceId: string): Promise<boolean> {
  if (!databaseEnabled || !db) return false;
  const who = clean(email);

  const [allowed] = await db
    .select({ id: t.access.workspaceId })
    .from(t.access)
    .where(
      and(
        eq(t.access.email, who),
        eq(t.access.workspaceId, workspaceId),
        isNull(t.access.revokedAt),
      ),
    )
    .limit(1);
  if (!allowed) return false;

  // tenancy-audit: keyed by the person, because which business they are looking
  // at is a property of them rather than of any one business.
  await db
    .insert(t.accounts)
    .values({ userEmail: who, activeWorkspaceId: workspaceId })
    .onConflictDoUpdate({
      target: t.accounts.userEmail,
      set: { activeWorkspaceId: workspaceId },
    });
  return true;
}

/**
 * The workspace for an address that is allowed in but has no row yet.
 *
 * Only ever reached by an address in ALLOWED_EMAILS, which is the environment
 * escape hatch: that person can always sign in, so they must always land
 * somewhere. Everyone else is invited into a workspace that already exists and
 * never takes this path.
 */
export async function provisionFor(email: string, name: string): Promise<Membership> {
  const database = requireDb();
  const address = clean(email);

  const existing = await membershipFor(address);
  if (existing) return existing;

  const workspaceId = newWorkspaceId();
  await database.transaction(async (tx) => {
    await tx.insert(t.workspaces).values({ id: workspaceId, name, createdBy: address });
    await tx
      .insert(t.settings)
      .values({ workspaceId, companyName: name, companyMark: markFor(name) })
      .onConflictDoNothing({ target: t.settings.workspaceId });
    await tx
      .insert(t.access)
      .values({ email: address, workspaceId, role: "admin", invitedBy: address })
      // Two tabs opening at once would otherwise race here, and the loser
      // would throw on a primary key that is already exactly what it wanted.
      .onConflictDoNothing({ target: [t.access.email, t.access.workspaceId] });
  });

  return (await membershipFor(address)) ?? { workspaceId, role: "admin", permissions: null };
}

/** Every workspace with the people who can open it. The operator's list. */
export async function listWorkspaces(): Promise<WorkspaceRow[]> {
  if (!databaseEnabled || !db) return [];
  const [spaces, members] = await Promise.all([
    db.select().from(t.workspaces).orderBy(desc(t.workspaces.createdAt)),
    db.select().from(t.access).where(isNull(t.access.revokedAt)),
  ]);

  const byWorkspace = new Map<string, WorkspaceRow["members"]>();
  for (const member of members) {
    const list = byWorkspace.get(member.workspaceId) ?? [];
    list.push({
      email: member.email,
      role: member.role === "admin" ? "admin" : "member",
      lastSignedInAt: member.lastSignedInAt?.getTime() ?? null,
    });
    byWorkspace.set(member.workspaceId, list);
  }

  return spaces.map((space) => ({
    id: space.id,
    name: space.name,
    note: space.note,
    createdBy: space.createdBy,
    createdAt: space.createdAt.getTime(),
    members: byWorkspace.get(space.id) ?? [],
  }));
}

/**
 * Creates a business and, optionally, invites its first person.
 *
 * One transaction, because a workspace nobody can open and an invitation into
 * a workspace that does not exist are both worse than the operation failing.
 */
export async function createWorkspace(input: {
  name: string;
  note?: string;
  createdBy: string;
  firstMember?: string;
}): Promise<string> {
  const database = requireDb();
  const id = newWorkspaceId();

  /*
   * One address belongs to one workspace: `email` is the primary key of the
   * access table. Caught here so the operator is told which business already
   * has them, rather than the insert failing on a constraint and the screen
   * saying only that something went wrong.
   */
  if (input.firstMember) {
    const existing = await membershipFor(input.firstMember);
    if (existing) {
      const [named] = await database
        .select({ name: t.workspaces.name })
        .from(t.workspaces)
        .where(eq(t.workspaces.id, existing.workspaceId))
        .limit(1);
      throw new Error(
        `${clean(input.firstMember)} is already in ${named?.name ?? "another business"}. ` +
          "Remove them from it first, or use a different address.",
      );
    }
  }

  await database.transaction(async (tx) => {
    await tx.insert(t.workspaces).values({
      id,
      name: input.name.trim(),
      note: input.note?.trim() || null,
      createdBy: clean(input.createdBy),
    });
    // The workspace's name is the panel's name. Two fields holding the same
    // fact drift, and the customer sees "Your Company" above their own work.
    await tx.insert(t.settings).values({
      workspaceId: id,
      companyName: input.name.trim(),
      companyMark: markFor(input.name),
    });

    if (input.firstMember) {
      await tx.insert(t.access).values({
        email: clean(input.firstMember),
        workspaceId: id,
        // The first person into a business runs it, so they get to invite the
        // rest of their own team without coming back to the operator.
        role: "admin",
        invitedBy: clean(input.createdBy),
      });
    }
  });

  return id;
}

/**
 * Removes a workspace and everything in it.
 *
 * Every table is scoped by workspace id, so this is the one place that has to
 * name all of them. Access rows go too: leaving them would point people at a
 * workspace that no longer exists, which reads as being locked out rather than
 * as having been removed.
 */
export async function deleteWorkspace(workspaceId: string): Promise<void> {
  const database = requireDb();
  await database.transaction(async (tx) => {
    await Promise.all([
      tx.delete(t.messages).where(eq(t.messages.workspaceId, workspaceId)),
      tx.delete(t.conversations).where(eq(t.conversations.workspaceId, workspaceId)),
      tx.delete(t.departments).where(eq(t.departments.workspaceId, workspaceId)),
      tx.delete(t.skills).where(eq(t.skills.workspaceId, workspaceId)),
      tx.delete(t.deliverables).where(eq(t.deliverables.workspaceId, workspaceId)),
      tx.delete(t.files).where(eq(t.files.workspaceId, workspaceId)),
      tx.delete(t.memory).where(eq(t.memory.workspaceId, workspaceId)),
      tx.delete(t.tasks).where(eq(t.tasks.workspaceId, workspaceId)),
      tx.delete(t.wikiPages).where(eq(t.wikiPages.workspaceId, workspaceId)),
      tx.delete(t.allHandsRounds).where(eq(t.allHandsRounds.workspaceId, workspaceId)),
      tx.delete(t.allHandsRuns).where(eq(t.allHandsRuns.workspaceId, workspaceId)),
      tx.delete(t.projects).where(eq(t.projects.workspaceId, workspaceId)),
      tx.delete(t.directMessages).where(eq(t.directMessages.workspaceId, workspaceId)),
      tx.delete(t.profiles).where(eq(t.profiles.workspaceId, workspaceId)),
      tx.delete(t.settings).where(eq(t.settings.workspaceId, workspaceId)),
      tx.delete(t.access).where(eq(t.access.workspaceId, workspaceId)),
    ]);
    await tx.delete(t.workspaces).where(eq(t.workspaces.id, workspaceId));
  });
}

/** How much is in each workspace, for the operator list. */
export async function workspaceTotals(): Promise<
  Record<string, { conversations: number; messages: number }>
> {
  if (!databaseEnabled || !db) return {};
  const rows = await db
    .select({
      workspaceId: t.messages.workspaceId,
      messages: sql<number>`count(*)::int`,
      conversations: sql<number>`count(distinct ${t.messages.conversationId})::int`,
    })
    .from(t.messages)
    .groupBy(t.messages.workspaceId);

  return Object.fromEntries(
    rows.map((row) => [row.workspaceId, { conversations: row.conversations, messages: row.messages }]),
  );
}

/**
 * Renames a business, and the panel with it.
 *
 * Both rows carry the same fact, so both move together. The badge follows only
 * while it still matches the old name: once somebody has set their own two
 * letters, a rename should not overwrite them.
 */
export async function renameWorkspace(workspaceId: string, name: string): Promise<void> {
  const database = requireDb();
  const next = name.trim();
  if (!next) throw new Error("Name the business.");

  await database.transaction(async (tx) => {
    const [current] = await tx
      .select({ name: t.workspaces.name })
      .from(t.workspaces)
      .where(eq(t.workspaces.id, workspaceId))
      .limit(1);

    await tx
      .update(t.workspaces)
      .set({ name: next, updatedAt: new Date() })
      .where(eq(t.workspaces.id, workspaceId));

    const [settings] = await tx
      .select({ mark: t.settings.companyMark })
      .from(t.settings)
      .where(eq(t.settings.workspaceId, workspaceId))
      .limit(1);

    const untouched = !current || settings?.mark === markFor(current.name);
    await tx
      .insert(t.settings)
      .values({
        workspaceId,
        companyName: next,
        companyMark: markFor(next),
      })
      .onConflictDoUpdate({
        target: t.settings.workspaceId,
        set: untouched
          ? { companyName: next, companyMark: markFor(next) }
          : { companyName: next },
      });
  });
}

/** How many people can open this workspace. */
export interface MemberRow {
  email: string;
  role: "member" | "admin";
  displayName: string;
  roleTitle: string;
  presence: "auto" | "online" | "away" | "busy";
  lastSeenAt: number | null;
  lastSignedInAt: number | null;
  invitedBy: string | null;
  createdAt: number;
  /** What they may open. Null means everything, which is most people. */
  permissions: Permissions | null;
}

/**
 * Everyone who can open one business, for that business to manage itself.
 *
 * The operator's list is `listWorkspaces`, which spans every customer. This one
 * is deliberately narrower: it takes the workspace id the caller was resolved
 * to and never a value from a request, so an administrator of one company sees
 * their own people and has no way to name anybody else's.
 *
 * The account row is joined in rather than fetched per person, because a
 * business with twenty people would otherwise be twenty round trips to render
 * one table.
 */
export async function listMembers(workspaceId: string): Promise<MemberRow[]> {
  if (!databaseEnabled || !db) return [];
  const rows = await db
    .select({
      email: t.access.email,
      role: t.access.role,
      invitedBy: t.access.invitedBy,
      createdAt: t.access.createdAt,
      lastSignedInAt: t.access.lastSignedInAt,
      permissions: t.access.permissions,
      displayName: t.accounts.displayName,
      roleTitle: t.accounts.roleTitle,
      presence: t.accounts.presence,
      lastSeenAt: t.accounts.lastSeenAt,
    })
    .from(t.access)
    .leftJoin(t.accounts, eq(t.accounts.userEmail, t.access.email))
    .where(and(eq(t.access.workspaceId, workspaceId), isNull(t.access.revokedAt)))
    .orderBy(t.access.createdAt);

  return rows.map((row) => ({
    email: row.email,
    role: row.role === "admin" ? "admin" : "member",
    displayName: row.displayName ?? "",
    roleTitle: row.roleTitle ?? "",
    presence:
      row.presence === "online" || row.presence === "away" || row.presence === "busy"
        ? row.presence
        : "auto",
    lastSeenAt: row.lastSeenAt?.getTime() ?? null,
    lastSignedInAt: row.lastSignedInAt?.getTime() ?? null,
    invitedBy: row.invitedBy,
    createdAt: row.createdAt.getTime(),
    permissions: parsePermissions(row.permissions),
  }));
}

/** How many administrators a business has, so the last one cannot be demoted. */
export async function countAdmins(workspaceId: string): Promise<number> {
  if (!databaseEnabled || !db) return 0;
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.access)
    .where(
      and(
        eq(t.access.workspaceId, workspaceId),
        eq(t.access.role, "admin"),
        isNull(t.access.revokedAt),
      ),
    );
  return Number(row?.n ?? 0);
}

export async function countMembers(workspaceId: string): Promise<number> {
  if (!databaseEnabled || !db) return 0;
  try {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(t.access)
      .where(and(eq(t.access.workspaceId, workspaceId), isNull(t.access.revokedAt)));
    return Number(row?.n ?? 0);
  } catch {
    return 0;
  }
}
