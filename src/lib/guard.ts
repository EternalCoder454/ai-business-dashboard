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

export interface RateState {
  allowed: boolean;
  limit: number;
  /** Requests left in this window, after counting the one being answered. */
  remaining: number;
  /** Unix seconds when the window frees up. */
  resetAt: number;
}

/**
 * The same limiter, but it says where you stand.
 *
 * `withinRate` answers yes or no, which is all a page needs. A public API
 * should say how much is left and when it frees up, so a client can pace
 * itself instead of discovering the ceiling by hitting it.
 */
export function rateState(key: string, limit: number, windowMs: number): RateState {
  const now = Date.now();
  const cutoff = now - windowMs;
  const hits = (windows.get(key) ?? []).filter((at) => at > cutoff);
  const oldest = hits[0] ?? now;
  const resetAt = Math.ceil((oldest + windowMs) / 1000);

  if (hits.length >= limit) {
    windows.set(key, hits);
    return { allowed: false, limit, remaining: 0, resetAt };
  }

  hits.push(now);
  windows.set(key, hits);
  prune(cutoff);
  return { allowed: true, limit, remaining: Math.max(0, limit - hits.length), resetAt };
}

export function withinRate(key: string, limit: number, windowMs: number): boolean {
  return retryAfter(key, limit, windowMs) === 0;
}

/**
 * Zero when the call is allowed, otherwise the seconds until it will be.
 *
 * "Wait a few minutes" is not something anybody can act on: it does not say
 * how many, so the only way to find out is to keep pressing the thing that is
 * already refusing. The limiter knows exactly when the oldest hit falls out of
 * the window, so it may as well say.
 */
export function retryAfter(key: string, limit: number, windowMs: number): number {
  const now = Date.now();
  const cutoff = now - windowMs;
  const hits = (windows.get(key) ?? []).filter((at) => at > cutoff);

  if (hits.length >= limit) {
    windows.set(key, hits);
    return Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000));
  }

  hits.push(now);
  windows.set(key, hits);

  prune(cutoff);
  return 0;
}

/**
 * Drops keys whose window has passed.
 *
 * Called from both limiters, because they share one map. It used to live inside
 * `withinRate` alone, so an instance serving only the developer API, which uses
 * `rateState`, never pruned at all and kept one entry per key for the life of
 * the process.
 */
function prune(cutoff: number): void {
  if (windows.size <= 500) return;
  for (const [entry, times] of windows) {
    if (!times.some((at) => at > cutoff)) windows.delete(entry);
  }
}
