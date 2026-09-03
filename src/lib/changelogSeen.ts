import { useSyncExternalStore } from "react";
import { CHANGELOG, LATEST } from "./changelog.data";

/**
 * Which entry somebody has read up to.
 *
 * In the browser rather than the database, because it is a per person, per
 * device convenience worth nothing to anybody else and not worth a column, a
 * write on every visit, or a sync.
 *
 * Every read is wrapped: a private window, cleared site data, or a browser set
 * to block storage all throw here rather than returning null, and none of them
 * should cost anybody the account menu.
 */
const KEY = "eterneon:changelog-seen";

/** Notified when the mark moves, so the badge clears without a reload. */
const listeners = new Set<() => void>();

function read(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Marks everything up to the newest entry as read. */
export function markChangelogSeen(): void {
  try {
    if (window.localStorage.getItem(KEY) === LATEST) return;
    window.localStorage.setItem(KEY, LATEST);
  } catch {
    // Then the dot stays, which is the whole consequence.
  }
  for (const listener of listeners) listener();
}

/**
 * How many entries have landed since this browser last looked.
 *
 * A browser that has never looked is marked as caught up rather than shown a
 * backlog of every change ever made: somebody signing in today has not missed
 * anything, and the dot should mean "since you were last here".
 *
 * Capped, because the number is a dot on an avatar and "9+" says everything
 * "47" does.
 */
function count(): number {
  const seen = read();
  if (!seen) return 0;
  const index = CHANGELOG.findIndex((entry) => entry.id === seen);
  // An id nothing matches means the history was rewritten under them. Treat it
  // as caught up rather than as everything being new.
  if (index === -1) return 0;
  return Math.min(index, 9);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab marking it read should clear the badge in this one too.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/**
 * The badge count, as an external store rather than state set from an effect.
 *
 * localStorage is not readable on the server, so the value has to arrive after
 * hydration either way. This is the shape React has for that: a server snapshot
 * of zero, and the real answer once the client takes over.
 */
export function useUnseenChangelog(): number {
  return useSyncExternalStore(subscribe, count, () => 0);
}

/**
 * Establishes the baseline for a browser that has never looked, so the next
 * release is what shows a dot rather than the whole history.
 */
export function baselineChangelog(): void {
  if (read() === null) markChangelogSeen();
}

/** What this browser has seen, for marking entries on the page itself. */
export function seenChangelog(): string | null {
  return read();
}
