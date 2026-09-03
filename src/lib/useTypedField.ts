"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A text field that saves a moment after somebody stops typing.
 *
 * The fields in Settings wrote straight through on every keystroke, so each
 * character was an HTTP request, a transaction, and a full workspace row
 * rewritten. Telemetry found it: 243 saves in an hour against one page load and
 * two chat messages, which is one person editing the writing rules once.
 *
 * Typing has to stay local, because a controlled input fed from a round trip
 * drops characters the moment the network is slower than the person.
 *
 * `dirty` is what makes it safe to hold a local copy. Until somebody types, the
 * field follows the store, so it fills in on load and reflects a change made
 * anywhere else. After that it stops following, so a save landing back from the
 * server cannot yank a half typed sentence out from under them.
 *
 * The saver is held in a ref rather than named as a dependency. It comes from
 * the store's context value, whose identity changes whenever any data changes,
 * including as a result of this very save: as a dependency it would restart the
 * timer on every unrelated change and re-save after every save of its own.
 */
export function useTypedField(
  remote: string,
  save: (value: string) => void,
  delay = 600,
): {
  value: string;
  onChange: (next: string) => void;
  /** For anything that replaces the text without typing, such as a reset. */
  replace: (next: string) => void;
} {
  const [value, setValue] = useState(remote);
  const dirty = useRef(false);
  const saver = useRef(save);
  /** Whether a save is owed. Read by the flush on the way out. */
  const owed = useRef(false);
  const latest = useRef(value);

  /*
   * Both kept current in an effect rather than assigned while rendering: a
   * render can be thrown away and rerun, and a ref written during a discarded
   * one has still been written. The timer callback and the flush on the way
   * out run after the effects, so they see the latest values either way.
   */
  useEffect(() => {
    saver.current = save;
    latest.current = value;
  });

  useEffect(() => {
    if (!dirty.current) setValue(remote);
  }, [remote]);

  useEffect(() => {
    if (!dirty.current) return;
    owed.current = true;
    const timer = window.setTimeout(() => {
      owed.current = false;
      saver.current(value);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  /*
   * Anything still owed is written on the way out. Debouncing opens a hole
   * that saving on every keystroke did not have: type a name, click away
   * inside the delay, and the timer is cleared with the component and the edit
   * is gone.
   */
  useEffect(
    () => () => {
      if (owed.current) saver.current(latest.current);
    },
    [],
  );

  return {
    value,
    onChange: (next: string) => {
      dirty.current = true;
      setValue(next);
    },
    // Saves at once and goes back to following the store, since the new text
    // did not come from the keyboard and there is nothing to protect.
    replace: (next: string) => {
      dirty.current = false;
      owed.current = false;
      setValue(next);
      saver.current(next);
    },
  };
}
