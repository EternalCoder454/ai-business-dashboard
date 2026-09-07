"use client";

import { useSyncExternalStore } from "react";
import type { ThemeMode } from "./types";

/**
 * Light or dark, chosen by the person rather than by the company.
 *
 * The theme was a workspace setting, which meant two things that were both
 * wrong. Anybody could change it, and changing it changed it for everybody, so
 * one person preferring light moved the whole business into light. And there
 * was no way to prefer light on your own laptop and leave the company alone.
 *
 * Now it is two settings that look like one. An administrator sets what the
 * business opens as, in Settings, which is the right thing for a business to
 * decide: it is the first impression of the panel and it goes with the mark and
 * the name. Anybody can then choose differently for themselves, and that choice
 * lives in their browser and reaches nothing else.
 *
 * Absent means following the company, which is a real third state and not the
 * same as having chosen the colour the company happens to be on. Somebody who
 * picks dark today should stay dark when the business moves to light; somebody
 * who never touched it should move with it.
 */

const KEY = "eterneon.theme.choice.v1";

let choice: ThemeMode | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function load(): ThemeMode | null {
  if (loaded || typeof window === "undefined") return choice;
  loaded = true;
  try {
    const value = window.localStorage.getItem(KEY);
    choice = value === "light" || value === "dark" ? value : null;
  } catch {
    // Private browsing or a blocked store. Following the company is the default
    // and is never wrong, only sometimes not what was wanted.
  }
  return choice;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Null on the server and on the first client render.
 *
 * The same trade every browser-held preference in here makes: reading storage
 * during render is a hydration mismatch. It costs nothing visible, because the
 * inline script in the root layout has already put the right theme on the
 * document before any of this runs.
 */
export function useThemeChoice(): ThemeMode | null {
  return useSyncExternalStore(
    subscribe,
    () => load(),
    () => null,
  );
}

/** Null follows the company again. */
export function setThemeChoice(next: ThemeMode | null): void {
  load();
  choice = next;
  try {
    if (next) window.localStorage.setItem(KEY, next);
    else window.localStorage.removeItem(KEY);
  } catch {
    // It still holds for this session.
  }
  for (const listener of listeners) listener();
}
