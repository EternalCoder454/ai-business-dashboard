import { auth, authEnabled } from "@/auth";

/**
 * The check every API route makes for itself.
 *
 * The proxy already redirects an unauthenticated request before it reaches a
 * route handler, so in normal operation this never fires. It exists because the
 * proxy is one regular expression away from being wrong: a matcher edit that
 * accidentally excludes a path would silently open it, and a route that only
 * inherits its protection has no way to notice. Each route answering for itself
 * means a mistake in the matcher costs a redirect, not the API key.
 *
 * When auth is not configured at all this returns ok, because a local checkout
 * with no OAuth client has no identity to check and is not reachable from
 * anywhere but the machine it runs on.
 */
export async function requireSession(): Promise<
  { ok: true; email?: string } | { ok: false; status: number; error: string }
> {
  if (!authEnabled) return { ok: true };

  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return { ok: false, status: 401, error: "Not signed in." };
  }
  return { ok: true, email };
}

/**
 * Reads a JSON body, refusing anything past `limit` bytes.
 *
 * `request.json()` will happily buffer whatever it is given, and these routes
 * accept base64 image data, so the ceiling has to be explicit. Content-Length
 * is checked first as a cheap rejection, then the body is measured while it is
 * read, because a chunked request can lie about its length or omit it.
 */
export async function readJsonWithin<T>(
  request: Request,
  limit: number,
): Promise<{ ok: true; body: T } | { ok: false; status: number; error: string }> {
  const declared = Number(request.headers.get("content-length") ?? "");
  const tooBig = {
    ok: false as const,
    status: 413,
    error: `That request is larger than the ${Math.round(limit / 1_000_000)}MB limit.`,
  };
  if (Number.isFinite(declared) && declared > limit) return tooBig;

  const reader = request.body?.getReader();
  if (!reader) {
    return { ok: false, status: 400, error: "Empty request body." };
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => {});
      return tooBig;
    }
    chunks.push(value);
  }

  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return { ok: true, body: JSON.parse(new TextDecoder().decode(joined)) as T };
  } catch {
    return { ok: false, status: 400, error: "Malformed request body." };
  }
}

/**
 * A per-instance sliding window, keyed by whoever is calling.
 *
 * Deliberately in memory: this deployment is serverless, so each instance keeps
 * its own counter and the real ceiling is looser than the number below. That is
 * still worth having, because the failure it guards against is a runaway client
 * loop rather than a determined attacker, and the allowlist already handles the
 * second case. A shared limiter would mean a Redis instance for one user.
 */
const windows = new Map<string, number[]>();

export function withinRate(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;
  const hits = (windows.get(key) ?? []).filter((at) => at > cutoff);

  if (hits.length >= limit) {
    windows.set(key, hits);
    return false;
  }

  hits.push(now);
  windows.set(key, hits);

  // Keep the map from growing without bound on a long-lived instance.
  if (windows.size > 500) {
    for (const [entry, times] of windows) {
      if (!times.some((at) => at > cutoff)) windows.delete(entry);
    }
  }

  return true;
}
