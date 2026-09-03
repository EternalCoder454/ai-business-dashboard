import { providerInfo, type Provider } from "./providers";

/**
 * One question, one answer, no streaming.
 *
 * The chat path streams because somebody is watching the words appear. Nothing
 * on a timer is: a scheduled briefing and the conduct review both want the
 * whole reply and have nobody to show it to in the meantime, and both had
 * grown their own copy of the same Anthropic fetch with the same headers and
 * the same brittle assumption that Anthropic is the only provider anybody has
 * a key for.
 *
 * So it lives here once, and it speaks all three. A business on OpenAI or
 * Gemini gets its briefings written and its conversations reviewed on the key
 * it actually has, rather than a line in a log saying its provider is not
 * wired up.
 */

export interface Answer {
  text: string;
  input: number;
  output: number;
}

export interface AskOptions {
  provider: Provider;
  model: string;
  apiKey: string;
  system: string;
  question: string;
  maxTokens?: number;
  /**
   * Held between calls where the provider supports it. Worth it for a system
   * block that is identical on every run, which is what both callers have.
   */
  cacheSystem?: boolean;
  /**
   * No sampling. For anything classifying rather than writing.
   *
   * The reviewer ran at the model's default temperature and gave two different
   * answers about the same sentence on two passes: "I am going to touch you
   * tonight" was left alone once and raised as sexual harassment the next time.
   * A judgement about somebody's conduct that changes when you press the button
   * again is not a judgement, and the person it is about deserves better than a
   * coin.
   */
  exact?: boolean;
  signal?: AbortSignal;
}

const DEFAULT_MAX_TOKENS = 4_000;

/** Null rather than a throw: neither caller should stop because one call failed. */
export async function askOnce(options: AskOptions): Promise<Answer | null> {
  const { provider } = options;
  try {
    if (provider === "anthropic") return await anthropic(options);
    if (provider === "openai") return await openai(options);
    return await google(options);
  } catch (error) {
    console.error(`[askOnce] ${providerInfo(provider).label} failed`, error);
    return null;
  }
}

async function anthropic(o: AskOptions): Promise<Answer | null> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": o.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    signal: o.signal,
    body: JSON.stringify({
      model: o.model,
      max_tokens: o.maxTokens ?? DEFAULT_MAX_TOKENS,
      ...(o.exact ? { temperature: 0 } : {}),
      system: o.cacheSystem
        ? [{ type: "text", text: o.system, cache_control: { type: "ephemeral", ttl: "1h" } }]
        : o.system,
      messages: [{ role: "user", content: o.question }],
    }),
  });
  if (!response.ok) return refused("anthropic", response);

  const body = (await response.json()) as {
    content?: { type: string; text?: string }[];
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  return {
    text: (body.content ?? [])
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join(""),
    input: body.usage?.input_tokens ?? 0,
    output: body.usage?.output_tokens ?? 0,
  };
}

async function openai(o: AskOptions): Promise<Answer | null> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${o.apiKey}`,
      "content-type": "application/json",
    },
    signal: o.signal,
    body: JSON.stringify({
      model: o.model,
      max_completion_tokens: o.maxTokens ?? DEFAULT_MAX_TOKENS,
      ...(o.exact ? { temperature: 0 } : {}),
      messages: [
        { role: "system", content: o.system },
        { role: "user", content: o.question },
      ],
    }),
  });
  if (!response.ok) return refused("openai", response);

  const body = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  return {
    text: body.choices?.[0]?.message?.content ?? "",
    input: body.usage?.prompt_tokens ?? 0,
    output: body.usage?.completion_tokens ?? 0,
  };
}

async function google(o: AskOptions): Promise<Answer | null> {
  // The key goes in a header rather than the query string, which is the other
  // documented way and the one that writes it into every access log on the
  // path.
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    o.model,
  )}:generateContent`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "x-goog-api-key": o.apiKey, "content-type": "application/json" },
    signal: o.signal,
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: o.system }] },
      contents: [{ role: "user", parts: [{ text: o.question }] }],
      generationConfig: {
        maxOutputTokens: o.maxTokens ?? DEFAULT_MAX_TOKENS,
        ...(o.exact ? { temperature: 0 } : {}),
      },
    }),
  });
  if (!response.ok) return refused("google", response);

  const body = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  return {
    text: (body.candidates?.[0]?.content?.parts ?? [])
      .map((part) => part.text ?? "")
      .join(""),
    input: body.usageMetadata?.promptTokenCount ?? 0,
    output: body.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

/**
 * The status and a short body, never the key.
 *
 * A refusal here is nearly always the key: expired, revoked, out of credit, or
 * pointed at a model the account cannot use. The body says which, and it is
 * the difference between an operator fixing it in a minute and wondering for a
 * week why the nightly pass produces nothing.
 */
async function refused(provider: Provider, response: Response): Promise<null> {
  const detail = await response.text().catch(() => "");
  console.error(
    `[askOnce] ${providerInfo(provider).label} refused`,
    response.status,
    detail.slice(0, 300).replace(/\s+/g, " "),
  );
  return null;
}
