/**
 * That the manual is written the way a manual is written, and that the search
 * index still matches it.
 *
 * Two different failures, and neither is visible from the file it happens in.
 *
 * The headings list is generated so the shell does not carry 24KB of prose to
 * match two dozen short strings. Splitting them is only safe while the two
 * agree: a generated file that has quietly stopped matching is worse than no
 * split at all, because the palette would then offer sections that are not
 * there and miss ones that are.
 *
 * And the writing drifts. Titles turn into sentences, and definitions turn into
 * riddles: decisions were once "something that has been settled, so it is not
 * reopened by accident", which is accurate and which nobody says out loud. Both
 * are easy to write and hard to notice afterwards, so they are checked here.
 *
 *   npm run documentation-test
 */
import { DOCUMENTATION, allSections } from "../src/lib/documentation";
import { DOC_HEADINGS } from "../src/lib/documentation.titles";

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures += 1;
}

const sections = allSections();

console.log(`\nthe generated headings match the manual (${sections.length} sections)`);
{
  check(
    "same number",
    DOC_HEADINGS.length === sections.length,
    `${DOC_HEADINGS.length} against ${sections.length}`,
  );

  const wrong = sections.findIndex(
    (section, i) =>
      DOC_HEADINGS[i]?.id !== section.id || DOC_HEADINGS[i]?.title !== section.title,
  );
  check(
    "same ids and titles, in the same order",
    wrong === -1,
    wrong === -1 ? "" : `position ${wrong}: ${DOC_HEADINGS[wrong]?.id ?? "missing"} against ${sections[wrong].id}`,
  );

  check(
    "every heading names its chapter",
    DOC_HEADINGS.every((heading) => heading.chapter.length > 0),
  );
}

console.log("\nthe manual is still well formed");
{
  const ids = sections.map((section) => section.id);
  check("no duplicate anchors", new Set(ids).size === ids.length);
  check("every section has a body", sections.every((section) => section.body.length > 50));

  /*
   * Every internal link points at a section that exists. A dead anchor in a
   * manual is worse than no link, because it reads as a promise that there is
   * more somewhere and then does nothing.
   */
  const known = new Set(ids);
  const dead: string[] = [];
  for (const section of sections) {
    for (const match of section.body.matchAll(/\]\(#([a-z0-9-]+)\)/g)) {
      if (!known.has(match[1])) dead.push(`${section.id} links to #${match[1]}`);
    }
  }
  check("no link points at a section that is gone", dead.length === 0, dead.join(", ") || "none");
}

console.log("\ntitles are labels rather than sentences");
{
  const titles = [
    ...DOCUMENTATION.map((chapter) => chapter.title),
    ...sections.map((section) => section.title),
  ];

  /*
   * Confluence's own project template is the reference here: every heading in
   * it is a short noun phrase. Objectives, Constraints, Next steps. A heading
   * phrased as a question or a sentence makes somebody scanning a contents
   * list read it to find out whether it is the one they want.
   */
  const questions = titles.filter((title) => /^(what|how|why|when|who|where)\b/i.test(title));
  check("none begins as a question", questions.length === 0, questions.join(", ") || "none");

  const sentences = titles.filter((title) => /[.?!]$/.test(title));
  check("none ends in punctuation", sentences.length === 0, sentences.join(", ") || "none");

  const long = titles.filter((title) => title.split(/\s+/).length > 4);
  check("none runs past four words", long.length === 0, long.join(", ") || "none");
}

console.log("\nand the writing keeps the house rules");
{
  const everything = sections.map((section) => section.body).join("\n");

  /*
   * Table separators are the one legitimate run of hyphens in this file, so
   * they are removed before looking rather than allowed for afterwards.
   */
  const prose = everything.replace(/^\|[\s|:-]+\|$/gm, "");
  check("no em dash", !prose.includes("—"));
  check("no en dash", !prose.includes("–"));
  check("no double hyphen", !prose.includes("--"));
}

console.log(
  failures === 0
    ? "\nall checks passed"
    : `\n${failures} FAILURES ABOVE. Run npm run documentation-titles.`,
);
process.exit(failures === 0 ? 0 : 1);
