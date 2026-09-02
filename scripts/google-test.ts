/**
 * The OAuth state parameter actually protects the callback.
 *
 * This is the piece worth testing rather than reasoning about. Without a state
 * check, anybody can send a signed-in person a link to our callback carrying
 * their own authorization code, and that person's panel quietly starts showing
 * the attacker's calendar. Nobody's data leaks in that direction, which is
 * exactly why nobody would notice.
 *
 * Run with: npm run google-test
 */
import { consentUrl, makeState, readState, redirectUri } from "../src/lib/google";

/*
 * Set before anything is called, not before anything is imported.
 *
 * Nothing in google.ts reads the environment at module scope: the signing key,
 * the client id, and the redirect are all read inside the functions. So a
 * static import is safe here, which top-level await is not under this runner.
 */
process.env.AUTH_SECRET = process.env.AUTH_SECRET || "test-secret-for-state-signing";
process.env.AUTH_GOOGLE_ID = process.env.AUTH_GOOGLE_ID || "test-client-id";
process.env.AUTH_GOOGLE_SECRET = process.env.AUTH_GOOGLE_SECRET || "test-client-secret";
process.env.NEXT_PUBLIC_SITE_URL = "https://business.eterneon.net";

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!condition) failures += 1;
}

const WHO = "owner@example.invalid";

console.log("a state we issued comes back readable");
const good = makeState(WHO);
check("it round trips", readState(good) === WHO, String(readState(good)));
check("two are never the same", makeState(WHO) !== makeState(WHO));

console.log("\nanything else is refused");
check("nothing", readState(null) === null);
check("empty", readState("") === null);
check("not our shape", readState("just-a-string") === null);
check("no signature", readState(good.split(".")[0]) === null);

// The attack: keep the payload, invent the signature.
const [payload] = good.split(".");
check("a forged signature", readState(`${payload}.notthesignature`) === null);

// The attack that matters: swap the address inside a payload we did sign, and
// reuse the signature. It cannot work, because the signature covers the
// address, but this is the case somebody would try.
const decoded = Buffer.from(payload, "base64url").toString("utf8");
const swapped = Buffer.from(decoded.replace(WHO, "attacker@example.invalid")).toString(
  "base64url",
);
check(
  "a swapped address with the old signature",
  readState(`${swapped}.${good.split(".")[1]}`) === null,
);

console.log("\nold states stop working");
const stale = (() => {
  const [encoded, signature] = makeState(WHO).split(".");
  const text = Buffer.from(encoded, "base64url").toString("utf8");
  const parts = text.split(":");
  // Signed eleven minutes ago, with a signature that no longer matches, which
  // is the honest version of expiry: an old state cannot be re-signed either.
  parts[1] = String(Date.now() - 11 * 60_000);
  return `${Buffer.from(parts.join(":")).toString("base64url")}.${signature}`;
})();
check("an eleven minute old state", readState(stale) === null);

console.log("\nthe consent screen asks for the least it can");
const url = new URL(consentUrl(WHO));
check("it is Google", url.hostname === "accounts.google.com");
check(
  "one scope, and it is read only",
  url.searchParams.get("scope") === "https://www.googleapis.com/auth/calendar.readonly",
  url.searchParams.get("scope") ?? "",
);
check("offline, so there is a refresh token", url.searchParams.get("access_type") === "offline");
check("consent is forced, so reconnecting works", url.searchParams.get("prompt") === "consent");
check("it carries a state", Boolean(url.searchParams.get("state")));
check(
  "the state in the url is valid",
  readState(url.searchParams.get("state")) === WHO,
);
check(
  "the redirect is ours",
  url.searchParams.get("redirect_uri") === redirectUri(),
  redirectUri(),
);
check(
  "and it is https in production",
  redirectUri().startsWith("https://"),
  redirectUri(),
);

console.log(failures ? "\nFAILURES ABOVE" : "\nall checks passed");
process.exit(failures ? 1 : 0);
