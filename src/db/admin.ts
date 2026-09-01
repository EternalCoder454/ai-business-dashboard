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

export interface AdminUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface AdminPerson {
  workspaceId: string;
  displayName?: string;
  roleTitle?: string;
  avatarUrl?: string;
  conversations: number;
  messages: number;
  lastActive?: number;
  usage: AdminUsage;
}

export interface AdminOverview {
  people: number;
  signedIn: number;
  conversations: number;
  messages: number;
  deliverables: number;
  projects: number;
  files: number;
  /** Base64 attachment bytes held in the database, which is what grows. */
  storageBytes: number;
  usage: AdminUsage;
}

const NO_USAGE: AdminUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

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
        email: t.conversations.workspaceId,
        conversations: sql<number>`count(distinct ${t.conversations.id})::int`,
        lastActive: sql<number>`max(extract(epoch from ${t.conversations.updatedAt}) * 1000)::bigint`,
      })
      .from(t.conversations)
      .groupBy(t.conversations.workspaceId),
  ]);

  const messageCounts = await db
    .select({
      email: t.messages.workspaceId,
      messages: sql<number>`count(*)::int`,
    })
    .from(t.messages)
    .groupBy(t.messages.workspaceId);

  const spend = await db
    .select({
      email: t.messages.workspaceId,
      input: sql<number>`coalesce(sum(${t.messages.inputTokens}), 0)::bigint`,
      output: sql<number>`coalesce(sum(${t.messages.outputTokens}), 0)::bigint`,
      cacheRead: sql<number>`coalesce(sum(${t.messages.cacheReadTokens}), 0)::bigint`,
      cacheWrite: sql<number>`coalesce(sum(${t.messages.cacheWriteTokens}), 0)::bigint`,
    })
    .from(t.messages)
    .groupBy(t.messages.workspaceId);

  const byWorkspace = new Map<string, AdminPerson>();
  const slot = (workspaceId: string): AdminPerson => {
    const key = workspaceId.toLowerCase();
    const found = byWorkspace.get(key);
    if (found) return found;
    const created: AdminPerson = {
      workspaceId: key,
      conversations: 0,
      messages: 0,
      usage: { ...NO_USAGE },
    };
    byWorkspace.set(key, created);
    return created;
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
  for (const row of spend) {
    slot(row.email).usage = {
      input: Number(row.input),
      output: Number(row.output),
      cacheRead: Number(row.cacheRead),
      cacheWrite: Number(row.cacheWrite),
    };
  }

  return [...byWorkspace.values()].sort(
    (a, b) => (b.lastActive ?? 0) - (a.lastActive ?? 0),
  );
}

/** Conversation headers for one person, newest first. */
export async function listConversationsFor(workspaceId: string): Promise<AdminConversation[]> {
  const db = requireDb();
  const owner = workspaceId.toLowerCase();

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
        eq(t.messages.workspaceId, t.conversations.workspaceId),
        eq(t.messages.conversationId, t.conversations.id),
      ),
    )
    .where(eq(t.conversations.workspaceId, owner))
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
  workspaceId: string,
  conversationId: string,
): Promise<{ title: string; departmentId: string; messages: Message[] } | null> {
  const db = requireDb();
  const owner = workspaceId.toLowerCase();

  const [conversation] = await db
    .select()
    .from(t.conversations)
    .where(and(eq(t.conversations.workspaceId, owner), eq(t.conversations.id, conversationId)))
    .limit(1);

  if (!conversation) return null;

  const rows = await db
    .select()
    .from(t.messages)
    .where(and(eq(t.messages.workspaceId, owner), eq(t.messages.conversationId, conversationId)))
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
      model: row.model ?? undefined,
      usage:
        row.outputTokens || row.inputTokens
          ? {
              input: row.inputTokens,
              output: row.outputTokens,
              cacheRead: row.cacheReadTokens,
              cacheWrite: row.cacheWriteTokens,
            }
          : undefined,
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
  workspaceId: string,
): Promise<Record<string, string>> {
  const db = requireDb();
  const rows = await db
    .select({ id: t.departments.id, name: t.departments.name, personaName: t.departments.personaName })
    .from(t.departments)
    .where(eq(t.departments.workspaceId, workspaceId.toLowerCase()));

  return Object.fromEntries(
    rows.map((row) => [row.id, row.personaName ? `${row.personaName}, ${row.name}` : row.name]),
  );
}

/** One row of totals for the whole workspace. */
export async function overview(): Promise<AdminOverview> {
  const db = requireDb();
  const count = sql<number>`count(*)::int`;

  const [people, conversations, messages, deliverables, projects, files, usage] =
    await Promise.all([
      db.select({ n: sql<number>`count(distinct ${t.conversations.workspaceId})::int` }).from(t.conversations),
      db.select({ n: count }).from(t.conversations),
      db.select({ n: count }).from(t.messages),
      db.select({ n: count }).from(t.deliverables),
      db.select({ n: count }).from(t.projects),
      db
        .select({
          n: count,
          bytes: sql<number>`coalesce(sum(length(${t.files.data})), 0)::bigint`,
        })
        .from(t.files),
      db
        .select({
          input: sql<number>`coalesce(sum(${t.messages.inputTokens}), 0)::bigint`,
          output: sql<number>`coalesce(sum(${t.messages.outputTokens}), 0)::bigint`,
          cacheRead: sql<number>`coalesce(sum(${t.messages.cacheReadTokens}), 0)::bigint`,
          cacheWrite: sql<number>`coalesce(sum(${t.messages.cacheWriteTokens}), 0)::bigint`,
        })
        .from(t.messages),
    ]);

  const accounts = await db.select({ n: count }).from(t.accounts);

  return {
    people: Number(people[0]?.n ?? 0),
    signedIn: Number(accounts[0]?.n ?? 0),
    conversations: Number(conversations[0]?.n ?? 0),
    messages: Number(messages[0]?.n ?? 0),
    deliverables: Number(deliverables[0]?.n ?? 0),
    projects: Number(projects[0]?.n ?? 0),
    files: Number(files[0]?.n ?? 0),
    // Base64 is four characters for every three bytes.
    storageBytes: Math.round(Number(files[0]?.bytes ?? 0) * 0.75),
    usage: {
      input: Number(usage[0]?.input ?? 0),
      output: Number(usage[0]?.output ?? 0),
      cacheRead: Number(usage[0]?.cacheRead ?? 0),
      cacheWrite: Number(usage[0]?.cacheWrite ?? 0),
    },
  };
}

/** What one person's workspace holds, beyond their conversations. */
export async function detailFor(workspaceId: string): Promise<{
  deliverables: number;
  projects: number;
  files: number;
  skills: number;
  departments: number;
  storageBytes: number;
}> {
  const db = requireDb();
  const owner = workspaceId.toLowerCase();
  const count = sql<number>`count(*)::int`;

  // Written out per table: drizzle types each table's userEmail column against
  // its own table name, so a shared helper cannot accept all of them.
  const [deliverables, projects, files, skills, departments] = await Promise.all([
    db.select({ n: count }).from(t.deliverables).where(eq(t.deliverables.workspaceId, owner)),
    db.select({ n: count }).from(t.projects).where(eq(t.projects.workspaceId, owner)),
    db
      .select({ n: count, bytes: sql<number>`coalesce(sum(length(${t.files.data})), 0)::bigint` })
      .from(t.files)
      .where(eq(t.files.workspaceId, owner)),
    db.select({ n: count }).from(t.skills).where(eq(t.skills.workspaceId, owner)),
    db.select({ n: count }).from(t.departments).where(eq(t.departments.workspaceId, owner)),
  ]);

  return {
    deliverables: Number(deliverables[0]?.n ?? 0),
    projects: Number(projects[0]?.n ?? 0),
    files: Number(files[0]?.n ?? 0),
    skills: Number(skills[0]?.n ?? 0),
    departments: Number(departments[0]?.n ?? 0),
    storageBytes: Math.round(Number(files[0]?.bytes ?? 0) * 0.75),
  };
}

/**
 * Removes everything belonging to one address.
 *
 * Offboarding, and the only write in this module. Direct messages are included
 * here even though they are not readable above: leaving a departed person's
 * messages behind would be worse than deleting them, and deletion does not
 * require anyone to have read them.
 */
export async function deleteEverythingFor(workspaceId: string): Promise<void> {
  const db = requireDb();
  const owner = workspaceId.toLowerCase();

  await db.transaction(async (tx) => {
    await tx.delete(t.messages).where(eq(t.messages.workspaceId, owner));
    await tx.delete(t.conversations).where(eq(t.conversations.workspaceId, owner));
    await tx.delete(t.allHandsRounds).where(eq(t.allHandsRounds.workspaceId, owner));
    await tx.delete(t.allHandsRuns).where(eq(t.allHandsRuns.workspaceId, owner));
    await tx.delete(t.deliverables).where(eq(t.deliverables.workspaceId, owner));
    await tx.delete(t.projects).where(eq(t.projects.workspaceId, owner));
    await tx.delete(t.files).where(eq(t.files.workspaceId, owner));
    await tx.delete(t.skills).where(eq(t.skills.workspaceId, owner));
    await tx.delete(t.departments).where(eq(t.departments.workspaceId, owner));
    await tx.delete(t.settings).where(eq(t.settings.workspaceId, owner));
    await tx.delete(t.profiles).where(eq(t.profiles.workspaceId, owner));
    await tx.delete(t.accounts).where(eq(t.accounts.userEmail, owner));
    await tx
      .delete(t.directMessages)
      .where(
        sql`${t.directMessages.fromEmail} = ${owner} or ${t.directMessages.toEmail} = ${owner}`,
      );
  });
}
