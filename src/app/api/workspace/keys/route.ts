import { keysBody } from "@/lib/schemas";
import { auth, authEnabled } from "@/auth";
import { databaseEnabled } from "@/db/client";
import { keySummaries, setWorkspaceKey } from "@/db/keys";
import { membershipFor } from "@/db/tenancy";
import { readJson } from "@/lib/guard";
import { PROVIDERS, type Provider } from "@/lib/providers";
import type { Credential } from "@/db/keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The business's model keys.
 *
 * Write only. There is no route that returns a key, here or anywhere else:
 * once it is set, the only things that come back out are whether one exists
 * and its last four characters. Somebody who needs to know the whole key has
 * it already, or should be issuing a new one.
 *
 * Admin only, which is the point of the feature. The owner pays for the
 * capacity and everyone in the workspace spends it; a member being able to
 * change the key would be a member being able to redirect the bill.
 */
async function requireAdminOfWorkspace(): Promise<
  { ok: true; workspaceId: string } | { ok: false; status: number; error: string }
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
      error: "Only an administrator of this workspace can change its keys.",
    };
  }

  return { ok: true, workspaceId: membership.workspaceId };
}

/**
 * What a credential is called, and what a key for it looks like.
 *
 * Perplexity sits alongside the model providers rather than among them: it is
 * a key the workspace holds, but not something a department can run on, so it
 * has no entry in PROVIDERS and no model in the dropdown.
 */
const PREFIX: Record<Credential, string> = {
  ...(Object.fromEntries(PROVIDERS.map((p) => [p.id, p.keyPrefix])) as Record<Provider, string>),
  perplexity: "pplx-",
};

function isCredential(value: unknown): value is Credential {
  return typeof value === "string" && value in PREFIX;
}

export async function POST(request: Request) {
  const admin = await requireAdminOfWorkspace();
  if (!admin.ok) {
    return Response.json({ error: admin.error }, { status: admin.status });
  }

  const parsed = await readJson(request, keysBody, 8_000);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: parsed.status });
  }

  const { provider } = parsed.body;
  if (!isCredential(provider)) {
    return Response.json({ error: "Unknown provider." }, { status: 400 });
  }

  const key = parsed.body.key?.trim() ?? "";
  const expected = PREFIX[provider];
  // A pasted address bar or a truncated copy fails here rather than on the
  // first message, which is where it would otherwise show up as "no reply".
  if (key && expected && !key.startsWith(expected)) {
    return Response.json(
      { error: `That does not look like a key for this provider. It should start ${expected}.` },
      { status: 400 },
    );
  }

  try {
    await setWorkspaceKey(admin.workspaceId, provider, key);
    // Never the key itself, not even the one just sent.
    return Response.json({ ok: true, keys: await keySummaries(admin.workspaceId) });
  } catch (error) {
    console.error("[api/workspace/keys]", error);
    return Response.json({ error: "Could not save that key." }, { status: 500 });
  }
}
