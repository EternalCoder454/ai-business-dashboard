import { auth, authEnabled } from "@/auth";
import { databaseEnabled } from "@/db/client";
import {
  addonsFor,
  approveAddon,
  createAddon,
  deleteAddon,
  recentRuns,
  setAddonState,
} from "@/db/addons";
import { membershipFor } from "@/db/tenancy";
import { addonsBody } from "@/lib/schemas";
import { readJson } from "@/lib/guard";
import { withinRate } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The business's addons.
 *
 * Administrator only, all of it, including reading. An addon runs unattended
 * and can send to an outside service, so both what exists and what it is
 * allowed to reach are decisions about the company rather than about one
 * person's own work.
 *
 * The Engineering head offers `create_addon` only to an administrator, but that
 * is what the model is told, not what is enforced. This is the enforcement: a
 * member whose browser posted here directly is refused, whatever their chat
 * conversation offered them.
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
      error: "Only an administrator of this business can manage its addons.",
    };
  }
  return { ok: true, email, workspaceId: membership.workspaceId };
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) return Response.json({ error: admin.error }, { status: admin.status });

  try {
    const [addons, runs] = await Promise.all([
      addonsFor(admin.workspaceId),
      recentRuns(admin.workspaceId),
    ]);
    return Response.json({ addons, runs });
  } catch (error) {
    console.error("[api/workspace/addons] read", error);
    return Response.json({ error: "Could not read your addons." }, { status: 500 });
  }
}

/**
 * Create one, approve one, pause or resume one, or delete one.
 *
 * Creating never turns anything on. Approving is the only thing that does, it
 * is a separate request a person makes after reading what the addon would do,
 * and it writes down the hosts as they stood at that moment.
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return Response.json({ error: admin.error }, { status: admin.status });

  if (!(await withinRate(`addons:${admin.email}`, 30, 60_000))) {
    return Response.json({ error: "Too many changes at once." }, { status: 429 });
  }

  const parsed = await readJson(request, addonsBody, 16_000);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: parsed.status });

  const body = parsed.body;

  try {
    switch (body.action) {
      case "create": {
        const result = await createAddon(admin.workspaceId, {
          name: body.name ?? "",
          description: body.description ?? "",
          recipe: body.recipe,
          createdBy: admin.email,
        });
        if (!result.ok) {
          // The problems go back in full: the model reads them and tries again,
          // and they describe the recipe it just sent rather than anything else.
          return Response.json({ error: result.problems.join(" "), problems: result.problems }, { status: 400 });
        }
        console.log(`[addons] ${admin.email} created ${result.addon.id}`);
        return Response.json({ ok: true, addon: result.addon, addons: await addonsFor(admin.workspaceId) });
      }

      case "approve": {
        if (!body.id) return Response.json({ error: "No addon named." }, { status: 400 });
        const addon = await approveAddon(admin.workspaceId, body.id, admin.email);
        if (!addon) return Response.json({ error: "No such addon." }, { status: 404 });
        console.log(`[addons] ${admin.email} approved ${addon.id} for ${addon.hosts.join(" ") || "no hosts"}`);
        return Response.json({ ok: true, addon, addons: await addonsFor(admin.workspaceId) });
      }

      case "pause":
      case "resume": {
        if (!body.id) return Response.json({ error: "No addon named." }, { status: 400 });
        const addon = await setAddonState(
          admin.workspaceId,
          body.id,
          body.action === "pause" ? "paused" : "live",
        );
        if (!addon) return Response.json({ error: "No such addon." }, { status: 404 });
        return Response.json({ ok: true, addon, addons: await addonsFor(admin.workspaceId) });
      }

      case "delete": {
        if (!body.id) return Response.json({ error: "No addon named." }, { status: 400 });
        await deleteAddon(admin.workspaceId, body.id);
        return Response.json({ ok: true, addons: await addonsFor(admin.workspaceId) });
      }
    }
  } catch (error) {
    console.error("[api/workspace/addons]", error);
    return Response.json({ error: "Could not make that change." }, { status: 500 });
  }
}
