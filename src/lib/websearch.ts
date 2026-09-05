/**
 * One web search through Perplexity.
 *
 * Shared by the tool a head calls mid answer and by the addon step that runs on
 * a schedule with nobody watching. Both need the same request, the same reading
 * of the response, and the same refusal to let an upstream error carry the key
 * back out, so they share this rather than each having a copy that drifts.
 *
 * Perplexity rather than the head's own provider, for a reason that is not
 * obvious: native search is a server tool inside a model request. It exists
 * only while a model is answering. An addon has no model call, so an unattended
 * search has nothing to attach to, and Perplexity is the only one of the two
 * that can be asked a question on its own.
 */

/** The Agent API. Sonar chat completions retires on 27 September 2026. */
const ENDPOINT = "https://api.perplexity.ai/v1/agent";

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

/** Never throws. A failed search is a sentence, not an exception. */
export async function searchTheWeb(query: string, key: string): Promise<SearchResult> {
  const asked = query.trim();
  if (!asked) return { ok: false, error: "Nothing to search for." };
  if (!key) return { ok: false, error: "No Perplexity key is set." };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      // A preset rather than a named model: which model answers is Perplexity's
      // business, and naming one is a thing to keep current for no gain.
      body: JSON.stringify({ input: asked, preset: "fast", stream: false }),
      signal: controller.signal,
    });

    if (!response.ok) {
      // Read for the status and never forwarded: the body can echo the key back.
      console.error("[websearch] perplexity answered", response.status);
      return {
        ok: false,
        error:
          response.status === 401
            ? "Perplexity refused that key."
            : response.status === 429
              ? "Perplexity is rate limiting this key."
              : "That search could not be run.",
      };
    }

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
