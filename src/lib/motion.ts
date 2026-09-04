"use client";

import { animate } from "motion/mini";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Every animation in the panel, driven by Motion.
 *
 * `motion/mini` rather than `motion/react`. The React bindings ship their own
 * animation engine, which measured 48KB over the wire; mini drives the
 * browser's native Web Animations API instead and is a fraction of that. The
 * panel does not need layout projection, drag, or scroll linking, so the
 * difference buys nothing and costs on every route.
 *
 * The trade worth knowing: WAAPI animates compositor properties, so transform,
 * opacity and filter are what belongs here. Height and colour work but are not
 * free, and anything laid out on the main thread should be a CSS transition
 * instead.
 *
 * The tokens below are the same values as the Material easing and duration
 * custom properties in globals.css. They are repeated here rather than read
 * from the stylesheet because reading a custom property costs a style
 * resolution per call, and these are hot.
 */

/** Material 3 easing, matching --md-motion-* in globals.css. */
export const EASE = {
  standard: [0.2, 0, 0, 1],
  /** Arriving: slow to settle, so the end of the movement is readable. */
  decelerate: [0.05, 0.7, 0.1, 1],
  /** Leaving: quick to go, so nothing on its way out holds anybody up. */
  accelerate: [0.3, 0, 0.8, 0.15],
} as const;

/** Material 3 durations, in seconds because that is what Motion takes. */
export const DURATION = {
  short: 0.15,
  medium: 0.3,
  long: 0.45,
} as const;

/**
 * Whether this person has asked for less movement.
 *
 * Read per call rather than cached: somebody can change it while the app is
 * open, and an animation is cheap enough that one media query lookup does not
 * matter.
 */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Runs one animation, or skips straight to the end.
 *
 * Every animation in the panel goes through here so reduced motion is handled
 * once. Under it the element is set to its final state immediately rather than
 * left alone: an entrance that starts at opacity 0 and never runs would leave
 * the content invisible, which is the opposite of what was asked for.
 */
export function play(
  element: Element | null | undefined,
  keyframes: Record<string, unknown>,
  options: { duration?: number; ease?: readonly number[]; delay?: number } = {},
): Promise<void> {
  if (!element) return Promise.resolve();

  const duration = prefersReducedMotion() ? 0 : (options.duration ?? DURATION.medium);
  const delay = prefersReducedMotion() ? 0 : (options.delay ?? 0);

  try {
    const controls = animate(element, keyframes as never, {
      duration,
      delay,
      ease: (options.ease ?? EASE.standard) as never,
    } as never);
    return (controls.finished as Promise<unknown>).then(() => undefined).catch(() => undefined);
  } catch {
    // A browser without WAAPI, or an element detached mid-flight. Neither is
    // worth an exception: the screen is correct, it just did not move.
    return Promise.resolve();
  }
}

/**
 * Keeps something in the tree long enough to animate out.
 *
 * This is the part that cannot be done in CSS at all. A component that returns
 * null when it closes is gone on that frame, so there is nothing left to
 * animate; every dialog in the panel used to vanish while its scrim was still
 * fading, which reads as a glitch rather than as speed.
 *
 * `render` stays true through the exit and goes false when it finishes, so the
 * caller renders normally and does not think about timing. The animation itself
 * is the caller's, passed as `run`, because what leaving looks like belongs to
 * the thing that is leaving.
 */
export function usePresence(
  open: boolean,
  run: (phase: "enter" | "exit") => Promise<unknown> | void,
): boolean {
  const [render, setRender] = useState(open);

  /*
   * Kept in a ref so a caller can write the animation inline without the effect
   * below restarting on every render.
   *
   * Synced in an effect rather than assigned during render: writing a ref while
   * rendering is not safe under concurrent React, which may render a tree it
   * then throws away. Declared before the effect that reads it, because effects
   * in one component run in the order they are written, so by the time the open
   * change is handled this is already current.
   */
  const latest = useRef(run);
  useLayoutEffect(() => {
    latest.current = run;
  });

  useEffect(() => {
    if (open) {
      setRender(true);
      return;
    }
    let live = true;
    // Nothing mounted means nothing to animate away.
    setRender((mounted) => {
      if (!mounted) return false;
      void Promise.resolve(latest.current("exit"))
        .catch(() => undefined)
        .finally(() => {
          if (live) setRender(false);
        });
      return true;
    });
    return () => {
      live = false;
    };
  }, [open]);

  // Before paint, so the first frame is the starting state rather than a flash
  // of the finished one.
  useLayoutEffect(() => {
    if (render && open) void Promise.resolve(latest.current("enter"))?.catch?.(() => undefined);
  }, [render, open]);

  return render;
}

/**
 * Animates something in once, when it first appears.
 *
 * Replaces the entrance keyframes that used to be classes in the stylesheet.
 * Returns a ref callback rather than a ref object so it runs the moment the
 * element exists, including for a list item added later.
 */
export function useEnter(
  keyframes: Record<string, unknown> = { opacity: [0, 1], transform: ["translateY(6px)", "none"] },
  options: { duration?: number; ease?: readonly number[]; delay?: number } = {},
) {
  const done = useRef(new WeakSet<Element>());

  return useCallback(
    (element: HTMLElement | null) => {
      // Once per element. Without this, every re-render replays the entrance,
      // which is the classic way an interface ends up flickering while
      // somebody types.
      if (!element || done.current.has(element)) return;
      done.current.add(element);
      void play(element, keyframes, { duration: DURATION.medium, ease: EASE.decelerate, ...options });
    },
    // The caller writes these inline, so comparing by identity would re-run on
    // every render. They are read at call time instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
}

/**
 * Brings a list in one item after another.
 *
 * A short step and a hard cap: past about five items a stagger stops reading as
 * one list arriving and starts reading as a queue, and somebody waiting on the
 * sixth row does not care that it was deliberate.
 */
export function stagger(container: Element | null, selector = ":scope > *"): void {
  if (!container) return;
  const items = [...container.querySelectorAll(selector)].slice(0, 5);
  items.forEach((item, index) => {
    void play(
      item,
      { opacity: [0, 1], transform: ["translateY(8px)", "none"] },
      { duration: DURATION.medium, ease: EASE.decelerate, delay: index * 0.03 },
    );
  });
}
