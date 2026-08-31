import { and, asc, eq, inArray } from "drizzle-orm";
import { requireDb } from "./client";
import * as t from "./schema";
import type { Conversation, Message, Project } from "@/lib/types";

/**
 * Projects shared between accounts.
 *
 * A project's rows stay stored under the owner's address; membership grants
 * other people access to them rather than copying anything. That keeps one
 * canonical copy of a conversation, which is the whole point when two people
 * are writing into it.
 */

const lower = (email: string) => email.trim().toLowerCase();

export interface Membership {
  projectId: string;
  ownerEmail: string;
}

/** Projects belonging to other people that this account has been added to. */
export async function membershipsFor(email: string): Promise<Membership[]> {
  const db = requireDb();
  const rows = await db
    .select({ projectId: t.projectMembers.projectId, ownerEmail: t.projectMembers.ownerEmail })
    .from(t.projectMembers)
    .where(eq(t.projectMembers.memberEmail, lower(email)));

  // A project can only be shared by its owner, so a row where the two match is
  // meaningless and would make the owner appear as their own guest.
  return rows.filter((row) => row.ownerEmail !== lower(email));
}

/** Who each of this account's own projects is shared with. */
export async function sharesByProject(
  ownerEmail: string,
): Promise<Record<string, string[]>> {
  const db = requireDb();
  const rows = await db
    .select({ projectId: t.projectMembers.projectId, memberEmail: t.projectMembers.memberEmail })
    .from(t.projectMembers)
    .where(eq(t.projectMembers.ownerEmail, lower(ownerEmail)));

  const byProject: Record<string, string[]> = {};
  for (const row of rows) {
    (byProject[row.projectId] ??= []).push(row.memberEmail);
  }
  return byProject;
}

/**
 * The shared projects and conversations to fold into a workspace snapshot.
 *
 * Loaded per owner rather than in one query, because rows are scoped by owner
 * and mixing them would need a join on a pair of columns for no gain at this
 * size. Someone in a dozen shared projects is the extreme case.
 */
export async function loadSharedInto(
  email: string,
): Promise<{ projects: Project[]; conversations: Conversation[] }> {
  const memberships = await membershipsFor(email);
  if (memberships.length === 0) return { projects: [], conversations: [] };

  const db = requireDb();
  const byOwner = new Map<string, string[]>();
  for (const m of memberships) {
    byOwner.set(m.ownerEmail, [...(byOwner.get(m.ownerEmail) ?? []), m.projectId]);
  }

  const projects: Project[] = [];
  const conversations: Conversation[] = [];

  for (const [ownerEmail, projectIds] of byOwner) {
    const [projectRows, conversationRows] = await Promise.all([
      db
        .select()
        .from(t.projects)
        .where(and(eq(t.projects.userEmail, ownerEmail), inArray(t.projects.id, projectIds))),
      db
        .select()
        .from(t.conversations)
        .where(
          and(
            eq(t.conversations.userEmail, ownerEmail),
            inArray(t.conversations.projectId, projectIds),
          ),
        ),
    ]);

    for (const row of projectRows) {
      projects.push({
        id: row.id,
        name: row.name,
        summary: row.summary,
        status: row.status as Project["status"],
        accent: row.accent,
        dueOn: row.dueOn,
        createdAt: row.createdAt.getTime(),
        updatedAt: row.updatedAt.getTime(),
        ownerEmail,
      });
    }

    if (conversationRows.length === 0) continue;

    const messageRows = await db
      .select()
      .from(t.messages)
      .where(
        and(
          eq(t.messages.userEmail, ownerEmail),
          inArray(
            t.messages.conversationId,
            conversationRows.map((row) => row.id),
          ),
        ),
      )
      .orderBy(asc(t.messages.sentAt));

    const byConversation = new Map<string, Message[]>();
    for (const row of messageRows) {
      const list = byConversation.get(row.conversationId) ?? [];
      list.push({
        id: row.id,
        role: row.role as Message["role"],
        content: row.content,
        thinking: row.thinking ?? undefined,
        error: row.isError || undefined,
        timestamp: row.sentAt,
        authorEmail: row.authorEmail ?? undefined,
        model: row.model ?? undefined,
      });
      byConversation.set(row.conversationId, list);
    }

    for (const row of conversationRows) {
      conversations.push({
        id: row.id,
        departmentId: row.departmentId,
        projectId: row.projectId ?? undefined,
        title: row.title,
        messages: byConversation.get(row.id) ?? [],
        createdAt: row.createdAt.getTime(),
        updatedAt: row.updatedAt.getTime(),
        ownerEmail,
      });
    }
  }

  return { projects, conversations };
}

/**
 * The owner a write should be scoped to.
 *
 * Returns the caller for anything they own, the project owner when they are
 * writing into a conversation shared with them, and null when they have no
 * business touching it at all. Every shared write goes through here.
 */
export async function resolveConversationOwner(
  email: string,
  conversationId: string,
): Promise<string | null> {
  const me = lower(email);
  const db = requireDb();

  const [own] = await db
    .select({ id: t.conversations.id })
    .from(t.conversations)
    .where(and(eq(t.conversations.userEmail, me), eq(t.conversations.id, conversationId)))
    .limit(1);
  if (own) return me;

  const memberships = await membershipsFor(me);
  if (memberships.length === 0) return null;

  // One query rather than one per membership. This runs on every message
  // anyone sends, and each round trip to a serverless database is real
  // latency, so the loop that was here cost more than the work it did.
  const rows = await db
    .select({ owner: t.conversations.userEmail, projectId: t.conversations.projectId })
    .from(t.conversations)
    .where(
      and(
        eq(t.conversations.id, conversationId),
        inArray(
          t.conversations.projectId,
          memberships.map((m) => m.projectId),
        ),
      ),
    );

  // A project id alone is not proof: the row has to belong to the owner this
  // account was actually added by, or a shared id would open someone else's.
  const allowed = new Set(memberships.map((m) => `${m.ownerEmail}::${m.projectId}`));
  for (const row of rows) {
    if (row.projectId && allowed.has(`${row.owner}::${row.projectId}`)) return row.owner;
  }

  // Not theirs and not in anything shared with them. A new conversation they
  // are creating lands here too, and belongs to them.
  return null;
}

/** Shares a project. Only its owner may do this. */
export async function shareProject(
  ownerEmail: string,
  projectId: string,
  memberEmail: string,
): Promise<boolean> {
  const owner = lower(ownerEmail);
  const member = lower(memberEmail);
  if (owner === member) return false;

  const db = requireDb();
  const [project] = await db
    .select({ id: t.projects.id })
    .from(t.projects)
    .where(and(eq(t.projects.userEmail, owner), eq(t.projects.id, projectId)))
    .limit(1);
  if (!project) return false;

  await db
    .insert(t.projectMembers)
    .values({ projectId, ownerEmail: owner, memberEmail: member })
    .onConflictDoNothing();
  return true;
}

export async function unshareProject(
  ownerEmail: string,
  projectId: string,
  memberEmail: string,
): Promise<void> {
  const db = requireDb();
  await db
    .delete(t.projectMembers)
    .where(
      and(
        eq(t.projectMembers.ownerEmail, lower(ownerEmail)),
        eq(t.projectMembers.projectId, projectId),
        eq(t.projectMembers.memberEmail, lower(memberEmail)),
      ),
    );
}

/** Everyone who can see a conversation, for polling and for the header. */
export async function participantsOf(
  ownerEmail: string,
  projectId: string | null,
): Promise<string[]> {
  const owner = lower(ownerEmail);
  if (!projectId) return [owner];
  const db = requireDb();
  const rows = await db
    .select({ memberEmail: t.projectMembers.memberEmail })
    .from(t.projectMembers)
    .where(
      and(eq(t.projectMembers.ownerEmail, owner), eq(t.projectMembers.projectId, projectId)),
    );
  return [owner, ...rows.map((row) => row.memberEmail)];
}
