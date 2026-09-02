/**
 * Readable, sortable, unique enough.
 *
 * A prefix says what the thing is when an id turns up in a log, the timestamp
 * makes a directory listing sort itself into the order things happened, and the
 * random tail is what actually stops two of them colliding.
 *
 * This lived in the IndexedDB module, which meant every screen that created a
 * row pulled the whole local-storage layer into its bundle to get six lines.
 */
export function newId(prefix: string): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${random}`;
}
