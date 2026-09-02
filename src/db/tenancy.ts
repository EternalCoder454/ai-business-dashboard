import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { databaseEnabled, db, requireDb } from "./client";
import * as t from "./schema";

export interface Membership {
  workspaceId: string;
  role: "member" | "admin";
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
    const [row] = await db
      .select({ workspaceId: t.access.workspaceId, role: t.access.role })
      .from(t.access)
      .where(and(eq(t.access.email, clean(email)), isNull(t.access.revokedAt)))
      .limit(1);
    if (!row) return null;
    return { workspaceId: row.workspaceId, role: row.role === "admin" ? "admin" : "member" };
  } catch (error) {
    console.error("[tenancy] could not resolve a workspace", error);
    return null;
  }
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
      .insert(t.access)
      .values({ email: address, workspaceId, role: "admin", invitedBy: address })
      // Two tabs opening at once would otherwise race here, and the loser
      // would throw on a primary key that is already exactly what it wanted.
      .onConflictDoNothing({ target: t.access.email });
  });

  return (await membershipFor(address)) ?? { workspaceId, role: "admin" };
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
      tx.delete(t.projectMembers).where(eq(t.projectMembers.workspaceId, workspaceId)),
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
