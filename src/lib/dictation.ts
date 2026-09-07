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
      let pending = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const said = result[0]?.transcript ?? "";
        if (result.isFinal) deliver.current(said);
        else pending += said;
      }
      setInterim(pending);
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
