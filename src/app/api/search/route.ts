import { auth, authEnabled } from "@/auth";
import { databaseEnabled, db } from "@/db/client";
import * as t from "@/db/schema";
import { eq } from "drizzle-orm";
import { workspaceKey } from "@/db/keys";
import { membershipFor } from "@/db/tenancy";
import { readJson } from "@/lib/guard";
import { searchBody } from "@/lib/schemas";
import { withinRate } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One web search, through Perplexity, on the business's own key.
 *
 * On the server because the key is encrypted at rest and never leaves it. The
 * browser asks, this answers, and the key is not part of either message.
 *
 * Perplexity rather than the head's own provider only when the business has
 * chosen it. Native search costs nothing extra and is the default; this exists
 * for a workspace whose heads are spread across providers that do not all
 * search, where one behaviour everywhere is worth a second key.
 */

/** The Agent API. The Sonar chat completions endpoint retires 27 Sep 2026. */
const ENDPOINT = "https://api.perplexity.ai/v1/agent";

/** Long enough for a real answer, short enough not to hang a reply behind it. */
const TIMEOUT_MS = 25_000;

interface Found {
  answer: string;
  sources: { title: string; url: string }[];
}

/**
 * Reads the answer and its sources out of the response.
 *
 * By type rather than by position. The documented example happens to put the
 * message first and the results second, and nothing promises it stays that way.
 */
function read(payload: unknown): Found {
  const output = (payload as { output?: unknown[] })?.output ?? [];
  let answer = "";
  const sources: { title: string; url: string }[] = [];

  for (const raw of output) {
    const item = raw as { type?: string; content?: unknown[]; results?: unknown[] };

    if (item.type === "message") {
      for (const part of item.content ?? []) {
        const piece = part as { type?: string; text?: string };
        if (piece.type === "output_text" && piece.text) answer += piece.text;
      }
    }

    if (item.type === "search_results") {
      for (const found of item.results ?? []) {
        const result = found as { url?: string; title?: string };
        if (result.url && !sources.some((s) => s.url === result.url)) {
          sources.push({ title: result.title || result.url, url: result.url });
        }
      }
    }
  }

  return { answer: answer.trim(), sources: sources.slice(0, 8) };
}

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

  const query = parsed.body.query.trim();
  if (!query) return Response.json({ error: "Nothing to search for." }, { status: 400 });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      // A preset rather than a named model: which model answers is Perplexity's
      // business, and naming one here is a thing to keep current for no gain.
      body: JSON.stringify({ input: query, preset: "fast", stream: false }),
      signal: controller.signal,
    });

    if (!response.ok) {
      // The upstream body can carry the key back in an error echo, so it is
      // read for the status and never forwarded.
      console.error("[api/search] perplexity answered", response.status);
      return Response.json(
        {
          error:
            response.status === 401
              ? "Perplexity refused that key."
              : response.status === 429
                ? "Perplexity is rate limiting this key."
                : "That search could not be run.",
        },
        { status: 502 },
      );
    }

    const found = read(await response.json());
    if (!found.answer && found.sources.length === 0) {
      return Response.json({ error: "That search came back empty." }, { status: 502 });
    }
    return Response.json(found);
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    console.error("[api/search]", aborted ? "timed out" : error);
    return Response.json(
      { error: aborted ? "That search took too long." : "That search could not be run." },
      { status: 504 },
    );
  } finally {
    clearTimeout(timer);
  }
}
