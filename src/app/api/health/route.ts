import { sql } from "drizzle-orm";
import { databaseEnabled, requireDb } from "@/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Whether this instance is worth sending traffic to.
 *
 * New with the move off Vercel, which answered this question on the app's
 * behalf and no longer does. Something has to decide when a container is ready,
 * when a deploy has actually come up, and when to stop and look.
 *
 * It asks the database, deliberately. A check that only proves the process is
 * listening reports a healthy panel that cannot load a single workspace, which
 * is the exact failure worth catching: the app starts perfectly well against a
 * database that is not there.
 *
 * It says nothing else. No version, no counts, no configuration, because this
 * is the one route on the deployment that answers to anybody at all.
 */
export async function GET(): Promise<Response> {
  const headers = { "Cache-Control": "no-store, max-age=0" };

  if (!databaseEnabled) {
    return Response.json({ ok: false }, { status: 503, headers });
  }

  try {
    await requireDb().execute(sql`select 1`);
    return Response.json({ ok: true }, { headers });
  } catch (error) {
    console.error("[api/health] the database did not answer", error);
    return Response.json({ ok: false }, { status: 503, headers });
  }
}
