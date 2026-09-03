import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { headers } from "next/headers";
import { db } from "@/db/client";
import * as t from "@/db/schema";

/**
 * Signing in.
 *
 * This was next-auth v5, which spent its whole life here as a beta: beta
 * software on the one path that must not break, chosen when the deployment had
 * one user and never revisited. Moving off it while there are four accounts
 * rather than forty is the entire reason it happened now, because the cost of
 * moving an auth library is paid in people signing in again.
 *
 * The exported surface is deliberately unchanged. `auth()`, `authEnabled`,
 * `OPERATOR_EMAILS` and `parseEmailList` mean exactly what they meant, and
 * `auth()` returns the same `{ user: { email, name, image } }` shape, so the
 * twenty six routes that only ask who is signed in were not touched. Four files
 * changed: this one, the handler, the sign-in page, and signing out.
 *
 * The real behavioural change is that a session is a row rather than a signed
 * token. Sessions used to be JWTs, so signing somebody out or removing them
 * took effect whenever the token expired; now it takes effect on their next
 * request. That is a better answer for a product where an administrator can
 * revoke a colleague's access and reasonably expect it to mean something.
 */

/**
 * Splits an address list on commas, newlines, semicolons, or spaces.
 *
 * A dashboard's environment field is a textarea, so writing one address a line
 * is the obvious guess. Accepting only commas would turn that guess into a
 * lockout, or worse, into an allowlist that silently matches nobody.
 */
export function parseEmailList(value: string | undefined, fallback = ""): string[] {
  return (value ?? fallback)
    .split(/[\s,;]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * The operator's own addresses, which are also the only ones that can sign in
 * without an invitation.
 *
 * There used to be a second list, ALLOWED_EMAILS, from when a workspace was a
 * person and getting in and being in charge were the same act. Everybody else
 * now arrives through a row in the access table that names the workspace they
 * belong to, so a separate allowlist was two answers to one question.
 *
 * No default. It used to fall back to one hardcoded address, which is a
 * stranger's deployment quietly trusting the person who wrote it.
 */
export const OPERATOR_EMAILS = parseEmailList(process.env.OPERATOR_EMAILS);

/**
 * Auth turns itself on only once it is configured. Without the Google
 * credentials the app runs exactly as it does today, so local development does
 * not need an OAuth client just to open a chat.
 *
 * The variable names are the ones that were already set. better-auth reads
 * BETTER_AUTH_SECRET by default and the deployment has AUTH_SECRET, so the
 * value is passed in below rather than renamed in three environments.
 */
export const authEnabled = Boolean(
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET && process.env.AUTH_SECRET,
);

/**
 * Where the app is, which better-auth needs in order to build a redirect.
 *
 * Vercel sets VERCEL_URL per deployment without a scheme. NEXT_PUBLIC_SITE_URL
 * is what the rest of this app already uses for absolute links, so it wins:
 * a preview build should not send somebody to production to sign in.
 */
function baseUrl(): string | undefined {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (explicit) return explicit;
  const vercel = process.env.VERCEL_URL?.trim();
  return vercel ? `https://${vercel}` : undefined;
}


/** What the door can say. Undefined means it opened. */
export type Admission = { error: string; errorDescription?: string } | undefined;

/**
 * The three ways somebody may be checked against, in the order they are asked.
 *
 * Passed in rather than imported so the decision can be tested without a
 * database, which matters more here than anywhere else in this codebase: this
 * function is the whole difference between a private panel and a public one,
 * and "I read it and it looked right" is not a way to know that.
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
 * This is the next-auth `signIn` callback, moved. It runs on a first sign-in,
 * on a returning one, and on an account being linked, which matters: gating
 * only the creation of a user would let somebody removed from every business
 * carry on signing in forever.
 *
 * OPERATOR_EMAILS first, because it lives in the environment rather than the
 * database: if the access table is empty, a row is revoked by mistake, or Neon
 * is unreachable at the moment somebody tries to sign in, the operator still
 * gets through. Checking it first also means their sign-in never waits on a
 * query.
 *
 * Then the access table, which is how everybody else is actually invited, from
 * the operator screen and without a redeploy. Then first run, which closes the
 * moment the first row exists.
 *
 * Getting in is all this decides. Which workspace the person then opens is
 * `membershipFor`, asked again on every request, so revoking a row takes effect
 * on the next call rather than at sign-in.
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
        baseURL: baseUrl(),
        /*
         * The origin the request actually arrived on.
         *
         * Every Vercel preview gets its own hostname, so a fixed list would
         * mean sign-in working in production and failing on every branch. The
         * request is optional in the signature because better-auth also calls
         * this outside a request, where there is no origin to trust.
         */
        trustedOrigins: (request) =>
          request ? [new URL(request.url).origin] : [],

        database: drizzleAdapter(db, {
          provider: "pg",
          /*
           * Named explicitly rather than handed the whole schema module.
           *
           * The adapter looks tables up by better-auth's model names, and this
           * schema calls them `auth_user` and so on: `user` is a reserved word
           * in Postgres and `account` is already taken here by something
           * completely different. Mapping them here is what lets both be true.
           */
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

        /*
         * Sessions last a fortnight and are extended a day at a time.
         *
         * Extending on use rather than on every request, so an open tab does
         * not write a row to Postgres every time somebody clicks something.
         */
        session: {
          expiresIn: 60 * 60 * 24 * 14,
          updateAge: 60 * 60 * 24,
        },

        /**
         * Three ways in, checked in order, and nothing else opens the door.
         *
         * This is the next-auth `signIn` callback, moved. It runs on a first
         * sign-in, on a returning one, and on an account being linked, which
         * matters: gating only the creation of a user would let somebody
         * removed from every business carry on signing in forever.
         *
         * OPERATOR_EMAILS first, because it lives in the environment rather
         * than the database: if the access table is empty, a row is revoked by
         * mistake, or Neon is unreachable at the moment somebody tries to sign
         * in, the operator still gets through. Checking it first also means
         * their sign-in never waits on a query.
         *
         * Then the access table, which is how everybody else is actually
         * invited, from the operator screen and without a redeploy. Then first
         * run, which closes the moment the first row exists.
         *
         * Getting in is all this decides. Which workspace the person then
         * opens is `membershipFor`, asked again on every request, so revoking a
         * row takes effect on the next call rather than at sign-in.
         *
         * The database module is imported inside rather than at the top of the
         * file so that the proxy, which imports this on every request, does not
         * pull a Postgres client into a check it never performs.
         */
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
