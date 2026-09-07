import { feedbackBody, feedbackDeleteBody, feedbackPatchBody } from "@/lib/schemas";
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { auth, authEnabled } from "@/auth";
import { databaseEnabled, requireDb } from "@/db/client";
import * as t from "@/db/schema";
import { membershipFor } from "@/db/tenancy";
import { readJson } from "@/lib/guard";
import { withinRate } from "@/lib/rateLimit";
import { isOperator } from "@/lib/admin";
import { checkAttachments, MAX_FEEDBACK_TOTAL_BYTES } from "@/lib/feedbackFiles";
import { optimiseImage } from "@/lib/optimiseImage";

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

  if (!(await withinRate(`feedback:${who.email}`, 5, 10 * 60_000))) {
    return Response.json(
      { error: "Too many in a row. Try again shortly." },
      { status: 429 },
    );
  }

  /*
   * Room for the note and the attachments, which travel as base64 and are
   * therefore a third larger again than the bytes they represent.
   */
  const parsed = await readJson(
    request,
    feedbackBody,
    MAX_BODY + Math.ceil((MAX_FEEDBACK_TOTAL_BYTES * 4) / 3) + 100_000,
  );
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: parsed.status });

  const body = parsed.body.body?.trim() ?? "";
  const attachments = parsed.body.files ?? [];

  // The same rule the dialog shows, applied where it counts.
  const refused = checkAttachments(attachments);
  if (refused) return Response.json({ error: refused }, { status: 400 });
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

    const feedbackId = randomUUID();
    await db.insert(t.feedback).values({
      id: feedbackId,
      workspaceId: membership.workspaceId,
      workspaceName: workspace?.name ?? "",
      email: who.email,
      displayName: account?.displayName ?? "",
      body,
    });

    if (attachments.length) {
      await db.insert(t.feedbackFiles).values(
        await Promise.all(
          attachments.map(async (file) => {
            /*
             * Losslessly re-encoded where that wins, which for a screenshot is
             * most of its size. A .png of a screen is about a tenth as large as
             * lossless WebP and pixel for pixel the same picture; a photograph
             * or a clip is left exactly as it arrived. See optimiseImage.
             */
            const raw = Buffer.from(file.data, "base64");
            const optimised = file.mediaType.startsWith("image/")
              ? await optimiseImage(raw, file.mediaType)
              : { bytes: raw, mediaType: file.mediaType };

            return {
              id: randomUUID(),
              feedbackId,
              name: file.name.slice(0, 300),
              mediaType: optimised.mediaType,
              size: optimised.bytes.length,
              data: optimised.bytes.toString("base64"),
            };
          }),
        ),
      );
    }

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
    const db = requireDb();
    const rows = await db
      .select()
      .from(t.feedback)
      .orderBy(desc(t.feedback.createdAt))
      .limit(200);

    /*
     * What is attached, never the bytes. A list of two hundred notes each
     * carrying a video would be tens of megabytes to draw a screen that shows
     * none of it until something is opened; the player fetches one at a time
     * from the route beside this one.
     */
    const files = rows.length
      ? await db
          .select({
            id: t.feedbackFiles.id,
            feedbackId: t.feedbackFiles.feedbackId,
            name: t.feedbackFiles.name,
            mediaType: t.feedbackFiles.mediaType,
            size: t.feedbackFiles.size,
          })
          .from(t.feedbackFiles)
          .where(
            inArray(
              t.feedbackFiles.feedbackId,
              rows.map((row) => row.id),
            ),
          )
      : [];

    return Response.json({
      feedback: rows.map((row) => ({
        files: files
          .filter((file) => file.feedbackId === row.id)
          .map(({ id, name, mediaType, size }) => ({ id, name, mediaType, size })),
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

/**
 * Throwing one away.
 *
 * Marking a note done keeps it, which is right for a note that was acted on and
 * wrong for a duplicate, a test, or a line somebody typed into the wrong box.
 * Those accumulate at the top of a screen that is meant to be read, so there
 * has to be a way to be rid of them.
 *
 * The operator only, and gone for good: a note is a few hundred characters and
 * a bin to empty later is another list to look at.
 */
export async function DELETE(request: Request) {
  const who = await signedIn();
  if (!who.ok) return Response.json({ error: who.error }, { status: who.status });
  if (!isOperator(who.email)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const parsed = await readJson(request, feedbackDeleteBody, 2_000);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: parsed.status });

  const id = parsed.body.id?.trim();
  if (!id) return Response.json({ error: "Nothing named." }, { status: 400 });

  try {
    const db = requireDb();
    // The files first: an attachment whose note is gone is one nothing can
    // reach and nothing will ever clean up.
    await db.delete(t.feedbackFiles).where(eq(t.feedbackFiles.feedbackId, id));
    await db.delete(t.feedback).where(eq(t.feedback.id, id));
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[api/feedback] delete", error);
    return Response.json({ error: "Could not delete that." }, { status: 500 });
  }
}

/** Marking one done, which is the only thing an operator changes about it. */
export async function PATCH(request: Request) {
  const who = await signedIn();
  if (!who.ok) return Response.json({ error: who.error }, { status: who.status });
  if (!isOperator(who.email)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const parsed = await readJson(request, feedbackPatchBody, 2_000);
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
