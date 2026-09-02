import { API_VERSION, ok, only } from "@/lib/api/v1";
import { ALL_SCOPES } from "@/db/apiKeys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What this API is, from the API itself.
 *
 * A developer's first request is almost always "is it up and did my key work",
 * and the second is "what can I call". Answering both without a documentation
 * site is cheap and means the description can never drift from the deployment.
 *
 * Deliberately unauthenticated: it lists shapes, not data.
 */
export function GET() {
  return ok({
    name: "Eterneon API",
    version: API_VERSION,
    authentication: {
      scheme: "Bearer",
      header: "Authorization: Bearer ek_...",
      note: "Keys are made in the panel under Integrations, and shown once.",
    },
    scopes: ALL_SCOPES,
    rate_limit: { requests: 120, per: "minute", by: "key" },
    conventions: {
      success: "{ data, request_id }",
      failure: "{ error: { type, message, param? }, request_id }",
      paging: "Pass ?limit= and ?cursor=. Responses carry next_cursor and has_more.",
      idempotency:
        "Send Idempotency-Key on a POST and a retry returns the first answer " +
        "rather than creating a second thing. Replays carry Idempotency-Replayed: true. " +
        "Reusing a key with a different body is a conflict_error.",
      rate_limit_headers:
        "RateLimit-Limit, RateLimit-Remaining, and RateLimit-Reset are on every " +
        "answer, so a client can pace itself without ever reaching 429.",
      errors: [
        "authentication_error",
        "permission_error",
        "invalid_request_error",
        "not_found_error",
        "method_not_allowed_error",
        "conflict_error",
        "rate_limit_error",
        "api_error",
      ],
    },
    endpoints: [
      { method: "GET", path: "/api/v1", scope: null, does: "This document." },
      { method: "GET", path: "/api/v1/me", scope: null, does: "Which business the key acts for." },
      { method: "GET", path: "/api/v1/departments", scope: "departments:read", does: "The org chart." },
      { method: "GET", path: "/api/v1/memory", scope: "memory:read", does: "What the business has recorded. Filter with ?department_id= and ?kind=." },
      { method: "GET", path: "/api/v1/tasks", scope: "tasks:read", does: "List tasks. Filter with ?status= and ?department_id=." },
      { method: "POST", path: "/api/v1/tasks", scope: "tasks:write", does: "Create a task. Takes Idempotency-Key." },
      { method: "GET", path: "/api/v1/tasks/{id}", scope: "tasks:read", does: "One task." },
      { method: "PATCH", path: "/api/v1/tasks/{id}", scope: "tasks:write", does: "Change a task. Send only what changes." },
      { method: "DELETE", path: "/api/v1/tasks/{id}", scope: "tasks:write", does: "Delete a task." },
    ],
  });
}

export const { POST, PUT, PATCH, DELETE } = only("GET");
