import { and, asc, eq, gt } from "drizzle-orm";
import { auth, authEnabled } from "@/auth";
import { databaseEnabled, requireDb } from "@/db/client";
import * as t from "@/db/schema";
import { membershipFor } from "@/db/tenancy";
import type { Message } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * New messages in one conversation, for polling a shared thread.
 *
 * Deliberately narrow. Refetching the whole workspace on a timer would pull
 * every stored attachment down with it, several megabytes at a time, to find
 * out whether anyone had typed. This returns the messages after a timestamp
 * and nothing else.
 *
 * Access is decided by resolveConversationOwner, the same function the write
 * path uses, so reading and writing can never disagree about who is allowed in.
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
  const since = Number.isFinite(rawSince) && rawSince > 0 ? rawSince : 0;

  try {
    const mine = await membershipFor(email);
    if (!mine) return Response.json({ error: "Not found." }, { status: 404 });
    const owner = mine.workspaceId;

    const db = requireDb();
    const rows = await db
      .select()
      .from(t.messages)
      .where(
        and(
          eq(t.messages.workspaceId, owner),
          eq(t.messages.conversationId, conversationId),
          gt(t.messages.sentAt, since),
        ),
      )
      .orderBy(asc(t.messages.sentAt))
      .limit(200);

    const messages: Message[] = rows.map((row) => ({
      id: row.id,
      role: row.role as Message["role"],
      content: row.content,
      thinking: row.thinking ?? undefined,
      error: row.isError || undefined,
      timestamp: row.sentAt,
      authorEmail: row.authorEmail ?? undefined,
      model: row.model ?? undefined,
    }));

    return Response.json({ messages, owner });
  } catch (error) {
    console.error("[api/projects/conversation]", error);
    return Response.json({ error: "Could not read that." }, { status: 500 });
  }
}
