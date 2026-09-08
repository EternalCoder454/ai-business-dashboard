import { and, asc, eq, gt, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { requireDb } from "./client";
import * as t from "./schema";
import type { Colleague, DirectMessage, MessageThread, PresenceStatus } from "@/lib/types";

/**
 * Every read here is fenced to one business as well as to the two addresses.
 *
 * The pair alone is not enough: somebody moved between businesses would
 * otherwise open their new employer's inbox and find their old colleagues and
 * everything said to them.
 *
 * These sit apart from repo.ts because a message belongs to two accounts and
 * arrives while you are looking at it, so it is polled rather than folded into
 * a snapshot that would be stale the moment anybody replied.
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
/**
 * Online means seen inside this window.
 *
 * Long enough that reading a message without typing does not flip you to
 * offline, short enough that a closed laptop stops claiming you are here.
 */
const ONLINE_WINDOW_MS = 3 * 60_000;

function presenceOf(setting: string | null | undefined, lastSeen: Date | null | undefined): PresenceStatus {
  if (setting === "dnd") return "dnd";
  if (!lastSeen) return "offline";
  return Date.now() - lastSeen.getTime() < ONLINE_WINDOW_MS ? "online" : "offline";
}

/** Records that this person is here, for the dot beside their name. */
export async function touchPresence(email: string): Promise<void> {
  const who = normalise(email);
  try {
    const database = requireDb();
    await database
      .update(t.accounts)
      .set({ lastSeenAt: new Date() })
      .where(eq(t.accounts.userEmail, who));

    /*
     * Backfills the arrival when nothing recorded one, since `markSignedIn`
     * only fires on a fresh sign in and a long lived session never sees it.
     * Only when null, so it does not become a second timestamp competing with
     * the real one.
     */
    await database
      .update(t.access)
      .set({ lastSignedInAt: new Date() })
      .where(and(eq(t.access.email, who), isNull(t.access.lastSignedInAt)));
  } catch {
    // A missed heartbeat shows someone as offline for a minute. Not worth
    // failing the request that carried it.
  }
}

export async function listColleagues(workspaceId: string, self: string): Promise<Colleague[]> {
  const db = requireDb();
  const me = normalise(self);

  // The people in this workspace, from the access table, since that is what
  // says who belongs where. It used to be the sign-in allowlist, which on a
  // deployment holding several businesses would have listed all of them in
  // everybody's directory.
  const members = await db
    .select({ email: t.access.email })
    .from(t.access)
    .where(and(eq(t.access.workspaceId, workspaceId), isNull(t.access.revokedAt)));

  const rows = await db
    .select({
      userEmail: t.accounts.userEmail,
      displayName: t.accounts.displayName,
      roleTitle: t.accounts.roleTitle,
      avatarUrl: t.accounts.avatarUrl,
      presence: t.accounts.presence,
      lastSeenAt: t.accounts.lastSeenAt,
    })
    .from(t.accounts);

  const known = new Map(rows.map((row) => [normalise(row.userEmail), row]));
  const everyone = new Set(members.map((row) => normalise(row.email)));
  everyone.delete(me);

  return [...everyone]
    .map((email) => {
      const row = known.get(email);
      return {
        email,
        displayName: row?.displayName || undefined,
        roleTitle: row?.roleTitle || undefined,
        avatarUrl: row?.avatarUrl ?? undefined,
        presence: presenceOf(row?.presence, row?.lastSeenAt),
        // The moment, not the verdict. "Offline" is true and unkind about
        // somebody who stepped out for coffee, and the inbox can say "active
        // 20m ago" instead only if it is given the number.
        lastSeenAt: row?.lastSeenAt ? row.lastSeenAt.getTime() : undefined,
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
export async function listThreads(
  workspaceId: string,
  self: string,
): Promise<MessageThread[]> {
  const db = requireDb();
  const me = normalise(self);

  /*
   * One round trip, not two.
   *
   * This was the latest message per thread, then a second query counting what
   * was unread, and the second waited on the first. Measured against the
   * production database, a trivial SELECT 1 costs 79ms and this query costs
   * 83ms: the work is four milliseconds and the rest is the trip. Two of them
   * in series is therefore about twice the price for no extra computation,
   * which is why messages.overview averaged 526ms and went over a second on a
   * third of its calls with twenty three rows in the table.
   *
   * Joined on thread_key rather than on the sender. The unread count belongs to
   * the other person in the thread, and the latest message may be one I sent,
   * so joining on from_email would attribute my own unread count to myself and
   * report zero for everybody.
   */
  const latest = await db.execute<{
    thread_key: string;
    from_email: string;
    to_email: string;
    body: string;
    sent_at: string | number;
    read_at: string | number | null;
    unread: number;
  }>(sql`
    WITH newest AS (
      SELECT DISTINCT ON (thread_key)
        thread_key, from_email, to_email, body, sent_at, read_at
      FROM direct_messages
      WHERE workspace_id = ${workspaceId}
        AND (from_email = ${me} OR to_email = ${me})
        AND deleted_at IS NULL
      ORDER BY thread_key, sent_at DESC
    ),
    pending AS (
      SELECT thread_key, count(*)::int AS n
      FROM direct_messages
      WHERE workspace_id = ${workspaceId}
        AND to_email = ${me}
        AND read_at IS NULL
        AND deleted_at IS NULL
      GROUP BY thread_key
    )
    SELECT
      newest.thread_key, newest.from_email, newest.to_email,
      newest.body, newest.sent_at, newest.read_at,
      COALESCE(pending.n, 0)::int AS unread
    FROM newest
    LEFT JOIN pending ON pending.thread_key = newest.thread_key
  `);

  return [...latest]
    .map((row) => {
      const other = counterpart(row.thread_key, me);
      return {
        email: other,
        lastBody: row.body,
        lastSentAt: Number(row.sent_at),
        lastFromSelf: normalise(row.from_email) === me,
        // Only meaningful on a row I sent. Free: the query above already had to
        // pick this exact row out to get the preview text.
        lastSeen: row.read_at != null,
        unread: Number(row.unread),
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
  workspaceId: string,
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
      and(
        eq(t.directMessages.workspaceId, workspaceId),
        eq(t.directMessages.threadKey, key),
        // Withdrawn by whoever sent it. Gone from the thread for both people
        // and still on the row, which is what management reads.
        isNull(t.directMessages.deletedAt),
        /*
         * An edit does not move sent_at, so a cursor on that alone would never
         * carry a correction to the other person: they would sit looking at the
         * text that was replaced until they next opened the thread. Editing
         * counts as news about a message, so it comes back in the delta and the
         * client merges it over the copy it holds by id.
         */
        since
          ? or(
              gt(t.directMessages.sentAt, since),
              gt(t.directMessages.editedAt, since),
            )
          : undefined,
      ),
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
    // Marked as changed, without carrying what it used to say: the person
    // reading is owed the fact, and the earlier text is the record's business.
    editedAt: row.editedAt ?? undefined,
  }));
}


/**
 * How many messages are waiting, out of the threads already fetched.
 *
 * A sum rather than a query. listThreads returns the unread count per thread,
 * and the total is those added up: every unread message is addressed to this
 * person and every thread they are in is in that list, so nothing falls between
 * the two. It used to be its own count(*) on the most called endpoint in the
 * product, asking the same table the same question in a different shape.
 *
 * Checked against production for every participant before the query went, and
 * then again with the predicate inverted so the counts were 15, 1, 2 and 8
 * rather than mostly zero.
 */
export function unreadIn(threads: MessageThread[]): number {
  return threads.reduce((sum, thread) => sum + thread.unread, 0);
}

/**
 * Who this person has blocked, and who has blocked them.
 *
 * Both directions in one read, because the inbox needs both: a thread you have
 * blocked is drawn differently, and a thread where you are the blocked one has
 * to stop offering a box that will refuse.
 */
export async function blocksFor(
  workspaceId: string,
  self: string,
): Promise<{ blocked: string[]; blockedBy: string[] }> {
  const db = requireDb();
  const me = normalise(self);
  const rows = await db
    .select()
    .from(t.messageBlocks)
    .where(
      and(
        eq(t.messageBlocks.workspaceId, workspaceId),
        or(eq(t.messageBlocks.blockerEmail, me), eq(t.messageBlocks.blockedEmail, me)),
      ),
    );
  return {
    blocked: rows.filter((row) => row.blockerEmail === me).map((row) => row.blockedEmail),
    blockedBy: rows.filter((row) => row.blockedEmail === me).map((row) => row.blockerEmail),
  };
}

/** Idempotent, so pressing it twice is not an error. */
export async function setBlocked(
  workspaceId: string,
  self: string,
  other: string,
  blocked: boolean,
): Promise<void> {
  const db = requireDb();
  const blockerEmail = normalise(self);
  const blockedEmail = normalise(other);
  if (blockerEmail === blockedEmail) return;

  if (!blocked) {
    await db
      .delete(t.messageBlocks)
      .where(
        and(
          eq(t.messageBlocks.workspaceId, workspaceId),
          eq(t.messageBlocks.blockerEmail, blockerEmail),
          eq(t.messageBlocks.blockedEmail, blockedEmail),
        ),
      );
    return;
  }

  await db
    .insert(t.messageBlocks)
    .values({ workspaceId, blockerEmail, blockedEmail, createdAt: Date.now() })
    .onConflictDoNothing();
}

/**
 * Whether a message may be delivered, checked in the direction that matters.
 *
 * The recipient's decision, not the sender's: blocking somebody stops them
 * writing to you and leaves you free to write to them.
 */
export async function isBlocked(
  workspaceId: string,
  from: string,
  to: string,
): Promise<boolean> {
  const db = requireDb();
  const rows = await db
    .select({ blockerEmail: t.messageBlocks.blockerEmail })
    .from(t.messageBlocks)
    .where(
      and(
        eq(t.messageBlocks.workspaceId, workspaceId),
        eq(t.messageBlocks.blockerEmail, normalise(to)),
        eq(t.messageBlocks.blockedEmail, normalise(from)),
      ),
    )
    .limit(1);
  return rows.length > 0;
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
 * Messages withdrawn from this thread since a cursor, so a poll can drop them.
 *
 * A withdrawn message cannot come back through listThread, which is the point
 * of it: nothing that reads a thread for the two people in it should return
 * one. But the other person is holding a copy already on screen, and telling
 * them only when they next open the thread is not withdrawing it.
 *
 * So the ids come back separately, with the moment each went, so the poll can
 * remove them and move its cursor past them rather than asking again forever.
 */
export async function withdrawnSince(
  workspaceId: string,
  self: string,
  other: string,
  since: number,
): Promise<{ id: string; at: number }[]> {
  const db = requireDb();
  const rows = await db
    .select({ id: t.directMessages.id, at: t.directMessages.deletedAt })
    .from(t.directMessages)
    .where(
      and(
        eq(t.directMessages.workspaceId, workspaceId),
        eq(t.directMessages.threadKey, threadKeyFor(self, other)),
        isNotNull(t.directMessages.deletedAt),
        gt(t.directMessages.deletedAt, since),
      ),
    )
    .limit(200);

  return rows.map((row) => ({ id: row.id, at: row.at ?? 0 }));
}

/**
 * Changes the text of a message somebody already sent.
 *
 * Only the sender, and only their own message: an administrator has a screen
 * that reads every thread, and being able to rewrite what a colleague said in
 * one would make that screen worthless as a record. The check is on the row
 * rather than in the caller, so there is one place it can be got wrong.
 *
 * The first edit keeps the original text. Later edits do not overwrite it,
 * because the thing worth keeping is what was originally said, not the version
 * before last.
 */
export async function editMessage(
  workspaceId: string,
  id: string,
  actor: string,
  body: string,
): Promise<{ ok: true } | { error: string }> {
  const db = requireDb();
  const me = normalise(actor);
  const text = body.trim();
  if (!text) return { error: "A message cannot be empty." };

  const [row] = await db
    .select({
      fromEmail: t.directMessages.fromEmail,
      body: t.directMessages.body,
      originalBody: t.directMessages.originalBody,
      deletedAt: t.directMessages.deletedAt,
    })
    .from(t.directMessages)
    .where(and(eq(t.directMessages.workspaceId, workspaceId), eq(t.directMessages.id, id)))
    .limit(1);

  if (!row) return { error: "That message no longer exists." };
  if (normalise(row.fromEmail) !== me) {
    return { error: "You can only edit your own messages." };
  }
  if (row.deletedAt) return { error: "That message was withdrawn." };

  await db
    .update(t.directMessages)
    .set({
      body: text,
      editedAt: Date.now(),
      // Only on the first edit. What was originally said is the thing worth
      // keeping; the version before last is not.
      originalBody: row.originalBody ?? row.body,
    })
    .where(and(eq(t.directMessages.workspaceId, workspaceId), eq(t.directMessages.id, id)));

  return { ok: true };
}

/**
 * Withdraws a message, without removing it.
 *
 * It disappears from the thread for both people, and the row stays exactly
 * where it was so the management screen still shows it, marked as withdrawn.
 *
 * That split is the point rather than a compromise. Somebody should be able to
 * take back a message they regret, and a business that may have to answer for
 * what was said inside it should not lose the record because the sender would
 * rather it were gone. The screen that keeps it is already administrator only.
 */
export async function deleteMessage(
  workspaceId: string,
  id: string,
  actor: string,
): Promise<{ ok: true } | { error: string }> {
  const db = requireDb();
  const me = normalise(actor);

  const [row] = await db
    .select({
      fromEmail: t.directMessages.fromEmail,
      deletedAt: t.directMessages.deletedAt,
    })
    .from(t.directMessages)
    .where(and(eq(t.directMessages.workspaceId, workspaceId), eq(t.directMessages.id, id)))
    .limit(1);

  if (!row) return { error: "That message no longer exists." };
  if (normalise(row.fromEmail) !== me) {
    return { error: "You can only withdraw your own messages." };
  }
  // Already gone, and saying so is friendlier than a second timestamp.
  if (row.deletedAt) return { ok: true };

  await db
    .update(t.directMessages)
    .set({ deletedAt: Date.now(), deletedBy: me })
    .where(and(eq(t.directMessages.workspaceId, workspaceId), eq(t.directMessages.id, id)));

  return { ok: true };
}

/**
 * Marks everything the other person sent as read.
 *
 * Scoped to messages addressed to the reader, so opening a thread can never
 * mark your own outgoing messages read on the recipient's behalf.
 */
export async function markThreadRead(
  workspaceId: string,
  self: string,
  other: string,
): Promise<void> {
  const db = requireDb();
  await db
    .update(t.directMessages)
    .set({ readAt: Date.now() })
    .where(
      and(
        eq(t.directMessages.workspaceId, workspaceId),
        eq(t.directMessages.threadKey, threadKeyFor(self, other)),
        eq(t.directMessages.toEmail, normalise(self)),
        isNull(t.directMessages.readAt),
      ),
    );
}

/**
 * The newest thing I sent in this thread that the other person has read.
 *
 * A watermark rather than a flag per message: read state only moves forwards,
 * so one number settles the thread and the poll carries eight bytes.
 *
 * It has to be separate because the thread poll asks for `sent_at > since`, and
 * a message already fetched and then read never appears in that answer again.
 * Without it the tick would never arrive.
 */
export async function seenThrough(
  workspaceId: string,
  self: string,
  other: string,
): Promise<number> {
  const db = requireDb();
  const [row] = await db
    .select({ at: sql<number | null>`max(${t.directMessages.sentAt})` })
    .from(t.directMessages)
    .where(
      and(
        eq(t.directMessages.workspaceId, workspaceId),
        eq(t.directMessages.threadKey, threadKeyFor(self, other)),
        eq(t.directMessages.fromEmail, normalise(self)),
        isNotNull(t.directMessages.readAt),
      ),
    );
  return Number(row?.at ?? 0);
}

/** Used by the test cleanup, and by nothing in the app. */
export async function deleteThreadsFor(emails: string[]): Promise<void> {
  if (!emails.length) return;
  const db = requireDb();
  const lowered = emails.map(normalise);
  // tenancy-audit: by address and across every business, which is what a test
  // cleanup needs. Exported for the tests and called by nothing in the app.
  await db
    .delete(t.directMessages)
    .where(
      or(
        inArray(t.directMessages.fromEmail, lowered),
        inArray(t.directMessages.toEmail, lowered),
      ),
    );
}

/* -------------------------------------------------------------------------- *
 * Review
 *
 * The Account page tells everybody that conversations and internal messaging
 * are recorded and can be reviewed by an administrator. Until these existed
 * that was only half true: the only way a message ever became readable was for
 * the conduct reporter to flag it, which produced a quote and a transcript
 * attached to a report. Everything nobody flagged was retained and unreadable,
 * so the sentence promised something the product did not do.
 *
 * These two are the other half. They are deliberately not scoped to a self:
 * that is the entire difference between reading your own inbox and reviewing
 * the business's, and it is why the route above them checks for an
 * administrator before it calls either.
 * -------------------------------------------------------------------------- */

export interface ThreadSummary {
  threadKey: string;
  /** Both addresses, sorted, since a thread has no owner from out here. */
  participants: [string, string];
  messages: number;
  lastAt: number;
  lastFrom: string;
  preview: string;
}

/**
 * Every thread in one business, newest first.
 *
 * One query rather than a list followed by a count each, for the reason
 * listThreads was rewritten: the work is milliseconds and the round trip is
 * eighty, so anything shaped as a loop over threads costs a second by the time
 * a busy workspace has a dozen.
 */
export async function auditThreads(workspaceId: string): Promise<ThreadSummary[]> {
  const db = requireDb();

  const rows = await db.execute<{
    thread_key: string;
    from_email: string;
    to_email: string;
    body: string;
    sent_at: string | number;
    messages: number;
  }>(sql`
    WITH counted AS (
      SELECT thread_key, count(*)::int AS n, max(sent_at) AS last_at
      FROM direct_messages
      WHERE workspace_id = ${workspaceId}
      GROUP BY thread_key
    )
    SELECT DISTINCT ON (m.thread_key)
      m.thread_key, m.from_email, m.to_email, m.body, m.sent_at,
      counted.n AS messages
    FROM direct_messages m
    JOIN counted ON counted.thread_key = m.thread_key
    WHERE m.workspace_id = ${workspaceId}
    ORDER BY m.thread_key, m.sent_at DESC
  `);

  return rows
    .map((row) => {
      const pair = row.thread_key.split("|");
      return {
        threadKey: row.thread_key,
        participants: [pair[0] ?? row.from_email, pair[1] ?? row.to_email] as [string, string],
        messages: Number(row.messages),
        lastAt: Number(row.sent_at),
        lastFrom: row.from_email,
        // Enough to recognise a thread, not enough to be the thread. Opening it
        // is a separate request, which is also where the audit line would go.
        preview: row.body.slice(0, 160),
      };
    })
    .sort((a, b) => b.lastAt - a.lastAt);
}

/**
 * One thread in full, by its key rather than by who is asking.
 *
 * The same 500 ceiling listThread uses, and for the same reason: a thread
 * longer than that is not something anybody scrolls, and the limit keeps one
 * query from returning a year of history.
 */
export async function auditThread(
  workspaceId: string,
  threadKey: string,
): Promise<DirectMessage[]> {
  const db = requireDb();
  const rows = await db
    .select()
    .from(t.directMessages)
    .where(
      and(
        eq(t.directMessages.workspaceId, workspaceId),
        eq(t.directMessages.threadKey, threadKey),
      ),
    )
    .orderBy(asc(t.directMessages.sentAt))
    .limit(500);

  /*
   * Everything, including what the two people in the thread can no longer see.
   *
   * This is the difference between this and listThread, and it is the whole
   * reason withdrawing a message marks the row instead of removing it. A
   * business that may have to answer for what was said inside it should not
   * lose the record because the sender would rather it were gone.
   */
  return rows.map((row) => ({
    id: row.id,
    fromEmail: row.fromEmail,
    toEmail: row.toEmail,
    body: row.body,
    sentAt: row.sentAt,
    readAt: row.readAt ?? undefined,
    editedAt: row.editedAt ?? undefined,
    originalBody: row.originalBody ?? undefined,
    deletedAt: row.deletedAt ?? undefined,
    deletedBy: row.deletedBy ?? undefined,
  }));
}

/**
 * Withdraws a message, or a whole thread, on the administrator's authority.
 *
 * The same soft delete a sender can do to their own, opened to the person who
 * answers for the business. It disappears from both inboxes and stays here,
 * marked, with their address against it.
 *
 * Marked rather than removed, and that is the whole design. A business that may
 * have to answer for what was said inside it should not lose the record because
 * somebody would rather it were gone, and that holds whether the somebody is
 * the sender or the manager. What an administrator gets is the power to take a
 * message out of circulation, not the power to make it never have happened.
 *
 * Returns how many it took down, so the screen can say what it did rather than
 * assume it worked.
 */
export async function withdrawForReview(
  workspaceId: string,
  actor: string,
  target: { messageId?: string; threadKey?: string },
): Promise<{ withdrawn: number }> {
  const db = requireDb();
  const by = normalise(actor);
  const now = Date.now();

  const scope = target.messageId
    ? eq(t.directMessages.id, target.messageId)
    : target.threadKey
      ? eq(t.directMessages.threadKey, target.threadKey)
      : undefined;
  if (!scope) return { withdrawn: 0 };

  const taken = await db
    .update(t.directMessages)
    .set({ deletedAt: now, deletedBy: by })
    .where(
      and(
        eq(t.directMessages.workspaceId, workspaceId),
        scope,
        // Anything already withdrawn keeps the timestamp and the name it has,
        // so a second pass over a thread does not rewrite who took down what.
        isNull(t.directMessages.deletedAt),
      ),
    )
    .returning({ id: t.directMessages.id });

  return { withdrawn: taken.length };
}
