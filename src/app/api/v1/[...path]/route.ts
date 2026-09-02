import { fail } from "@/lib/api/v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Anything under /api/v1 that is not a real endpoint.
 *
 * Without this, a typo in a path fell through to the application's own 404,
 * which answers with a full HTML page. A client that parses every response as
 * JSON then fails on the parse rather than on the error, so the developer sees
 * "unexpected token <" instead of "no such endpoint" and goes looking for a bug
 * in their JSON handling. The contract is worth keeping all the way to the
 * edges, and the edges are where somebody is most likely to be lost.
 *
 * Deliberately unauthenticated. Asking for a key before saying the path does
 * not exist would tell somebody with a bad URL to go and check their
 * credentials.
 */
function noSuchEndpoint(_request: Request, ctx: { params: Promise<{ path: string[] }> }) {
  void ctx;
  return fail(
    "not_found_error",
    "No such endpoint. GET /api/v1 lists every path this API has.",
  );
}

export const GET = noSuchEndpoint;
export const POST = noSuchEndpoint;
export const PUT = noSuchEndpoint;
export const PATCH = noSuchEndpoint;
export const DELETE = noSuchEndpoint;
