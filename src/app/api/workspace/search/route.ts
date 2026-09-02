import { and, desc, eq, ilike } from "drizzle-orm";
import { auth, authEnabled } from "@/auth";
import { databaseEnabled, requireDb } from "@/db/client";
import * as t from "@/db/schema";
import { membershipFor } from "@/db/tenancy";
import { withinRate } from "@/lib/guard";
import { conversationHref } from "@/lib/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Searching what was said, rather than what is loaded.
 *
 * The command palette used to search message bodies out of the workspace
 * snapshot, which held every message in the business. It no longer does, and
 * searching whatever happened to be in memory would have been the worst of both
 * things: results that quietly depended on which threads you had opened this
 * session, with nothing on screen to say so.
 *
 * Everything else the palette finds is still local and instant. This is only
 * the part that needs the database.
 */
const LIMIT = 12;
const RADIUS = 70;

/** The matching line, with enough either side to recognise it. */
function snippet(body: string, needle: string): string {
  const at = body.toLowerCase().indexOf(needle.toLowerCase());
  if (at === -1) return body.slice(0, RADIUS * 2).replace(/\s+/g, " ").trim();
  const start = Math.max(0, at - RADIUS);
  const end = Math.min(body.length, at + needle.length + RADIUS);
  return `${start > 0 ? "…" : ""}${body.slice(start, end).replace(/\s+/g, " ").trim()}${
    end < body.length ? "…" : ""
  }`;
}

/** Percent and underscore are wildcards in LIKE, so a query containing them is escaped. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export async function GET(request: Request) {
  if (!authEnabled || !databaseEnabled) {
    return Response.json({ results: [] });
  }

  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return Response.json({ error: "Not signed in." }, { status: 401 });

  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return Response.json({ results: [] });

  // A palette searches on every keystroke, so this is the one route somebody
  // reaches by typing rather than by choosing to.
  if (!withinRate(`search:${email}`, 60, 60_000)) {
    return Response.json({ results: [] });
  }

  try {
    const mine = await membershipFor(email);
    if (!mine) return Response.json({ results: [] });

    const rows = await requireDb()
      .select({
        id: t.messages.id,
        role: t.messages.role,
        content: t.messages.content,
        conversationId: t.messages.conversationId,
        title: t.conversations.title,
        departmentId: t.conversations.departmentId,
        departmentName: t.departments.name,
        sentAt: t.messages.sentAt,
      })
      .from(t.messages)
      .innerJoin(
        t.conversations,
        and(
          eq(t.conversations.workspaceId, t.messages.workspaceId),
          eq(t.conversations.id, t.messages.conversationId),
        ),
      )
      .leftJoin(
        t.departments,
        and(
          eq(t.departments.workspaceId, t.conversations.workspaceId),
          eq(t.departments.id, t.conversations.departmentId),
        ),
      )
      .where(
        and(
          eq(t.messages.workspaceId, mine.workspaceId),
          ilike(t.messages.content, `%${escapeLike(query)}%`),
        ),
      )
      .orderBy(desc(t.messages.sentAt))
      .limit(LIMIT * 4);

    // One hit per conversation, the most recent. Ten rows from one thread would
    // bury every other kind of result, which is the rule the local search
    // already followed.
    const seen = new Set<string>();
    const results = [];
    for (const row of rows) {
      if (seen.has(row.conversationId)) continue;
      seen.add(row.conversationId);
      results.push({
        id: `msg:${row.id}`,
        kind: "message" as const,
        title: row.title,
        subtitle: `${row.role === "user" ? "You" : (row.departmentName ?? "Reply")} · in conversation`,
        snippet: snippet(row.content, query),
        // The helper, not a hand-built path: the lead's conversations live at
        // /ceo rather than /dept/ceo, and a link built here by hand got that
        // wrong for exactly the thread people search for most.
        href: conversationHref(row.departmentId, row.conversationId),
        score: 3,
      });
      if (results.length >= LIMIT) break;
    }

    return Response.json({ results });
  } catch (error) {
    console.error("[api/workspace/search]", error);
    return Response.json({ results: [] });
  }
}
