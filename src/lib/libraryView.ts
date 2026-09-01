"use client";

import { useSyncExternalStore } from "react";

/**
 * How the Library lays its files out.
 *
 * Kept in this browser rather than in the workspace, for the same reason the
 * collapsed rail is: it follows the screen, not the company. A phone wants the
 * list and a monitor wants the cards, and syncing the choice between them
 * would leave one of the two wrong every time. See [[navCollapsed]] for the
 * same argument at more length.
 */
export type LibraryView = "cards" | "compact" | "list";

export const LIBRARY_VIEWS: { id: LibraryView; label: string }[] = [
  { id: "cards", label: "Cards" },
  { id: "compact", label: "Compact" },
  { id: "list", label: "List" },
];

const STORE_KEY = "eterneon.library.view.v1";
const DEFAULT: LibraryView = "cards";

let view: LibraryView = DEFAULT;
let loaded = false;
const listeners = new Set<() => void>();

function isView(value: string | null): value is LibraryView {
  return value === "cards" || value === "compact" || value === "list";
}

function load(): LibraryView {
  if (loaded || typeof window === "undefined") return view;
  loaded = true;
  try {
    const stored = window.localStorage.getItem(STORE_KEY);
    if (isView(stored)) view = stored;
  } catch {
    // Private browsing or a disabled store. The default is fine.
  }
  return view;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Cards on the server and on the first client render, whatever is stored.
 *
 * Reading localStorage during render would make the markup depend on something
 * the server cannot know, which is a hydration mismatch. The stored view takes
 * over immediately after hydration.
 */
export function useLibraryView(): LibraryView {
  return useSyncExternalStore(
    subscribe,
    () => load(),
    () => DEFAULT,
  );
}

export function setLibraryView(next: LibraryView): void {
  if (view === next && loaded) return;
  view = next;
  loaded = true;
  try {
    window.localStorage.setItem(STORE_KEY, next);
  } catch {
    // Keep it for this session and move on.
  }
  for (const listener of listeners) listener();
}
