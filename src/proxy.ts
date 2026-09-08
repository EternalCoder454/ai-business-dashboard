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
 * later by whatever it reached. That is not a hole, because nothing here was
 * ever the real check: every API route calls `requireSession` for itself, and
 * the layout every private page sits under resolves the session properly and
 * redirects here if there is not one. What this does is send the ordinary
 * signed-out visitor to the sign-in page without a database round trip on
 * every request in the application.
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
     * Six exclusions, each because the caller cannot follow a redirect to a
     * sign-in page and each gated more strictly by the route itself, or in
     * health's case because there is nothing behind it to gate:
     *
     * - api/workspace/status: answering "you are not signed in" is its job.
     * - api/v1: authenticates with a bearer token, and every route under it
     *   calls `authorize`, which checks the key, the scope and the rate limit.
     * - api/cron and api/reports/run: the caller is a scheduler, which follows
     *   a 307 silently and would have reported the nightly pass as succeeding
     *   for as long as anybody believed it. Both check their own bearer token
     *   in constant time.
     * - api/health: asked by the container runtime and by anything watching
     *   the deployment, neither of which has a session or follows a redirect.
     *   It answers ok or not and says nothing else at all.
     * - mark: one business's logo, fetched by a mail client reading an
     *   invitation. There is no session to redirect and nothing behind it but
     *   a company's own badge; an id matching nothing returns the same generic
     *   mark as one that does, so it cannot be asked whether a business exists.
     */
    "/((?!api/auth|api/v1|api/cron|api/health|api/reports/run|api/workspace/status|mark/|signin|_next/static|_next/image|icon|apple-icon|manifest.webmanifest|opengraph-image|twitter-image|robots.txt|favicon.ico).*)",
  ],
};
