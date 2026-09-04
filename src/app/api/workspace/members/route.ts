import { membersBody } from "@/lib/schemas";
import { and, eq } from "drizzle-orm";
import { auth, authEnabled, OPERATOR_EMAILS } from "@/auth";
import { databaseEnabled, requireDb } from "@/db/client";
import * as t from "@/db/schema";
import { grantAccess, revokeAccess } from "@/db/access";
import { countAdmins, listMembers, membershipFor, membershipIn } from "@/db/tenancy";
import { readJson } from "@/lib/guard";
import { withinRate } from "@/lib/rateLimit";
import { sendInvite } from "@/lib/email";
import { parsePermissions } from "@/lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One business managing its own people.
 *
 * The operator route next door spans every customer and takes a workspace id
 * from the request body. This one never does: the workspace is whatever the
 * session resolves to, so an administrator of one company has no way to name
 * another company's, whatever they send.
 *
 * That distinction is the whole point of the file. Running your own business
 * and running the deployment are different jobs, and the merge that briefly
 * made them one is why a customer's administrator had nothing to click.
 */
async function requireAdmin(): Promise<
  | { ok: true; email: string; workspaceId: string }
  | { ok: false; status: number; error: string }
> {
  if (!authEnabled || !databaseEnabled) {
    return { ok: false, status: 501, error: "This instance has no hosted workspace." };
  }
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return { ok: false, status: 401, error: "Not signed in." };

  const membership = await membershipFor(email);
  if (!membership) {
    return { ok: false, status: 403, error: "You are not in a workspace." };
  }
  if (membership.role !== "admin") {
    return {
      ok: false,
      status: 403,
      error: "Only an administrator of this business can manage its people.",
    };
  }
  return { ok: true, email, workspaceId: membership.workspaceId };
}

/** The people in the caller's own business. */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) return Response.json({ error: admin.error }, { status: admin.status });

  try {
    const [members, workspace] = await Promise.all([
      listMembers(admin.workspaceId),
      requireDb()
        .select({ name: t.workspaces.name })
        .from(t.workspaces)
        .where(eq(t.workspaces.id, admin.workspaceId))
        .limit(1),
    ]);
    return Response.json({
      members,
      you: admin.email,
      businessName: workspace[0]?.name ?? "",
    });
  } catch (error) {
    console.error("[api/workspace/members] read", error);
    return Response.json({ error: "Could not read your people." }, { status: 500 });
  }
}

const ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Invite somebody, change what they can do, or take their access away.
 *
 * Two guards that are the same guard from different sides: the workspace is
 * never taken from the request, and the last administrator cannot be demoted or
 * removed. Without the second one a business can lock itself out of its own
 * settings and has to come to the operator to get back in.
 *
 * Everything here asks about this business only. A person may belong to several
 * and the panel has a switcher for exactly that, so their standing elsewhere is
 * none of this administrator's business and must not change what they can do
 * here.
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return Response.json({ error: admin.error }, { status: admin.status });

  if (!(await withinRate(`members:${admin.email}`, 30, 60_000))) {
    return Response.json({ error: "Too many changes at once." }, { status: 429 });
  }

  const parsed = await readJson(request, membersBody, 8_000);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: parsed.status });

  const action = parsed.body.action;
  const email = parsed.body.email?.trim().toLowerCase() ?? "";
  const role = parsed.body.role === "admin" ? "admin" : "member";

  if (!ADDRESS.test(email)) {
    return Response.json({ error: "That is not an email address." }, { status: 400 });
  }

  const done = async (extra: Record<string, unknown> = {}) =>
    Response.json({ ok: true, members: await listMembers(admin.workspaceId), ...extra });

  try {
    /*
     * Their standing in this business, not wherever they happen to be signed
     * in. Using the active one made every action below fail for anybody whose
     * other business was the one they were currently looking at, and it made an
     * invitation depend on a fact about a company this administrator cannot see.
     */
    const existing = await membershipIn(email, admin.workspaceId);

    if (action === "invite") {
      /*
       * Somebody already in another business is invited normally.
       *
       * They gain a membership here and keep the one they had; the access table
       * is keyed on address and workspace together for this reason, and the
       * switcher in the account menu is how they move between them. An
       * accountant with four clients, or somebody who owns one company and
       * works at another, is the ordinary case rather than the strange one.
       *
       * Nothing crosses over. Every row in the panel is scoped to a workspace,
       * so belonging to two is two separate sets of data that never meet.
       */
      await grantAccess({
        email,
        workspaceId: admin.workspaceId,
        role,
        note: parsed.body.note,
        invitedBy: admin.email,
      });

      const [workspace] = await requireDb()
        .select({ name: t.workspaces.name })
        .from(t.workspaces)
        .where(eq(t.workspaces.id, admin.workspaceId))
        .limit(1);

      // A bounced invitation does not undo the access row. The row is what
      // lets them in; the email only tells them it is there.
      const emailError =
        parsed.body.invite === false
          ? null
          : await sendInvite({
              to: email,
              workspaceName: workspace?.name ?? "your workspace",
              invitedBy: admin.email,
            });

      return done({ emailError });
    }

    // Everything below changes somebody who is already here, so they have to
    // actually be here. `existing` is this business's row, so somebody who
    // belongs to another as well is administered here normally.
    if (!existing) {
      return Response.json({ error: "Nobody here has that email." }, { status: 404 });
    }

    const lastAdmin = existing.role === "admin" && (await countAdmins(admin.workspaceId)) <= 1;

    if (action === "role") {
      if (role === "member" && lastAdmin) {
        return Response.json(
          { error: "At least one administrator is required. Promote somebody first." },
          { status: 400 },
        );
      }
      await requireDb()
        .update(t.access)
        .set({ role })
        .where(and(eq(t.access.email, email), eq(t.access.workspaceId, admin.workspaceId)));
      return done();
    }

    if (action === "permissions") {
      /*
       * Read through the parser rather than stored as sent, so a hand written
       * body cannot put a shape in the column that every reader then has to
       * defend against. An empty result is written as null, the one value
       * meaning no restrictions.
       *
       * Never applied to an administrator: they can lift any of it in a click,
       * so it would only lock the last one out of the screen that sets it.
       */
      if (existing.role === "admin") {
        return Response.json(
          { error: "An administrator of this business is not restricted." },
          { status: 400 },
        );
      }
      await requireDb()
        .update(t.access)
        .set({ permissions: parsePermissions(parsed.body.permissions) })
        .where(and(eq(t.access.email, email), eq(t.access.workspaceId, admin.workspaceId)));
      return done();
    }

    if (action === "remove") {
      if (email === admin.email) {
        return Response.json(
          { error: "You cannot remove your own access." },
          { status: 400 },
        );
      }
      if (lastAdmin) {
        return Response.json(
          { error: "Last administrator. Promote somebody else first." },
          { status: 400 },
        );
      }
      // An address in the environment gets in whatever this table says, so
      // removing it here would report success and change nothing.
      if (OPERATOR_EMAILS.includes(email)) {
        return Response.json(
          { error: "That address runs this deployment and cannot be removed here." },
          { status: 400 },
        );
      }
      // This business only. An administrator removing somebody from their own
      // company has no business removing them from anybody else's.
      await revokeAccess(email, admin.workspaceId);
      return done();
    }

    return Response.json({ error: "No such action." }, { status: 400 });
  } catch (error) {
    console.error("[api/workspace/members]", error);
    return Response.json({ error: "Could not make that change." }, { status: 500 });
  }
}
