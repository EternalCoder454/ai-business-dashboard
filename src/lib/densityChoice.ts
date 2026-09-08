"use client";

import { useSyncExternalStore } from "react";
import type { Density } from "./types";

/**
 * How tightly packed the panel is, chosen by the person rather than the company.
 *
 * The same two settings that look like one as the theme, and for the same
 * reason. A business decides what its panel opens as, because that is the first
 * impression of it. But somebody on a thirteen inch laptop wants everything
 * closer together whatever their company thinks, and somebody who finds tight
 * rows hard to read wants the opposite, and neither of them should have to move
 * everyone else to get it.
 *
 * Absent is a real third state and is not the same as having chosen the setting
 * the company happens to be on: somebody who picks compact today should stay
 * compact when the business moves to comfortable, and somebody who never
 * touched it should move with it.
 */

const KEY = "eterneon.density.choice.v1";

let choice: Density | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function load(): Density | null {
  if (loaded || typeof window === "undefined") return choice;
  loaded = true;
  try {
    const value = window.localStorage.getItem(KEY);
    choice = value === "compact" || value === "comfortable" ? value : null;
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
 * Null on the server and on the first client render, like every other
 * browser-held preference here: reading storage during render is a hydration
 * mismatch. Nothing is visible because the inline script in the root layout has
 * already put the right value on the document before any of this runs.
 */
export function useDensityChoice(): Density | null {
  return useSyncExternalStore(
    subscribe,
    () => load(),
    () => null,
  );
}

/** Null follows the company again. */
export function setDensityChoice(next: Density | null): void {
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
