import { and, desc, eq, sql } from "drizzle-orm";
import { auth, authEnabled } from "@/auth";
import { databaseEnabled, requireDb } from "@/db/client";
import * as t from "@/db/schema";
import { membershipFor } from "@/db/tenancy";
import { isOperator } from "@/lib/admin";
import { readJsonWithin, retryAfter } from "@/lib/guard";
import { reporterEnabled, runReview } from "@/lib/reporter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A pass over every business talks to the model once per batch, which is
// slower than a page load and should not be cut off half way.
export const maxDuration = 300;

/**
 * Reports are the operator's alone.
 *
 * Two readers, and the boundary between them is which rows.
 *
 * An operator sees every business, because somebody has to be able to answer a
 * complaint about a customer and because the deployment is theirs.
 *
 * An administrator sees their own business and nothing else. This used to be
 * operator only, on the reasoning that a report is sometimes about the
 * administrator themselves and a console for reading flagged messages about
 * your own staff is a management tool rather than a safety net. That reasoning
 * has a real hole in it: the review now runs on the business's own key, about
 * its own people, and the version where the only person who can see it is a
 * stranger who runs the servers is worse for everybody, including the person
 * the report is about. It is their duty of care and their bill.
 *
 * The hole that remains, stated rather than designed around: an administrator
 * can see and dismiss a report about themselves. The operator's own view still
 * shows every row from every business, so nothing disappears by being
 * dismissed, and that is the check on it.
 */
async function reader(): Promise<
  | { ok: true; email: string; workspaceId: string | null }
  | { ok: false; status: number; error: string }
> {
  if (!authEnabled || !databaseEnabled) {
    return { ok: false, status: 501, error: "Not configured." };
  }
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return { ok: false, status: 401, error: "Not signed in." };

  // null means every business.
  if (isOperator(email)) return { ok: true, email, workspaceId: null };

  const mine = await membershipFor(email);
  if (mine?.role === "admin") return { ok: true, email, workspaceId: mine.workspaceId };

  // 404 rather than 403, so the route does not confirm it exists to somebody
  // who should not know that it does.
  return { ok: false, status: 404, error: "Not found." };
}

export async function GET(request: Request) {
  const who = await reader();
  if (!who.ok) return Response.json({ error: who.error }, { status: who.status });

  /*
   * One transcript, on request.
   *
   * Keyed by the business as well as the id where the caller is an
   * administrator, so an id from another business matches nothing rather than
   * matching and being refused.
   */
  const wanted = new URL(request.url).searchParams.get("transcript")?.trim();
  if (wanted) {
    const [row] = await requireDb()
      .select({ transcript: t.reports.transcript })
      .from(t.reports)
      .where(
        who.workspaceId
          ? and(eq(t.reports.id, wanted), eq(t.reports.workspaceId, who.workspaceId))
          : eq(t.reports.id, wanted),
      )
      .limit(1);
    return Response.json({ transcript: row?.transcript ?? "" });
  }

  return listing(who);
}

async function listing(who: { email: string; workspaceId: string | null }) {
  try {
    const mine = who.workspaceId;
    const [rows, [cursor]] = await Promise.all([
      // tenancy-audit: fenced to one business for an administrator, and
      // deliberately across all of them for an operator, which `reader` above
      // is the gate on.
      /*
       * Every column except the transcript.
       *
       * A transcript is up to four thousand characters and there can be two
       * hundred rows, so the list was carrying the better part of a megabyte of
       * other people's conversations to render a page that shows none of it:
       * it sits behind a disclosure nobody opens on most rows. Whether there is
       * one comes back as a flag, and the text itself is fetched when somebody
       * actually asks to read it.
       */
      requireDb()
        .select({
          id: t.reports.id,
          workspaceName: t.reports.workspaceName,
          source: t.reports.source,
          sourceId: t.reports.sourceId,
          authorEmail: t.reports.authorEmail,
          category: t.reports.category,
          severity: t.reports.severity,
          reason: t.reports.reason,
          quote: t.reports.quote,
          status: t.reports.status,
          createdAt: t.reports.createdAt,
          hasTranscript: sql<boolean>`length(${t.reports.transcript}) > 0`,
        })
        .from(t.reports)
        .where(mine ? eq(t.reports.workspaceId, mine) : undefined)
        .orderBy(desc(t.reports.createdAt))
        .limit(200),
      requireDb()
        .select({ lastRunAt: t.reviewCursors.lastRunAt })
        .from(t.reviewCursors)
        .where(mine ? eq(t.reviewCursors.workspaceId, mine) : undefined)
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
        hasTranscript: row.hasTranscript,
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
  const who = await reader();
  if (!who.ok) return Response.json({ error: who.error }, { status: who.status });

  const parsed = await readJsonWithin<{ action?: string; id?: string; status?: string }>(
    request,
    4_000,
  );
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: parsed.status });

  try {
    if (parsed.body.action === "run") {
      /*
       * A pass costs money, so it is still not something to hold down the
       * button on, but three in ten minutes was set when one pass swept every
       * business on the operator's own key. An administrator's pass now reads
       * one business, on their key, over at most a hundred and twenty messages
       * on the cheap model, which is fractions of a penny. The limit is there
       * to stop a loop, not to ration.
       */
      const wait = retryAfter(`review:${who.email}`, 10, 10 * 60_000);
      if (wait > 0) {
        return Response.json(
          {
            error:
              wait > 60
                ? `That is ten passes in ten minutes. Try again in ${Math.ceil(wait / 60)} minutes.`
                : `That is ten passes in ten minutes. Try again in ${wait} seconds.`,
          },
          { status: 429 },
        );
      }
      // An administrator reviews their own business and pays for it with their
      // own key. An operator sweeps the lot.
      const result = await runReview(who.workspaceId ?? undefined);
      return Response.json({ ok: true, result });
    }

    if (parsed.body.action === "status") {
      const id = parsed.body.id?.trim();
      const status =
        parsed.body.status === "dismissed" || parsed.body.status === "reviewed"
          ? parsed.body.status
          : "new";
      if (!id) return Response.json({ error: "Nothing named." }, { status: 400 });
      /*
       * Fenced to the caller's business unless they are the operator.
       *
       * By id alone this was safe only while an operator was the one caller.
       * The moment an administrator can post here, an id from another business
       * would have worked: reports are not secret ids, they travel in support
       * threads, and dismissing somebody else's report is a quiet way to bury
       * one. Keyed by both, so an id from elsewhere matches nothing rather than
       * matching and being refused.
       */
      await requireDb()
        .update(t.reports)
        .set({ status })
        .where(
          who.workspaceId
            ? and(eq(t.reports.id, id), eq(t.reports.workspaceId, who.workspaceId))
            : eq(t.reports.id, id),
        );
      return Response.json({ ok: true });
    }

    return Response.json({ error: "No such action." }, { status: 400 });
  } catch (error) {
    console.error("[api/reports]", error);
    return Response.json({ error: "Could not do that." }, { status: 500 });
  }
}
