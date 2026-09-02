import { and, desc, eq, lt } from "drizzle-orm";
import { requireDb } from "@/db/client";
import * as t from "@/db/schema";
import { authorize, caught, fail, only, page } from "@/lib/api/v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What the business has recorded: decisions that stand, and figures that were
 * true on a date.
 *
 * Read only, and read only. An addon composing something on the company's
 * behalf needs to know what the company has already settled, and getting that
 * wrong is worse than not having it. Writing here is a different matter: these
 * entries are what every head reasons from, so something that could add to them
 * over an API could quietly steer every answer the business gets. That stays a
 * decision a person makes in the panel.
 *
 * Archived entries are left out. They were archived because they stopped being
 * true, and an integration has no way to tell the difference.
 */
export async function GET(request: Request) {
  const auth = await authorize(request, "memory:read");
  if (!auth.ok) return auth.response;
  const { caller } = auth;

  try {
    const url = new URL(request.url);
    const departmentId = url.searchParams.get("department_id");
    const kind = url.searchParams.get("kind");

    const rawLimit = Number(url.searchParams.get("limit") ?? "50");
    const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 50, 1), 200);

    const cursor = url.searchParams.get("cursor");
    const cursorAt = cursor ? Number(cursor) : null;
    if (cursor && !Number.isFinite(cursorAt)) {
      return fail("invalid_request_error", "cursor should be one from next_cursor.", {
        param: "cursor",
        caller,
      });
    }

    // One more than asked for, so "is there another page" is answered without a
    // second count query.
    const rows = await requireDb()
      .select({
        id: t.memory.id,
        kind: t.memory.kind,
        label: t.memory.label,
        value: t.memory.value,
        detail: t.memory.detail,
        revisitWhen: t.memory.revisitWhen,
        departmentId: t.memory.departmentId,
        projectId: t.memory.projectId,
        occurredAt: t.memory.occurredAt,
      })
      .from(t.memory)
      .where(
        and(
          eq(t.memory.workspaceId, caller.workspaceId),
          eq(t.memory.archived, false),
          departmentId ? eq(t.memory.departmentId, departmentId) : undefined,
          kind ? eq(t.memory.kind, kind) : undefined,
          cursorAt !== null ? lt(t.memory.occurredAt, cursorAt) : undefined,
        ),
      )
      .orderBy(desc(t.memory.occurredAt))
      .limit(limit + 1);

    const window = rows.slice(0, limit);
    const nextCursor =
      rows.length > limit && window.length
        ? String(window[window.length - 1].occurredAt)
        : null;

    return page(
      window.map((row) => ({
        id: row.id,
        kind: row.kind,
        label: row.label,
        value: row.value,
        detail: row.detail,
        revisit_when: row.revisitWhen,
        department_id: row.departmentId,
        project_id: row.projectId,
        occurred_at: row.occurredAt,
      })),
      nextCursor,
      { caller },
    );
  } catch (error) {
    return caught("memory", error, caller);
  }
}

/** Anything else on this path answers in the envelope rather than an empty 405. */
export const { POST, PUT, PATCH, DELETE } = only("GET");
