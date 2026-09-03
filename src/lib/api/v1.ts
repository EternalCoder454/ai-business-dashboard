import { createHash, randomUUID } from "node:crypto";
import { resolveBearer, touchKey, type Bearer, type Scope } from "@/db/apiKeys";
import { databaseEnabled } from "@/db/client";
import { rateLimit } from "@/lib/rateLimit";

/**
 * The shape every /api/v1 route answers in.
 *
 * One envelope, one error shape, one place that decides status codes. The
 * panel's own routes each answer `{ error: "..." }` in their own words, which
 * is fine for a screen that wrote the request itself; a public API is read by
 * somebody who cannot see the code, so the contract has to be worth learning
 * once and then never surprising.
 *
 * Successes are `{ data }`. Failures are `{ error: { type, message, param? } }`.
 * Both carry `request_id`, which is also on the `X-Request-Id` header, so a
 * developer can quote one line back and have it be findable.
 *
 * The contract holds for every answer this API gives, including the ones a
 * framework would otherwise write for you. A 405 with an empty body and a 404
 * carrying an HTML error page both break a client that parses JSON, and they
 * break it with a parse error rather than the typed error it was ready for,
 * which is the worst way to find out you have a typo in a URL.
 */

export const API_VERSION = "2026-09-01";

const LIMIT = 120;
const WINDOW = 60_000;

export type ErrorType =
  | "authentication_error"
  | "permission_error"
  | "invalid_request_error"
  | "not_found_error"
  | "method_not_allowed_error"
  | "conflict_error"
  | "rate_limit_error"
  | "api_error";

const STATUS: Record<ErrorType, number> = {
  authentication_error: 401,
  permission_error: 403,
  invalid_request_error: 400,
  not_found_error: 404,
  method_not_allowed_error: 405,
  conflict_error: 409,
  rate_limit_error: 429,
  api_error: 500,
};

function baseHeaders(requestId: string): Record<string, string> {
  return {
    "X-Request-Id": requestId,
    "X-Api-Version": API_VERSION,
    "Cache-Control": "no-store",
  };
}

export interface Caller extends Bearer {
  requestId: string;
  /** Carried onto every response so a client can pace itself. */
  rateHeaders: Record<string, string>;
}

export function ok<T>(
  data: T,
  init: {
    status?: number;
    requestId?: string;
    caller?: Caller;
    headers?: Record<string, string>;
  } = {},
): Response {
  const requestId = init.requestId ?? init.caller?.requestId ?? randomUUID();
  return Response.json(
    { data, request_id: requestId },
    {
      status: init.status ?? 200,
      headers: {
        ...baseHeaders(requestId),
        ...(init.caller?.rateHeaders ?? {}),
        ...init.headers,
      },
    },
  );
}

/**
 * A page of results.
 *
 * Cursor paging rather than offsets: an offset shifts under you when a row is
 * added, which for a task list written to by both a person and an addon is the
 * normal case rather than the rare one.
 */
export function page<T>(
  items: T[],
  nextCursor: string | null,
  init: { requestId?: string; caller?: Caller } = {},
): Response {
  return ok({ items, next_cursor: nextCursor, has_more: nextCursor !== null }, init);
}

export function fail(
  type: ErrorType,
  message: string,
  init: {
    param?: string;
    requestId?: string;
    caller?: Caller;
    headers?: Record<string, string>;
  } = {},
): Response {
  const requestId = init.requestId ?? init.caller?.requestId ?? randomUUID();
  return Response.json(
    {
      error: { type, message, ...(init.param ? { param: init.param } : {}) },
      request_id: requestId,
    },
    {
      status: STATUS[type],
      headers: {
        ...baseHeaders(requestId),
        ...(init.caller?.rateHeaders ?? {}),
        ...init.headers,
      },
    },
  );
}

/**
 * The answer for a method this path does not have.
 *
 * Next returns an empty 405 with no content type for an unexported method, so
 * a client that parses every response gets a parse error where it expected a
 * typed one. Every route exports these explicitly, which also means `Allow`
 * says what the path does take.
 */
export function notAllowed(allowed: string[]): Response {
  return fail(
    "method_not_allowed_error",
    `That path takes ${allowed.join(", ")}.`,
    { headers: { Allow: allowed.join(", ") } },
  );
}

/** Builds the handful of identical handlers a route needs to reject cleanly. */
export function only(...allowed: string[]) {
  const reject = () => notAllowed(allowed);
  const all = ["GET", "POST", "PUT", "PATCH", "DELETE"];
  return Object.fromEntries(
    all.filter((method) => !allowed.includes(method)).map((method) => [method, reject]),
  ) as Record<string, () => Response>;
}

/**
 * Every /api/v1 route starts here.
 *
 * Returns either a caller or the Response to send back, so a route reads as one
 * `if` rather than a ladder of guards. The scope check is part of it: a route
 * names what it needs and cannot forget to enforce it.
 *
 * The rate limit is per key rather than per address, because the interesting
 * unit for an API is the integration, and a bad one behind a load balancer
 * would otherwise be invisible. It is counted in memory, so on serverless each
 * instance holds its own tally and the real ceiling is looser than the number
 * reported. That is worth having anyway: what it catches is a client stuck in a
 * loop, and the headers let a well behaved one pace itself without ever finding
 * the wall.
 */
export async function authorize(
  request: Request,
  need: Scope,
): Promise<{ ok: true; caller: Caller } | { ok: false; response: Response }> {
  const requestId = randomUUID();

  if (!databaseEnabled) {
    return {
      ok: false,
      response: fail("api_error", "This deployment has no hosted workspace.", { requestId }),
    };
  }

  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(/\s+/, 2);
  if (!token || scheme.toLowerCase() !== "bearer") {
    return {
      ok: false,
      response: fail(
        "authentication_error",
        "Send your key as `Authorization: Bearer ek_...`.",
        { requestId, headers: { "WWW-Authenticate": "Bearer" } },
      ),
    };
  }

  const bearer = await resolveBearer(token);
  if (!bearer) {
    return {
      ok: false,
      response: fail("authentication_error", "That key is not valid, or was revoked.", {
        requestId,
        headers: { "WWW-Authenticate": "Bearer" },
      }),
    };
  }

  const rate = await rateLimit(`v1:${bearer.keyId}`, LIMIT, WINDOW);
  const rateHeaders = {
    "RateLimit-Limit": String(rate.limit),
    "RateLimit-Remaining": String(rate.remaining),
    "RateLimit-Reset": String(rate.resetAt),
  };

  if (!rate.allowed) {
    return {
      ok: false,
      response: fail("rate_limit_error", `At most ${LIMIT} requests a minute per key.`, {
        requestId,
        headers: {
          ...rateHeaders,
          "Retry-After": String(Math.max(1, rate.resetAt - Math.floor(Date.now() / 1000))),
        },
      }),
    };
  }

  const caller: Caller = { ...bearer, requestId, rateHeaders };

  if (!bearer.scopes.includes(need)) {
    return {
      ok: false,
      response: fail(
        "permission_error",
        `This key does not have the \`${need}\` scope. Add it, or make a new key.`,
        { caller },
      ),
    };
  }

  touchKey(bearer.keyId);
  return { ok: true, caller };
}

/**
 * Reads a JSON body, or hands back the error to send.
 *
 * Refuses anything that is not an object, so a route never has to wonder
 * whether `body.title` is being read off an array or a string.
 */
export async function readBody(
  request: Request,
  caller: Caller,
  limit = 100_000,
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; response: Response }> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > limit) {
    return {
      ok: false,
      response: fail("invalid_request_error", "That body is too large.", { caller }),
    };
  }
  const raw = await request.text();
  if (raw.length > limit) {
    return {
      ok: false,
      response: fail("invalid_request_error", "That body is too large.", { caller }),
    };
  }
  if (!raw.trim()) return { ok: true, body: {} };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        ok: false,
        response: fail("invalid_request_error", "The body has to be a JSON object.", {
          caller,
        }),
      };
    }
    return { ok: true, body: parsed as Record<string, unknown> };
  } catch {
    return {
      ok: false,
      response: fail("invalid_request_error", "That body is not valid JSON.", { caller }),
    };
  }
}

/**
 * A stable fingerprint for one attempt at a write.
 *
 * The header the caller sent, mixed with the key and the body, so replaying the
 * same key against a different body is a conflict rather than a silent hit on
 * somebody else's earlier result.
 */
export function idempotencyFingerprint(
  request: Request,
  caller: Caller,
  body: Record<string, unknown>,
): { key: string; bodyHash: string } | null {
  const supplied = request.headers.get("idempotency-key")?.trim();
  if (!supplied) return null;
  return {
    key: `${caller.keyId}:${supplied.slice(0, 200)}`,
    bodyHash: createHash("sha256").update(JSON.stringify(body)).digest("hex"),
  };
}

/** A trimmed string, or undefined when the field was absent or the wrong type. */
export function str(value: unknown, max = 10_000): string | undefined {
  return typeof value === "string" ? value.trim().slice(0, max) : undefined;
}

/** Turns anything thrown inside a route into the one shape callers expect. */
export function caught(where: string, error: unknown, caller: Caller): Response {
  console.error(`[api/v1/${where}]`, error);
  return fail("api_error", "Something went wrong at our end.", { caller });
}
