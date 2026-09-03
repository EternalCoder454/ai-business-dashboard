/**
 * Which links get taken out of a message, and which text is not a link at all.
 *
 * Both halves matter and the second is the one that breaks things quietly. A
 * domain match that is too eager turns `report.pdf`, `index.ts` and somebody's
 * email address into "[link removed]", which is a colleague's message being
 * mangled by a safety feature they cannot see.
 *
 * Run with: npm run links-test
 */
import { findLinks, hostOf, isAllowed, normaliseDomain, scrubLinks, REMOVED } from "../src/lib/links";

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!condition) failures += 1;
}

console.log("what counts as a link");
for (const [text, host] of [
  ["https://example.com/path", "example.com"],
  ["http://example.com", "example.com"],
  ["www.example.com", "example.com"],
  ["example.com", "example.com"],
  ["docs.example.co.uk/a/b", "docs.example.co.uk"],
  ["HTTPS://Example.COM", "example.com"],
] as const) {
  check(`${text} is ${host}`, hostOf(text) === host, hostOf(text));
}

console.log("\nwhat is not a link, and must survive untouched");
for (const text of [
  "report.pdf",
  "index.ts",
  "Component.tsx",
  "notes.md",
  "photo.jpeg",
  "archive.tar.gz",
  "deploy.sh",
  "data.json",
  "v1.2",
  "3.14",
  "e.g",
  "etc.",
]) {
  check(`${text} is not a link`, hostOf(text) === "", hostOf(text));
}

console.log("\nan email address is left alone");
const email = scrubLinks("ask ada@example.com about it", []);
check("no link found", email.removed.length === 0, email.removed.join());
check("text unchanged", email.text === "ask ada@example.com about it", email.text);

console.log("\nthe list covers a domain and everything under it");
check("itself", isAllowed("example.com", ["example.com"]));
check("a subdomain", isAllowed("docs.example.com", ["example.com"]));
check("a deep subdomain", isAllowed("a.b.example.com", ["example.com"]));
check("with www", isAllowed("www.example.com", ["example.com"]));
check("a different domain is not", !isAllowed("evil.com", ["example.com"]));
// The one that catches a lookalike: allowing example.com must not allow a
// domain that merely ends with those letters.
check("a lookalike is not", !isAllowed("notexample.com", ["example.com"]));
check("a suffix attack is not", !isAllowed("example.com.evil.com", ["example.com"]));
check("and it does not work upwards", !isAllowed("example.com", ["docs.example.com"]));

console.log("\nstripping");
const one = scrubLinks("have a look at https://evil.com/login please", []);
check("the link is gone", !one.text.includes("evil.com"), one.text);
check("the sentence survives", one.text.startsWith("have a look at"), one.text);
check("the marker is there", one.text.includes(REMOVED));
check("the host is reported", one.removed.join() === "evil.com", one.removed.join());

const kept = scrubLinks("the docs are at https://example.com/guide", ["example.com"]);
check("an allowed link stays", kept.text.includes("https://example.com/guide"), kept.text);
check("and nothing is reported", kept.removed.length === 0);

const mixed = scrubLinks("good https://example.com bad https://evil.com", ["example.com"]);
check("the allowed one stays", mixed.text.includes("example.com"));
check("the other goes", !mixed.text.includes("evil.com"), mixed.text);
check("one host reported", mixed.removed.join() === "evil.com", mixed.removed.join());

console.log("\ntrailing punctuation belongs to the sentence");
const stop = scrubLinks("see https://evil.com.", []);
check("the full stop is not part of the host", stop.removed.join() === "evil.com", stop.removed.join());
const paren = scrubLinks("see (https://evil.com)", []);
check("nor is a bracket", paren.removed.join() === "evil.com", paren.removed.join());

console.log("\ncredentials in a URL are a disguise");
// https://example.com@evil.com goes to evil.com, and reads as example.com.
check(
  "the host is what the browser would use",
  hostOf("https://example.com@evil.com/login") === "evil.com",
  hostOf("https://example.com@evil.com/login"),
);
const disguised = scrubLinks("https://example.com@evil.com/login", ["example.com"]);
check("so an allowed name in front does not save it", disguised.removed.join() === "evil.com", disguised.removed.join());

console.log("\na message that was only links says so once");
const many = scrubLinks("https://a.com https://b.com https://c.com", []);
check("markers collapse", (many.text.match(/link removed/g) ?? []).length === 1, many.text);
check("every host is still reported", many.removed.length === 3, many.removed.join());

console.log("\nwhat somebody types into the allowlist");
for (const [input, out] of [
  ["example.com", "example.com"],
  ["  Example.COM  ", "example.com"],
  ["https://example.com/some/path", "example.com"],
  ["www.example.com", "example.com"],
  ["docs.example.com", "docs.example.com"],
  ["", ""],
  ["not a domain", ""],
  ["report.pdf", ""],
] as const) {
  check(`${JSON.stringify(input)} -> ${JSON.stringify(out)}`, normaliseDomain(input) === out, normaliseDomain(input));
}

console.log("\nfinding links for a report");
const found = findLinks("one https://a.com and two www.b.com and three c.co.uk/x");
check("all three", found.length === 3, String(found.length));
check("hosts", found.map((f) => f.host).join() === "a.com,b.com,c.co.uk", found.map((f) => f.host).join());

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
