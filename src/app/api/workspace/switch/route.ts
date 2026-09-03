import { auth, authEnabled } from "@/auth";
import { databaseEnabled } from "@/db/client";
import { chooseWorkspace, membershipFor, membershipsFor } from "@/db/tenancy";
import { readJsonWithin, withinRate } from "@/lib/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The businesses one person can open, and moving between them.
 *
 * A person can belong to more than one now: somebody who owns a company and
 * works at another, or an accountant with two clients. Which one they are
 * currently in is a choice, and this is where it is read and made.
 *
 * The move is checked against their own memberships rather than trusted, so
 * naming a workspace is not a way of reaching it.
 */
export async function GET() {
  if (!authEnabled || !databaseEnabled) return Response.json({ workspaces: [] });

  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return Response.json({ workspaces: [] });

  // Which one they are in as well as which they could be in, so the menu can
  // mark it without working it out a second way and getting a different answer.
  const [workspaces, current] = await Promise.all([
    membershipsFor(email),
    membershipFor(email),
  ]);
  return Response.json({ workspaces, current: current?.workspaceId ?? null });
}

export async function POST(request: Request) {
  if (!authEnabled || !databaseEnabled) {
    return Response.json({ error: "Not available on this instance." }, { status: 503 });
  }

  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return Response.json({ error: "Not signed in." }, { status: 401 });

  // Switching reloads the whole workspace, so it is worth a ceiling.
  if (!withinRate(`switch:${email}`, 20, 60_000)) {
    return Response.json({ error: "Too many at once." }, { status: 429 });
  }

  const parsed = await readJsonWithin<{ workspaceId?: string }>(request, 2_000);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: parsed.status });

  const wanted = parsed.body.workspaceId?.trim();
  if (!wanted) return Response.json({ error: "Nothing named." }, { status: 400 });

  const moved = await chooseWorkspace(email, wanted);
  if (!moved) {
    // 404 rather than 403: whether a workspace exists is not something to
    // confirm to somebody who is not in it.
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  return Response.json({ ok: true });
}
