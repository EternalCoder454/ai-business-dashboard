import { and, eq } from "drizzle-orm";
import { auth, authEnabled } from "@/auth";
import { databaseEnabled, requireDb } from "@/db/client";
import * as t from "@/db/schema";
import { loadConversationMessages } from "@/db/repo";
import { membershipFor } from "@/db/tenancy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One conversation's messages.
 *
 * Two callers, one query. Opening a thread asks for the newest window of it,
 * because the workspace snapshot carries counts rather than message bodies;
 * polling a thread somebody else is also typing in asks for whatever arrived
 * after a timestamp. The difference is the `since` parameter and nothing else.
 *
 * This lived under /api/projects for a while, from when a conversation could be
 * shared across workspaces. That went, and the name stopped describing it. The
 * copy of the row mapping that lived here went with it: it quietly dropped
 * attachments, usage, and tool calls, so a message read through this route was
 * a thinner thing than the same message read through the snapshot, and nothing
 * said so.
 */
export async function GET(request: Request) {
  if (!authEnabled || !databaseEnabled) {
    return Response.json({ error: "Not available on this instance." }, { status: 503 });
  }

  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return Response.json({ error: "Not signed in." }, { status: 401 });

  const url = new URL(request.url);
  const conversationId = url.searchParams.get("id")?.trim();
  if (!conversationId) {
    return Response.json({ error: "No conversation named." }, { status: 400 });
  }

  const rawSince = Number(url.searchParams.get("since") ?? "");
  const since = Number.isFinite(rawSince) && rawSince > 0 ? rawSince : undefined;

  try {
    const mine = await membershipFor(email);
    if (!mine) return Response.json({ error: "Not found." }, { status: 404 });

    // The conversation has to belong to this business, or a guessed id would
    // read somebody else's thread.
    const [conversation] = await requireDb()
      .select({ id: t.conversations.id })
      .from(t.conversations)
      .where(
        and(
          eq(t.conversations.workspaceId, mine.workspaceId),
          eq(t.conversations.id, conversationId),
        ),
      )
      .limit(1);
    if (!conversation) return Response.json({ error: "Not found." }, { status: 404 });

    const { messages, hasMore } = await loadConversationMessages(
      mine.workspaceId,
      conversationId,
      { since },
    );

    return Response.json({
      messages,
      hasMore,
      /** True when this is the whole conversation, so the client can stop asking. */
      complete: since === undefined && !hasMore,
    });
  } catch (error) {
    console.error("[api/workspace/conversation]", error);
    return Response.json({ error: "Could not read that." }, { status: 500 });
  }
}
