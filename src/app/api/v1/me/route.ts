import { eq } from "drizzle-orm";
import { requireDb } from "@/db/client";
import * as t from "@/db/schema";
import { authorize, caught, ok } from "@/lib/api/v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Who this key is.
 *
 * The endpoint a developer hits first to check the token works, so it needs no
 * scope beyond a valid key. `tasks:read` is used as the gate because every key
 * has at least one scope and this one costs nothing to hold.
 */
export async function GET(request: Request) {
  const auth = await authorize(request, "tasks:read");
  if (!auth.ok) return auth.response;
  const { caller } = auth;

  try {
    const [workspace] = await requireDb()
      .select({ id: t.workspaces.id, name: t.workspaces.name })
      .from(t.workspaces)
      .where(eq(t.workspaces.id, caller.workspaceId))
      .limit(1);

    return ok(
      {
        business: { id: caller.workspaceId, name: workspace?.name ?? "" },
        key: { id: caller.keyId, scopes: caller.scopes },
      },
      { requestId: caller.requestId },
    );
  } catch (error) {
    return caught("me", error, caller.requestId);
  }
}
