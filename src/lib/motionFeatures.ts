/**
 * Motion's animation features, fetched after the page is already usable.
 *
 * Worth explaining, because the obvious version of this is measurably worse.
 * Importing the feature set directly, the way the documentation shows, put
 * 143KB of JavaScript into the first load of every route in the panel. That is
 * more than the whole Word-file parser this pass had just removed, and it made
 * the task board and the settings page slower than they were before any of it,
 * to pay for a dialog closing nicely.
 *
 * Passing a function instead makes it a separate chunk that is fetched once,
 * after hydration, while the person is still reading the screen. Until it
 * arrives an `m` element renders as a plain element with its final styles, so
 * nothing is missing or misplaced, it simply has not animated yet. For a dialog
 * that has to be opened before it can animate, that window is over long before
 * anybody could see it.
 */
export const motionFeatures = () =>
  import("motion/react").then((module) => module.domAnimation);
