import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, lt } from "drizzle-orm";
import { requireDb } from "@/db/client";
import * as t from "@/db/schema";
import { authorize, caught, fail, page, readBody, str } from "@/lib/api/v1";
import { CEO_ID } from "@/lib/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = ["todo", "doing", "done"] as const;
type Status = (typeof STATUSES)[number];

const isStatus = (value: unknown): value is Status =>
  typeof value === "string" && (STATUSES as readonly string[]).includes(value);

export interface WireTask {
  id: string;
  title: string;
  notes: string;
  status: Status;
  department_id: string;
  project_id: string | null;
  due_at: number | null;
  order: number;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
}

/**
 * snake_case on the wire, camelCase inside.
 *
 * The panel is TypeScript all the way down and has no reason to care, but an
 * API read from Python, a shell, or a no-code tool is easier to hold when the
 * field names look like the rest of the world's.
 */
export function toWire(row: typeof t.tasks.$inferSelect): WireTask {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    status: isStatus(row.status) ? row.status : "todo",
    department_id: row.departmentId,
    project_id: row.projectId,
    due_at: row.dueAt,
    order: row.sortOrder,
    created_at: row.createdAt.getTime(),
    updated_at: row.updatedAt.getTime(),
    completed_at: row.completedAt,
  };
}

/**
 * The task list, for something outside the panel to read.
 *
 * This is the endpoint the whole developer API exists for: an addon asks what
 * needs doing, does one of them, and marks it off. Everything else here is in
 * service of that loop.
 *
 * Paged by `created_at` rather than an offset, because both a person and an
 * integration write to this table and an offset would skip rows whenever one
 * was inserted mid-walk.
 */
export async function GET(request: Request) {
  const auth = await authorize(request, "tasks:read");
  if (!auth.ok) return auth.response;
  const { caller } = auth;

  try {
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const departmentId = url.searchParams.get("department_id");
    const rawLimit = Number(url.searchParams.get("limit") ?? "50");
    const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 50, 1), 200);

    if (status && !isStatus(status)) {
      return fail("invalid_request_error", `status has to be one of ${STATUSES.join(", ")}.`, {
        param: "status",
        requestId: caller.requestId,
      });
    }

    const cursor = url.searchParams.get("cursor");
    const cursorAt = cursor ? Number(cursor) : null;
    if (cursor && !Number.isFinite(cursorAt)) {
      return fail("invalid_request_error", "cursor should be one from next_cursor.", {
        param: "cursor",
        requestId: caller.requestId,
      });
    }

    // One more than asked for, so "is there another page" is answered without a
    // second count query.
    const rows = await requireDb()
      .select()
      .from(t.tasks)
      .where(
        and(
          eq(t.tasks.workspaceId, caller.workspaceId),
          status ? eq(t.tasks.status, status) : undefined,
          departmentId ? eq(t.tasks.departmentId, departmentId) : undefined,
          cursorAt !== null ? lt(t.tasks.createdAt, new Date(cursorAt)) : undefined,
        ),
      )
      .orderBy(desc(t.tasks.createdAt))
      .limit(limit + 1);

    const window = rows.slice(0, limit);
    const nextCursor =
      rows.length > limit && window.length
        ? String(window[window.length - 1].createdAt.getTime())
        : null;

    return page(window.map(toWire), nextCursor, { requestId: caller.requestId });
  } catch (error) {
    return caught("tasks", error, caller.requestId);
  }
}

/**
 * Create one task.
 *
 * `title` is the only thing required. Everything else has a sensible place to
 * land, because the common caller is a script that knows what it wants done and
 * not which head owns it.
 */
export async function POST(request: Request) {
  const auth = await authorize(request, "tasks:write");
  if (!auth.ok) return auth.response;
  const { caller } = auth;

  const parsed = await readBody(request, caller.requestId);
  if (!parsed.ok) return parsed.response;

  const title = str(parsed.body.title, 300);
  if (!title) {
    return fail("invalid_request_error", "A task needs a title.", {
      param: "title",
      requestId: caller.requestId,
    });
  }

  const status = parsed.body.status === undefined ? "todo" : parsed.body.status;
  if (!isStatus(status)) {
    return fail("invalid_request_error", `status has to be one of ${STATUSES.join(", ")}.`, {
      param: "status",
      requestId: caller.requestId,
    });
  }

  const dueAt = parsed.body.due_at;
  if (dueAt !== undefined && dueAt !== null && typeof dueAt !== "number") {
    return fail("invalid_request_error", "due_at is a millisecond timestamp, or null.", {
      param: "due_at",
      requestId: caller.requestId,
    });
  }

  try {
    const db = requireDb();
    const departmentId = str(parsed.body.department_id, 120) || CEO_ID;

    // A task pointed at a head that does not exist would never appear on any
    // board, which reads as the write having silently failed.
    if (departmentId !== CEO_ID) {
      const [head] = await db
        .select({ id: t.departments.id })
        .from(t.departments)
        .where(
          and(
            eq(t.departments.workspaceId, caller.workspaceId),
            eq(t.departments.id, departmentId),
          ),
        )
        .limit(1);
      if (!head) {
        return fail("not_found_error", "No department here has that id.", {
          param: "department_id",
          requestId: caller.requestId,
        });
      }
    }

    // New work goes to the top of its column, which is where somebody looking
    // at the board expects to find what just arrived.
    const [first] = await db
      .select({ sortOrder: t.tasks.sortOrder })
      .from(t.tasks)
      .where(and(eq(t.tasks.workspaceId, caller.workspaceId), eq(t.tasks.status, status)))
      .orderBy(asc(t.tasks.sortOrder))
      .limit(1);

    const row = {
      id: randomUUID(),
      workspaceId: caller.workspaceId,
      title,
      notes: str(parsed.body.notes, 20_000) ?? "",
      status,
      departmentId,
      projectId: str(parsed.body.project_id, 120) ?? null,
      dueAt: typeof dueAt === "number" ? dueAt : null,
      sortOrder: (first?.sortOrder ?? 0) - 1,
      completedAt: status === "done" ? Date.now() : null,
    };

    await db.insert(t.tasks).values(row);
    const [saved] = await db
      .select()
      .from(t.tasks)
      .where(and(eq(t.tasks.workspaceId, caller.workspaceId), eq(t.tasks.id, row.id)))
      .limit(1);

    return Response.json(
      { data: toWire(saved), request_id: caller.requestId },
      {
        status: 201,
        headers: {
          "X-Request-Id": caller.requestId,
          "Cache-Control": "no-store",
          Location: `/api/v1/tasks/${row.id}`,
        },
      },
    );
  } catch (error) {
    return caught("tasks", error, caller.requestId);
  }
}
