import { auth, authEnabled } from "@/auth";
import { databaseEnabled } from "@/db/client";
import { applyMutations, loadWorkspace, type MutationOp } from "@/db/repo";
import { readJsonWithin } from "@/lib/guard";

/** Conversations carry base64 attachments, so an upload is legitimately large. */
const MAX_BODY_BYTES = 20_000_000;

/**
 * The tables applyMutations knows how to write. An op naming anything else
 * falls through its switch silently, which would make a typo look like a
 * successful save.
 */
const KNOWN_TABLES = new Set([
  "departments",
  "projects",
  "conversations",
  "skills",
  "deliverables",
  "files",
  "allHands",
  "profile",
  "settings",
  "account",
]);

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

  const parsed = await readJsonWithin<{ ops?: MutationOp[] }>(request, MAX_BODY_BYTES);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: parsed.status });
  }

  const ops = Array.isArray(parsed.body.ops) ? parsed.body.ops : [];
  if (ops.length === 0) return Response.json({ applied: 0 });

  // Each op becomes its own branch of a single transaction, so an unbounded
  // array is an unbounded transaction. The upload path sends fewer than ten.
  if (ops.length > 200) {
    return Response.json({ error: "Too many operations in one request." }, { status: 400 });
  }

  if (!ops.every((op) => op && typeof op === "object" && KNOWN_TABLES.has(op.table))) {
    return Response.json({ error: "Unrecognised operation." }, { status: 400 });
  }

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
