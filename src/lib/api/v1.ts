import { randomUUID } from "node:crypto";
import { resolveBearer, touchKey, type Bearer, type Scope } from "@/db/apiKeys";
import { databaseEnabled } from "@/db/client";
import { withinRate } from "@/lib/guard";

/**
 * The shape every /api/v1 route answers in.
 *
 * One envelope, one error shape, one place that decides status codes. The panel's
 * own routes each answer `{ error: "..." }` in their own words, which is fine for
 * a screen that wrote the request itself; a public API is read by somebody who
 * cannot see the code, so the contract has to be worth learning once.
 *
 * Successes are `{ data }`. Failures are `{ error: { type, message, param? } }`.
 * Both carry `request_id`, which is also on the `X-Request-Id` header, so a
 * developer can quote one line back and have it be findable.
 */

export const API_VERSION = "2026-09-01";

export type ErrorType =
  | "authentication_error"
  | "permission_error"
  | "invalid_request_error"
  | "not_found_error"
  | "rate_limit_error"
  | "api_error";

const STATUS: Record<ErrorType, number> = {
  authentication_error: 401,
  permission_error: 403,
  invalid_request_error: 400,
  not_found_error: 404,
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

export function ok<T>(
  data: T,
  init: { status?: number; requestId?: string; headers?: Record<string, string> } = {},
): Response {
  const requestId = init.requestId ?? randomUUID();
  return Response.json(
    { data, request_id: requestId },
    {
      status: init.status ?? 200,
      headers: { ...baseHeaders(requestId), ...init.headers },
    },
  );
}

/**
 * A page of results.
 *
 * Cursor paging rather than offsets: an offset shifts under you when a row is
 * added, which for a task list being written to by both a person and an addon
 * is the normal case rather than the rare one.
 */
export function page<T>(
  items: T[],
  nextCursor: string | null,
  init: { requestId?: string } = {},
): Response {
  return ok({ items, next_cursor: nextCursor, has_more: nextCursor !== null }, init);
}

export function fail(
  type: ErrorType,
  message: string,
  init: { param?: string; requestId?: string; headers?: Record<string, string> } = {},
): Response {
  const requestId = init.requestId ?? randomUUID();
  return Response.json(
    {
      error: { type, message, ...(init.param ? { param: init.param } : {}) },
      request_id: requestId,
    },
    {
      status: STATUS[type],
      headers: { ...baseHeaders(requestId), ...init.headers },
    },
  );
}

export interface Caller extends Bearer {
  requestId: string;
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
 * would otherwise be invisible.
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

  const LIMIT = 120;
  const WINDOW = 60_000;
  if (!withinRate(`v1:${bearer.keyId}`, LIMIT, WINDOW)) {
    return {
      ok: false,
      response: fail("rate_limit_error", `At most ${LIMIT} requests a minute per key.`, {
        requestId,
        headers: {
          "Retry-After": "60",
          "RateLimit-Limit": String(LIMIT),
          "RateLimit-Remaining": "0",
        },
      }),
    };
  }

  if (!bearer.scopes.includes(need)) {
    return {
      ok: false,
      response: fail(
        "permission_error",
        `This key does not have the \`${need}\` scope. Add it, or make a new key.`,
        { requestId },
      ),
    };
  }

  touchKey(bearer.keyId);
  return { ok: true, caller: { ...bearer, requestId } };
}

/**
 * Reads a JSON body, or hands back the error to send.
 *
 * Refuses anything that is not an object, so a route never has to wonder
 * whether `body.title` is being read off an array or a string.
 */
export async function readBody(
  request: Request,
  requestId: string,
  limit = 100_000,
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; response: Response }> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > limit) {
    return {
      ok: false,
      response: fail("invalid_request_error", "That body is too large.", { requestId }),
    };
  }
  const raw = await request.text();
  if (raw.length > limit) {
    return {
      ok: false,
      response: fail("invalid_request_error", "That body is too large.", { requestId }),
    };
  }
  if (!raw.trim()) return { ok: true, body: {} };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        ok: false,
        response: fail("invalid_request_error", "The body has to be a JSON object.", {
          requestId,
        }),
      };
    }
    return { ok: true, body: parsed as Record<string, unknown> };
  } catch {
    return {
      ok: false,
      response: fail("invalid_request_error", "That body is not valid JSON.", { requestId }),
    };
  }
}

/** A trimmed string, or undefined when the field was absent or the wrong type. */
export function str(value: unknown, max = 10_000): string | undefined {
  return typeof value === "string" ? value.trim().slice(0, max) : undefined;
}

/** Turns anything thrown inside a route into the one shape callers expect. */
export function caught(where: string, error: unknown, requestId: string): Response {
  console.error(`[api/v1/${where}]`, error);
  return fail("api_error", "Something went wrong at our end.", { requestId });
}
