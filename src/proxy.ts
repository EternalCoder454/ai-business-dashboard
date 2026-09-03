import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { authEnabled } from "@/auth";

/**
 * Everything is private except the sign-in page and the auth endpoints.
 *
 * Next 16 renamed this convention from middleware to proxy. Behaviour and the
 * matcher are unchanged.
 *
 * When auth is not configured the proxy steps aside entirely, so a local
 * checkout with no OAuth client behaves exactly as it did before.
 *
 * This looks for the session cookie rather than loading the session, and that
 * is a deliberate downgrade from what it did under next-auth. A proxy runs on
 * every request including every asset, it cannot use `next/headers`, and
 * reaching Postgres from here would put a database round trip in front of the
 * whole app. So it asks the cheap question: does this request carry a session
 * cookie at all.
 *
 * Which means a forged or expired cookie gets past this and is refused a moment
 * later by the route it reached. That is not a hole, because nothing here was
 * ever the real check: every API route calls `requireSession` for itself and
 * every page loads through `auth()`, both of which read the session properly.
 * What this does is send somebody without one to the sign-in page instead of to
 * a screen that cannot answer them.
 */
export default async function proxy(request: NextRequest) {
  if (!authEnabled) return NextResponse.next();

  if (getSessionCookie(request)) return NextResponse.next();

  const signIn = new URL("/signin", request.url);
  // Come back to where they were trying to go once they are through.
  signIn.searchParams.set("from", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(signIn);
}

export const config = {
  matcher: [
    /*
     * Everything except the auth routes, the sign-in page, and the static and
     * generated assets, which have to load before anyone is signed in.
     */
    /*
     * api/workspace/status is excluded because answering "you are not signed
     * in" is its entire job. Redirecting it meant the store fetched the
     * sign-in page as JSON, failed, and fell back by accident rather than by
     * being told. It checks auth itself and reveals nothing else.
     *
     * api/v1 is excluded because it authenticates with a bearer token rather
     * than a session cookie. Left in, every call from an addon would be
     * answered with a 307 to the sign-in page: an HTML body, a redirect a
     * curl follows silently, and no way for the caller to tell a bad key from
     * a wrong URL. Every route under it calls `authorize` for itself, which is
     * a stricter gate than this one: it checks the key, the scope, and the
     * rate limit, where the proxy only checks that somebody is signed in.
     *
     * api/cron and api/reports/run are excluded for the same reason and are
     * worth naming separately, because the caller is a scheduler rather than a
     * person and would never have reported the problem. Left in, the nightly pass was
     * redirected to the sign-in page, Vercel recorded a 307 as a success, and
     * the reviewer would have looked like it was running for as long as
     * anybody cared to believe it. It checks its own bearer token in constant
     * time and otherwise requires an operator session.
     */
    "/((?!api/auth|api/v1|api/cron|api/reports/run|api/workspace/status|signin|_next/static|_next/image|icon|apple-icon|manifest.webmanifest|opengraph-image|twitter-image|robots.txt|favicon.ico).*)",
  ],
};
