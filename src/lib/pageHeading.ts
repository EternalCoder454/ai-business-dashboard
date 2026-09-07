import { useSyncExternalStore } from "react";

/**
 * The heading of the page currently on screen, for the top app bar to read.
 *
 * On a phone the destination and the page heading were two separate bars, one
 * above the other, saying two halves of the same thing: "Dashboard", then
 * "Northbound Analytics" underneath it in its own bordered row. A desktop puts
 * exactly those two strings in one block, the section over the title, and
 * spends about half the height doing it.
 *
 * The two live in different trees, though. The bar belongs to the shell and the
 * heading belongs to whichever page is mounted, so the page publishes it here
 * and the bar subscribes. A module store rather than a context because the shell
 * would otherwise have to wrap every route in a provider it does not otherwise
 * need, and because this is the same shape as the other per-browser stores.
 */
let heading: string | null = null;
const listeners = new Set<() => void>();

/**
 * Called by the page that owns the heading, and called again with null when it
 * unmounts. A page that sets the same string twice does not wake anybody.
 */
export function setPageHeading(next: string | null): void {
  if (heading === next) return;
  heading = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Null on the server and on the first paint, because no page has mounted to
 * publish one yet. The bar falls back to the destination's own name, which is
 * what it always showed.
 */
export function usePageHeading(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => heading,
    () => null,
  );
}
