import { useState } from "react";

/**
 * The current time, read once when the component mounts.
 *
 * Calling `Date.now()` during render makes the output depend on when React
 * happened to run, which is not pure and is what the compiler objects to. A
 * screen left open past a boundary shows the old reckoning until it is
 * reloaded, which is the right trade for anything measured in days.
 */
export function useNow(): number {
  const [now] = useState(() => Date.now());
  return now;
}
