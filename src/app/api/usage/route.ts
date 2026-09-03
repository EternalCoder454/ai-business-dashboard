import { and, gte, isNull, sql } from "drizzle-orm";
import { auth, authEnabled } from "@/auth";
import { databaseEnabled, requireDb } from "@/db/client";
import * as t from "@/db/schema";
import { isOperator } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Who is actually using this, per business.
 *
 * Read from the real tables rather than from telemetry. Telemetry answers "is
 * it working"; this answers "is anybody there", and the second question is
 * better asked of the work itself. Conversations and messages are already
 * stamped, they go back to the beginning rather than to the retention window,
 * and nothing new has to be written on every request to produce them.
 *
 * Counts only. How many people signed in, how many messages, when the business
 * was last touched. Never who, never what they said, never which department a
 * named person prefers. The question this exists to answer is which businesses
 * have gone quiet, and no part of that needs a person's name in it.
 */
const DAY = 86_400_000;

export async function GET(request: Request) {
  if (!authEnabled || !databaseEnabled) {
    return Response.json({ error: "Not available on this instance." }, { status: 503 });
  }

  const session = await auth();
  if (!isOperator(session?.user?.email?.toLowerCase())) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const url = new URL(request.url);
  const asked = Number(url.searchParams.get("days") ?? "30");
  const days = Number.isFinite(asked) ? Math.min(Math.max(asked, 1), 365) : 30;
  const since = Date.now() - days * DAY;
  const sinceDate = new Date(since);

  try {
    const db = requireDb();

    /*
     * Seven aggregates, issued together: the driver pipelines prepared
     * statements, so they cost about one round trip rather than seven.
     * Separate grouped queries rather than one join, because joining several
     * one-to-many tables multiplies the rows and every count comes out wrong
     * in a way that looks plausible.
     */
    const [spaces, seats, signedIn, conversations, messages, deliverables, briefings] =
      await Promise.all([
        db
          .select({ id: t.workspaces.id, name: t.workspaces.name, createdAt: t.workspaces.createdAt })
          .from(t.workspaces),

        // tenancy-audit: across every business, for the operator's own screen.
        db
          .select({ ws: t.access.workspaceId, n: sql<number>`count(*)::int` })
          .from(t.access)
          .where(isNull(t.access.revokedAt))
          .groupBy(t.access.workspaceId),

        // People who have actually signed in during the window, which is not
        // the same as people who were invited.
        // tenancy-audit: across every business, for the operator's own screen.
        db
          .select({ ws: t.access.workspaceId, n: sql<number>`count(*)::int` })
          .from(t.access)
          .where(and(isNull(t.access.revokedAt), gte(t.access.lastSignedInAt, sinceDate)))
          .groupBy(t.access.workspaceId),

        // tenancy-audit: across every business, for the operator's own screen.
        db
          .select({ ws: t.conversations.workspaceId, n: sql<number>`count(*)::int` })
          .from(t.conversations)
          .groupBy(t.conversations.workspaceId),

        // Messages carry the only reliable clock on whether anybody is here.
        // tenancy-audit: across every business, for the operator's own screen.
        db
          .select({
            ws: t.messages.workspaceId,
            n: sql<number>`count(*)::int`,
            recent: sql<number>`count(*) filter (where ${t.messages.sentAt} >= ${since})::int`,
            last: sql<number>`max(${t.messages.sentAt})::bigint`,
          })
          .from(t.messages)
          .groupBy(t.messages.workspaceId),

        // tenancy-audit: across every business, for the operator's own screen.
        db
          .select({ ws: t.deliverables.workspaceId, n: sql<number>`count(*)::int` })
          .from(t.deliverables)
          .groupBy(t.deliverables.workspaceId),

        // tenancy-audit: across every business, for the operator's own screen.
        db
          .select({ ws: t.briefings.workspaceId, n: sql<number>`count(*)::int` })
          .from(t.briefings)
          .groupBy(t.briefings.workspaceId),
      ]);

    const by = <T extends { ws: string }>(rows: T[]) => new Map(rows.map((row) => [row.ws, row]));
    const seatsBy = by(seats);
    const signedInBy = by(signedIn);
    const conversationsBy = by(conversations);
    const messagesBy = by(messages);
    const deliverablesBy = by(deliverables);
    const briefingsBy = by(briefings);

    const rows = spaces.map((space) => {
      const said = messagesBy.get(space.id);
      const last = said?.last == null ? null : Number(said.last);
      return {
        id: space.id,
        name: space.name,
        createdAt: space.createdAt.getTime(),
        seats: Number(seatsBy.get(space.id)?.n ?? 0),
        activePeople: Number(signedInBy.get(space.id)?.n ?? 0),
        conversations: Number(conversationsBy.get(space.id)?.n ?? 0),
        messages: Number(said?.n ?? 0),
        recentMessages: Number(said?.recent ?? 0),
        deliverables: Number(deliverablesBy.get(space.id)?.n ?? 0),
        briefings: Number(briefingsBy.get(space.id)?.n ?? 0),
        lastActivityAt: last,
      };
    });

    return Response.json({ days, rows });
  } catch (error) {
    console.error("[api/usage] read", error);
    return Response.json({ error: "Could not read usage." }, { status: 500 });
  }
}
