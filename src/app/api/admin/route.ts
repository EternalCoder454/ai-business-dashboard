import { auth, authEnabled } from "@/auth";
import { databaseEnabled } from "@/db/client";
import {
  deleteEverythingFor,
  departmentNamesFor,
  detailFor,
  listConversationsFor,
  listPeople,
  overview,
  readConversation,
} from "@/db/admin";
import { ADMIN_EMAILS, isAdminEmail } from "@/lib/admin";
import { ALLOWED_EMAILS } from "@/auth";
import { readJsonWithin } from "@/lib/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Administrators only.
 *
 * Every read here crosses the per-account boundary that the rest of the app
 * enforces, and the one write deletes an entire workspace, so both go through
 * the same check and both are logged.
 */
async function requireAdmin(): Promise<
  { ok: true; email: string } | { ok: false; status: number; error: string }
> {
  if (!authEnabled || !databaseEnabled) {
    return { ok: false, status: 503, error: "This instance has no accounts to review." };
  }

  const session = await auth();
  const email = session?.user?.email;
  if (!email) return { ok: false, status: 401, error: "Not signed in." };

  // A plain 404 rather than a 403: someone who is not an administrator has no
  // business learning that this route exists.
  if (!isAdminEmail(email)) return { ok: false, status: 404, error: "Not found." };

  return { ok: true, email };
}

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return Response.json({ error: admin.error }, { status: admin.status });
  }

  const url = new URL(request.url);
  const person = url.searchParams.get("person")?.trim().toLowerCase();
  const conversation = url.searchParams.get("conversation")?.trim();

  try {
    if (person && conversation) {
      // Logged because reading someone else's thread should leave a trace,
      // even when the only person who can do it is the person who owns the app.
      console.log(`[admin] ${admin.email} read ${person}/${conversation}`);
      const thread = await readConversation(person, conversation);
      if (!thread) return Response.json({ error: "No such conversation." }, { status: 404 });
      return Response.json({ thread });
    }

    if (person) {
      const [conversations, departments, detail] = await Promise.all([
        listConversationsFor(person),
        departmentNamesFor(person),
        detailFor(person),
      ]);
      return Response.json({ conversations, departments, detail });
    }

    const [people, totals] = await Promise.all([listPeople(), overview()]);
    return Response.json({
      people,
      overview: totals,
      self: admin.email,
      // Both lists come from the environment, so they are shown rather than
      // edited here. Saying who is allowed beats making it guessable.
      access: { allowed: ALLOWED_EMAILS, admins: ADMIN_EMAILS },
    });
  } catch (error) {
    console.error("[api/admin]", error);
    return Response.json({ error: "Could not read that." }, { status: 500 });
  }
}

/**
 * Offboarding: removes everything belonging to one address.
 *
 * The address has to be sent twice, once as the target and once as a typed
 * confirmation, because the request that deletes a colleague's entire workspace
 * should be impossible to send by accident. An administrator cannot delete
 * themselves; that is what the database console is for.
 */
export async function DELETE(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return Response.json({ error: admin.error }, { status: admin.status });
  }

  const parsed = await readJsonWithin<{ person?: string; confirm?: string }>(request, 4_000);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: parsed.status });
  }

  const person = parsed.body.person?.trim().toLowerCase();
  const confirm = parsed.body.confirm?.trim().toLowerCase();

  if (!person) {
    return Response.json({ error: "No account named." }, { status: 400 });
  }
  if (person !== confirm) {
    return Response.json(
      { error: "Type the address exactly to confirm." },
      { status: 400 },
    );
  }
  if (person === admin.email) {
    return Response.json(
      { error: "You cannot delete your own workspace from here." },
      { status: 400 },
    );
  }

  try {
    console.warn(`[admin] ${admin.email} deleted the workspace of ${person}`);
    await deleteEverythingFor(person);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[api/admin] delete", error);
    return Response.json({ error: "Could not delete that workspace." }, { status: 500 });
  }
}
