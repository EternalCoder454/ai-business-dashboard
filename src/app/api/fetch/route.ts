import { auth, authEnabled } from "@/auth";
import { databaseEnabled, db } from "@/db/client";
import * as t from "@/db/schema";
import { eq } from "drizzle-orm";
import { membershipFor } from "@/db/tenancy";
import { readJson } from "@/lib/guard";
import { fetchBody } from "@/lib/schemas";
import { readPage } from "@/lib/readPage";
import { withinRate } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Opens one web page for a head that was given the address.
 *
 * On the server because the guards are: DNS resolution, the private address
 * check and the socket pin all live in Node, and a browser fetch would be
 * subject to the page's CORS policy rather than to ours anyway.
 *
 * Behind the same switch as searching. Reading the web is reading the web, and
 * a business that has turned it off has said so about both; there is no reading
 * of "web search: off" under which fetching a page is still allowed. Which
 * engine they chose does not matter here, since this uses neither.
 */
export async function POST(request: Request) {
  if (!authEnabled || !databaseEnabled || !db) {
    return Response.json({ error: "Not configured." }, { status: 501 });
  }

  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return Response.json({ error: "Not signed in." }, { status: 401 });

  const membership = await membershipFor(email);
  if (!membership) return Response.json({ error: "No workspace." }, { status: 404 });

  const [settings] = await db
    .select({ mode: t.settings.webSearch })
    .from(t.settings)
    .where(eq(t.settings.workspaceId, membership.workspaceId))
    .limit(1);

  if ((settings?.mode ?? "off") === "off") {
    return Response.json(
      { error: "This business has web access turned off." },
      { status: 403 },
    );
  }

  /*
   * Bounded per business per day.
   *
   * A fetch costs no money, which is exactly why it needs a ceiling: nothing
   * else stops a head that has decided a page is worth re-reading from asking
   * for it on every turn, and the thing being spent is our server's outbound
   * requests rather than somebody's balance.
   */
  if (!(await withinRate(`fetch:${membership.workspaceId}`, 200, 86_400_000))) {
    return Response.json(
      { error: "This business has opened its 200 pages for today." },
      { status: 429 },
    );
  }

  const parsed = await readJson(request, fetchBody, 2_000);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: parsed.status });

  const page = await readPage(parsed.body.url);
  if (!page.ok) return Response.json({ error: page.detail }, { status: 502 });

  return Response.json({
    url: page.url,
    title: page.title,
    text: page.text,
    truncated: page.truncated,
  });
}
