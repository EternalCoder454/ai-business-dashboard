"use client";

import { useEffect } from "react";

/**
 * Publishes the height of the on-screen keyboard as `--keyboard-inset`.
 *
 * Chrome Android honours `interactive-widget=resizes-content` and shrinks the
 * layout itself, leaving this at zero. iOS Safari does not: the layout viewport
 * keeps its full height and only the visual viewport shrinks, so a composer
 * pinned to the bottom ends up underneath the keyboard. Measuring the gap
 * between the two covers both, and the shell subtracts it from its own height.
 *
 * Only `resize` is observed. `scroll` fires continuously while the address bar
 * collapses, and resizing the shell on every frame of that is worse than the
 * gap it would close.
 */
export function useKeyboardInset(): void {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const root = document.documentElement;

    const sync = () => {
      const inset = Math.max(
        0,
        Math.round(window.innerHeight - viewport.height - viewport.offsetTop),
      );
      // Below this it is a toolbar or a rounding artefact, not a keyboard.
      root.style.setProperty("--keyboard-inset", inset > 120 ? `${inset}px` : "0px");
    };

    sync();
    viewport.addEventListener("resize", sync);
    return () => {
      viewport.removeEventListener("resize", sync);
      root.style.removeProperty("--keyboard-inset");
    };
  }, []);
}
