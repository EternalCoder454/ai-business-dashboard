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
import { OPERATOR_EMAILS, isOperator } from "@/lib/admin";
import { grantAccess, listAccess, revokeAccess } from "@/db/access";
import { createWorkspace, deleteWorkspace, listWorkspaces, renameWorkspace } from "@/db/tenancy";
import { emailEnabled, sendInvite } from "@/lib/email";
import { readJsonWithin, withinRate } from "@/lib/guard";

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
  // Operator only. An administrator of their own business is not one of
  // these, and everything below this line crosses the tenant boundary.
  if (!isOperator(email)) return { ok: false, status: 404, error: "Not found." };

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
      // The environment lists are shown as well as the table, because they
      // still grant access and an administrator reading this page needs to
      // know why someone can sign in who is not on the list they can edit.
      access: {
        allowed: OPERATOR_EMAILS,
        admins: OPERATOR_EMAILS,
        invited: await listAccess(),
      },
      workspaces: await listWorkspaces(),
      email: emailEnabled,
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

/**
 * Inviting and revoking.
 *
 * This is the whole point of the access table: adding a person used to be an
 * environment variable and a redeploy, which is not something you do for one
 * beta tester and not something you do at all in a hurry.
 *
 * Revoking only stops the sign-in. Their workspace is left where it is, and
 * removing that is the DELETE above, typed twice. Those are different
 * decisions and should never share a button.
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return Response.json({ error: admin.error }, { status: admin.status });
  }

  const parsed = await readJsonWithin<{
    action?: string;
    email?: string;
    workspaceId?: string;
    role?: string;
    note?: string;
    name?: string;
    invite?: boolean;
  }>(request, 4_000);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: parsed.status });
  }

  /*
   * Operators are trusted, and a stuck client is not. Each of these can send
   * an email or destroy a workspace, so a runaway loop costs real money or
   * real data.
   */
  if (!withinRate(`operator:${admin.email}`, 30, 60_000)) {
    return Response.json({ error: "Slow down a moment." }, { status: 429 });
  }

  const { action, note } = parsed.body;
  const email = parsed.body.email?.trim().toLowerCase();

  /*
   * Creating a business is the one action that does not need an address: a
   * workspace can exist before anybody is in it, and the operator may want to
   * set one up before the customer has given them a contact.
   */
  if (action === "createWorkspace") {
    const name = parsed.body.name?.trim();
    if (!name) return Response.json({ error: "Name the business." }, { status: 400 });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: "That is not an address." }, { status: 400 });
    }

    try {
      const workspaceId = await createWorkspace({
        name,
        note,
        createdBy: admin.email,
        firstMember: email || undefined,
      });
      console.log(`[operator] ${admin.email} created ${name} (${workspaceId})`);

      // The invitation is a courtesy, and the access row is what actually
      // grants entry, so a refused send is reported and changes nothing.
      let emailError: string | null = null;
      if (email && parsed.body.invite !== false) {
        emailError = await sendInvite({
          to: email,
          workspaceName: name,
          invitedBy: admin.email,
        });
      }

      return Response.json({
        ok: true,
        workspaceId,
        emailError,
        workspaces: await listWorkspaces(),
        access: await listAccess(),
      });
    } catch (error) {
      console.error("[api/admin] createWorkspace", error);
      // The reason is usually actionable, so it is shown rather than hidden
      // behind a generic failure.
      const said = error instanceof Error ? error.message : "";
      return Response.json(
        { error: said || "Could not create that workspace." },
        { status: 400 },
      );
    }
  }

  if (action === "renameWorkspace") {
    const workspaceId = parsed.body.workspaceId?.trim();
    const name = parsed.body.name?.trim();
    if (!workspaceId || !name) {
      return Response.json({ error: "Name the business." }, { status: 400 });
    }
    try {
      await renameWorkspace(workspaceId, name);
      return Response.json({ ok: true, workspaces: await listWorkspaces() });
    } catch (error) {
      console.error("[api/admin] renameWorkspace", error);
      return Response.json({ error: "Could not rename that workspace." }, { status: 500 });
    }
  }

  if (action === "deleteWorkspace") {
    const workspaceId = parsed.body.workspaceId?.trim();
    if (!workspaceId) return Response.json({ error: "No workspace named." }, { status: 400 });
    try {
      console.warn(`[operator] ${admin.email} deleted workspace ${workspaceId}`);
      await deleteWorkspace(workspaceId);
      return Response.json({
        ok: true,
        workspaces: await listWorkspaces(),
        access: await listAccess(),
      });
    } catch (error) {
      console.error("[api/admin] deleteWorkspace", error);
      return Response.json({ error: "Could not delete that workspace." }, { status: 500 });
    }
  }

  if (!email) return Response.json({ error: "No address given." }, { status: 400 });

  // Not a full RFC check, just enough that a typo does not become a row.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "That is not an address." }, { status: 400 });
  }

  try {
    if (action === "revoke") {
      if (email === admin.email) {
        return Response.json(
          { error: "You cannot revoke your own access." },
          { status: 400 },
        );
      }
      // An address in the environment keeps working whatever this table says,
      // so revoking it here would report success and change nothing.
      if (OPERATOR_EMAILS.includes(email)) {
        return Response.json(
          { error: "That address is in OPERATOR_EMAILS. Remove it there." },
          { status: 400 },
        );
      }
      console.warn(`[admin] ${admin.email} revoked ${email}`);
      await revokeAccess(email);
      return Response.json({ ok: true, access: await listAccess() });
    }

    if (action === "grant") {
      const role = parsed.body.role === "admin" ? "admin" : "member";
      const workspaceId = parsed.body.workspaceId?.trim();
      if (!workspaceId) {
        return Response.json({ error: "No workspace named." }, { status: 400 });
      }
      console.log(`[operator] ${admin.email} invited ${email} to ${workspaceId} as ${role}`);
      await grantAccess({ email, workspaceId, role, note, invitedBy: admin.email });

      const named = (await listWorkspaces()).find((w) => w.id === workspaceId);
      const emailError =
        parsed.body.invite === false
          ? null
          : await sendInvite({
              to: email,
              workspaceName: named?.name ?? "your workspace",
              invitedBy: admin.email,
            });

      return Response.json({
        ok: true,
        emailError,
        access: await listAccess(),
        workspaces: await listWorkspaces(),
      });
    }

    return Response.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    console.error("[api/admin] access", error);
    return Response.json({ error: "Could not change access." }, { status: 500 });
  }
}
