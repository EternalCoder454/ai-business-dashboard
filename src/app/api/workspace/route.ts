import { auth, authEnabled } from "@/auth";
import { databaseEnabled } from "@/db/client";
import { applyMutations, loadWorkspace, type MutationOp } from "@/db/repo";

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
  { email: string } | { error: string; status: number }
> {
  if (!databaseEnabled) {
    return { error: "No DATABASE_URL, so this instance stores everything locally.", status: 501 };
  }
  if (!authEnabled) {
    return { error: "Auth is not configured, so there is no account to load.", status: 501 };
  }

  const session = await auth();
  const email = session?.user?.email;
  if (!email) return { error: "Not signed in.", status: 401 };

  return { email };
}

export async function GET() {
  const owner = await resolveOwner();
  if ("error" in owner) {
    return Response.json({ error: owner.error }, { status: owner.status });
  }

  try {
    return Response.json(await loadWorkspace(owner.email));
  } catch (error) {
    console.error("[api/workspace] load", error);
    return Response.json({ error: "Could not read the workspace." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const owner = await resolveOwner();
  if ("error" in owner) {
    return Response.json({ error: owner.error }, { status: owner.status });
  }

  let ops: MutationOp[];
  try {
    const body = (await request.json()) as { ops?: MutationOp[] };
    ops = Array.isArray(body.ops) ? body.ops : [];
  } catch {
    return Response.json({ error: "Malformed request body." }, { status: 400 });
  }

  if (ops.length === 0) return Response.json({ applied: 0 });

  try {
    // One transaction for the batch, so a failure halfway cannot leave a
    // conversation saved with none of its messages.
    await applyMutations(owner.email, ops);
    return Response.json({ applied: ops.length });
  } catch (error) {
    console.error("[api/workspace] mutate", error);
    return Response.json({ error: "Could not save those changes." }, { status: 500 });
  }
}
