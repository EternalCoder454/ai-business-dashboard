import { cache } from "react";
import { and, isNull } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { databaseEnabled, requireDb } from "@/db/client";
import * as t from "@/db/schema";
import { ACTIVE_WORKSPACE_FIRST } from "@/db/tenancy";

export interface Viewer {
  email: string;
  workspaceId: string;
}

/**
 * Who is asking, and which business they are in, resolved once per request.
 *
 * Wrapped in React's cache, so the layout and the page below it share one
 * answer instead of asking the same two questions twice on their way to
 * rendering the same screen. Both need it, they run on the same request, and a
 * session lookup is a round trip like any other.
 *
 * Never throws. Nothing that renders a page should fail because a name could
 * not be read, so every path out of here is either a viewer or null.
 */
export const currentViewer = cache(async (): Promise<Viewer | null> => {
  if (!databaseEnabled) return null;

  try {
    const { auth, authEnabled } = await import("@/auth");
    if (!authEnabled) return null;

    const session = await auth();
    const email = session?.user?.email?.toLowerCase();
    if (!email) return null;

    const [row] = await requireDb()
      .select({ workspaceId: t.access.workspaceId })
      .from(t.access)
      // The account row only for its choice of workspace, which is what the
      // ordering reads. Left, so somebody who has never chosen still matches
      // and falls through to their oldest membership.
      .leftJoin(t.accounts, eq(t.accounts.userEmail, t.access.email))
      .where(and(eq(t.access.email, email), isNull(t.access.revokedAt)))
      .orderBy(...ACTIVE_WORKSPACE_FIRST)
      .limit(1);

    return row ? { email, workspaceId: row.workspaceId } : null;
  } catch {
    return null;
  }
});
