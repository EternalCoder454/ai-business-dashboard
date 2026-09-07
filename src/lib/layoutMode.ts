"use client";

import { useSyncExternalStore } from "react";

/**
 * Which arrangement of the panel somebody wants: the old one or the current one.
 *
 * Three merges happened over a few days, each defensible on its own. Information
 * became a band on the dashboard, Briefings became a tab of Tasks, and the
 * Reference group dissolved into Work once it held one row. Two people who use
 * this every day said the same thing about the result: the presentation got
 * better and the arrangement got worse.
 *
 * So the arrangement is a choice and the presentation is not. Both modes get
 * the type, the resizable columns, the folding, the shorter headers and
 * everything else; what differs is where things live. Nobody is being offered
 * an older, worse looking panel.
 *
 * Kept in this browser, like the theme and the pane widths, because it is a
 * preference about reading rather than a fact about the business.
 */

const KEY = "eterneon.layout.v1";

export type LayoutMode = "modern" | "legacy";

/** What a browser that has never chosen gets. */
const DEFAULT: LayoutMode = "modern";

let mode: LayoutMode = DEFAULT;
let loaded = false;
const listeners = new Set<() => void>();

function load(): LayoutMode {
  if (loaded || typeof window === "undefined") return mode;
  loaded = true;
  try {
    const value = window.localStorage.getItem(KEY);
    if (value === "modern" || value === "legacy") mode = value;
  } catch {
    // Private browsing or a blocked store. The default is a working panel.
  }
  return mode;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The shipped default on the server and on the first client render.
 *
 * The same trade every browser-held preference here makes: reading storage
 * during render is a hydration mismatch. The navigation rearranges itself a
 * frame after load, which is the cost of the arrangement being a choice.
 */
export function useLayoutMode(): LayoutMode {
  return useSyncExternalStore(
    subscribe,
    () => load(),
    () => DEFAULT,
  );
}

export function setLayoutMode(next: LayoutMode): void {
  load();
  mode = next;
  try {
    window.localStorage.setItem(KEY, next);
  } catch {
    // It still holds for this session.
  }
  for (const listener of listeners) listener();
}
