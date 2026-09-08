"use client";

import { useSyncExternalStore } from "react";
import type { SearchShortcut, SidebarSide } from "./types";

/**
 * Which side the navigation sits on, and which key opens search.
 *
 * Held in the browser rather than in the workspace, which is the correction
 * this move is really making. Both were workspace columns anybody could write,
 * so a left-hander moving the navigation moved it for the whole company, and
 * somebody who types a lot of slashes turning the search key off took it away
 * from everyone. They are the same mistake the theme made and the same fix: a
 * fact about the person and the machine in front of them, not about the
 * business.
 *
 * There is no company default to fall back to any more, because neither of
 * these is a decision a business has any reason to make. The shipped values are
 * the defaults.
 */

const SIDE_KEY = "eterneon.desk.side.v1";
const SEARCH_KEY = "eterneon.desk.search.v1";

let side: SidebarSide | null = null;
let search: SearchShortcut | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function load(): void {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const storedSide = window.localStorage.getItem(SIDE_KEY);
    if (storedSide === "left" || storedSide === "right") side = storedSide;
    const storedSearch = window.localStorage.getItem(SEARCH_KEY);
    if (storedSearch === "slash" || storedSearch === "k" || storedSearch === "none") {
      search = storedSearch;
    }
  } catch {
    // Private browsing or a blocked store. The shipped defaults hold.
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function announce(): void {
  for (const listener of listeners) listener();
}

/**
 * Null on the server and on the first client render, like every other
 * browser-held preference here: reading storage during render is a hydration
 * mismatch, and the store lays these over the defaults once they arrive.
 */
export function useSidebarSideChoice(): SidebarSide | null {
  return useSyncExternalStore(
    subscribe,
    () => {
      load();
      return side;
    },
    () => null,
  );
}

export function useSearchShortcutChoice(): SearchShortcut | null {
  return useSyncExternalStore(
    subscribe,
    () => {
      load();
      return search;
    },
    () => null,
  );
}

export function setSidebarSideChoice(next: SidebarSide): void {
  load();
  side = next;
  try {
    window.localStorage.setItem(SIDE_KEY, next);
  } catch {
    // It still holds for this session.
  }
  announce();
}

export function setSearchShortcutChoice(next: SearchShortcut): void {
  load();
  search = next;
  try {
    window.localStorage.setItem(SEARCH_KEY, next);
  } catch {
    // It still holds for this session.
  }
  announce();
}
