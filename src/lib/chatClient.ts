import type {
  ChatRequestBody,
  ChatStreamEvent,
  ProposedToolCall,
  TokenUsage,
} from "./types";

export interface StreamHandlers {
  /** Called with the delta and the text so far, on every text chunk. */
  onText?: (delta: string, full: string) => void;
  onThinking?: (delta: string, full: string) => void;
  onUsage?: (usage: TokenUsage) => void;
  /** Where a searched answer came from, once the reply is finished. */
  onSources?: (sources: { title: string; url: string }[]) => void;
}

export interface StreamResult {
  text: string;
  thinking: string;
  usage?: TokenUsage;
  /** Actions the reply proposed. Nothing has run: they await approval. */
  toolCalls: ProposedToolCall[];
  /** Set when the model never produced usable text, or stopped early. */
  error?: string;
}

/**
 * The single transport for every model call the app makes, used by both the
 * per-department chat and the all-hands fan-out.
 *
 * Swapping the fan-out to the Batches API later means replacing the caller in
 * `allHands.ts`, not this function: batch has no streaming, so it needs its own
 * submit-and-poll path rather than a different reader here.
 */
export async function streamChat(
  body: ChatRequestBody,
  apiKey: string,
  workspaceId: string,
  handlers: StreamHandlers = {},
  signal?: AbortSignal,
  /** Browser-held keys for the other providers, when the server has none. */
  otherKeys: { openai?: string; google?: string } = {},
): Promise<StreamResult> {
  let text = "";
  let thinking = "";
  let usage: TokenUsage | undefined;
  let error: string | undefined;
  const toolCalls: ProposedToolCall[] = [];

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { "x-anthropic-key": apiKey } : {}),
        // Only meaningful alongside a browser-held key. A server key brings its
        // own workspace from the environment.
        ...(workspaceId ? { "x-anthropic-workspace": workspaceId } : {}),
        ...(otherKeys.openai ? { "x-openai-key": otherKeys.openai } : {}),
        ...(otherKeys.google ? { "x-google-key": otherKeys.google } : {}),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok || !response.body) {
      const detail = await response.json().catch(() => null);
      return {
        text,
        thinking,
        toolCalls,
        error: detail?.error ?? `Request failed with status ${response.status}.`,
      };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        let event: ChatStreamEvent;
        try {
          event = JSON.parse(line) as ChatStreamEvent;
        } catch {
          continue;
        }

        if (event.type === "text") {
          text += event.text;
          handlers.onText?.(event.text, text);
        } else if (event.type === "thinking") {
          thinking += event.text;
          handlers.onThinking?.(event.text, thinking);
        } else if (event.type === "sources") {
          handlers.onSources?.(event.sources);
        } else if (event.type === "usage") {
          usage = event.usage;
          handlers.onUsage?.(event.usage);
        } else if (event.type === "tool") {
          toolCalls.push(event.call);
        } else if (event.type === "error") {
          error = event.message;
        }
      }
    }
  } catch (caught) {
    if ((caught as Error)?.name === "AbortError") {
      error = text ? undefined : "Stopped before the model replied.";
    } else {
      error = (caught as Error)?.message ?? "The request failed.";
    }
  }

  return { text, thinking, usage, error, toolCalls };
}

/**
 * Runs `task` over `items` with at most `limit` in flight. Keeps a company-wide
 * fan-out from opening a dozen concurrent streams and tripping a rate limit.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await task(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
}
