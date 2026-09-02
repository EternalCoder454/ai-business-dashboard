import { auth, authEnabled } from "@/auth";
import { databaseEnabled } from "@/db/client";
import { ALL_SCOPES, createKey, isScope, listKeys, revokeKey } from "@/db/apiKeys";
import { membershipFor } from "@/db/tenancy";
import { readJsonWithin, withinRate } from "@/lib/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The business's keys for the developer API.
 *
 * Administrator only, for the same reason the model keys are: a key here can
 * read the task list and write to it as the whole business, and handing that
 * out is a decision about the company rather than about one person's own work.
 *
 * Note this is a different thing from /api/workspace/keys, which holds the
 * model credentials the panel spends money with. This one mints credentials
 * other people spend against the panel. Neither route can read a secret back.
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
  if (!membership) return { ok: false, status: 403, error: "You are not in a workspace." };
  if (membership.role !== "admin") {
    return {
      ok: false,
      status: 403,
      error: "Only an administrator of this business can manage its API keys.",
    };
  }
  return { ok: true, email, workspaceId: membership.workspaceId };
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) return Response.json({ error: admin.error }, { status: admin.status });

  try {
    return Response.json({ keys: await listKeys(admin.workspaceId), scopes: ALL_SCOPES });
  } catch (error) {
    console.error("[api/workspace/api-keys] read", error);
    return Response.json({ error: "Could not read your keys." }, { status: 500 });
  }
}

/**
 * Mint one, or revoke one.
 *
 * The created token comes back exactly once, in this response. There is no
 * second chance to copy it and nothing that can produce it again, which is
 * stated on the screen as well as here.
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return Response.json({ error: admin.error }, { status: admin.status });

  if (!withinRate(`apikeys:${admin.email}`, 20, 60_000)) {
    return Response.json({ error: "Too many changes at once." }, { status: 429 });
  }

  const parsed = await readJsonWithin<{
    action?: string;
    id?: string;
    name?: string;
    scopes?: unknown;
  }>(request, 8_000);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: parsed.status });

  try {
    if (parsed.body.action === "revoke") {
      const id = parsed.body.id?.trim();
      if (!id) return Response.json({ error: "No key named." }, { status: 400 });
      const done = await revokeKey(admin.workspaceId, id);
      if (!done) return Response.json({ error: "No such key." }, { status: 404 });
      return Response.json({ ok: true, keys: await listKeys(admin.workspaceId) });
    }

    if (parsed.body.action === "create") {
      const name = parsed.body.name?.trim();
      if (!name) {
        return Response.json({ error: "Give the key a name." }, { status: 400 });
      }
      const asked = Array.isArray(parsed.body.scopes) ? parsed.body.scopes : [];
      const scopes = asked.filter(isScope);
      if (scopes.length === 0) {
        return Response.json({ error: "Pick at least one thing it can do." }, { status: 400 });
      }

      const { key, token } = await createKey({
        workspaceId: admin.workspaceId,
        name,
        scopes,
        createdBy: admin.email,
      });
      console.log(`[api-keys] ${admin.email} created ${key.id} (${scopes.join(" ")})`);

      return Response.json({
        ok: true,
        token,
        key,
        keys: await listKeys(admin.workspaceId),
      });
    }

    return Response.json({ error: "No such action." }, { status: 400 });
  } catch (error) {
    console.error("[api/workspace/api-keys]", error);
    return Response.json({ error: "Could not make that change." }, { status: 500 });
  }
}
