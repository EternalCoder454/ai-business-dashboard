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
import { appendSpoken } from "../src/lib/dictation";

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

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} FAILURES ABOVE`);
process.exit(failures === 0 ? 0 : 1);
