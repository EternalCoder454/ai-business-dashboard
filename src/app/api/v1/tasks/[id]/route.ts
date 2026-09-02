import { and, eq } from "drizzle-orm";
import { requireDb } from "@/db/client";
import * as t from "@/db/schema";
import { authorize, caught, fail, ok, readBody, str } from "@/lib/api/v1";
import { toWire } from "../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = ["todo", "doing", "done"] as const;
const isStatus = (value: unknown): value is (typeof STATUSES)[number] =>
  typeof value === "string" && (STATUSES as readonly string[]).includes(value);

/**
 * Every read and write here is keyed by workspace and id together.
 *
 * Not by id alone with a check afterwards: an id belonging to another business
 * simply does not match, so there is no window between finding a row and
 * deciding whether the caller was allowed to see it, and no way for a later
 * edit to drop the second half of the condition and go unnoticed.
 */
async function find(workspaceId: string, id: string) {
  const [row] = await requireDb()
    .select()
    .from(t.tasks)
    .where(and(eq(t.tasks.workspaceId, workspaceId), eq(t.tasks.id, id)))
    .limit(1);
  return row ?? null;
}

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request, "tasks:read");
  if (!auth.ok) return auth.response;
  const { caller } = auth;

  try {
    const { id } = await ctx.params;
    const row = await find(caller.workspaceId, id);
    if (!row) {
      return fail("not_found_error", "No task here has that id.", {
        requestId: caller.requestId,
      });
    }
    return ok(toWire(row), { requestId: caller.requestId });
  } catch (error) {
    return caught("tasks/id", error, caller.requestId);
  }
}

/**
 * Change what was sent, and nothing else.
 *
 * A PATCH that quietly reset the fields it was not given would make the obvious
 * "mark this done" call wipe the notes, so absent and null are kept distinct:
 * absent means leave it alone, null means clear it.
 */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request, "tasks:write");
  if (!auth.ok) return auth.response;
  const { caller } = auth;

  const parsed = await readBody(request, caller.requestId);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  try {
    const { id } = await ctx.params;
    const existing = await find(caller.workspaceId, id);
    if (!existing) {
      return fail("not_found_error", "No task here has that id.", {
        requestId: caller.requestId,
      });
    }

    const patch: Partial<typeof t.tasks.$inferInsert> = { updatedAt: new Date() };

    if ("title" in body) {
      const title = str(body.title, 300);
      if (!title) {
        return fail("invalid_request_error", "A task needs a title.", {
          param: "title",
          requestId: caller.requestId,
        });
      }
      patch.title = title;
    }

    if ("notes" in body) patch.notes = str(body.notes, 20_000) ?? "";

    if ("status" in body) {
      if (!isStatus(body.status)) {
        return fail(
          "invalid_request_error",
          "status has to be one of " + STATUSES.join(", ") + ".",
          { param: "status", requestId: caller.requestId },
        );
      }
      patch.status = body.status;
      // Finishing something stamps the time; reopening it clears the stamp,
      // rather than leaving a completion date on a task that is not complete.
      patch.completedAt = body.status === "done" ? (existing.completedAt ?? Date.now()) : null;
    }

    if ("due_at" in body) {
      if (body.due_at !== null && typeof body.due_at !== "number") {
        return fail("invalid_request_error", "due_at is a millisecond timestamp, or null.", {
          param: "due_at",
          requestId: caller.requestId,
        });
      }
      patch.dueAt = body.due_at;
    }

    if ("department_id" in body) {
      const departmentId = str(body.department_id, 120);
      if (!departmentId) {
        return fail("invalid_request_error", "department_id cannot be empty.", {
          param: "department_id",
          requestId: caller.requestId,
        });
      }
      patch.departmentId = departmentId;
    }

    await requireDb()
      .update(t.tasks)
      .set(patch)
      .where(and(eq(t.tasks.workspaceId, caller.workspaceId), eq(t.tasks.id, id)));

    const saved = await find(caller.workspaceId, id);
    return ok(saved ? toWire(saved) : null, { requestId: caller.requestId });
  } catch (error) {
    return caught("tasks/id", error, caller.requestId);
  }
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request, "tasks:write");
  if (!auth.ok) return auth.response;
  const { caller } = auth;

  try {
    const { id } = await ctx.params;
    const removed = await requireDb()
      .delete(t.tasks)
      .where(and(eq(t.tasks.workspaceId, caller.workspaceId), eq(t.tasks.id, id)))
      .returning({ id: t.tasks.id });

    if (removed.length === 0) {
      return fail("not_found_error", "No task here has that id.", {
        requestId: caller.requestId,
      });
    }
    return ok({ id, deleted: true }, { requestId: caller.requestId });
  } catch (error) {
    return caught("tasks/id", error, caller.requestId);
  }
}
