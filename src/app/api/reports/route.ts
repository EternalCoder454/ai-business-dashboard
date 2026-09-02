import { desc, eq } from "drizzle-orm";
import { auth, authEnabled } from "@/auth";
import { databaseEnabled, requireDb } from "@/db/client";
import * as t from "@/db/schema";
import { isOperator } from "@/lib/admin";
import { readJsonWithin, withinRate } from "@/lib/guard";
import { reporterEnabled, runReview } from "@/lib/reporter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A pass over every business talks to the model once per batch, which is
// slower than a page load and should not be cut off half way.
export const maxDuration = 300;

/**
 * Reports are the operator's alone.
 *
 * Not a workspace administrator's: a report is often about somebody's own
 * colleague, sometimes about the administrator, and handing the business a
 * console for reading flagged messages about its own staff would turn a safety
 * net into a management tool. It stays with whoever runs the deployment.
 */
async function requireOperator(): Promise<
  { ok: true; email: string } | { ok: false; status: number; error: string }
> {
  if (!authEnabled || !databaseEnabled) {
    return { ok: false, status: 501, error: "Not configured." };
  }
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return { ok: false, status: 401, error: "Not signed in." };
  // 404 rather than 403, so the route does not confirm it exists to somebody
  // who should not know that it does.
  if (!isOperator(email)) return { ok: false, status: 404, error: "Not found." };
  return { ok: true, email };
}

export async function GET() {
  const who = await requireOperator();
  if (!who.ok) return Response.json({ error: who.error }, { status: who.status });

  try {
    const [rows, [cursor]] = await Promise.all([
      requireDb().select().from(t.reports).orderBy(desc(t.reports.createdAt)).limit(200),
      requireDb()
        .select({ lastRunAt: t.reviewCursors.lastRunAt })
        .from(t.reviewCursors)
        .orderBy(desc(t.reviewCursors.lastRunAt))
        .limit(1),
    ]);

    return Response.json({
      enabled: reporterEnabled(),
      lastRunAt: cursor?.lastRunAt?.getTime() ?? null,
      reports: rows.map((row) => ({
        id: row.id,
        workspaceName: row.workspaceName,
        source: row.source,
        sourceId: row.sourceId,
        authorEmail: row.authorEmail,
        category: row.category,
        severity: row.severity,
        reason: row.reason,
        quote: row.quote,
        status: row.status,
        createdAt: row.createdAt.getTime(),
      })),
    });
  } catch (error) {
    console.error("[api/reports] read", error);
    return Response.json({ error: "Could not read the reports." }, { status: 500 });
  }
}

/** Run a pass now, or mark one report as dealt with. */
export async function POST(request: Request) {
  const who = await requireOperator();
  if (!who.ok) return Response.json({ error: who.error }, { status: who.status });

  const parsed = await readJsonWithin<{ action?: string; id?: string; status?: string }>(
    request,
    4_000,
  );
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: parsed.status });

  try {
    if (parsed.body.action === "run") {
      // A pass costs money and takes time, so it is not something to hold down
      // the button on.
      if (!withinRate(`review:${who.email}`, 3, 10 * 60_000)) {
        return Response.json(
          { error: "A pass has just run. Give it a few minutes." },
          { status: 429 },
        );
      }
      const result = await runReview();
      return Response.json({ ok: true, result });
    }

    if (parsed.body.action === "status") {
      const id = parsed.body.id?.trim();
      const status =
        parsed.body.status === "dismissed" || parsed.body.status === "reviewed"
          ? parsed.body.status
          : "new";
      if (!id) return Response.json({ error: "Nothing named." }, { status: 400 });
      await requireDb().update(t.reports).set({ status }).where(eq(t.reports.id, id));
      return Response.json({ ok: true });
    }

    return Response.json({ error: "No such action." }, { status: 400 });
  } catch (error) {
    console.error("[api/reports]", error);
    return Response.json({ error: "Could not do that." }, { status: 500 });
  }
}
