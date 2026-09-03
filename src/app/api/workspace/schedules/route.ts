import { randomUUID } from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import { auth, authEnabled } from "@/auth";
import { databaseEnabled, requireDb } from "@/db/client";
import * as t from "@/db/schema";
import { membershipFor } from "@/db/tenancy";
import { allowsArea } from "@/lib/permissions";
import { readJsonWithin, withinRate } from "@/lib/guard";
import { listBriefings } from "@/lib/schedules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A business's own rhythms, and what they have produced.
 *
 * Any member reads. Only an administrator changes one, because a schedule
 * spends the business's key on a timer and adding one is a decision about the
 * bill rather than about somebody's own work.
 */
async function whoever(): Promise<
  | { ok: true; email: string; workspaceId: string; admin: boolean }
  | { ok: false; status: number; error: string }
> {
  if (!authEnabled || !databaseEnabled) {
    return { ok: false, status: 501, error: "This instance has no hosted workspace." };
  }
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return { ok: false, status: 401, error: "Not signed in." };

  const membership = await membershipFor(email);
  if (!membership) return { ok: false, status: 403, error: "You are not in a workspace." };

  // Briefings are a schedule of their own, on their own endpoint, so the check
  // that covers the tables in the workspace batch does not reach them.
  if (!allowsArea(membership.role, membership.permissions, "briefings")) {
    return { ok: false, status: 403, error: "Briefings are not open to your account." };
  }

  return {
    ok: true,
    email,
    workspaceId: membership.workspaceId,
    admin: membership.role === "admin",
  };
}

const CADENCES = ["daily", "weekly", "monthly"] as const;
const isCadence = (value: unknown): value is (typeof CADENCES)[number] =>
  typeof value === "string" && (CADENCES as readonly string[]).includes(value);

/** Whole numbers only, and inside the range the cadence can actually use. */
function clamp(value: unknown, low: number, high: number, fallback: number): number {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n >= low && n <= high ? n : fallback;
}

export async function GET() {
  const who = await whoever();
  if (!who.ok) return Response.json({ error: who.error }, { status: who.status });

  try {
    const [schedules, briefings] = await Promise.all([
      requireDb()
        .select()
        .from(t.schedules)
        .where(eq(t.schedules.workspaceId, who.workspaceId))
        .orderBy(asc(t.schedules.createdAt)),
      listBriefings(who.workspaceId),
    ]);

    return Response.json({
      canEdit: who.admin,
      schedules: schedules.map((row) => ({
        id: row.id,
        name: row.name,
        departmentId: row.departmentId,
        prompt: row.prompt,
        cadence: row.cadence,
        weekday: row.weekday,
        dayOfMonth: row.dayOfMonth,
        enabled: row.enabled,
        lastRunAt: row.lastRunAt?.getTime() ?? null,
      })),
      briefings: briefings.map((row) => ({
        id: row.id,
        scheduleName: row.scheduleName,
        departmentId: row.departmentId,
        title: row.title,
        body: row.body,
        read: row.readAt !== null,
        createdAt: row.createdAt.getTime(),
      })),
    });
  } catch (error) {
    console.error("[api/workspace/schedules] read", error);
    return Response.json({ error: "Could not read your schedules." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const who = await whoever();
  if (!who.ok) return Response.json({ error: who.error }, { status: who.status });

  const parsed = await readJsonWithin<{
    action?: string;
    id?: string;
    name?: string;
    departmentId?: string;
    prompt?: string;
    cadence?: string;
    weekday?: number;
    dayOfMonth?: number;
    enabled?: boolean;
  }>(request, 20_000);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: parsed.status });

  const body = parsed.body;

  // Marking a briefing read is the one thing a member may do, since it is about
  // having looked at something rather than about what the business spends.
  if (body.action === "read") {
    const id = body.id?.trim();
    if (!id) return Response.json({ error: "Nothing named." }, { status: 400 });
    await requireDb()
      .update(t.briefings)
      .set({ readAt: new Date() })
      .where(and(eq(t.briefings.id, id), eq(t.briefings.workspaceId, who.workspaceId)));
    return Response.json({ ok: true });
  }

  if (!who.admin) {
    return Response.json(
      { error: "Only an administrator of this business can change its schedules." },
      { status: 403 },
    );
  }

  if (!withinRate(`schedules:${who.email}`, 30, 60_000)) {
    return Response.json({ error: "Too many changes at once." }, { status: 429 });
  }

  try {
    if (body.action === "delete") {
      const id = body.id?.trim();
      if (!id) return Response.json({ error: "Nothing named." }, { status: 400 });
      await requireDb()
        .delete(t.schedules)
        .where(and(eq(t.schedules.id, id), eq(t.schedules.workspaceId, who.workspaceId)));
      // The briefings it produced stay. They are what the business read, and
      // deleting the rhythm should not delete the record of it having run.
      await requireDb()
        .update(t.briefings)
        .set({ scheduleId: null })
        .where(
          and(eq(t.briefings.scheduleId, id), eq(t.briefings.workspaceId, who.workspaceId)),
        );
      return Response.json({ ok: true });
    }

    if (body.action === "save") {
      const name = body.name?.trim();
      const prompt = body.prompt?.trim();
      const departmentId = body.departmentId?.trim();
      if (!name) return Response.json({ error: "Give it a name." }, { status: 400 });
      if (!prompt) return Response.json({ error: "Write the question." }, { status: 400 });
      if (!departmentId) {
        return Response.json({ error: "Pick who answers it." }, { status: 400 });
      }

      // A schedule pointed at a head that does not exist would fail silently
      // every morning, which is the worst way for this to be wrong.
      const [head] = await requireDb()
        .select({ id: t.departments.id })
        .from(t.departments)
        .where(
          and(
            eq(t.departments.workspaceId, who.workspaceId),
            eq(t.departments.id, departmentId),
          ),
        )
        .limit(1);
      if (!head) return Response.json({ error: "No such head." }, { status: 404 });

      const values = {
        workspaceId: who.workspaceId,
        name: name.slice(0, 80),
        departmentId,
        prompt: prompt.slice(0, 4_000),
        cadence: isCadence(body.cadence) ? body.cadence : "weekly",
        weekday: clamp(body.weekday, 0, 6, 1),
        // Below 29, so a monthly rhythm exists in February.
        dayOfMonth: clamp(body.dayOfMonth, 1, 28, 1),
        enabled: body.enabled !== false,
        updatedAt: new Date(),
      };

      const id = body.id?.trim();
      if (id) {
        await requireDb()
          .update(t.schedules)
          .set(values)
          .where(and(eq(t.schedules.id, id), eq(t.schedules.workspaceId, who.workspaceId)));
      } else {
        await requireDb()
          .insert(t.schedules)
          .values({ ...values, id: randomUUID(), createdBy: who.email });
      }

      const schedules = await requireDb()
        .select()
        .from(t.schedules)
        .where(eq(t.schedules.workspaceId, who.workspaceId))
        .orderBy(desc(t.schedules.createdAt));
      return Response.json({ ok: true, count: schedules.length });
    }

    return Response.json({ error: "No such action." }, { status: 400 });
  } catch (error) {
    console.error("[api/workspace/schedules]", error);
    return Response.json({ error: "Could not make that change." }, { status: 500 });
  }
}
