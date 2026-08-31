import { and, asc, desc, eq, sql } from "drizzle-orm";
import { requireDb } from "./client";
import * as t from "./schema";
import type { Message } from "@/lib/types";

/**
 * Read-only views across every account, for an administrator.
 *
 * Deliberately its own module with no write path. Everything else in the app
 * reaches the database through a repository scoped to one signed-in address;
 * this is the one place that reads past that boundary, so it is easier to audit
 * if it cannot do anything but read.
 *
 * Direct messages are not here. A conversation with a department head is work
 * product on a company tool; a message to a colleague is not the same thing,
 * and reading one should be a separate, deliberate decision rather than
 * something that arrives with an unrelated feature.
 */

export interface AdminPerson {
  email: string;
  displayName?: string;
  roleTitle?: string;
  avatarUrl?: string;
  conversations: number;
  messages: number;
  lastActive?: number;
}

export interface AdminConversation {
  id: string;
  departmentId: string;
  title: string;
  messageCount: number;
  updatedAt: number;
}

/** Everyone with a workspace, whether or not they have used it yet. */
export async function listPeople(): Promise<AdminPerson[]> {
  const db = requireDb();

  const [accounts, activity] = await Promise.all([
    db.select().from(t.accounts),
    db
      .select({
        email: t.conversations.userEmail,
        conversations: sql<number>`count(distinct ${t.conversations.id})::int`,
        lastActive: sql<number>`max(extract(epoch from ${t.conversations.updatedAt}) * 1000)::bigint`,
      })
      .from(t.conversations)
      .groupBy(t.conversations.userEmail),
  ]);

  const messageCounts = await db
    .select({
      email: t.messages.userEmail,
      messages: sql<number>`count(*)::int`,
    })
    .from(t.messages)
    .groupBy(t.messages.userEmail);

  const byEmail = new Map<string, AdminPerson>();
  const slot = (email: string) => {
    const key = email.toLowerCase();
    let found = byEmail.get(key);
    if (!found) {
      found = { email: key, conversations: 0, messages: 0 };
      byEmail.set(key, found);
    }
    return found;
  };

  for (const row of accounts) {
    const person = slot(row.userEmail);
    person.displayName = row.displayName || undefined;
    person.roleTitle = row.roleTitle || undefined;
    person.avatarUrl = row.avatarUrl ?? undefined;
  }
  for (const row of activity) {
    const person = slot(row.email);
    person.conversations = Number(row.conversations);
    person.lastActive = row.lastActive ? Number(row.lastActive) : undefined;
  }
  for (const row of messageCounts) {
    slot(row.email).messages = Number(row.messages);
  }

  return [...byEmail.values()].sort(
    (a, b) => (b.lastActive ?? 0) - (a.lastActive ?? 0),
  );
}

/** Conversation headers for one person, newest first. */
export async function listConversationsFor(email: string): Promise<AdminConversation[]> {
  const db = requireDb();
  const owner = email.toLowerCase();

  const rows = await db
    .select({
      id: t.conversations.id,
      departmentId: t.conversations.departmentId,
      title: t.conversations.title,
      updatedAt: t.conversations.updatedAt,
      messageCount: sql<number>`count(${t.messages.id})::int`,
    })
    .from(t.conversations)
    .leftJoin(
      t.messages,
      and(
        eq(t.messages.userEmail, t.conversations.userEmail),
        eq(t.messages.conversationId, t.conversations.id),
      ),
    )
    .where(eq(t.conversations.userEmail, owner))
    .groupBy(
      t.conversations.id,
      t.conversations.departmentId,
      t.conversations.title,
      t.conversations.updatedAt,
    )
    .orderBy(desc(t.conversations.updatedAt));

  return rows
    .filter((row) => Number(row.messageCount) > 0)
    .map((row) => ({
      id: row.id,
      departmentId: row.departmentId,
      title: row.title,
      messageCount: Number(row.messageCount),
      updatedAt: row.updatedAt.getTime(),
    }));
}

/**
 * One conversation in full.
 *
 * Attachment bytes are left behind and only the file name is kept. An
 * administrator reading a thread needs to know a screenshot was sent, not to
 * pull every image in the company down the wire.
 */
export async function readConversation(
  email: string,
  conversationId: string,
): Promise<{ title: string; departmentId: string; messages: Message[] } | null> {
  const db = requireDb();
  const owner = email.toLowerCase();

  const [conversation] = await db
    .select()
    .from(t.conversations)
    .where(and(eq(t.conversations.userEmail, owner), eq(t.conversations.id, conversationId)))
    .limit(1);

  if (!conversation) return null;

  const rows = await db
    .select()
    .from(t.messages)
    .where(and(eq(t.messages.userEmail, owner), eq(t.messages.conversationId, conversationId)))
    .orderBy(asc(t.messages.sentAt));

  return {
    title: conversation.title,
    departmentId: conversation.departmentId,
    messages: rows.map((row) => ({
      id: row.id,
      role: row.role as Message["role"],
      content: row.content,
      thinking: row.thinking ?? undefined,
      error: row.isError || undefined,
      timestamp: row.sentAt,
      attachments: row.attachmentIds.length
        ? row.attachmentIds.map((id) => ({
            id,
            kind: "image" as const,
            mediaType: "",
            name: `${row.attachmentIds.length} attachment${row.attachmentIds.length === 1 ? "" : "s"}`,
            data: "",
            width: 0,
            height: 0,
          }))
        : undefined,
    })),
  };
}

/** Department names for one person, so their conversations can be labelled. */
export async function departmentNamesFor(
  email: string,
): Promise<Record<string, string>> {
  const db = requireDb();
  const rows = await db
    .select({ id: t.departments.id, name: t.departments.name, personaName: t.departments.personaName })
    .from(t.departments)
    .where(eq(t.departments.userEmail, email.toLowerCase()));

  return Object.fromEntries(
    rows.map((row) => [row.id, row.personaName ? `${row.personaName}, ${row.name}` : row.name]),
  );
}
