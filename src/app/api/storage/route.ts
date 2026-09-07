import { auth, authEnabled } from "@/auth";
import { databaseEnabled } from "@/db/client";
import { membershipFor } from "@/db/tenancy";
import { storageFor } from "@/db/storage";
import { allowsArea } from "@/lib/permissions";
import { track } from "@/lib/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What this workspace is using, in bytes.
 *
 * Behind the same permission the Information screen was, which is the whole
 * reason that area still exists now the screen does not: folding the figures
 * into the dashboard must not hand them to somebody an administrator had
 * already decided should not see them.
 */
export async function GET() {
  if (!databaseEnabled || !authEnabled) {
    return Response.json({ lines: [] });
  }

  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return Response.json({ error: "Not signed in." }, { status: 401 });

  const membership = await membershipFor(email);
  if (!membership) return Response.json({ error: "No workspace." }, { status: 404 });

  if (!allowsArea(membership.role, membership.permissions, "information")) {
    // Answered as nothing rather than refused, the way the calendar is: the
    // card hides itself, and a 403 would put an error on a dashboard about a
    // thing the person cannot change.
    return Response.json({ lines: [] });
  }

  try {
    const lines = await track("storage.read", membership.workspaceId, () =>
      storageFor(membership.workspaceId),
    );
    return Response.json({ lines });
  } catch (error) {
    console.error("[api/storage] read", error);
    return Response.json({ error: "Could not read your storage." }, { status: 500 });
  }
}
