"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Speaking instead of typing, using what the browser already has.
 *
 * The Web Speech API rather than a transcription service, and that is a
 * decision rather than a shortcut. A service would need a key, a route, an
 * upload of somebody's voice and a bill per minute, for a feature whose whole
 * point is being able to ask a question while doing something else. The browser
 * does it for nothing.
 *
 * The cost of that choice is honest and worth stating: this is not universal.
 * Chrome, Edge and Safari have it, Firefox does not, and the control is absent
 * where the browser cannot do it rather than present and broken. In Chrome the
 * audio goes to Google to be recognised, which is a thing a business ought to
 * be told once rather than discover, so it is said on the control itself and in
 * the documentation.
 */

/*
 * Minimal shapes for an API the DOM types do not carry. Only what is used, so
 * this does not become a second, worse copy of a specification.
 */
interface SpeechAlternative {
  transcript: string;
}
interface SpeechResult {
  0: SpeechAlternative;
  isFinal: boolean;
  length: number;
}
interface SpeechResultList {
  length: number;
  [index: number]: SpeechResult;
}
interface SpeechEvent {
  resultIndex: number;
  results: SpeechResultList;
}
interface SpeechErrorEvent {
  error: string;
}
interface SpeechRecogniser {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechEvent) => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
}
type RecogniserConstructor = new () => SpeechRecogniser;

function constructorFor(): RecogniserConstructor | null {
  if (typeof window === "undefined") return null;
  const found = window as unknown as {
    SpeechRecognition?: RecogniserConstructor;
    webkitSpeechRecognition?: RecogniserConstructor;
  };
  return found.SpeechRecognition ?? found.webkitSpeechRecognition ?? null;
}

/**
 * What is new in a results event, and what has already been said.
 *
 * The whole of the duplication bug lives here. `event.results` is cumulative
 * for the session rather than a delta: it holds every result so far, and
 * `resultIndex` is only a hint about where the browser started rewriting. A
 * result that went final several events ago is still in the list, and Chrome
 * happily sends an event whose resultIndex points at or before it. So a loop
 * that appends every final result it walks past appends the same phrase again
 * on every event after it settled, which is what turned one "hello" into
 * "hello hello hello hello ruth hello ruth".
 *
 * The index of the last final result already delivered is therefore the state
 * that matters, not the index the event suggests. Anything at or below it has
 * been said; anything above it is new.
 *
 * @param through index of the last final result already delivered, or -1.
 */
export function readResults(
  results: { transcript: string; isFinal: boolean }[],
  resultIndex: number,
  through: number,
): { phrases: string[]; interim: string; through: number } {
  const phrases: string[] = [];
  let interim = "";
  let settled = through;

  // From whichever is earlier, since resultIndex can point behind what is
  // already delivered and the interim text lives past the end of it.
  const from = Math.max(0, Math.min(resultIndex, through + 1));

  for (let i = from; i < results.length; i += 1) {
    const result = results[i];
    if (!result) continue;
    if (result.isFinal) {
      if (i > through) {
        phrases.push(result.transcript);
        settled = Math.max(settled, i);
      }
    } else {
      interim += result.transcript;
    }
  }

  return { phrases, interim, through: settled };
}

export interface Dictation {
  /** False where the browser cannot do this, so the control can be absent. */
  supported: boolean;
  listening: boolean;
  /** What is being said now, before it settles. Shown, never committed. */
  interim: string;
  /** Said plainly, since it reaches somebody holding a phone. */
  error: string | null;
  start: () => void;
  stop: () => void;
}

/**
 * @param onText called with each settled phrase, to append where it belongs.
 *   Phrases rather than one transcript at the end, so a long dictation appears
 *   as it is spoken instead of arriving all at once when somebody stops.
 */
export function useDictation(onText: (text: string) => void): Dictation {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recogniser = useRef<SpeechRecogniser | null>(null);

  /*
   * Held in a ref rather than named as a dependency. The caller passes a
   * closure over the current draft, so it changes on every keystroke; as a
   * dependency it would tear down and rebuild the recogniser mid sentence.
   */
  const deliver = useRef(onText);
  deliver.current = onText;

  /*
   * The last final result already handed over, per session. Reset on start,
   * because a new session numbers its results from zero again and carrying a
   * stale high-water mark over would swallow the first thing said.
   */
  const delivered = useRef(-1);

  // After mount, because the API is on window and the server has no window.
  useEffect(() => {
    setSupported(constructorFor() !== null);
  }, []);

  const stop = useCallback(() => {
    recogniser.current?.stop();
    recogniser.current = null;
    setListening(false);
    setInterim("");
  }, []);

  // Nothing keeps listening after the composer is gone.
  useEffect(() => () => recogniser.current?.abort(), []);

  const start = useCallback(() => {
    const Recogniser = constructorFor();
    if (!Recogniser || recogniser.current) return;

    setError(null);
    delivered.current = -1;
    const live = new Recogniser();
    /*
     * Continuous, because a sentence is not the unit anybody thinks in. Without
     * it the browser stops at the first pause, which on a phone in a van means
     * stopping halfway through the thought.
     */
    live.continuous = true;
    live.interimResults = true;
    live.lang = navigator.language || "en-GB";

    live.onresult = (event) => {
      const flat: { transcript: string; isFinal: boolean }[] = [];
      for (let i = 0; i < event.results.length; i += 1) {
        const result = event.results[i];
        flat.push({ transcript: result?.[0]?.transcript ?? "", isFinal: Boolean(result?.isFinal) });
      }

      const read = readResults(flat, event.resultIndex, delivered.current);
      delivered.current = read.through;
      for (const phrase of read.phrases) deliver.current(phrase);
      setInterim(read.interim);
    };

    live.onerror = (event) => {
      /*
       * "no-speech" and "aborted" are not failures. The first is somebody
       * thinking, the second is them pressing stop, and reporting either as an
       * error would put a warning on screen for doing the right thing.
       */
      if (event.error === "no-speech" || event.error === "aborted") return;
      setError(
        event.error === "not-allowed"
          ? "The microphone is blocked for this site."
          : event.error === "network"
            ? "Speech recognition could not be reached."
            : "That did not come through.",
      );
      stop();
    };

    // The browser ends a session on its own, for a long silence or a timeout.
    // The button has to follow, or it sits there saying it is listening.
    live.onend = () => {
      recogniser.current = null;
      setListening(false);
      setInterim("");
    };

    try {
      live.start();
    } catch {
      setError("Dictation could not start.");
      return;
    }
    recogniser.current = live;
    setListening(true);
  }, [stop]);

  return { supported, listening, interim, error, start, stop };
}

/**
 * Adds a spoken phrase to what is already in the box.
 *
 * Appended rather than replacing, since somebody may have typed half of it, and
 * spaced rather than run together. The recogniser hands back phrases with no
 * leading space and no capital, which read as one long sentence when simply
 * concatenated.
 */
export function appendSpoken(draft: string, said: string): string {
  const phrase = said.trim();
  if (!phrase) return draft;
  if (!draft) return phrase.charAt(0).toUpperCase() + phrase.slice(1);
  // No double space, and no space before punctuation the recogniser produced.
  const gap = /\s$/.test(draft) ? "" : " ";
  return `${draft}${gap}${phrase}`;
}
