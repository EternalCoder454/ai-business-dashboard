"use client";

import { useSyncExternalStore } from "react";
import { setDateStyle, type Clock, type DateOrder } from "./routes";

/**
 * How dates and times are written, for this browser.
 *
 * The panel wrote 09/07/2026 everywhere, on purpose: leaving it to the
 * browser's locale meant two people looking at the same record read two
 * different strings, which is the wrong trade for something that is evidence.
 * The trouble is that 09/07 is the ninth of July to most of the world and the
 * seventh of September to the United States, and it is silently one of them.
 *
 * So it is still one written-out format rather than the locale's, and now it is
 * a format somebody chose. Held per browser, like the theme: which way round a
 * date reads is a fact about the person, and a business with people either side
 * of the Atlantic should not have to pick one of them to be wrong.
 *
 * The value is pushed into routes.ts rather than read from it, because
 * formatExactTime is a plain function called from dozens of places and threading
 * a preference through all of them would be worse than a module holding one.
 */
const ORDER_KEY = "eterneon.dates.order.v1";
const CLOCK_KEY = "eterneon.dates.clock.v1";

let order: DateOrder = "mdy";
let clock: Clock = "24";
let loaded = false;
const listeners = new Set<() => void>();

function load(): void {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const storedOrder = window.localStorage.getItem(ORDER_KEY);
    if (storedOrder === "mdy" || storedOrder === "dmy" || storedOrder === "ymd") {
      order = storedOrder;
    }
    const storedClock = window.localStorage.getItem(CLOCK_KEY);
    if (storedClock === "12" || storedClock === "24") clock = storedClock;
  } catch {
    // Blocked storage. The shipped format holds, which is what it always was.
  }
  setDateStyle(order, clock);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDateOrder(): DateOrder {
  return useSyncExternalStore(
    subscribe,
    () => {
      load();
      return order;
    },
    () => "mdy" as DateOrder,
  );
}

export function useClock(): Clock {
  return useSyncExternalStore(
    subscribe,
    () => {
      load();
      return clock;
    },
    () => "24" as Clock,
  );
}

export function setDateOrder(next: DateOrder): void {
  load();
  order = next;
  setDateStyle(order, clock);
  try {
    window.localStorage.setItem(ORDER_KEY, next);
  } catch {
    // It still holds for this session.
  }
  for (const listener of listeners) listener();
}

export function setClock(next: Clock): void {
  load();
  clock = next;
  setDateStyle(order, clock);
  try {
    window.localStorage.setItem(CLOCK_KEY, next);
  } catch {
    // It still holds for this session.
  }
  for (const listener of listeners) listener();
}
