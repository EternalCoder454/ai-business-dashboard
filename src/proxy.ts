import { NextResponse, type NextRequest } from "next/server";
import { auth, authEnabled } from "@/auth";

/**
 * Everything is private except the sign-in page and the auth endpoints.
 *
 * Next 16 renamed this convention from middleware to proxy. Behaviour and the
 * matcher are unchanged.
 *
 * When auth is not configured the middleware steps aside entirely, so a local
 * checkout with no OAuth client behaves exactly as it did before.
 */
export default async function proxy(request: NextRequest) {
  if (!authEnabled) return NextResponse.next();

  const session = await auth();
  if (session?.user) return NextResponse.next();

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
     * a stricter gate than this one — it checks the key, the scope, and the
     * rate limit, where the proxy only checks that somebody is signed in.
     */
    "/((?!api/auth|api/v1|api/workspace/status|signin|_next/static|_next/image|icon|apple-icon|manifest.webmanifest|opengraph-image|twitter-image|robots.txt|favicon.ico).*)",
  ],
};
