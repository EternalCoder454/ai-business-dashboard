import { randomUUID } from "node:crypto";
import { ALLOWED_EMAILS, auth, authEnabled } from "@/auth";
import { databaseEnabled } from "@/db/client";
import {
  listColleagues,
  listThread,
  listThreads,
  markThreadRead,
  sendMessage,
  unreadTotal,
} from "@/db/messages";
import { readJsonWithin, withinRate } from "@/lib/guard";
import { membershipFor } from "@/db/tenancy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A message is text. Long enough for a real note, short enough to bound a row. */
const MAX_BODY_CHARS = 8_000;
const MAX_REQUEST_BYTES = 64_000;

/** Sends per minute per person. A conversation never approaches this. */
const SEND_LIMIT = 30;

/**
 * Messages need a signed-in identity on both ends, so unlike the workspace this
 * cannot fall back to local storage. Without auth or a database there is
 * nothing to answer with, and saying so plainly beats an empty inbox that looks
 * like nobody has written.
 */
async function resolveSender(): Promise<
  { ok: true; email: string } | { ok: false; status: number; error: string }
> {
  if (!authEnabled || !databaseEnabled) {
    return {
      ok: false,
      status: 503,
      error: "Messages need the hosted workspace. This instance is running on local storage.",
    };
  }

  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return { ok: false, status: 401, error: "Not signed in." };

  return { ok: true, email };
}

/**
 * The allowlist is the boundary for messages exactly as it is for sign in.
 *
 * Checked on the server on every send. A recipient picked from the directory
 * will always pass; this is here for the request that did not come from the
 * directory.
 */
function canReceive(email: string): boolean {
  return ALLOWED_EMAILS.includes(email.trim().toLowerCase());
}

/**
 * GET with no query returns the overview: threads, unread total, and who can be
 * written to. With `?with=` it returns one thread, and `&since=` makes that the
 * polling call by returning only what arrived after a timestamp.
 */
export async function GET(request: Request) {
  const sender = await resolveSender();
  if (!sender.ok) {
    return Response.json({ error: sender.error }, { status: sender.status });
  }

  const url = new URL(request.url);
  const other = url.searchParams.get("with")?.trim().toLowerCase();

  try {
    if (other) {
      if (!canReceive(other)) {
        return Response.json({ error: "No such person here." }, { status: 404 });
      }
      const rawSince = Number(url.searchParams.get("since") ?? "");
      const since = Number.isFinite(rawSince) && rawSince > 0 ? rawSince : undefined;
      const messages = await listThread(sender.email, other, since);
      return Response.json({ messages });
    }

    const [threads, people, unread] = await Promise.all([
      listThreads(sender.email),
      listColleagues(sender.email),
      unreadTotal(sender.email),
    ]);
    return Response.json({ threads, people, unread, self: sender.email });
  } catch (error) {
    console.error("[api/messages] read", error);
    return Response.json({ error: "Could not read your messages." }, { status: 500 });
  }
}

/**
 * Sends a message, or marks a thread read. Both are small writes on the same
 * pair of addresses, so they share a route rather than splitting over two.
 */
export async function POST(request: Request) {
  const sender = await resolveSender();
  if (!sender.ok) {
    return Response.json({ error: sender.error }, { status: sender.status });
  }

  const parsed = await readJsonWithin<{ to?: string; body?: string; markRead?: string }>(
    request,
    MAX_REQUEST_BYTES,
  );
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: parsed.status });
  }

  const { to, body, markRead } = parsed.body;

  try {
    if (markRead) {
      const other = markRead.trim().toLowerCase();
      if (!canReceive(other)) {
        return Response.json({ error: "No such person here." }, { status: 404 });
      }
      await markThreadRead(sender.email, other);
      return Response.json({ ok: true });
    }

    const recipient = to?.trim().toLowerCase();
    const text = body?.trim();

    if (!recipient || !text) {
      return Response.json({ error: "A message needs a recipient and some text." }, { status: 400 });
    }
    if (text.length > MAX_BODY_CHARS) {
      return Response.json(
        { error: `A message can be at most ${MAX_BODY_CHARS} characters.` },
        { status: 400 },
      );
    }
    if (recipient === sender.email) {
      return Response.json({ error: "You cannot message yourself." }, { status: 400 });
    }
    if (!canReceive(recipient)) {
      return Response.json(
        { error: "That address is not on the allowlist for this workspace." },
        { status: 403 },
      );
    }
    if (!withinRate(`dm:${sender.email}`, SEND_LIMIT, 60_000)) {
      return Response.json({ error: "Slow down a moment." }, { status: 429 });
    }

    // A thread belongs to the workspace both people are in, so a message can
    // never cross from one business into another.
    const mine = await membershipFor(sender.email);
    if (!mine) {
      return Response.json({ error: "You are not in a workspace." }, { status: 403 });
    }
    const message = await sendMessage(
      mine.workspaceId,
      sender.email,
      recipient,
      text,
      randomUUID(),
    );
    return Response.json({ message });
  } catch (error) {
    console.error("[api/messages] write", error);
    return Response.json({ error: "Could not send that." }, { status: 500 });
  }
}
