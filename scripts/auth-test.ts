/**
 * Who the front door lets in.
 *
 * This is the one function in the codebase where being wrong does not produce a
 * bug, it produces a public panel. Everything else in the product is fenced by
 * a workspace check that assumes the person is somebody; this decides whether
 * they are anybody at all.
 *
 * It moved from next-auth to better-auth, which is exactly the kind of change
 * where a condition gets dropped in the copying and nothing complains, because
 * the failure mode of an over-permissive door is that everything works.
 *
 * Run with: npm run auth-test
 */
import { admit, type Doorkeeper } from "../src/auth";

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!condition) failures += 1;
}

/** Records who was stamped as having signed in, so that can be asserted too. */
function keeper(options: {
  operators?: string[];
  allowed?: string[];
  empty?: boolean;
}): Doorkeeper & { stamped: string[] } {
  const stamped: string[] = [];
  return {
    stamped,
    operators: options.operators ?? [],
    isAllowed: async (email) => (options.allowed ?? []).includes(email),
    nobodyHasAccess: async () => options.empty ?? false,
    markSignedIn: async (email) => {
      stamped.push(email);
    },
  };
}

const OPEN = undefined;

async function main() {
  console.log("an invited address");
  const invited = keeper({ allowed: ["ada@example.com"] });
  check("is let in", (await admit("ada@example.com", true, invited)) === OPEN);
  check("and is recorded as having arrived", invited.stamped.includes("ada@example.com"));

  console.log("\nan address nobody invited");
  const closed = keeper({ allowed: ["ada@example.com"] });
  const stranger = await admit("mallory@example.com", true, closed);
  check("is refused", stranger?.error === "AccessDenied");
  check("and is not recorded", closed.stamped.length === 0);

  console.log("\nthe operator");
  // Checked before the database on purpose: if Neon is unreachable at the
  // moment they try to sign in, the person who can fix it must still get in.
  const broken: Doorkeeper = {
    operators: ["boss@example.com"],
    isAllowed: async () => {
      throw new Error("the database is down");
    },
    nobodyHasAccess: async () => {
      throw new Error("the database is down");
    },
    markSignedIn: async () => {},
  };
  check(
    "gets in without the database being asked",
    (await admit("boss@example.com", true, broken)) === OPEN,
  );

  console.log("\nfirst run");
  // An install with no operator and nobody invited belongs to whoever arrives
  // first. The window has to close the moment there is one row.
  check(
    "an empty deployment adopts the first person",
    (await admit("founder@example.com", true, keeper({ empty: true }))) === OPEN,
  );
  check(
    "and closes once anybody has access",
    (await admit("second@example.com", true, keeper({ empty: false })))?.error ===
      "AccessDenied",
  );
  check(
    "and never opens when an operator is configured",
    (
      await admit(
        "opportunist@example.com",
        true,
        keeper({ operators: ["boss@example.com"], empty: true }),
      )
    )?.error === "AccessDenied",
  );

  console.log("\nthe address itself");
  check("nothing is refused", (await admit(undefined, true, keeper({})))?.error === "no_email");
  check("empty is refused", (await admit("   ", true, keeper({})))?.error === "no_email");
  check(
    "an unverified one is refused even if invited",
    (await admit("ada@example.com", false, keeper({ allowed: ["ada@example.com"] })))?.error ===
      "unverified_email",
  );
  check(
    "a provider that does not say is not treated as unverified",
    (await admit("ada@example.com", undefined, keeper({ allowed: ["ada@example.com"] }))) === OPEN,
  );

  console.log("\ncase and whitespace");
  // Google returns whatever the person typed when they made the account, and
  // the access table is lowercased. A capital letter must not be a lockout.
  check(
    "an invited address in capitals still gets in",
    (await admit("Ada@Example.com", true, keeper({ allowed: ["ada@example.com"] }))) === OPEN,
  );
  check(
    "and with spaces around it",
    (await admit("  ada@example.com  ", true, keeper({ allowed: ["ada@example.com"] }))) === OPEN,
  );
  check(
    "an operator in capitals is still an operator",
    (await admit("BOSS@example.com", true, keeper({ operators: ["boss@example.com"] }))) === OPEN,
  );

  console.log(failures === 0 ? "\nall checks passed" : `\n${failures} failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
