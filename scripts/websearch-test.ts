/**
 * What the two Perplexity calls send, and what they make of what comes back.
 *
 * There is no test that runs a real search: that costs money on somebody's key
 * every time and would fail in CI for reasons that have nothing to do with this
 * code. What is worth covering is everything either side of the network, which
 * is where the bugs actually are. The request has to match the documented shape
 * or the API rejects it; the reading has to survive fields arriving in a
 * different order or not at all; and neither may ever let an upstream body out,
 * because the body can quote the request back and the request carries the key.
 *
 *   npm run websearch-test
 */
import { searchRankedWeb, searchTheWeb, withSources } from "../src/lib/websearch";

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures += 1;
}

const realFetch = globalThis.fetch;
type Call = { url: string; body: Record<string, unknown>; auth: string };

/** Stands in for Perplexity and records what it was sent. */
function stub(
  reply: { status: number; json?: unknown; body?: string },
): { calls: Call[] } {
  const calls: Call[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({
      url: String(url),
      body: JSON.parse(String(init.body)),
      auth: String((init.headers as Record<string, string>).Authorization ?? ""),
    });
    return {
      ok: reply.status >= 200 && reply.status < 300,
      status: reply.status,
      json: async () => reply.json ?? {},
      text: async () => reply.body ?? "",
    };
  }) as unknown as typeof fetch;
  return { calls };
}

const SECRET = "pplx-not-a-real-key";

void (async () => {
  console.log("\nthe search request matches the documented shape");
  {
    const { calls } = stub({
      status: 200,
      json: { id: "x", results: [{ title: "T", url: "https://a.example", snippet: "S" }] },
    });
    await searchRankedWeb("corporation tax small companies", SECRET);
    const [call] = calls;
    check("posts to /search", call.url === "https://api.perplexity.ai/search", call.url);
    check("sends query as a string", typeof call.body.query === "string");
    check(
      "max_results is within 1 to 20",
      typeof call.body.max_results === "number" &&
        (call.body.max_results as number) >= 1 &&
        (call.body.max_results as number) <= 20,
      String(call.body.max_results),
    );
    check(
      "search_context_size is one of the three allowed",
      ["low", "medium", "high"].includes(String(call.body.search_context_size)),
      String(call.body.search_context_size),
    );
    check("bearer auth", call.auth === `Bearer ${SECRET}`);
    check(
      "sends nothing the search endpoint does not take",
      Object.keys(call.body).every((key) =>
        ["query", "max_results", "search_context_size"].includes(key),
      ),
      Object.keys(call.body).join(),
    );
  }

  console.log("\nresults are read, deduped and bounded");
  {
    stub({
      status: 200,
      json: {
        id: "x",
        results: [
          { title: "One", url: "https://a.example", snippet: "first", date: "2026-01-02" },
          // The docs ask for a dedupe by url, which matters for the multi-query
          // form and costs nothing here.
          { title: "Again", url: "https://a.example", snippet: "duplicate" },
          // A result with no url cannot be cited, so it is not a result.
          { title: "Nowhere", snippet: "no address" },
          { title: "Two", url: "https://b.example", snippet: "second" },
        ],
      },
    });
    const found = await searchRankedWeb("anything", SECRET);
    check("succeeded", found.ok);
    if (found.ok) {
      check("two results survive", found.results.length === 2, String(found.results.length));
      check("deduped by url", found.results[0].url === "https://a.example");
      check("keeps the date when there is one", found.results[0].date === "2026-01-02");
      check("drops a result with no url", !found.results.some((r) => r.title === "Nowhere"));
    }
  }

  console.log("\nan empty result set is a sentence, not a success");
  {
    stub({ status: 200, json: { id: "x", results: [] } });
    const found = await searchRankedWeb("anything", SECRET);
    check("reported as failed", !found.ok);
  }

  console.log("\na title falls back to the address rather than being blank");
  {
    stub({ status: 200, json: { id: "x", results: [{ url: "https://c.example", snippet: "s" }] } });
    const found = await searchRankedWeb("anything", SECRET);
    check("titled by url", found.ok && found.results[0].title === "https://c.example");
  }

  console.log("\nan upstream failure never carries the key back out");
  {
    const leak = `401 unauthorized for Authorization: Bearer ${SECRET}`;
    for (const status of [401, 429, 500]) {
      stub({ status, json: { error: leak }, body: leak });
      const ranked = await searchRankedWeb("anything", SECRET);
      const agent = await searchTheWeb("anything", SECRET);
      check(
        `search ${status} says nothing about the key`,
        !ranked.ok && !ranked.error.includes(SECRET),
        ranked.ok ? "unexpectedly ok" : ranked.error,
      );
      check(
        `agent ${status} says nothing about the key`,
        !agent.ok && !agent.error.includes(SECRET),
        agent.ok ? "unexpectedly ok" : agent.error,
      );
    }
  }

  console.log("\nthe agent call is unchanged, and still reads by type not position");
  {
    const { calls } = stub({
      status: 200,
      json: {
        output: [
          // Deliberately results first, which is not the order the docs show.
          { type: "search_results", results: [{ url: "https://d.example", title: "D" }] },
          { type: "message", content: [{ type: "output_text", text: "The answer." }] },
        ],
      },
    });
    const found = await searchTheWeb("anything", SECRET);
    check("posts to /v1/agent", calls[0].url === "https://api.perplexity.ai/v1/agent", calls[0].url);
    check("uses a preset rather than naming a model", calls[0].body.preset === "fast");
    check("does not stream", calls[0].body.stream === false);
    check("found the answer", found.ok && found.answer === "The answer.");
    check("found the source", found.ok && found.sources[0]?.url === "https://d.example");
    if (found.ok) {
      check(
        "sources render under the answer",
        withSources(found.answer, found.sources).includes("https://d.example"),
      );
    }
  }

  console.log("\nnothing is asked without a question or a key");
  {
    const { calls } = stub({ status: 200, json: { results: [] } });
    check("empty query is refused", !(await searchRankedWeb("   ", SECRET)).ok);
    check("missing key is refused", !(await searchRankedWeb("anything", "")).ok);
    check("neither reached the network", calls.length === 0, String(calls.length));
  }

  globalThis.fetch = realFetch;

  console.log(failures === 0 ? "\nall checks passed" : `\n${failures} FAILURES ABOVE`);
  process.exit(failures === 0 ? 0 : 1);
})();
