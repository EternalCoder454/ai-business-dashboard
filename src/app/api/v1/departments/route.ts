import { asc, eq } from "drizzle-orm";
import { requireDb } from "@/db/client";
import * as t from "@/db/schema";
import { authorize, caught, ok } from "@/lib/api/v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The org chart, so a caller can address a task to the right head.
 *
 * The system prompt is not here. It is the business's own writing, it is not
 * needed to file a task, and an addon that only ever wanted to create work has
 * no reason to hold a copy of how each head is told to think.
 */
export async function GET(request: Request) {
  const auth = await authorize(request, "departments:read");
  if (!auth.ok) return auth.response;
  const { caller } = auth;

  try {
    const rows = await requireDb()
      .select({
        id: t.departments.id,
        name: t.departments.name,
        roleTitle: t.departments.roleTitle,
        personaName: t.departments.personaName,
        status: t.departments.status,
        isCeo: t.departments.isCeo,
        personal: t.departments.personal,
        sortOrder: t.departments.sortOrder,
      })
      .from(t.departments)
      .where(eq(t.departments.workspaceId, caller.workspaceId))
      .orderBy(asc(t.departments.sortOrder));

    return ok(
      {
        items: rows
          // Somebody's private head is theirs rather than the business's, so it
          // is not something an integration should file work against.
          .filter((row) => !row.personal)
          .map((row) => ({
            id: row.id,
            name: row.name,
            role_title: row.roleTitle,
            persona_name: row.personaName,
            status: row.status,
            is_lead: row.isCeo,
          })),
      },
      { requestId: caller.requestId },
    );
  } catch (error) {
    return caught("departments", error, caller.requestId);
  }
}
