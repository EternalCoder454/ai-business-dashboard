/**
 * Whether this browser has been through the introduction.
 *
 * Its own module for the reason BRAND_COLOURS has one. It lived in Setup.tsx,
 * which is a component that pulls in the store, which pulls in most of the app,
 * and the account settings page imported the constant out of it. That closed a
 * cycle: the page evaluated, reached into Setup, and read the const before
 * Setup's own body had run, which is a temporal dead zone error and a page that
 * will not render. A string with no imports of its own cannot do that.
 *
 * The key carries a version, so the tour can be shown to everybody again later
 * by bumping it rather than by hunting for who has already seen what.
 */
export const TOUR_KEY = "eterneon:tour-v1";

/**
 * Which introduction this is.
 *
 * Stored on the account rather than a flag, so the tour can be shown to
 * everybody again later by moving this on. Compared against account.tourSeen.
 */
export const TOUR_VERSION = "v1";
