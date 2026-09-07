/**
 * How a spoken phrase joins what is already in the box.
 *
 * The recogniser is the browser's and cannot be tested here. What can, and what
 * actually breaks, is the joining: phrases arrive with no leading space and no
 * capital, so concatenating them naively produces one long lowercase run that
 * reads as a transcription fault rather than as the person speaking normally.
 *
 *   npm run dictation-test
 */
import { appendSpoken, readResults } from "../src/lib/dictation";

/* A real newline, built rather than escaped: the first version of this test
   wrote a backslash and an n into the string and then asserted that the code
   treated it as whitespace, which is a test failing at itself. */
const NEWLINE = String.fromCharCode(10);

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures += 1;
}

console.log("\nthe first phrase starts a sentence");
{
  check("capitalised into an empty box", appendSpoken("", "what is our margin") === "What is our margin", appendSpoken("", "what is our margin"));
  check("already capitalised is left alone", appendSpoken("", "Acme owes us") === "Acme owes us");
  check("surrounding space is trimmed", appendSpoken("", "  hello  ") === "Hello");
}

console.log("\nlater phrases are added, not substituted");
{
  const first = appendSpoken("", "what is our margin");
  const second = appendSpoken(first, "on the Acme job");
  check(
    "joined with one space",
    second === "What is our margin on the Acme job",
    second,
  );
  check(
    "and the second is not capitalised mid sentence",
    !second.includes("On the Acme"),
    second,
  );
}

console.log("\nit does not fight what somebody typed");
{
  check(
    "appended after typed text",
    appendSpoken("Draft a reply saying", "we can start Monday") ===
      "Draft a reply saying we can start Monday",
  );
  // Somebody who typed a trailing space meant it, and adding a second makes a
  // gap in the middle of a sentence.
  check(
    "a trailing space is not doubled",
    appendSpoken("Draft a reply ", "saying yes") === "Draft a reply saying yes",
    appendSpoken("Draft a reply ", "saying yes"),
  );
  check(
    "a newline counts as space too",
    appendSpoken("First line" + NEWLINE, "second thought") ===
      "First line" + NEWLINE + "second thought",
    JSON.stringify(appendSpoken("First line" + NEWLINE, "second thought")),
  );
}

console.log("\nnothing said changes nothing");
{
  check("an empty phrase is dropped", appendSpoken("Keep this", "") === "Keep this");
  check("whitespace is dropped too", appendSpoken("Keep this", "   ") === "Keep this");
  check("and does not add a space", appendSpoken("Keep this", "  ") === "Keep this");
  check("into an empty box, still empty", appendSpoken("", "  ") === "");
}

console.log("\na settled phrase is delivered once, however often it comes back");
{
  /*
   * The sequence that produced "hello hello hello hello ruth hello ruth".
   *
   * results is cumulative for the whole session rather than a delta, so every
   * event carries every phrase said so far, and resultIndex is only a hint
   * about where the browser started rewriting. Chrome sends events whose
   * resultIndex points at or behind something that went final several events
   * ago. Walking from resultIndex and appending every final result therefore
   * appends the same phrase again on every event after it settles.
   */
  const said: string[] = [];
  let through = -1;
  let interim = "";

  const event = (
    results: { transcript: string; isFinal: boolean }[],
    resultIndex: number,
  ) => {
    const read = readResults(results, resultIndex, through);
    through = read.through;
    interim = read.interim;
    said.push(...read.phrases);
  };

  const F = (transcript: string) => ({ transcript, isFinal: true });
  const I = (transcript: string) => ({ transcript, isFinal: false });

  event([I("hel")], 0);
  check("nothing is committed while it is still interim", said.length === 0);
  check("but it is shown", interim === "hel", interim);

  event([I("hello")], 0);
  check("a refined interim still commits nothing", said.length === 0, said.join("|"));

  event([F("hello")], 0);
  check("settling commits it once", said.join("|") === "hello", said.join("|"));

  // The same final result, sent again, which is the actual bug.
  event([F("hello")], 0);
  check("and sending it again commits nothing", said.join("|") === "hello", said.join("|"));

  event([F("hello"), I("ru")], 1);
  check("a new interim beside it is shown, not committed", said.join("|") === "hello", said.join("|"));
  check("and the interim is only the new part", interim === "ru", interim);

  event([F("hello"), F("ruth")], 1);
  check("the second phrase commits once", said.join("|") === "hello|ruth", said.join("|"));

  // An event pointing back at the start, which is what Chrome does and what
  // turned one word into six.
  event([F("hello"), F("ruth")], 0);
  check(
    "an event pointing back at the beginning repeats nothing",
    said.join("|") === "hello|ruth",
    said.join("|"),
  );

  event([F("hello"), F("ruth"), I("what is")], 2);
  check("still nothing repeated", said.join("|") === "hello|ruth", said.join("|"));
  check("and the newest interim shows", interim === "what is", interim);
}

console.log("\na new session starts counting again");
{
  // through resets to -1 on start. Without that, the first phrase of the second
  // session sits at index 0, below a stale high-water mark, and is swallowed.
  const first = readResults([{ transcript: "one", isFinal: true }], 0, -1);
  check("first session delivers", first.phrases.join("|") === "one" && first.through === 0);

  const second = readResults([{ transcript: "two", isFinal: true }], 0, -1);
  check("second session delivers too", second.phrases.join("|") === "two");

  const stale = readResults([{ transcript: "two", isFinal: true }], 0, first.through);
  check("and would have been swallowed without the reset", stale.phrases.length === 0);
}

console.log("\ntwo phrases arriving in one event both land");
{
  const read = readResults(
    [
      { transcript: "first", isFinal: true },
      { transcript: "second", isFinal: true },
    ],
    0,
    -1,
  );
  check("both delivered", read.phrases.join("|") === "first|second", read.phrases.join("|"));
  check("and the mark moves to the last", read.through === 1, String(read.through));
}

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} FAILURES ABOVE`);
process.exit(failures === 0 ? 0 : 1);
