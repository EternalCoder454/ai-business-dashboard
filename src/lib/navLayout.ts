"use client";

import { useSyncExternalStore } from "react";

/**
 * The order of the sidebar's sections, and which of them are hidden.
 *
 * Kept in this browser rather than in the workspace, for the same reason the
 * collapsed rail is: this is a property of how one person works at one screen,
 * not a fact about the company. Someone who never opens Projects should be
 * able to put it away without hiding it from anyone else.
 *
 * Hiding a section only removes it from the drawer. Every destination stays
 * reachable from search, from the bottom bar on compact, and by its URL, so
 * this can never strand a page.
 */
const STORE_KEY = "eterneon.nav.layout.v1";

/** Every section the drawer can show, in the order it ships. */
export const NAV_SECTIONS = [
  "work",
  "workspace",
  "departments",
  "personal",
  "recent",
] as const;

export type NavSectionId = (typeof NAV_SECTIONS)[number];

export interface NavLayout {
  order: NavSectionId[];
  hidden: NavSectionId[];
}

const DEFAULT_LAYOUT: NavLayout = { order: [...NAV_SECTIONS], hidden: [] };

let layout: NavLayout = DEFAULT_LAYOUT;
let loaded = false;
const listeners = new Set<() => void>();

/**
 * Reconciles a stored layout against the sections that exist now.
 *
 * A layout saved before a section existed would silently drop it, and one
 * saved after a section was removed would try to render nothing. Unknown ids
 * are discarded and missing ones appended, so the drawer is always complete.
 */
function reconcile(stored: Partial<NavLayout> | null): NavLayout {
  const known = new Set<string>(NAV_SECTIONS);
  const order = (stored?.order ?? []).filter((id): id is NavSectionId => known.has(id));
  for (const id of NAV_SECTIONS) if (!order.includes(id)) order.push(id);
  const hidden = (stored?.hidden ?? []).filter((id): id is NavSectionId => known.has(id));
  return { order, hidden };
}

function load(): NavLayout {
  if (loaded || typeof window === "undefined") return layout;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    layout = reconcile(raw ? (JSON.parse(raw) as Partial<NavLayout>) : null);
  } catch {
    // Private browsing, or a value someone hand edited. Ship order is fine.
    layout = DEFAULT_LAYOUT;
  }
  return layout;
}

function commit(next: NavLayout): void {
  layout = next;
  loaded = true;
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(next));
  } catch {
    // Keep it for this session and move on.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The ship order on the server and on the first client render.
 *
 * Reading localStorage during render would make the markup depend on something
 * the server cannot know, which is a hydration mismatch. The saved order takes
 * over immediately afterwards.
 */
export function useNavLayout(): NavLayout {
  return useSyncExternalStore(
    subscribe,
    () => load(),
    () => DEFAULT_LAYOUT,
  );
}

/** Moves one section to sit at `toIndex` in the visible order. */
export function moveNavSection(id: NavSectionId, toIndex: number): void {
  const current = load();
  const order = current.order.filter((other) => other !== id);
  order.splice(Math.max(0, Math.min(toIndex, order.length)), 0, id);
  commit({ ...current, order });
}

export function toggleNavSection(id: NavSectionId): void {
  const current = load();
  const hidden = current.hidden.includes(id)
    ? current.hidden.filter((other) => other !== id)
    : [...current.hidden, id];
  commit({ ...current, hidden });
}

export function resetNavLayout(): void {
  commit({ order: [...NAV_SECTIONS], hidden: [] });
}
