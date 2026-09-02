import { auth, authEnabled } from "@/auth";
import { databaseEnabled } from "@/db/client";
import { loadDeliverableBody } from "@/db/repo";
import { membershipFor } from "@/db/tenancy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One deliverable's full text.
 *
 * The workspace snapshot carries the opening of each document rather than all
 * of it, because the Library card shows about 180 characters and the rest was
 * being sent to every browser on every page load, growing with the business.
 * This is what fills one in when somebody opens or edits it.
 */
export async function GET(request: Request) {
  if (!authEnabled || !databaseEnabled) {
    return Response.json({ error: "Not available on this instance." }, { status: 503 });
  }

  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return Response.json({ error: "Not signed in." }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) return Response.json({ error: "Nothing named." }, { status: 400 });

  try {
    const mine = await membershipFor(email);
    if (!mine) return Response.json({ error: "Not found." }, { status: 404 });

    const body = await loadDeliverableBody(mine.workspaceId, id);
    if (body === null) return Response.json({ error: "Not found." }, { status: 404 });

    return Response.json({ body });
  } catch (error) {
    console.error("[api/workspace/deliverable-body]", error);
    return Response.json({ error: "Could not read that." }, { status: 500 });
  }
}
