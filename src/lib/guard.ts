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
 * Reads a JSON body and checks it is the shape the route expects.
 *
 * `readJsonWithin` casts, which is a promise the runtime never checks: every
 * field it hands back is typed and none of it is verified, so a handler reads
 * `body.email.trim()` on whatever arrived and a number where a string belongs
 * is a 500 rather than a 400. That is the gap this closes.
 *
 * The size guard is the same one, run first, because a body too large to
 * accept should be refused before it is parsed rather than after.
 *
 * The message names the field and what was wrong with it. A caller who gets
 * "Invalid request" has to guess, and the only people calling these routes are
 * this app and whoever is writing against the public API.
 */
export async function readJson<T>(
  request: Request,
  schema: { safeParse: (value: unknown) => SafeParse<T> },
  limit: number,
): Promise<{ ok: true; body: T } | { ok: false; status: number; error: string }> {
  const read = await readJsonWithin<unknown>(request, limit);
  if (!read.ok) return read;

  const checked = schema.safeParse(read.body);
  if (checked.success) return { ok: true, body: checked.data };

  const first = checked.error.issues[0];
  const where = first?.path?.length ? first.path.join(".") : "";
  return {
    ok: false,
    status: 400,
    error: where ? `${where}: ${first?.message ?? "not valid"}` : (first?.message ?? "Invalid request."),
  };
}

/** The part of a zod result this uses, named so the import stays a type. */
type SafeParse<T> =
  | { success: true; data: T }
  | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } };
