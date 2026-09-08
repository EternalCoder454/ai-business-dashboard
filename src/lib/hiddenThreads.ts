"use client";

import { useSyncExternalStore } from "react";

/**
 * Threads put away until the other person says something.
 *
 * Not a block and not a delete. A block is a decision about somebody, refused
 * on the server, and it stops their messages arriving at all. This is a
 * decision about a conversation: it has run its course for now, and you would
 * rather not look at it, but if they write again you want to know.
 *
 * So what is stored is the moment it was put away, not a flag. A thread comes
 * back on its own the instant something arrives after that moment, which is the
 * behaviour somebody actually means by "hide it until they reply". A flag would
 * have needed the act of un-hiding to be somebody's job, and it would have been
 * nobody's.
 *
 * Held in the browser rather than the workspace: which conversations you want
 * in front of you is not something your colleagues have a view on, and it is
 * cheap enough to be worth nothing if you sign in somewhere else.
 */
const KEY = "eterneon.threads.hidden.v1";

let hidden: Record<string, number> = {};
let loaded = false;
const listeners = new Set<() => void>();

const NOTHING: Record<string, number> = {};

function load(): Record<string, number> {
  if (loaded || typeof window === "undefined") return hidden;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      hidden = Object.fromEntries(
        Object.entries(parsed as Record<string, unknown>).filter(
          ([, at]) => typeof at === "number" && Number.isFinite(at),
        ) as [string, number][],
      );
    }
  } catch {
    // Blocked storage, or something that is not JSON. Nothing is hidden, which
    // is the state somebody who has never used this is in anyway.
  }
  return hidden;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useHiddenThreads(): Record<string, number> {
  return useSyncExternalStore(
    subscribe,
    () => load(),
    () => NOTHING,
  );
}

/**
 * Whether a thread should be out of the list.
 *
 * The comparison is against the last thing said, so a reply un-hides it and a
 * message you sent yourself does not: putting a conversation away and then
 * writing into it is a thing people do, and it should not spring back because
 * of your own message.
 */
export function isHidden(
  hiddenAt: Record<string, number>,
  email: string,
  lastSentAt: number,
  lastFromSelf: boolean,
): boolean {
  const at = hiddenAt[email];
  if (at === undefined) return false;
  if (lastFromSelf) return true;
  return lastSentAt <= at;
}

export function setThreadHidden(email: string, put: boolean): void {
  load();
  const next = { ...hidden };
  if (put) next[email] = Date.now();
  else delete next[email];
  hidden = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(hidden));
  } catch {
    // It still holds for this session.
  }
  for (const listener of listeners) listener();
}
