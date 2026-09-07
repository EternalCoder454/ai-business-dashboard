import { desc, eq, sql } from "drizzle-orm";
import { databaseEnabled, requireDb } from "@/db/client";
import * as t from "@/db/schema";
import { currentViewer } from "./viewer";

/** Enough to draw the two panes, and deliberately nothing else. */
export interface DashboardPreview {
  conversations: {
    id: string;
    departmentId: string;
    title: string;
    updatedAt: number;
  }[];
  meetings: { id: string; title: string; rounds: number; updatedAt: number }[];
}

/**
 * The recent conversations and meetings, rendered with the page rather than
 * fetched after it.
 *
 * These two panes were the last thing on the dashboard to fill in, about a
 * second and a half after everything else, and the reason is a chain rather
 * than a slow query. The browser had to receive the HTML, run the JavaScript,
 * mount the store, ask /api/workspace, and wait for a snapshot that carries the
 * whole business, before it could draw ten lines of text.
 *
 * So the server reads those ten lines itself, on the request that was already
 * happening. They arrive in the markup, and the snapshot replaces them a moment
 * later with the same thing.
 *
 * Small on purpose. Six conversations and four meetings, titles and counts, no
 * message bodies and no rounds. Sending the whole snapshot in the HTML would
 * trade a round trip for a bigger document and slow down the first paint this
 * exists to speed up.
 */
export async function loadDashboardPreview(): Promise<DashboardPreview | null> {
  if (!databaseEnabled) return null;

  try {
    const viewer = await currentViewer();
    if (!viewer) return null;

    const db = requireDb();

    // Together, so this is one round trip rather than two.
    const [conversations, meetings] = await Promise.all([
      db
        .select({
          id: t.conversations.id,
          departmentId: t.conversations.departmentId,
          title: t.conversations.title,
          updatedAt: t.conversations.updatedAt,
          // Same rule the pane uses: a conversation nobody has said anything in
          // is not one worth a line.
          /*
           * Written out rather than interpolated. Building this correlation
           * from drizzle's column objects rendered both sides unqualified,
           * so it came out as `where "workspace_id" = "workspace_id" and
           * "conversation_id" = "id"`: both names resolved to the inner table,
           * which is a tautology and a comparison of two different columns of
           * it. Every count was zero and the pane was empty, while the query
           * succeeded and the types were right.
           */
          messages: sql<number>`(
            select count(*)::int from messages m
            where m.workspace_id = conversations.workspace_id
              and m.conversation_id = conversations.id
          )`,
        })
        .from(t.conversations)
        .where(eq(t.conversations.workspaceId, viewer.workspaceId))
        .orderBy(desc(t.conversations.updatedAt))
        .limit(12),
      db
        .select({
          id: t.meetings.id,
          title: t.meetings.title,
          updatedAt: t.meetings.updatedAt,
          // Qualified for the same reason as above.
          rounds: sql<number>`(
            select count(*)::int from meeting_rounds r
            where r.workspace_id = meetings.workspace_id
              and r.run_id = meetings.id
          )`,
        })
        .from(t.meetings)
        .where(eq(t.meetings.workspaceId, viewer.workspaceId))
        .orderBy(desc(t.meetings.updatedAt))
        .limit(3),
    ]);

    return {
      conversations: conversations
        .filter((row) => row.messages > 0)
        .slice(0, 4)
        .map((row) => ({
          id: row.id,
          departmentId: row.departmentId,
          title: row.title,
          updatedAt: row.updatedAt.getTime(),
        })),
      meetings: meetings.map((row) => ({
        id: row.id,
        title: row.title,
        rounds: Number(row.rounds),
        updatedAt: row.updatedAt.getTime(),
      })),
    };
  } catch {
    // The panes fill in from the snapshot a moment later either way, so this
    // is never worth failing a page over.
    return null;
  }
}
