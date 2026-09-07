/**
 * How long to wait before asking the inbox again.
 *
 * Measured over the life of the deployment, messages.overview was 55% of all
 * server time: 7,313 calls at 324ms, 790 of them slow. Nothing about the query
 * explains that. It is one round trip doing four milliseconds of work, already
 * folded down from two, against twenty odd rows. The cost is the asking, and
 * the answer is to ask less often rather than faster.
 *
 * A fixed twenty five seconds is right when something is happening and wasteful
 * when nothing is. Most of those seven thousand polls were somebody with the
 * panel open in a tab all day, and every one of them returned the same inbox as
 * the last. So the interval stretches while the answer keeps coming back
 * identical, and snaps back the moment it does not.
 *
 * Deliberately not a websocket. The comment in messages.tsx explains why: this
 * deploys to functions with a duration limit, so a long lived connection is
 * either impossible or expensive.
 */

/** While anything is happening, and for the first few quiet polls after it. */
export const FAST_MS = 25_000;

/** The longest it will ever wait. */
export const SLOW_MS = 120_000;

/**
 * How many identical answers to accept before slowing down.
 *
 * Not zero. Somebody who has just read a message is very likely about to get a
 * reply, so the first minute and a half after activity stays responsive and the
 * stretching only begins once a conversation has really stopped.
 */
export const PATIENCE = 3;

/**
 * The wait after `quiet` consecutive polls that changed nothing.
 *
 * Doubling rather than stepping, so the interval spends most of its time at
 * either end and little in between: responsive during a conversation, close to
 * idle after one. Reaching the ceiling takes about four minutes of silence.
 */
export function nextInterval(quiet: number): number {
  if (quiet <= PATIENCE) return FAST_MS;
  const widened = FAST_MS * 2 ** (quiet - PATIENCE);
  return Math.min(SLOW_MS, widened);
}

/** What the inbox looked like, small enough to compare on every poll. */
export interface InboxShape {
  unread?: number;
  threads?: { email: string; lastSentAt: number; unread: number; lastSeen?: boolean }[];
  people?: { email: string; presence?: string }[];
}

/**
 * A short string that changes when anything worth waking up for has.
 *
 * Every thread's last message and unread count, so a new message, a reply, or
 * something being read elsewhere all count as activity. Presence is included
 * because a colleague coming online is a change the screen draws.
 *
 * Compared as a string rather than deep equalled, because this runs on a timer
 * forever and the whole point is that it should cost nothing.
 */
export function digestOf(inbox: InboxShape): string {
  const threads = (inbox.threads ?? [])
    .map((t) => `${t.email}:${t.lastSentAt}:${t.unread}:${t.lastSeen ? 1 : 0}`)
    .join("|");
  const people = (inbox.people ?? []).map((p) => `${p.email}:${p.presence ?? ""}`).join("|");
  return `${inbox.unread ?? 0}#${threads}#${people}`;
}
