import { auth, authEnabled } from "@/auth";
import { databaseEnabled, db } from "@/db/client";
import * as t from "@/db/schema";
import { eq } from "drizzle-orm";
import { workspaceKey } from "@/db/keys";
import { membershipFor } from "@/db/tenancy";
import { readJson } from "@/lib/guard";
import { searchBody } from "@/lib/schemas";
import { withinRate } from "@/lib/rateLimit";
import { searchTheWeb } from "@/lib/websearch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One web search, on the business's own key, for a head mid answer.
 *
 * On the server because the key is encrypted at rest and never leaves it. The
 * browser asks, this answers, and the key is not part of either message.
 *
 * The search itself lives in lib/websearch.ts, shared with the addon step that
 * runs on a schedule. What is left here is everything about this being a
 * request from a person: who they are, which business they are in, and whether
 * that business has said yes to spending money on this.
 */
export async function POST(request: Request) {
  if (!authEnabled || !databaseEnabled) {
    return Response.json({ error: "Search is not available on this instance." }, { status: 501 });
  }

  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return Response.json({ error: "Not signed in." }, { status: 401 });

  const membership = await membershipFor(email);
  if (!membership) return Response.json({ error: "You are not in a workspace." }, { status: 403 });

  /*
   * Per person rather than per workspace. A search costs money on the
   * business's key, and a head that has decided to look something up will keep
   * looking; this is the ceiling on how much one person can spend in a minute
   * by asking a question that cannot be answered.
   */
  if (!(await withinRate(`search:${email}`, 20, 60_000))) {
    return Response.json({ error: "Too many searches at once." }, { status: 429 });
  }

  /*
   * Read here rather than trusted from the request. The mode decides whether
   * this business spends money on searching, so a browser saying "perplexity"
   * must not be what makes it true.
   */
  const [row] = await db!
    .select({ mode: t.settings.webSearch })
    .from(t.settings)
    .where(eq(t.settings.workspaceId, membership.workspaceId))
    .limit(1);

  if (row?.mode !== "perplexity") {
    return Response.json(
      { error: "This business has not turned on Perplexity search." },
      { status: 403 },
    );
  }

  const key = await workspaceKey(membership.workspaceId, "perplexity");
  if (!key) {
    return Response.json(
      { error: "No Perplexity key is set. An administrator adds it under Integrations." },
      { status: 400 },
    );
  }

  const parsed = await readJson(request, searchBody, 4_000);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: parsed.status });

  const found = await searchTheWeb(parsed.body.query, key);
  if (!found.ok) return Response.json({ error: found.error }, { status: 502 });

  return Response.json({ answer: found.answer, sources: found.sources });
}
