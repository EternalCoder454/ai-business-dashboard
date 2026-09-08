"use client";

import { useSyncExternalStore } from "react";

/**
 * Which standing notices this person wants to keep seeing.
 *
 * The list in the account menu is five things the panel thinks are unfinished,
 * and some of them are unfinished on purpose. A business that keeps its
 * decisions somewhere else, or has deliberately given a head no skills, is told
 * about it every time it opens the menu and can do nothing but read it again.
 * A notice nobody can act on and nobody can silence is not a notice, it is
 * furniture.
 *
 * Held in the browser rather than the workspace, like the theme and the
 * density: what one person wants to be reminded of is not a company decision,
 * and muting one for everybody would hide it from the person who was going to
 * deal with it.
 *
 * Stored as the muted ones rather than the kept ones, so a notice added in a
 * later release starts out visible. Somebody who has silenced four things has
 * not thereby asked to be kept in the dark about a fifth that did not exist
 * when they chose.
 */
const KEY = "eterneon.notices.muted.v1";

let muted: string[] = [];
let loaded = false;
const listeners = new Set<() => void>();

/** The same array identity until it actually changes, so renders do not loop. */
function load(): string[] {
  if (loaded || typeof window === "undefined") return muted;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) muted = parsed.filter((id) => typeof id === "string");
  } catch {
    // Blocked storage, or something that is not JSON. Everything stays visible,
    // which is the state somebody who has never chosen is in anyway.
  }
  return muted;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const NOTHING: string[] = [];

export function useMutedNotices(): string[] {
  return useSyncExternalStore(
    subscribe,
    () => load(),
    () => NOTHING,
  );
}

export function isMuted(id: string): boolean {
  return load().includes(id);
}

/** On means show it, which is the way round the switch reads. */
export function setNoticeShown(id: string, shown: boolean): void {
  load();
  const next = shown ? muted.filter((one) => one !== id) : [...new Set([...muted, id])];
  if (next.length === muted.length && next.every((one, i) => one === muted[i])) return;
  muted = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(muted));
  } catch {
    // It still holds for this session.
  }
  for (const listener of listeners) listener();
}
