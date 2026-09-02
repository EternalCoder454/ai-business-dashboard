import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { auth, authEnabled } from "@/auth";
import { databaseEnabled, requireDb } from "@/db/client";
import * as t from "@/db/schema";
import { membershipFor } from "@/db/tenancy";
import { readJsonWithin, withinRate } from "@/lib/guard";
import { isOperator } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 4_000;

async function signedIn(): Promise<
  { ok: true; email: string } | { ok: false; status: number; error: string }
> {
  if (!authEnabled || !databaseEnabled) {
    return { ok: false, status: 501, error: "Not configured." };
  }
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return { ok: false, status: 401, error: "Not signed in." };
  return { ok: true, email };
}

/**
 * Anyone signed in can send a note about the panel.
 *
 * Nothing about who they are comes from the request. The address is the
 * session's, the name and the business are read from the database, and all
 * three are stored alongside the message. A form that asked for them would be
 * a form that could be lied to, and one more thing to type.
 */
export async function POST(request: Request) {
  const who = await signedIn();
  if (!who.ok) return Response.json({ error: who.error }, { status: who.status });

  if (!withinRate(`feedback:${who.email}`, 5, 10 * 60_000)) {
    return Response.json(
      { error: "That is a few in a row. Try again in a little while." },
      { status: 429 },
    );
  }

  const parsed = await readJsonWithin<{ body?: string }>(request, MAX_BODY + 1_000);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: parsed.status });

  const body = parsed.body.body?.trim() ?? "";
  if (!body) return Response.json({ error: "Nothing written." }, { status: 400 });
  if (body.length > MAX_BODY) {
    return Response.json(
      { error: `Keep it under ${MAX_BODY.toLocaleString()} characters.` },
      { status: 400 },
    );
  }

  const membership = await membershipFor(who.email);
  if (!membership) {
    return Response.json({ error: "You are not in a workspace." }, { status: 403 });
  }

  try {
    const db = requireDb();
    const [workspace] = await db
      .select({ name: t.workspaces.name })
      .from(t.workspaces)
      .where(eq(t.workspaces.id, membership.workspaceId))
      .limit(1);
    const [account] = await db
      .select({ displayName: t.accounts.displayName })
      .from(t.accounts)
      .where(eq(t.accounts.userEmail, who.email))
      .limit(1);

    await db.insert(t.feedback).values({
      id: randomUUID(),
      workspaceId: membership.workspaceId,
      workspaceName: workspace?.name ?? "",
      email: who.email,
      displayName: account?.displayName ?? "",
      body,
    });

    return Response.json({ ok: true });
  } catch (error) {
    console.error("[api/feedback]", error);
    return Response.json({ error: "Could not send that." }, { status: 500 });
  }
}

/** Reading it is the operator's, since it is feedback about the product. */
export async function GET() {
  const who = await signedIn();
  if (!who.ok) return Response.json({ error: who.error }, { status: who.status });
  if (!isOperator(who.email)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  try {
    const rows = await requireDb()
      .select()
      .from(t.feedback)
      .orderBy(desc(t.feedback.createdAt))
      .limit(200);

    return Response.json({
      feedback: rows.map((row) => ({
        id: row.id,
        workspaceName: row.workspaceName,
        email: row.email,
        displayName: row.displayName,
        body: row.body,
        status: row.status,
        createdAt: row.createdAt.getTime(),
      })),
    });
  } catch (error) {
    console.error("[api/feedback] read", error);
    return Response.json({ error: "Could not read that." }, { status: 500 });
  }
}

/** Marking one done, which is the only thing an operator changes about it. */
export async function PATCH(request: Request) {
  const who = await signedIn();
  if (!who.ok) return Response.json({ error: who.error }, { status: who.status });
  if (!isOperator(who.email)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const parsed = await readJsonWithin<{ id?: string; status?: string }>(request, 2_000);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: parsed.status });

  const id = parsed.body.id?.trim();
  const status = parsed.body.status === "done" ? "done" : "new";
  if (!id) return Response.json({ error: "Nothing named." }, { status: 400 });

  try {
    await requireDb().update(t.feedback).set({ status }).where(eq(t.feedback.id, id));
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[api/feedback] update", error);
    return Response.json({ error: "Could not update that." }, { status: 500 });
  }
}
