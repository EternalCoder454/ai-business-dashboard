import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { geminiThinkingBudget } from "./providers";
import type { ChatStreamEvent, Effort, Role, WireContent } from "./types";

/**
 * The non-Anthropic providers, normalised to the same stream of events the
 * client already reads.
 *
 * Anthropic stays in the route itself: it is the only one with prompt caching,
 * server-side fallbacks, and adaptive thinking, and folding those into a shared
 * abstraction would mean the abstraction is shaped like Anthropic anyway and
 * the other two carry fields they ignore.
 */
export interface StreamArgs {
  apiKey: string;
  model: string;
  system: string;
  messages: { role: Role; content: string | WireContent[] }[];
  effort: Effort;
  /** Called for every text or thinking fragment, and once for usage. */
  emit: (event: ChatStreamEvent) => void;
  /** True once the browser has hung up, so the loop can stop generating. */
  stopped: () => boolean;
  /** Handed the upstream so an aborted request tears it down rather than billing on. */
  onOpen: (upstream: { abort: () => void }) => void;
}

/**
 * OpenAI, through the Responses API.
 *
 * Images ride along as input_image parts. A PDF is dropped rather than sent,
 * because it needs uploading to the Files API first and silently sending a
 * question with its attachment missing is worse than saying so.
 */
export async function streamOpenAi(args: StreamArgs): Promise<void> {
  const client = new OpenAI({ apiKey: args.apiKey, maxRetries: 2 });
  const controller = new AbortController();
  args.onOpen({ abort: () => controller.abort() });

  const input = args.messages.map((message) => {
    if (typeof message.content === "string") {
      return { role: message.role, content: message.content };
    }
    const parts: Record<string, unknown>[] = [];
    for (const block of message.content) {
      if (block.type === "text") {
        parts.push({ type: "input_text", text: block.text });
      } else if (block.type === "image") {
        parts.push({
          type: "input_image",
          image_url: `data:${block.mediaType};base64,${block.data}`,
          detail: "auto",
        });
      }
    }
    return { role: message.role, content: parts };
  });

  const stream = await client.responses.create(
    {
      model: args.model,
      instructions: args.system,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      input: input as any,
      stream: true,
      reasoning: { effort: args.effort, summary: "auto" },
    },
    { signal: controller.signal },
  );

  for await (const event of stream) {
    if (args.stopped()) break;

    if (event.type === "response.output_text.delta") {
      args.emit({ type: "text", text: event.delta });
    } else if (event.type === "response.reasoning_summary_text.delta") {
      args.emit({ type: "thinking", text: event.delta });
    } else if (event.type === "response.completed") {
      const usage = event.response.usage;
      if (usage) {
        args.emit({
          type: "usage",
          usage: {
            input: usage.input_tokens,
            output: usage.output_tokens,
            // OpenAI caches automatically and reports what it reused.
            cacheRead: usage.input_tokens_details?.cached_tokens ?? 0,
            cacheWrite: 0,
          },
        });
      }
    }
  }
}

/**
 * Google Gemini.
 *
 * The system prompt is a separate field rather than a first turn, and thinking
 * is a token budget rather than a level, so both are mapped on the way in.
 */
export async function streamGemini(args: StreamArgs): Promise<void> {
  const ai = new GoogleGenAI({ apiKey: args.apiKey });
  let cancelled = false;
  args.onOpen({ abort: () => { cancelled = true; } });

  const contents = args.messages.map((message) => {
    const parts: Record<string, unknown>[] = [];
    if (typeof message.content === "string") {
      parts.push({ text: message.content });
    } else {
      for (const block of message.content) {
        if (block.type === "text") {
          parts.push({ text: block.text });
        } else if (block.type === "image" || block.type === "document") {
          parts.push({ inlineData: { mimeType: block.mediaType, data: block.data } });
        }
      }
    }
    // Gemini calls the assistant "model".
    return { role: message.role === "assistant" ? "model" : "user", parts };
  });

  const stream = await ai.models.generateContentStream({
    model: args.model,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    contents: contents as any,
    config: {
      systemInstruction: args.system,
      thinkingConfig: {
        thinkingBudget: geminiThinkingBudget(args.effort),
        includeThoughts: true,
      },
    },
  });

  let input = 0;
  let output = 0;
  let cacheRead = 0;

  for await (const chunk of stream) {
    if (cancelled || args.stopped()) break;

    for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
      if (!part.text) continue;
      // The same field carries both, distinguished by a flag.
      args.emit({ type: part.thought ? "thinking" : "text", text: part.text });
    }

    const usage = chunk.usageMetadata;
    if (usage) {
      input = usage.promptTokenCount ?? input;
      output = usage.candidatesTokenCount ?? output;
      cacheRead = usage.cachedContentTokenCount ?? cacheRead;
    }
  }

  if (!cancelled && !args.stopped() && (input || output)) {
    args.emit({ type: "usage", usage: { input, output, cacheRead, cacheWrite: 0 } });
  }
}

/** Anything the caller could not send, so the answer is not silently short. */
export function droppedAttachments(
  messages: { content: string | WireContent[] }[],
  provider: "openai" | "google",
): string | null {
  const kinds = new Set<string>();
  for (const message of messages) {
    if (typeof message.content === "string") continue;
    for (const block of message.content) {
      if (provider === "openai" && block.type === "document") kinds.add("PDFs");
    }
  }
  if (!kinds.size) return null;
  return `${[...kinds].join(" and ")} were left out: this provider cannot read them here. Ask Anthropic or Gemini for that one.`;
}
