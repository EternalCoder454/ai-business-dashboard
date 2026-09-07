/**
 * That @ finds what was named and nothing that was not.
 *
 * The second half is the one worth testing. A draft is full of @ that means
 * nothing: an email address, a handle, a price in a table. Every one of those
 * has to pass through as text, because a menu that opens on the domain of an
 * email address is one nobody can type past, and a parser that decides
 * "@gmail" is a department sends a head somewhere it was never pointed.
 *
 *   npm run mentions-test
 */
import {
  findMentions,
  matchMentions,
  mentionUnderCursor,
  tokenFor,
  type Mentionable,
} from "../src/lib/mentions";

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures += 1;
}

const AVAILABLE: Mentionable[] = [
  { kind: "department", id: "d_fin", label: "Finance" },
  { kind: "department", id: "d_mkt", label: "Marketing" },
  { kind: "project", id: "p_1", label: "Q4 pricing" },
  { kind: "conversation", id: "c_1", label: "Supplier terms" },
  { kind: "conversation", id: "c_2", label: "Q1 refinancing" },
];

const names = (text: string) => findMentions(text, AVAILABLE).map((m) => m.label).join(", ");

console.log("\nnaming something finds it");
{
  check("a head", names("@Finance what did we agree") === "Finance");
  check("in the middle of a sentence", names("ask @Marketing about it") === "Marketing");
  check("case does not matter", names("@finance") === "Finance");
  check("a project, in brackets", names("look at @[Q4 pricing]") === "Q4 pricing");
  check("a conversation", names("compare with @[Supplier terms]") === "Supplier terms");
  check("two at once", names("@Finance and @[Q4 pricing]") === "Finance, Q4 pricing");
  check("the same one twice is one", findMentions("@Finance @finance", AVAILABLE).length === 1);
}

console.log("\nand an @ that names nothing is left alone");
{
  check("an email address", names("write to zach@eterneon.net") === "");
  check("a name nobody has", names("@Procurement should know") === "");
  check("a bare @", names("50 units @ 4.20") === "");
  check("an address that ends in a real name", names("someone@finance") === "");
}

console.log("\nthe menu opens where the cursor is and not before");
{
  const at = (text: string) => mentionUnderCursor(text, text.length);
  check("while typing a name", at("ask @fin")?.query === "fin");
  check("on a bare @", at("ask @")?.query === "");
  check("inside brackets, spaces and all", at("see @[Q4 pri")?.query === "Q4 pri");
  check("at the start of the line", at("@Fin")?.query === "Fin");
  check("after a bracket", at("(@Fin")?.query === "Fin");

  check("not once the word is finished", at("ask @Finance about it") === null);
  check("not in an email address", at("zach@eterneon") === null);
  check("and not where there is no @", at("ask Finance") === null);

  // The cursor is what decides, not the end of the text.
  const text = "ask @fin about the thing";
  check("only the token the cursor is in", mentionUnderCursor(text, 8)?.query === "fin");
  check("and not one it has left", mentionUnderCursor(text, 20) === null);
}

console.log("\nthe list narrows the way typing expects");
{
  const shown = (q: string) => matchMentions(q, AVAILABLE).map((i) => i.label).join(", ");
  check("what starts with it comes first", shown("fin") === "Finance, Q1 refinancing", shown("fin"));
  check("empty shows everything", matchMentions("", AVAILABLE).length === AVAILABLE.length);
  check("and nothing matching shows nothing", shown("zzz") === "");
}

console.log("\nand a name with a space is written with brackets");
{
  check("a plain name is bare", tokenFor(AVAILABLE[0]) === "@Finance");
  check("a name with a space is not", tokenFor(AVAILABLE[2]) === "@[Q4 pricing]");
  /*
   * The round trip is the whole contract between the menu and the parser: what
   * one writes, the other has to find.
   */
  const broken = AVAILABLE.filter((item) => findMentions(tokenFor(item), AVAILABLE)[0]?.id !== item.id);
  check("everything the menu writes is found again", broken.length === 0,
    broken.map((i) => i.label).join(", ") || "none");
}

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} FAILURES ABOVE`);
process.exit(failures === 0 ? 0 : 1);
