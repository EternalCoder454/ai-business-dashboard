/**
 * The two pieces of the Matrix integration that fail quietly.
 *
 * Everything else about an appservice fails loudly: a wrong URL is a connection
 * error, a wrong token is a 403, a malformed room is a 400. These two are the
 * ones that work, produce no error, and are wrong.
 *
 * The user id, because it is derived rather than stored. A change to how an
 * address becomes a localpart does not break anything visible: it quietly makes
 * every existing person into a new person, so their rooms belong to somebody
 * who no longer exists and their colleagues are talking to a stranger with the
 * same name. There is no error at any point.
 *
 * The namespace regex, because the homeserver is the only thing that reads it
 * and it does so once, at startup. An unanchored or wrong pattern either claims
 * ids the panel does not own, which stops real people registering, or fails to
 * claim the ones it does, which lets anybody register as a colleague.
 *
 *   npm run matrix-test
 */
import { localpartFor, userIdFor, userNamespaceRegex } from "../src/lib/matrix/ids";

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures += 1;
}

console.log("\na person is the same person every time");
{
  const one = localpartFor("zach@eterneon.net");
  check("twice is the same", one === localpartFor("zach@eterneon.net"), one);
  check(
    "and case does not make a second person",
    one === localpartFor("Zach@Eterneon.NET"),
  );
  check("nor does a stray space", one === localpartFor("  zach@eterneon.net  "));
  check(
    "somebody else is somebody else",
    one !== localpartFor("zach@eterneon.com"),
  );
}

console.log("\nand is a legal Matrix localpart");
{
  // The grammar: lowercase letters, digits, and . _ = - / +
  const legal = /^[a-z0-9._=\-/+]+$/;
  const awkward = [
    "zach+tag@eterneon.net",
    "O'Brien@example.com",
    "üser@exämple.com",
    "a.very.long.address.that.goes.on@subdomain.example.co.uk",
  ];
  for (const address of awkward) {
    const part = localpartFor(address);
    check(`${address} is legal`, legal.test(part), part);
  }
  check(
    "and short enough to live in a 255 character id",
    localpartFor(awkward[3]).length < 64,
    `${localpartFor(awkward[3]).length}`,
  );
}

console.log("\nthe address is not in the id");
{
  /*
   * A user id is visible to everybody in a room and travels with the event over
   * federation. Putting the address in it would hand out the company's email
   * list to anybody ever invited into a conversation.
   */
  const id = userIdFor("zach@eterneon.net", "eterneon.net");
  check("no local part of the address", !id.includes("zach"), id);
  check("and no domain of it either", !id.slice(1).includes("eterneon.net@"));
  check("it is a well formed id", /^@[a-z0-9._=\-/+]+:[^:]+$/.test(id), id);
}

console.log("\nthe namespace claims exactly the panel's users");
{
  const server = "eterneon.net";
  const pattern = new RegExp(userNamespaceRegex(server));

  check("it claims one of ours", pattern.test(userIdFor("zach@eterneon.net", server)));
  check(
    "and another",
    pattern.test(userIdFor("someone.else@example.com", server)),
  );

  // The ones it must not claim, and each is a real way to get this wrong.
  check("not a person who registered by hand", !pattern.test(`@zach:${server}`));
  check(
    "not a lookalike with the prefix in the middle",
    !pattern.test(`@evil_eterneon_0123456789abcdef0123:${server}`),
  );
  check(
    "not the same id on another server",
    !pattern.test("@_eterneon_0123456789abcdef0123:evil.example"),
  );
  check(
    "not one with the right shape and the wrong length",
    !pattern.test(`@_eterneon_0123:${server}`),
  );
  check(
    "and not the bot, which is named rather than hashed",
    !pattern.test(`@_eterneon_bot:${server}`),
  );
}

console.log("\nthe server name is escaped, not interpolated");
{
  /*
   * A dot in a hostname is a dot. Unescaped, "eterneon.net" also matches
   * "eterneonXnet", which is a domain somebody else can register.
   */
  const pattern = new RegExp(userNamespaceRegex("eterneon.net"));
  check(
    "a dot does not match any character",
    !pattern.test("@_eterneon_0123456789abcdef0123:eterneonXnet"),
  );
}

console.log(
  failures === 0
    ? "\nall checks passed"
    : `\n${failures} FAILURES ABOVE. A wrong user id makes everybody a new person, silently.`,
);
process.exit(failures === 0 ? 0 : 1);
