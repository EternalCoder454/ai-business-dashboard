import { auth, authEnabled } from "@/auth";
import { databaseEnabled } from "@/db/client";
import { auditThread, auditThreads, withdrawForReview } from "@/db/messages";
import { membershipFor } from "@/db/tenancy";
import { track } from "@/lib/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Reading the business's internal messages, as its administrator.
 *
 * This is the half of the Account disclaimer that did not exist. It has said
 * for a long time that all conversations and internal messaging are recorded
 * and can be reviewed by an administrator, and until now the only way a message
 * ever became readable was for the conduct reporter to flag it. Everything
 * nobody flagged was retained and unreadable, which made the promise wrong in
 * the direction that matters: people were told they had no privacy, and the
 * person responsible for the business could not actually answer a question
 * about what was said.
 *
 * Administrators of their own business, and nobody else. Not the operator:
 * reports are a safety net that has to cross businesses because somebody must
 * be able to answer a complaint about a customer, and this is not that. This is
 * a manager reading their own staff's messages, which is a thing a business
 * does about itself and not a thing the person running the servers does about
 * other people's. An operator who wants this for their own business is an
 * administrator of it and gets it that way.
 *
 * 404 rather than 403 for everybody else, so the route does not confirm it
 * exists to somebody who should not know that it does.
 */
async function reviewer(): Promise<
  | { ok: true; workspaceId: string; email: string }
  | { ok: false; status: number; error: string }
> {
  if (!authEnabled || !databaseEnabled) {
    return { ok: false, status: 501, error: "Not configured." };
  }
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return { ok: false, status: 401, error: "Not signed in." };

  const mine = await membershipFor(email);
  if (mine?.role !== "admin") return { ok: false, status: 404, error: "Not found." };
  return { ok: true, workspaceId: mine.workspaceId, email };
}

export async function GET(request: Request) {
  const who = await reviewer();
  if (!who.ok) return Response.json({ error: who.error }, { status: who.status });

  const query = new URL(request.url).searchParams;
  const wanted = query.get("thread")?.trim();

  /*
   * The key is fenced by the business as well as matched, so a key from another
   * workspace returns an empty thread rather than somebody else's. The key is
   * two addresses joined, which makes it guessable by design, and the fence is
   * what stops that mattering.
   */
  if (wanted) {
    const messages = await track("messages.review.thread", who.workspaceId, () =>
      auditThread(who.workspaceId, wanted),
    );
    return Response.json({ messages });
  }

  const threads = await track("messages.review.list", who.workspaceId, () =>
    auditThreads(who.workspaceId),
  );
  return Response.json({ threads });
}

/**
 * Withdraws a message, or a whole thread, on the administrator's authority.
 *
 * Behind the same check reading is behind, which is the point: the person who
 * can be asked what was said is the person who can take it out of circulation.
 * An operator is not that person, for the reason the reviewer above gives.
 *
 * It does not erase. The message leaves both inboxes and stays on this screen
 * with the administrator's address against it, because the record is what this
 * screen is for.
 */
export async function DELETE(request: Request) {
  const who = await reviewer();
  if (!who.ok) return Response.json({ error: who.error }, { status: who.status });

  const query = new URL(request.url).searchParams;
  const messageId = query.get("message")?.trim() || undefined;
  const threadKey = query.get("thread")?.trim() || undefined;

  if (!messageId && !threadKey) {
    return Response.json({ error: "Name a message or a thread." }, { status: 400 });
  }

  const { withdrawn } = await track("messages.review.withdraw", who.workspaceId, () =>
    withdrawForReview(who.workspaceId, who.email, { messageId, threadKey }),
  );

  return Response.json({ withdrawn });
}
