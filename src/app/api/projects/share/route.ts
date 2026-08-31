import { ALLOWED_EMAILS, auth, authEnabled } from "@/auth";
import { databaseEnabled } from "@/db/client";
import { shareProject, unshareProject } from "@/db/sharing";
import { readJsonWithin } from "@/lib/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sharing a project, and taking it back.
 *
 * Only the owner may do either, which shareProject enforces by checking the
 * project exists under the caller's address before writing anything. A member
 * cannot re-share a project they were added to.
 */
async function owner(): Promise<
  { ok: true; email: string } | { ok: false; status: number; error: string }
> {
  if (!authEnabled || !databaseEnabled) {
    return { ok: false, status: 503, error: "Sharing needs the hosted workspace." };
  }
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return { ok: false, status: 401, error: "Not signed in." };
  return { ok: true, email };
}

export async function POST(request: Request) {
  const caller = await owner();
  if (!caller.ok) return Response.json({ error: caller.error }, { status: caller.status });

  const parsed = await readJsonWithin<{
    projectId?: string;
    email?: string;
    remove?: boolean;
  }>(request, 16_000);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: parsed.status });

  const projectId = parsed.body.projectId?.trim();
  const target = parsed.body.email?.trim().toLowerCase();

  if (!projectId || !target) {
    return Response.json({ error: "A project and an address are required." }, { status: 400 });
  }
  if (target === caller.email) {
    return Response.json({ error: "You already have this one." }, { status: 400 });
  }
  // The allowlist is the boundary for sharing exactly as it is for signing in.
  if (!ALLOWED_EMAILS.includes(target)) {
    return Response.json(
      { error: "That address is not approved for this workspace." },
      { status: 403 },
    );
  }

  try {
    if (parsed.body.remove) {
      await unshareProject(caller.email, projectId, target);
      return Response.json({ ok: true });
    }

    const shared = await shareProject(caller.email, projectId, target);
    if (!shared) {
      // Either it is not theirs or it does not exist. Same answer for both, so
      // this cannot be used to find out which projects someone else has.
      return Response.json({ error: "No such project." }, { status: 404 });
    }
    console.log(`[projects] ${caller.email} shared ${projectId} with ${target}`);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[api/projects/share]", error);
    return Response.json({ error: "Could not change sharing." }, { status: 500 });
  }
}
