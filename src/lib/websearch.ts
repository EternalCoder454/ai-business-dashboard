/**
 * Web search through Perplexity, on two of its APIs rather than one.
 *
 * Perplexity rather than the head's own provider, for a reason that is not
 * obvious: native search is a server tool inside a model request. It exists
 * only while a model is answering. An addon has no model call, so an unattended
 * search has nothing to attach to, and Perplexity is the only one of the two
 * that can be asked a question on its own.
 *
 * Which of its APIs depends on whether a model is already running, and the two
 * callers differ on exactly that.
 *
 * A head calling the tool mid answer is a model, with its department's persona
 * and the house writing rules loaded. It wants raw material: ranked results it
 * reads and writes up itself. Handing it a finished answer put a second model's
 * prose inside a reply the house rules exist to govern, and had the panel pay
 * an agent to write something it then wrapped in its own voice. So that goes
 * through the Search API, which returns ranked results and no prose.
 *
 * An addon step has no model call at all, which is the whole reason it needs
 * Perplexity in the first place, and the recipe language has no variables, so
 * there is nowhere to hold ten snippets and nothing to turn them into a note.
 * That one keeps the Agent API, which does the reading and the writing.
 *
 * Both share the timeout, the reading of failures, and the refusal to forward
 * an upstream body, which can echo the key back.
 */

/** The Agent API. Sonar chat completions retires on 27 September 2026. */
const AGENT_ENDPOINT = "https://api.perplexity.ai/v1/agent";

/** Ranked results and no answer. Billed per request, not per token. */
const SEARCH_ENDPOINT = "https://api.perplexity.ai/search";

/**
 * How many results a head gets back.
 *
 * The API allows 1 to 20 and defaults to 10. The docs ask for only what you
 * need, since more results means a slower response, and every one of these is
 * also tokens the head pays to read on the turn it searched. Eight is a page of
 * results: enough to see agreement between sources, short enough not to bury
 * the question.
 */
const MAX_RESULTS = 8;

/** Long enough for a real answer, short enough not to hang a reply behind it. */
const TIMEOUT_MS = 25_000;

export interface SearchSource {
  title: string;
  url: string;
}

export type SearchResult =
  | { ok: true; answer: string; sources: SearchSource[] }
  /** Said plainly: this reaches a run log an owner reads, or a head mid answer. */
  | { ok: false; error: string };

/**
 * Reads the answer and its sources out of the response.
 *
 * By type rather than by position. The documented example puts the message
 * first and the results second, and nothing promises it stays that way.
 */
function read(payload: unknown): { answer: string; sources: SearchSource[] } {
  const output = (payload as { output?: unknown[] })?.output ?? [];
  let answer = "";
  const sources: SearchSource[] = [];

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

/**
 * What to say when Perplexity refuses.
 *
 * The status only. The body is deliberately never forwarded: an upstream error
 * can quote the request back, and the request carries the key.
 */
function refusal(status: number): string {
  console.error("[websearch] perplexity answered", status);
  if (status === 401) return "Perplexity refused that key.";
  if (status === 429) return "Perplexity is rate limiting this key.";
  return "That search could not be run.";
}

export interface WebResult {
  title: string;
  url: string;
  snippet: string;
  /** When it was published, when the result says. */
  date?: string;
}

export type RankedResult =
  | { ok: true; results: WebResult[] }
  | { ok: false; error: string };

/**
 * Ranked web results, for a caller that will write the answer itself.
 *
 * `query` takes a single string or up to five, which is why the parameter is
 * not called `input` like the agent's. One is what a head asks; the array form
 * is left unused rather than exposed, because a head asking five questions in
 * one tool call is a head that has stopped saying what it wants.
 *
 * Never throws, like everything else here: a failed search is a sentence the
 * model can read and work around, not an exception that loses the turn.
 */
export async function searchRankedWeb(query: string, key: string): Promise<RankedResult> {
  const asked = query.trim();
  if (!asked) return { ok: false, error: "Nothing to search for." };
  if (!key) return { ok: false, error: "No Perplexity key is set." };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(SEARCH_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        query: asked,
        max_results: MAX_RESULTS,
        /*
         * The default is "high", which extracts the most from each page. A head
         * reads all eight of these on the turn it searched, so the deepest
         * setting is the one that most reliably buries the question it was
         * asked. Medium is a paragraph per result, which is what a person
         * skimming a page of results actually gets.
         */
        search_context_size: "medium",
      }),
      signal: controller.signal,
    });

    if (!response.ok) return { ok: false, error: refusal(response.status) };

    const payload = (await response.json()) as { results?: unknown[] };
    const seen = new Set<string>();
    const results: WebResult[] = [];

    for (const raw of payload.results ?? []) {
      const row = raw as { title?: string; url?: string; snippet?: string; date?: string };
      // Deduped by url, as the docs ask. It matters for the multi-query form
      // and costs nothing here, and a repeated source reads as corroboration.
      if (!row.url || seen.has(row.url)) continue;
      seen.add(row.url);
      results.push({
        title: row.title || row.url,
        url: row.url,
        snippet: row.snippet ?? "",
        date: row.date ?? undefined,
      });
    }

    if (results.length === 0) return { ok: false, error: "That search found nothing." };
    return { ok: true, results };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    console.error("[websearch]", aborted ? "timed out" : error);
    return {
      ok: false,
      error: aborted ? "That search took too long." : "That search could not be run.",
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Never throws. A failed search is a sentence, not an exception. */
export async function searchTheWeb(query: string, key: string): Promise<SearchResult> {
  const asked = query.trim();
  if (!asked) return { ok: false, error: "Nothing to search for." };
  if (!key) return { ok: false, error: "No Perplexity key is set." };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(AGENT_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      // A preset rather than a named model: which model answers is Perplexity's
      // business, and naming one is a thing to keep current for no gain.
      body: JSON.stringify({ input: asked, preset: "fast", stream: false }),
      signal: controller.signal,
    });

    if (!response.ok) return { ok: false, error: refusal(response.status) };

    const found = read(await response.json());
    if (!found.answer && found.sources.length === 0) {
      return { ok: false, error: "That search came back empty." };
    }
    return { ok: true, ...found };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    console.error("[websearch]", aborted ? "timed out" : error);
    return {
      ok: false,
      error: aborted ? "That search took too long." : "That search could not be run.",
    };
  } finally {
    clearTimeout(timer);
  }
}

/** The answer with its sources under it, as markdown, for saving or replying. */
export function withSources(answer: string, sources: SearchSource[]): string {
  if (!sources.length) return answer;
  const list = sources.map((source) => `- [${source.title}](${source.url})`).join("\n");
  return `${answer}\n\nSources:\n${list}`;
}
