import { and, asc, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { requireDb } from "./client";
import * as t from "./schema";
import { forgetBlobs } from "./blobs";
import type { Message } from "@/lib/types";

/**
 * Read-only views across every account, for an administrator.
 *
 * The one place that reads past the per-address boundary, so it deliberately
 * has no write path and is easier to audit for it.
 *
 * Direct messages stay out. Reading a colleague's messages should be a
 * separate, deliberate decision, not something that arrives with a feature.
 */

export interface AdminUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface AdminMember {
  email: string;
  role: "member" | "admin";
  displayName: string;
  /** What the person set by hand, or "auto" to let the heartbeat decide. */
  presence: "auto" | "online" | "away" | "busy";
  /** Last overview poll, which is the heartbeat. Null until they arrive. */
  lastSeenAt: number | null;
  lastSignedInAt: number | null;
}

export interface AdminPerson {
  workspaceId: string;
  /** The business's name. Absent only for a workspace row with no record. */
  name?: string;
  /** How many people can open it. */
  people?: number;
  /** Who they are, so a client is a list of names rather than a count. */
  members?: AdminMember[];
  createdAt?: number;
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
  /**
   * The things somebody has to do something about, as opposed to the things
   * that are merely true. Everything above is a total that goes up on its own;
   * these are the ones with a person waiting at the end of them.
   */
  waiting: {
    reports: number;
    urgentReports: number;
    feedback: number;
    /** The last nightly tick, so an absence is visible rather than silent. */
    cronAt: number | null;
  };
  /** The last day of behaviour, which is the question "is it working now". */
  health: {
    calls: number;
    errors: number;
    refused: number;
    slow: number;
  };
  businesses: {
    total: number;
    /** Somebody sent something in the last week. */
    active: number;
    /** Nothing in a month, which is the shape of a customer leaving. */
    quiet: number;
  };
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

  const [businesses, members, activity] = await Promise.all([
    // Every business, so one with no activity yet still appears. It is a
    // client either way, and an empty row is the useful thing to see.
    db.select({ id: t.workspaces.id, name: t.workspaces.name, createdAt: t.workspaces.createdAt })
      .from(t.workspaces),
    // Joined to the account row rather than fetched per person: a client with
    // twenty people would otherwise be twenty round trips to draw one card.
    db
      .select({
        workspaceId: t.access.workspaceId,
        email: t.access.email,
        role: t.access.role,
        lastSignedInAt: t.access.lastSignedInAt,
        displayName: t.accounts.displayName,
        presence: t.accounts.presence,
        lastSeenAt: t.accounts.lastSeenAt,
      })
      .from(t.access)
      .leftJoin(t.accounts, eq(t.accounts.userEmail, t.access.email))
      .where(isNull(t.access.revokedAt)),
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
      people: 0,
      conversations: 0,
      messages: 0,
      usage: { ...NO_USAGE },
    };
    byWorkspace.set(key, created);
    return created;
  };

  /*
   * Businesses first, so the list is every client rather than only the ones
   * that have said something. This loop used to read the accounts table and
   * key it by address into a map keyed by workspace id, which invented a
   * client per person and gave the real ones somebody's display name.
   */
  for (const row of businesses) {
    const client = slot(row.id);
    client.name = row.name;
    client.createdAt = row.createdAt.getTime();
  }
  for (const row of members) {
    const client = slot(row.workspaceId);
    client.people = (client.people ?? 0) + 1;
    client.members = [
      ...(client.members ?? []),
      {
        email: row.email,
        role: row.role === "admin" ? "admin" : "member",
        displayName: row.displayName ?? "",
        presence:
          row.presence === "online" || row.presence === "away" || row.presence === "busy"
            ? row.presence
            : "auto",
        lastSeenAt: row.lastSeenAt?.getTime() ?? null,
        lastSignedInAt: row.lastSignedInAt?.getTime() ?? null,
      },
    ];
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

  // tenancy-audit: totals across every business, which is what an overview of
  // the deployment is. Reachable only through the operator-gated admin route.
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

  const now = Date.now();
  const day = now - 86_400_000;
  const week = now - 7 * 86_400_000;
  const month = now - 30 * 86_400_000;

  /*
   * The second half: what needs a person, and whether it is working. Separate
   * from the totals above because a count tells you how big this is and an
   * open report tells you somebody is waiting. The screen leads with the
   * second kind.
   */
  // tenancy-audit: across every business, which is what an operator's overview
  // is, and the route above is gated on isOperator.
  const [openReports, urgentReports, newFeedback, tick, day1, spaces, lively] =
    await Promise.all([
      db.select({ n: count }).from(t.reports).where(eq(t.reports.status, "new")),
      db
        .select({ n: count })
        .from(t.reports)
        .where(and(eq(t.reports.status, "new"), eq(t.reports.severity, "high"))),
      db.select({ n: count }).from(t.feedback).where(eq(t.feedback.status, "new")),
      db
        .select({ at: sql<number>`max(${t.telemetry.bucket})::bigint` })
        .from(t.telemetry)
        .where(eq(t.telemetry.operation, "cron.tick")),
      db
        .select({
          calls: sql<number>`coalesce(sum(${t.telemetry.calls}), 0)::int`,
          errors: sql<number>`coalesce(sum(${t.telemetry.errors}), 0)::int`,
          refused: sql<number>`coalesce(sum(${t.telemetry.refused}), 0)::int`,
          slow: sql<number>`coalesce(sum(${t.telemetry.slow}), 0)::int`,
        })
        .from(t.telemetry)
        .where(gte(t.telemetry.bucket, day)),
      db.select({ n: count }).from(t.workspaces),
      // One row per business that has said anything, with when it last did.
      db
        .select({
          ws: t.messages.workspaceId,
          at: sql<number>`max(${t.messages.sentAt})::bigint`,
        })
        .from(t.messages)
        .groupBy(t.messages.workspaceId),
    ]);

  const lastSpoke = lively.map((row) => Number(row.at));
  const total = Number(spaces[0]?.n ?? 0);

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
    waiting: {
      reports: Number(openReports[0]?.n ?? 0),
      urgentReports: Number(urgentReports[0]?.n ?? 0),
      feedback: Number(newFeedback[0]?.n ?? 0),
      cronAt: tick[0]?.at == null ? null : Number(tick[0].at),
    },
    health: {
      calls: Number(day1[0]?.calls ?? 0),
      errors: Number(day1[0]?.errors ?? 0),
      refused: Number(day1[0]?.refused ?? 0),
      slow: Number(day1[0]?.slow ?? 0),
    },
    businesses: {
      total,
      active: lastSpoke.filter((at) => at >= week).length,
      // A business that has never said anything counts as quiet: it is the
      // same problem as one that stopped, and arguably a worse one.
      quiet: total - lastSpoke.filter((at) => at >= month).length,
    },
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

  // Cleared after the transaction. A store having a bad day must not stop a
  // business being deleted when somebody asked for it to be.
  const blobs: string[] = [];

  /*
   * Anything holding a workspace_id belongs in this list. `npm run
   * tenancy-audit` compares it against the schema and fails when they
   * disagree, because a table missed here outlives the business it belonged to.
   */
  await db.transaction(async (tx) => {
    // The work.
    await tx.delete(t.messages).where(eq(t.messages.workspaceId, owner));
    await tx.delete(t.conversations).where(eq(t.conversations.workspaceId, owner));
    await tx.delete(t.allHandsRounds).where(eq(t.allHandsRounds.workspaceId, owner));
    await tx.delete(t.allHandsRuns).where(eq(t.allHandsRuns.workspaceId, owner));
    await tx.delete(t.deliverables).where(eq(t.deliverables.workspaceId, owner));
    await tx.delete(t.projects).where(eq(t.projects.workspaceId, owner));
    // Where this business kept its bytes, read before the rows that say so go.
    blobs.push(
      ...(
        await tx
          .select({ url: t.files.blobUrl })
          .from(t.files)
          .where(eq(t.files.workspaceId, owner))
      ).map((row) => row.url),
    );
    await tx.delete(t.files).where(eq(t.files.workspaceId, owner));
    await tx.delete(t.skills).where(eq(t.skills.workspaceId, owner));
    await tx.delete(t.tasks).where(eq(t.tasks.workspaceId, owner));
    await tx.delete(t.wikiPages).where(eq(t.wikiPages.workspaceId, owner));
    await tx.delete(t.memory).where(eq(t.memory.workspaceId, owner));
    await tx.delete(t.departments).where(eq(t.departments.workspaceId, owner));

    // What people said to each other. By workspace, not by address: `owner` is
    // a workspace id, and the version that compared it to an email deleted
    // nothing at all.
    await tx.delete(t.directMessages).where(eq(t.directMessages.workspaceId, owner));

    // The rhythms, and what they produced.
    await tx.delete(t.briefings).where(eq(t.briefings.workspaceId, owner));
    await tx.delete(t.schedules).where(eq(t.schedules.workspaceId, owner));

    // Credentials and anything holding one. An api_keys row left behind is a
    // token that still authenticates.
    await tx.delete(t.apiKeys).where(eq(t.apiKeys.workspaceId, owner));
    await tx.delete(t.idempotency).where(eq(t.idempotency.workspaceId, owner));
    await tx.delete(t.googleConnections).where(eq(t.googleConnections.workspaceId, owner));

    // The reviewer's record of this business, and where it had read up to.
    await tx.delete(t.reports).where(eq(t.reports.workspaceId, owner));
    await tx.delete(t.reviewCursors).where(eq(t.reviewCursors.workspaceId, owner));

    // How it behaved. Counts and timings rather than anything anybody wrote,
    // but they are still this business's rows and a deleted business should
    // not go on appearing in the health screen.
    await tx.delete(t.telemetry).where(eq(t.telemetry.workspaceId, owner));

    // Settings last of the scoped tables, since the model keys live there.
    await tx.delete(t.settings).where(eq(t.settings.workspaceId, owner));
    await tx.delete(t.profiles).where(eq(t.profiles.workspaceId, owner));

    /*
     * Accounts and feedback stay: an account is the person rather than the
     * business, and feedback was written to us rather than to them. Access
     * rows are removed by deleteWorkspace, which calls this first.
     */
  });

  // After the rows. A business deleted with its files left in the store would
  // be paying for a company that no longer exists.
  await forgetBlobs(blobs);
}

