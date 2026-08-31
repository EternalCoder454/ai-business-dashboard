"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether the permanent drawer is collapsed to the navigation rail.
 *
 * Kept in this browser rather than in the workspace, because it is a property
 * of the screen you are sitting at rather than of the company. A laptop wants
 * the rail and a desktop wants the drawer, and syncing the choice between them
 * would mean one of the two is always wrong. `sidebarSide` is in settings
 * because which hand you reach with does follow you between machines.
 *
 * An external store rather than React state: the shell reads it, the drawer
 * header toggles it, and there is no component above both that owns anything
 * else.
 */
const STORE_KEY = "eterneon.nav.collapsed.v1";

let collapsed = false;
let loaded = false;
const listeners = new Set<() => void>();

function load(): boolean {
  if (loaded || typeof window === "undefined") return collapsed;
  loaded = true;
  try {
    collapsed = window.localStorage.getItem(STORE_KEY) === "1";
  } catch {
    // Private browsing or a disabled store. The default is fine.
  }
  return collapsed;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * False on the server and on the first client render.
 *
 * Reading localStorage during render would make the markup depend on a value
 * the server cannot know, which is a hydration mismatch. The drawer is the
 * default, so a collapsed rail appears immediately after hydration instead.
 */
export function useNavCollapsed(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => load(),
    () => false,
  );
}

export function setNavCollapsed(next: boolean): void {
  if (collapsed === next && loaded) return;
  collapsed = next;
  loaded = true;
  try {
    window.localStorage.setItem(STORE_KEY, next ? "1" : "0");
  } catch {
    // Keep it for this session and move on.
  }
  for (const listener of listeners) listener();
}

export function toggleNavCollapsed(): void {
  setNavCollapsed(!load());
}
