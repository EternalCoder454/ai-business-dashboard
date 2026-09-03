import { auth, authEnabled } from "@/auth";
import { databaseEnabled } from "@/db/client";
import { applyMutations, loadWorkspace, type MutationOp } from "@/db/repo";
// The compiler-checked list, so it cannot fall behind MutationOp the way a
// hand-written copy of it here did.
import { MAX_WRITE_BYTES, WRITABLE_TABLES } from "@/lib/workspace";
import { membershipFor, provisionFor } from "@/db/tenancy";
import { OPERATOR_EMAILS } from "@/auth";
import { readJsonWithin } from "@/lib/guard";
import { refused, track } from "@/lib/telemetry";
import { allowsArea, allowsHead, areaOfTable, type Permissions } from "@/lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Resolves who is asking, and refuses when that cannot be established.
 *
 * With auth off there is no hosted workspace to serve, because there is no
 * identity to scope rows to. That path returns 501 rather than inventing a
 * shared account.
 */
async function resolveOwner(): Promise<
  | {
      workspaceId: string;
      email: string;
      role: "member" | "admin";
      permissions: Permissions | null;
    }
  | { error: string; status: number; reason?: "no-workspace" }
> {
  if (!databaseEnabled) {
    return { error: "No database configured on this instance.", status: 501 };
  }
  if (!authEnabled) {
    return { error: "Auth is not configured.", status: 501 };
  }

  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return { error: "Not signed in.", status: 401 };

  const membership = await membershipFor(email);
  if (membership) {
    return {
      workspaceId: membership.workspaceId,
      email,
      role: membership.role,
      permissions: membership.permissions,
    };
  }

  /*
   * Signed in and in no workspace.
   *
   * Only reachable by an address in OPERATOR_EMAILS, since everyone else got in
   * through an access row that names one. That list is the environment escape
   * hatch, so it has to land somewhere rather than 403 the owner out of their
   * own deployment; anyone else is told to ask, because inventing a workspace
   * for them would quietly separate a colleague from the company they were
   * meant to join.
   */
  /*
   * The same two cases sign-in allows: an operator, or the first person into
   * an install that has nobody. Both have to land in a workspace, or they are
   * signed in to a door that opens onto nothing.
   */
  const { nobodyHasAccess } = await import("@/db/access");
  const firstRun = OPERATOR_EMAILS.length === 0 && (await nobodyHasAccess());
  if (!OPERATOR_EMAILS.includes(email) && !firstRun) {
    // Named, so the client can tell this apart from a request that failed.
    // One is a dead end that retrying cannot fix and the other is a moment.
    return {
      error: "This account is not in a workspace yet.",
      reason: "no-workspace" as const,
      status: 403,
    };
  }

  const provisioned = await provisionFor(email, "Your Company");
  return {
    workspaceId: provisioned.workspaceId,
    email,
    role: provisioned.role,
    permissions: provisioned.permissions,
  };
}

export async function GET() {
  const owner = await resolveOwner();
  if ("error" in owner) {
    return Response.json(
      { error: owner.error, reason: owner.reason },
      { status: owner.status },
    );
  }

  try {
    return Response.json(
      await track("workspace.load", owner.workspaceId, () =>
        loadWorkspace(owner.workspaceId, owner.email),
      ),
    );
  } catch (error) {
    console.error("[api/workspace] load", error);
    return Response.json({ error: "Could not read the workspace." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const owner = await resolveOwner();
  if ("error" in owner) {
    return Response.json(
      { error: owner.error, reason: owner.reason },
      { status: owner.status },
    );
  }

  const parsed = await readJsonWithin<{ ops?: MutationOp[] }>(request, MAX_WRITE_BYTES);
  if (!parsed.ok) {
    // Usually an upload over the size cap, which the person experiences as a
    // save that did not happen. Worth a count.
    refused("workspace.save", owner.workspaceId, "BodyRejected");
    return Response.json({ error: parsed.error }, { status: parsed.status });
  }

  const ops = Array.isArray(parsed.body.ops) ? parsed.body.ops : [];
  if (ops.length === 0) return Response.json({ applied: 0 });

  // Each op becomes its own branch of a single transaction, so an unbounded
  // array is an unbounded transaction. The upload path sends fewer than ten.
  if (ops.length > 200) {
    refused("workspace.save", owner.workspaceId, "TooManyOps");
    return Response.json({ error: "Too many operations in one request." }, { status: 400 });
  }

  if (!ops.every((op) => op && typeof op === "object" && WRITABLE_TABLES.has(op.table))) {
    return Response.json({ error: "Unrecognised operation." }, { status: 400 });
  }

  /*
   * The wiki is the workspace's own documentation, written once and read by
   * everyone in it, so writing it is an administrator's job. Enforced here
   * rather than only by hiding the button, because a hidden button is not a
   * permission.
   */
  if (owner.role !== "admin" && ops.some((op) => op.table === "wikiPages")) {
    refused("workspace.save", owner.workspaceId, "NotAnAdministrator");
    return Response.json(
      { error: "Only an administrator of this workspace can edit the wiki." },
      { status: 403 },
    );
  }

  /*
   * A screen somebody cannot open is also a screen they cannot write to.
   *
   * Hiding the navigation is what makes a restriction usable and this is what
   * makes it a restriction: the writes all arrive here, on one endpoint, in a
   * batch that names its table, so one check covers every area that maps onto
   * a table rather than a check per screen that somebody forgets to add.
   *
   * Reads are not fenced here and deliberately so. The workspace loads as one
   * document, so this decides what a person is shown and may change, not what
   * their browser could be made to fetch. Anyone who must not see something at
   * all belongs in their own workspace.
   */
  const denied = ops
    .map((op) => areaOfTable(op.table))
    .find((area) => area && !allowsArea(owner.role, owner.permissions, area));
  if (denied) {
    refused("workspace.save", owner.workspaceId, "AreaNotAllowed");
    return Response.json(
      { error: "That part of the panel is not open to your account." },
      { status: 403 },
    );
  }

  /*
   * And a conversation with a head they were not given.
   *
   * The head itself is answered by whoever holds the key, so somebody willing
   * to build their own request can talk to any of them whatever this says.
   * What this stops is the part that lasts: a thread with a head outside their
   * list cannot be saved, so it cannot appear in the sidebar, in search, in
   * the reviewer's reading, or in anybody else's copy of the workspace.
   */
  const wrongHead = ops.some(
    (op) =>
      op.table === "conversations" &&
      op.action === "upsert" &&
      op.rows.some((row) => !allowsHead(owner.role, owner.permissions, row.departmentId)),
  );
  if (wrongHead) {
    refused("workspace.save", owner.workspaceId, "HeadNotAllowed");
    return Response.json(
      { error: "That head is not open to your account." },
      { status: 403 },
    );
  }

  try {
    // One transaction for the batch, so a failure halfway cannot leave a
    // conversation saved with none of its messages.
    await track("workspace.save", owner.workspaceId, () =>
      applyMutations(owner.workspaceId, owner.email, ops),
    );
    return Response.json({ applied: ops.length });
  } catch (error) {
    console.error("[api/workspace] mutate", error);
    return Response.json({ error: "Could not save those changes." }, { status: 500 });
  }
}
