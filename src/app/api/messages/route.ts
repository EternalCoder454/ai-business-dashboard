import { randomUUID } from "node:crypto";
import { auth, authEnabled } from "@/auth";
import { databaseEnabled } from "@/db/client";
import {
  listColleagues,
  listThread,
  listThreads,
  markThreadRead,
  seenThrough,
  sendMessage,
  touchPresence,
  unreadTotal,
} from "@/db/messages";
import { readJsonWithin, withinRate } from "@/lib/guard";
import { track } from "@/lib/telemetry";
import { membershipFor, type Membership } from "@/db/tenancy";
import { allowsArea } from "@/lib/permissions";

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
  | { ok: true; email: string; membership: Membership }
  | { ok: false; status: number; error: string }
> {
  if (!authEnabled || !databaseEnabled) {
    return {
      ok: false,
      status: 503,
      error: "Messages require a hosted workspace.",
    };
  }

  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return { ok: false, status: 401, error: "Not signed in." };

  /*
   * Resolved once here rather than at each branch below, which asked for it
   * again every time. It is also where the inbox can be switched off for one
   * person: every path through this route needs the membership, so a business
   * that has taken messages away from somebody takes them away everywhere
   * rather than from the four places anybody remembered to check.
   */
  const membership = await membershipFor(email);
  if (!membership) return { ok: false, status: 403, error: "You are not in a workspace." };
  if (!allowsArea(membership.role, membership.permissions, "messages")) {
    return { ok: false, status: 403, error: "Messages are not open to your account." };
  }

  return { ok: true, email, membership };
}

/**
 * The workspace is the boundary for messages, as it is for everything else.
 *
 * You can write to the people you work with, and to nobody else. This was the
 * sign-in allowlist, which on a single-tenant install was the same set and on
 * a multi-tenant one would have let a customer message every other customer.
 *
 * Checked on the server on every send. A recipient picked out of the directory
 * always passes; this is for the request that did not come from the directory.
 *
 * Somebody whose inbox has been switched off cannot receive either. Otherwise
 * a business that took messages away from a person would still be filling an
 * inbox they can never open.
 */
async function canReceive(workspaceId: string, email: string): Promise<boolean> {
  const theirs = await membershipFor(email.trim().toLowerCase());
  if (theirs?.workspaceId !== workspaceId) return false;
  return allowsArea(theirs.role, theirs.permissions, "messages");
}

/**
 * GET with no `x-thread-with` header returns the overview: threads, unread
 * total, and who can be written to. With that header it returns one thread,
 * and `?since=` makes that the polling call by returning only what arrived
 * after a timestamp.
 *
 * The colleague's address is a header rather than a query parameter on
 * purpose. Query strings are recorded in the platform's request log and in the
 * browser's own history, and a work address is the one piece of this that
 * somebody outside the workspace might care about. A header is read by the
 * route and written down nowhere.
 */
export async function GET(request: Request) {
  const sender = await resolveSender();
  if (!sender.ok) {
    return Response.json({ error: sender.error }, { status: sender.status });
  }

  const url = new URL(request.url);
  const other = request.headers.get("x-thread-with")?.trim().toLowerCase();

  try {
    if (other) {
      const mine = sender.membership;
      if (!(await canReceive(mine.workspaceId, other))) {
        return Response.json({ error: "No such person here." }, { status: 404 });
      }
      const rawSince = Number(url.searchParams.get("since") ?? "");
      const since = Number.isFinite(rawSince) && rawSince > 0 ? rawSince : undefined;
      // Both every time, including on the polling call. `since` bounds the
      // messages, but the watermark has to come back unbounded or a tick on
      // something sent earlier would never reach the screen.
      const [messages, seen] = await track("messages.thread", mine.workspaceId, () =>
        Promise.all([
          listThread(mine.workspaceId, sender.email, other, since),
          seenThrough(mine.workspaceId, sender.email, other),
        ]),
      );
      return Response.json({ messages, seenThrough: seen });
    }

    const workspace = sender.membership;

    // The overview is already polled on a timer, so it is the heartbeat. A
    // second endpoint doing nothing but saying "still here" would be one more
    // request per person per minute for the same fact.
    void touchPresence(sender.email);

    const [threads, people, unread] = await track(
      "messages.overview",
      workspace.workspaceId,
      () =>
        Promise.all([
          listThreads(workspace.workspaceId, sender.email),
          listColleagues(workspace.workspaceId, sender.email),
          unreadTotal(workspace.workspaceId, sender.email),
        ]),
    );
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
      const mine = sender.membership;
      if (!(await canReceive(mine.workspaceId, other))) {
        return Response.json({ error: "No such person here." }, { status: 404 });
      }
      await markThreadRead(mine.workspaceId, sender.email, other);
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
    const mine = sender.membership;
    if (!(await canReceive(mine.workspaceId, recipient))) {
      return Response.json(
        { error: "That address is not on the allowlist for this workspace." },
        { status: 403 },
      );
    }
    if (!withinRate(`dm:${sender.email}`, SEND_LIMIT, 60_000)) {
      return Response.json({ error: "Slow down a moment." }, { status: 429 });
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
