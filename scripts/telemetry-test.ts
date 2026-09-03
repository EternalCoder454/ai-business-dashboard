/**
 * The promise telemetry makes is that it does not collect personal information.
 *
 * That promise lives in one function. Error messages are the leak nobody plans
 * for: a Postgres constraint violation quotes the row that broke it, a failed
 * fetch quotes the URL it called, and an invite failure says who it was to. All
 * three end up in an error message, and an error message is the one field here
 * that is not a number.
 *
 * So the scrubber gets a test with the real shapes in it, and a last check that
 * walks a set of addresses through it and fails if any survives.
 *
 * Run with: npm run telemetry-test
 */
import { kindOf, scrub } from "../src/lib/telemetry";

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!condition) failures += 1;
}

const gone = (input: string, needle: string) => !scrub(input).includes(needle);

console.log("addresses never survive");
check(
  "a plain one",
  gone("could not invite hello@example.com to the workspace", "hello@example.com"),
);
check(
  "one with a plus tag",
  gone("bounce for zachary.smith+work@eterneon.net", "zachary.smith+work@eterneon.net"),
);
check("two at once", gone("from a@b.co to c@d.co", "a@b.co") && gone("from a@b.co to c@d.co", "c@d.co"));
check("the marker is left behind", scrub("mail to a@b.co failed").includes("[address]"));

console.log("\nother things that identify a person or a place");
check("an address of a machine", gone("connect ECONNREFUSED 10.0.0.14:5432", "10.0.0.14"));
check("a url with a query on it", gone("GET https://x.co/api?token=abc123 failed", "token=abc123"));
check(
  "a long key or token",
  gone("bad key sk-ant-api03-QQQQWWWWEEEERRRRTTTTYYYY", "sk-ant-api03-QQQQWWWWEEEERRRRTTTTYYYY"),
);

console.log("\nvalues quoted by Postgres and by our own guards");
check(
  "a duplicate key names the value",
  gone(
    `duplicate key value violates unique constraint "api_keys_hash_idx" DETAIL: Key (token_hash)=(deadbeef) already exists.`,
    "api_keys_hash_idx",
  ),
);
check(
  "a check constraint quoting a title",
  gone(`new row for relation "deliverables" violates check constraint`, "deliverables"),
);

console.log("\nwhat it keeps, because a note that says nothing is not worth storing");
check("the shape of the failure survives", scrub("connect ECONNREFUSED 10.0.0.14:5432").includes("ECONNREFUSED"));
check("the verb survives", scrub("duplicate key value violates unique constraint \"x\"").includes("duplicate key value"));

console.log("\nbounds");
check("never longer than 200", scrub("x".repeat(5_000)).length <= 200);
check("collapses whitespace", scrub("a\n\n\t  b") === "a b");
check("empty stays empty", scrub("") === "");

console.log("\nthe kind is short and stable");
check("an Error gives its constructor", kindOf(new TypeError("nope")) === "TypeError");
check("a coded error prefers the code", kindOf(Object.assign(new Error("x"), { code: "ECONNRESET" })) === "ECONNRESET");
check("a thrown string does not crash it", kindOf("nope") === "string");
check("undefined does not crash it", kindOf(undefined) === "undefined");
check("never longer than 40", kindOf(Object.assign(new Error("x"), { code: "E".repeat(200) })).length <= 40);

/*
 * The backstop. Everything above is a case somebody thought of; this is the
 * one that catches the case nobody did, by running a set of addresses through
 * the shapes an error message actually takes.
 */
console.log("\nnothing that looks like an address gets through, in any wrapper");
const addresses = [
  "a@b.co",
  "first.last@example.com",
  "UPPER@EXAMPLE.COM",
  "with+tag@sub.domain.co.uk",
  "dashed-name@my-company.net",
];
const wrappers = [
  (a: string) => `invite to ${a} failed`,
  (a: string) => `Key (email)=(${a}) already exists.`,
  (a: string) => `"${a}" is not a member`,
  (a: string) => `fetch https://api.example.com/u/${a} returned 404`,
  (a: string) => `${a}`,
];
let leaked = 0;
for (const address of addresses) {
  for (const wrap of wrappers) {
    const out = scrub(wrap(address));
    // Case insensitive: the scrubber must not be defeated by capitals.
    if (out.toLowerCase().includes(address.toLowerCase())) {
      console.log(`       leaked: ${out}`);
      leaked += 1;
    }
  }
}
check(`${addresses.length * wrappers.length} address and wrapper combinations`, leaked === 0);

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
