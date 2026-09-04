/**
 * Whose name and picture win, and what happens when one is cleared.
 *
 * This is a small piece of logic that was wrong for months in a way nobody
 * could see: uploading a profile picture saved it correctly to the database and
 * then displayed the Google one anyway, so the feature looked broken while
 * working perfectly. A test is the only thing that catches that, because both
 * halves of the system were behaving.
 *
 * Run with: npm run account-test
 */
// This file imports nothing, which would otherwise make it a global script
// rather than a module: TypeScript puts the top level of a non-module file in
// the global scope, so `failures` and `check` collide with any other script
// that does the same. That is a build failure in a test file, which is a
// tedious way to break a deploy.
export {};


/** The two shapes the merge reads, without importing the whole store. */
interface Stored {
  email: string;
  displayName: string;
  avatarUrl?: string;
}
interface Google {
  email?: string;
  givenName?: string;
  image?: string;
}

/**
 * The merge from lib/store, kept in step by hand.
 *
 * Copied rather than imported because the store is a client module that pulls
 * React, the database client and every provider in with it. If this drifts from
 * the real one the test is worthless, so it is three lines and they are the
 * three lines that matter.
 */
function merge(stored: Stored, google: Google | undefined) {
  return {
    ...stored,
    email: google?.email ?? stored.email,
    avatarUrl: stored.avatarUrl || google?.image,
    displayName: stored.displayName || google?.givenName || "",
  };
}

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!condition) failures += 1;
}

const GOOGLE: Google = {
  email: "ada@example.com",
  givenName: "Ada",
  image: "https://lh3.googleusercontent.com/a/google-photo",
};
const UPLOADED = "data:image/webp;base64,theirs";

console.log("somebody who has set nothing");
{
  const a = merge({ email: "", displayName: "", avatarUrl: undefined }, GOOGLE);
  check("takes Google's picture", a.avatarUrl === GOOGLE.image, a.avatarUrl);
  check("takes Google's first name", a.displayName === "Ada", a.displayName);
  check("takes Google's address", a.email === "ada@example.com", a.email);
}

console.log("\nsomebody who uploaded a picture");
{
  const a = merge({ email: "ada@example.com", displayName: "", avatarUrl: UPLOADED }, GOOGLE);
  // The bug this file exists for. Google's photo must not win here.
  check("keeps their own picture", a.avatarUrl === UPLOADED, a.avatarUrl);
  check("and still takes Google's name", a.displayName === "Ada");
}

console.log("\nsomebody who set their own name");
{
  const a = merge(
    { email: "ada@example.com", displayName: "Ada Lovelace", avatarUrl: undefined },
    GOOGLE,
  );
  check("keeps their own name", a.displayName === "Ada Lovelace", a.displayName);
}

console.log("\nsomebody who reset their picture");
{
  // Reset writes an empty string, not undefined, so the key survives JSON.
  const a = merge({ email: "ada@example.com", displayName: "Ada", avatarUrl: "" }, GOOGLE);
  check("falls back to Google's", a.avatarUrl === GOOGLE.image, a.avatarUrl);
}

console.log("\nthe address is always Google's");
{
  // The identity, not a preference: access rows, messages and permissions are
  // all keyed on it, so a stored value must never override it.
  const a = merge({ email: "stale@example.com", displayName: "", avatarUrl: undefined }, GOOGLE);
  check("a stale stored address does not win", a.email === "ada@example.com", a.email);
}

console.log("\nno Google identity yet, which is every render before the status call");
{
  const a = merge({ email: "ada@example.com", displayName: "Ada", avatarUrl: UPLOADED }, undefined);
  check("their own picture still shows", a.avatarUrl === UPLOADED);
  check("their own name still shows", a.displayName === "Ada");
  check("their address still shows", a.email === "ada@example.com");
}

console.log("\nclearing has to survive being sent as JSON");
{
  // The second half of the bug: undefined is dropped by JSON.stringify, so a
  // reset written that way reaches the server as an empty row and changes
  // nothing. Empty string is the value that travels.
  const dropped = JSON.parse(JSON.stringify({ row: { avatarUrl: undefined } })) as {
    row: Record<string, unknown>;
  };
  check("undefined does not survive", !("avatarUrl" in dropped.row));

  const kept = JSON.parse(JSON.stringify({ row: { avatarUrl: "" } })) as {
    row: Record<string, unknown>;
  };
  check("an empty string does", "avatarUrl" in kept.row);
}

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
