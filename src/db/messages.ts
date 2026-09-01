import { and, asc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { ALLOWED_EMAILS } from "@/auth";
import { requireDb } from "./client";
import * as t from "./schema";
import type { Colleague, DirectMessage, MessageThread } from "@/lib/types";

/**
 * Direct messages sit apart from the workspace repository on purpose.
 *
 * Everything in repo.ts belongs to exactly one account and is loaded as one
 * snapshot. A message belongs to two accounts and arrives while you are looking
 * at it, so it is queried directly and polled rather than folded into a
 * snapshot that would then be stale the moment someone replied.
 */

/** Addresses are compared lowercased everywhere, so they are stored that way. */
const normalise = (email: string) => email.trim().toLowerCase();

/**
 * One stable key per pair, whichever direction a message travels.
 *
 * Sorting is the whole point: without it, A writing to B and B writing to A
 * would land in two different threads that never saw each other.
 */
export function threadKeyFor(a: string, b: string): string {
  return [normalise(a), normalise(b)].sort().join("|");
}

/** The other address in a thread key, given one of them. */
function counterpart(threadKey: string, self: string): string {
  const [a, b] = threadKey.split("|");
  return a === normalise(self) ? b : a;
}

/**
 * Everyone this person is allowed to write to.
 *
 * Drawn from the allowlist, which is the real boundary, unioned with anyone who
 * has actually signed in so their name and picture can be shown. Someone on the
 * allowlist who has never signed in still appears, because otherwise there is
 * no way to start the conversation that would make them appear.
 */
export async function listColleagues(self: string): Promise<Colleague[]> {
  const db = requireDb();
  const me = normalise(self);

  const rows = await db
    .select({
      userEmail: t.accounts.userEmail,
      displayName: t.accounts.displayName,
      roleTitle: t.accounts.roleTitle,
      avatarUrl: t.accounts.avatarUrl,
    })
    .from(t.accounts);

  const known = new Map(rows.map((row) => [normalise(row.userEmail), row]));
  const everyone = new Set([...ALLOWED_EMAILS, ...known.keys()]);
  everyone.delete(me);

  return [...everyone]
    .map((email) => {
      const row = known.get(email);
      return {
        email,
        displayName: row?.displayName || undefined,
        roleTitle: row?.roleTitle || undefined,
        avatarUrl: row?.avatarUrl ?? undefined,
        hasSignedIn: Boolean(row),
      };
    })
    .sort((a, b) =>
      (a.displayName ?? a.email).localeCompare(b.displayName ?? b.email),
    );
}

/**
 * Every thread this person is part of, newest first, with unread counts.
 *
 * DISTINCT ON is doing the work: one row per thread, and because the ordering
 * inside the thread is by sent_at descending, the row it keeps is the latest
 * message. Fetching every message and reducing in JavaScript would return the
 * entire history to answer a question about its last line.
 */
export async function listThreads(self: string): Promise<MessageThread[]> {
  const db = requireDb();
  const me = normalise(self);

  const latest = await db.execute<{
    thread_key: string;
    from_email: string;
    to_email: string;
    body: string;
    sent_at: string | number;
  }>(sql`
    SELECT DISTINCT ON (thread_key) thread_key, from_email, to_email, body, sent_at
    FROM direct_messages
    WHERE from_email = ${me} OR to_email = ${me}
    ORDER BY thread_key, sent_at DESC
  `);

  const unread = await db
    .select({ from: t.directMessages.fromEmail, count: sql<number>`count(*)::int` })
    .from(t.directMessages)
    .where(and(eq(t.directMessages.toEmail, me), isNull(t.directMessages.readAt)))
    .groupBy(t.directMessages.fromEmail);

  const unreadBy = new Map(unread.map((row) => [row.from, Number(row.count)]));

  return [...latest]
    .map((row) => {
      const other = counterpart(row.thread_key, me);
      return {
        email: other,
        lastBody: row.body,
        lastSentAt: Number(row.sent_at),
        lastFromSelf: normalise(row.from_email) === me,
        unread: unreadBy.get(other) ?? 0,
      };
    })
    .sort((a, b) => b.lastSentAt - a.lastSentAt);
}

/**
 * One thread, oldest first so it reads top to bottom.
 *
 * `since` turns the same query into the polling call: pass the newest timestamp
 * already on screen and only what arrived after it comes back.
 */
export async function listThread(
  self: string,
  other: string,
  since?: number,
): Promise<DirectMessage[]> {
  const db = requireDb();
  const key = threadKeyFor(self, other);

  const rows = await db
    .select()
    .from(t.directMessages)
    .where(
      since
        ? and(eq(t.directMessages.threadKey, key), gt(t.directMessages.sentAt, since))
        : eq(t.directMessages.threadKey, key),
    )
    .orderBy(asc(t.directMessages.sentAt))
    // A ceiling rather than a pager: a thread this long is not something anyone
    // scrolls, and it keeps one bad query from returning a year of history.
    .limit(500);

  return rows.map((row) => ({
    id: row.id,
    fromEmail: row.fromEmail,
    toEmail: row.toEmail,
    body: row.body,
    sentAt: row.sentAt,
    readAt: row.readAt ?? undefined,
  }));
}

/** Total unread across every thread, for the badge in the navigation. */
export async function unreadTotal(self: string): Promise<number> {
  const db = requireDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(t.directMessages)
    .where(
      and(eq(t.directMessages.toEmail, normalise(self)), isNull(t.directMessages.readAt)),
    );
  return Number(row?.count ?? 0);
}

export async function sendMessage(
  /** The workspace both people are in, so a thread cannot cross businesses. */
  workspaceId: string,
  from: string,
  to: string,
  body: string,
  id: string,
): Promise<DirectMessage> {
  const db = requireDb();
  const message = {
    id,
    workspaceId,
    threadKey: threadKeyFor(from, to),
    fromEmail: normalise(from),
    toEmail: normalise(to),
    body,
    sentAt: Date.now(),
    readAt: null,
  };

  await db.insert(t.directMessages).values(message);

  return { ...message, readAt: undefined };
}

/**
 * Marks everything the other person sent as read.
 *
 * Scoped to messages addressed to the reader, so opening a thread can never
 * mark your own outgoing messages read on the recipient's behalf.
 */
export async function markThreadRead(self: string, other: string): Promise<void> {
  const db = requireDb();
  await db
    .update(t.directMessages)
    .set({ readAt: Date.now() })
    .where(
      and(
        eq(t.directMessages.threadKey, threadKeyFor(self, other)),
        eq(t.directMessages.toEmail, normalise(self)),
        isNull(t.directMessages.readAt),
      ),
    );
}

/** Used by the test cleanup, and by nothing in the app. */
export async function deleteThreadsFor(emails: string[]): Promise<void> {
  if (!emails.length) return;
  const db = requireDb();
  const lowered = emails.map(normalise);
  await db
    .delete(t.directMessages)
    .where(
      or(
        inArray(t.directMessages.fromEmail, lowered),
        inArray(t.directMessages.toEmail, lowered),
      ),
    );
}
