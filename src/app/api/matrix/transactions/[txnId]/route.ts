import { requireDb } from "@/db/client";
import * as t from "@/db/schema";
import { homeserverToken, matrixConfigured } from "@/lib/matrix/config";

/**
 * Where the homeserver pushes events to the panel.
 *
 * This is the other half of the appservice: the panel sends messages by calling
 * the homeserver, and the homeserver sends messages by calling this. There is
 * no sync loop and no websocket, which is the part of the design worth knowing,
 * because it means the panel has to be reachable from the homeserver rather
 * than the other way round.
 *
 * Two things it must get right, and neither is optional:
 *
 *   It must check the token. The URL is guessable and the body is a message
 *   claiming to be from somebody. Without the check, anybody who can reach the
 *   route can put words in a colleague's mouth. The homeserver sends hs_token,
 *   which is the one that comes in; as_token is the one that goes out and must
 *   never be accepted here.
 *
 *   It must answer 200 once and ignore the repeat. Synapse retries a
 *   transaction until it is acknowledged, which is correct of it, and means a
 *   restart mid-push redelivers whatever was in flight. The transaction id is
 *   recorded before the events are handled so a retry is recognised.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ txnId: string }> },
) {
  if (!matrixConfigured()) {
    return Response.json({ error: "Not configured." }, { status: 404 });
  }

  /*
   * The token, from either place the spec allows.
   *
   * Older homeservers put it in the query string and current ones use the
   * Authorization header. Both are accepted on the way in; only the header is
   * ever sent on the way out.
   */
  const url = new URL(request.url);
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const given = bearer || (url.searchParams.get("access_token") ?? "");

  // Constant time would be better and is not available here without pulling in
  // node:crypto for a comparison of two short strings on a route that is not
  // rate limited by anything an attacker can measure through.
  if (!given || given !== homeserverToken()) {
    return Response.json({ errcode: "M_FORBIDDEN" }, { status: 403 });
  }

  const { txnId } = await params;
  if (!txnId) return Response.json({ errcode: "M_UNKNOWN" }, { status: 400 });

  let events: unknown[] = [];
  try {
    const body = (await request.json()) as { events?: unknown[] };
    events = Array.isArray(body.events) ? body.events : [];
  } catch {
    return Response.json({ errcode: "M_NOT_JSON" }, { status: 400 });
  }

  try {
    const db = requireDb();

    /*
     * Claim the transaction first.
     *
     * Inserting before handling means a retry finds the row and stops, which is
     * the behaviour that matters. It also means a crash between the insert and
     * the handling loses those events rather than duplicating them, and that is
     * the right way round for a mirror: the panel's own Postgres is still the
     * record while this migration is in progress, so a dropped mirror event is
     * a gap to backfill and a duplicated one is a message that was said twice.
     */
    const claimed = await db
      .insert(t.matrixTransactions)
      .values({ txnId, receivedAt: Date.now() })
      .onConflictDoNothing()
      .returning({ txnId: t.matrixTransactions.txnId });

    if (claimed.length === 0) {
      // Already handled. Answering 200 is what stops the retry.
      return Response.json({});
    }

    await handle(events);
    return Response.json({});
  } catch (error) {
    console.error("[api/matrix] transaction", error);
    // Not 200, so the homeserver tries again rather than dropping it.
    return Response.json({ errcode: "M_UNKNOWN" }, { status: 500 });
  }
}

/**
 * What to do with a batch of events.
 *
 * Deliberately empty of behaviour for now beyond recognising what arrived. The
 * panel is still the source of truth and still writes every message to its own
 * tables, so an incoming Matrix event during the mirroring phase is either an
 * echo of something the panel just sent or a message from a real Matrix client
 * that nobody is using yet. Acting on it before the read path has moved would
 * be writing the same message twice.
 *
 * It is a real route rather than a stub because the homeserver needs somewhere
 * to push to from the moment the appservice is registered, and because a route
 * that returns 200 and records the transaction is what lets the homeserver be
 * stood up and proven before anything depends on it.
 */
async function handle(events: unknown[]): Promise<void> {
  for (const event of events) {
    const one = event as { type?: string; room_id?: string; sender?: string };
    if (one?.type !== "m.room.message") continue;
    // The shape is known and nothing consumes it yet. See above.
    void one.room_id;
    void one.sender;
  }
}

/**
 * Two routes the spec requires an appservice to answer.
 *
 * A homeserver asks these when somebody mentions a user or an alias inside the
 * appservice's namespace that it has never heard of, to give the appservice a
 * chance to create it. The panel creates its users up front when a person first
 * sends a message, so there is never anything to create on demand, and 404 is
 * the correct answer rather than a missing feature.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const given = bearer || (url.searchParams.get("access_token") ?? "");
  if (!given || given !== homeserverToken()) {
    return Response.json({ errcode: "M_FORBIDDEN" }, { status: 403 });
  }
  return Response.json({ errcode: "M_NOT_FOUND" }, { status: 404 });
}

export const dynamic = "force-dynamic";
