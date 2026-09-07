"use client";

import { useSyncExternalStore } from "react";

/**
 * How wide each side pane is, and whether it is showing at all.
 *
 * In a conversation there are two columns before the thread: the navigation and
 * the list of conversations. Measured on a 1600px window they took 24% of it,
 * and neither could be moved. A fifth of the screen is a lot to spend on
 * furniture, and the amount somebody wants to spend depends on the screen and
 * on what they are doing, which is not something this can decide for them.
 *
 * Kept in this browser rather than in the workspace, for the same reason
 * the navigation always did: it is a property of the screen you are sitting at rather
 * than of the company. A laptop and a desktop want different widths, and
 * syncing the two would mean one of them is always wrong.
 *
 * An external store rather than React state because the panes are in different
 * trees. The shell owns the navigation, ChatView owns the conversation list,
 * and there is nothing above both that owns anything else.
 */

const KEY = "eterneon.panes.v1";

export interface PaneState {
  /** Pixels. Absent means the pane's own default. */
  width?: number;
  /** Folded to a rail. Absent means showing. */
  hidden?: boolean;
}

type Panes = Record<string, PaneState>;

let panes: Panes = {};
let loaded = false;
const listeners = new Set<() => void>();

/**
 * One frozen empty object for every pane nobody has touched.
 *
 * useSyncExternalStore compares snapshots by identity and re-reads on every
 * render, so returning a fresh `{}` here is an infinite render loop rather than
 * a minor waste.
 */
const NOTHING: PaneState = Object.freeze({});

function load(): Panes {
  if (loaded || typeof window === "undefined") return panes;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      panes = parsed as Panes;
    }
  } catch {
    // Private browsing, a disabled store, or something else's key in the way.
    // The defaults are what everybody starts with anyway.
  }
  return panes;
}

function save(): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(panes));
  } catch {
    // The layout still holds for this session.
  }
}

function announce(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Empty on the server and on the first client render.
 *
 * Reading localStorage during render would make the markup depend on something
 * the server cannot know, which is a hydration mismatch. So every pane draws at
 * its default width for one frame and takes its stored width immediately after,
 * which is the trade every browser-held preference in here makes.
 */
export function usePane(id: string): PaneState {
  return useSyncExternalStore(
    subscribe,
    () => load()[id] ?? NOTHING,
    () => NOTHING,
  );
}

function update(id: string, patch: PaneState): void {
  load();
  const next = { ...panes[id], ...patch };

  // Absent rather than false, so a pane returned to its default leaves nothing
  // behind and picks up any later change to that default.
  if (next.hidden === false) delete next.hidden;
  if (next.width === undefined) delete next.width;

  panes = { ...panes, [id]: next };
  loaded = true;
  save();
  announce();
}

export function setPaneWidth(id: string, width: number | undefined): void {
  update(id, { width });
}

export function setPaneHidden(id: string, hidden: boolean): void {
  update(id, { hidden });
}

export function togglePane(id: string): void {
  update(id, { hidden: !(load()[id]?.hidden ?? false) });
}

/** Never wider than the window can spare, whatever is stored. */
export function clampWidth(width: number, min: number, max: number): number {
  return Math.min(Math.max(Math.round(width), min), max);
}
