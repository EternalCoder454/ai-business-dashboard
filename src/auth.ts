import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { headers } from "next/headers";
import { db } from "@/db/client";
import * as t from "@/db/schema";
import { siteUrl } from "@/lib/site";

/**
 * Signing in, on better-auth with Google as the only provider.
 *
 * Sessions are rows rather than signed tokens, so revoking somebody's access
 * takes effect on their next request instead of whenever a JWT would have
 * expired.
 */

/**
 * Splits an address list on commas, newlines, semicolons, or spaces.
 *
 * Lenient because the value is typed into a dashboard textarea, where a
 * stricter parser silently matches nobody.
 */
export function parseEmailList(value: string | undefined, fallback = ""): string[] {
  return (value ?? fallback)
    .split(/[\s,;]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Whoever runs this deployment, and the only addresses that can sign in
 * without an access row. No default: an unset value means nobody.
 */
export const OPERATOR_EMAILS = parseEmailList(process.env.OPERATOR_EMAILS);

/**
 * Whether auth is configured at all. Unset credentials leave the app open
 * locally rather than broken, so a checkout runs without an OAuth client.
 */
export const authEnabled = Boolean(
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET && process.env.AUTH_SECRET,
);

/** What the door can say. Undefined means it opened. */
export type Admission = { error: string; errorDescription?: string } | undefined;

/**
 * What `admit` checks against. Passed in rather than imported so the decision
 * can be tested without a database.
 *
 * @see scripts/auth-test.ts
 */
export interface Doorkeeper {
  operators: string[];
  isAllowed: (email: string) => Promise<boolean>;
  nobodyHasAccess: () => Promise<boolean>;
  markSignedIn: (email: string) => Promise<void>;
}

/**
 * Three ways in, checked in order, and nothing else opens the door.
 *
 * Runs on every sign-in, not only the first, so somebody removed from every
 * business stops getting in.
 *
 * Order matters. OPERATOR_EMAILS is checked before the database so the person
 * who can fix a broken deployment still gets in when Neon is unreachable or a
 * row was revoked by mistake.
 *
 * This decides entry only. Which workspace they land in is `membershipFor`,
 * asked again on every request.
 */
export async function admit(
  rawEmail: string | undefined,
  emailVerified: boolean | undefined,
  keeper?: Doorkeeper,
): Promise<Admission> {
  const email = rawEmail?.toLowerCase().trim();
  if (!email) return { error: "no_email" };

  // Google verifies the address; an unverified one is not an identity. Only an
  // explicit false is a refusal, because a provider that does not send the
  // claim has not said the address is unverified.
  if (emailVerified === false) return { error: "unverified_email" };

  /*
   * Imported here rather than at the top of the file so that the proxy, which
   * imports this module on every request, does not pull a Postgres client into
   * a check it never performs.
   */
  let door: Doorkeeper;
  if (keeper) {
    door = keeper;
  } else {
    const access = await import("@/db/access");
    door = {
      operators: OPERATOR_EMAILS,
      isAllowed: access.isAllowed,
      nobodyHasAccess: access.nobodyHasAccess,
      markSignedIn: access.markSignedIn,
    };
  }

  if (door.operators.includes(email)) {
    // Recorded for the operator too. Their row said "never signed in" while
    // they were reading it, which is a confusing thing for a screen to tell you
    // about yourself.
    await door.markSignedIn(email);
    return;
  }

  if (await door.isAllowed(email)) {
    await door.markSignedIn(email);
    return;
  }

  /*
   * First run: an install with no operator configured and nobody in the access
   * table belongs to whoever signs in first, and they become its operator.
   *
   * Without this, a deployment with OPERATOR_EMAILS unset can be signed in to
   * by nobody at all, which is a locked door with the key inside. The window
   * closes the moment the first row exists.
   */
  if (door.operators.length === 0 && (await door.nobodyHasAccess())) {
    await door.markSignedIn(email);
    return;
  }

  return {
    error: "AccessDenied",
    errorDescription: "That account is not approved for this workspace.",
  };
}

const instance =
  authEnabled && db
    ? betterAuth({
        secret: process.env.AUTH_SECRET,
        // siteUrl reads VERCEL_PROJECT_PRODUCTION_URL, not VERCEL_URL: the
        // per deployment hostname is not a registered Google redirect URI, so
        // building from it breaks sign in on previews only.

        baseURL: siteUrl(),
        // Every preview has its own hostname, so the list cannot be fixed.
        // The request is optional because better-auth also calls this outside
        // one, where there is no origin to trust.

        trustedOrigins: (request) =>
          request ? [new URL(request.url).origin] : [],

        database: drizzleAdapter(db, {
          provider: "pg",
          // Mapped by hand: better-auth's model names collide with a reserved
          // word (`user`) and with a table this app already has (`account`).

          schema: {
            user: t.authUser,
            session: t.authSession,
            account: t.authAccount,
            verification: t.authVerification,
          },
        }),

        socialProviders: {
          google: {
            clientId: process.env.AUTH_GOOGLE_ID ?? "",
            clientSecret: process.env.AUTH_GOOGLE_SECRET ?? "",
          },
        },

        // A fortnight, extended a day at a time rather than on every request,
        // so an open tab does not write a row on each click.

        session: {
          expiresIn: 60 * 60 * 24 * 14,
          updateAge: 60 * 60 * 24,
        },

        // The whole gate. See admit above.
        user: {
          async validateUserInfo({ user, source }) {
            const profile = source.oauth?.profile as
              | { email_verified?: boolean }
              | undefined;
            return admit(user.email, profile?.email_verified);
          },
        },

        // Lets the server side sign-out set its cookie from a server action.
        plugins: [nextCookies()],
      })
    : null;

/** The handler mounted at /api/auth. Null when auth is not configured. */
export const authInstance = instance;

/** What every route asks for. */
export interface Session {
  user: {
    email: string;
    name?: string | null;
    image?: string | null;
  };
}

/**
 * Who is signed in, or null.
 *
 * The same shape next-auth returned, on purpose: every caller wanted an email
 * and occasionally a name and a picture, and none of them should have to know
 * which library answered.
 *
 * Null rather than a throw when nothing is configured, because a local checkout
 * with no OAuth client is a supported way to run this and every caller already
 * treats a missing session as "not signed in".
 */
export async function auth(): Promise<Session | null> {
  if (!instance) return null;
  try {
    const found = await instance.api.getSession({ headers: await headers() });
    const email = found?.user?.email?.toLowerCase();
    if (!found || !email) return null;
    return {
      user: {
        email,
        name: found.user.name ?? null,
        image: found.user.image ?? null,
      },
    };
  } catch (error) {
    // A session that cannot be read is not a session. Throwing here would turn
    // a database blip into every page failing rather than into a sign-in page.
    console.error("[auth] could not read the session", error);
    return null;
  }
}
