import { auth, authEnabled } from "@/auth";
import { databaseEnabled } from "@/db/client";
import { loadWorkspace } from "@/db/repo";
import { membershipFor } from "@/db/tenancy";
import { withinRate } from "@/lib/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A copy of the business, as a file.
 *
 * This used to be read out of the browser's own IndexedDB, which stopped being
 * where anything lived when workspaces moved to the server. The button kept
 * working and kept producing a file, an empty one, so anybody who pressed it
 * came away believing they had a backup of a business whose data was somewhere
 * else entirely. An export that silently exports nothing is worse than no
 * export button at all.
 *
 * Any member can take one. It is their own company's writing, they can already
 * read all of it on the screen, and a backup somebody has to ask permission for
 * is a backup nobody takes.
 */
export async function GET() {
  if (!authEnabled || !databaseEnabled) {
    return Response.json({ error: "This instance has no hosted workspace." }, { status: 501 });
  }

  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return Response.json({ error: "Not signed in." }, { status: 401 });

  const membership = await membershipFor(email);
  if (!membership) {
    return Response.json({ error: "You are not in a workspace." }, { status: 403 });
  }

  // An export reads the whole business. It is a thing somebody presses once in
  // a while, so a ceiling costs nobody anything and stops one stuck client
  // from reading everything over and over.
  if (!withinRate(`export:${email}`, 5, 10 * 60_000)) {
    return Response.json(
      { error: "Too many exports. Try again shortly." },
      { status: 429 },
    );
  }

  try {
    const workspace = await loadWorkspace(membership.workspaceId, email);

    // The model keys are columns on the settings row and would otherwise ride
    // along into a file that lands in somebody's downloads folder.
    const { anthropicKey: _a, openaiKey: _o, googleKey: _g, ...settings } =
      (workspace.settings ?? {}) as Record<string, unknown>;

    const payload = {
      app: "eterneon",
      version: 2,
      exportedAt: new Date().toISOString(),
      ...workspace,
      settings,
    };

    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="eterneon-export-${stamp}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[api/workspace/export]", error);
    return Response.json({ error: "Could not build the export." }, { status: 500 });
  }
}
