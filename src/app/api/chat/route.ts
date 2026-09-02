import Anthropic from "@anthropic-ai/sdk";
import type { NextRequest } from "next/server";
import { readJsonWithin, requireSession, withinRate } from "@/lib/guard";
import { auth } from "@/auth";
import { workspaceKey } from "@/db/keys";
import { membershipFor } from "@/db/tenancy";
import { DEFAULT_PROVIDER, providerInfo, providerOf, type Provider } from "@/lib/providers";
import { droppedAttachments, streamGemini, streamOpenAi } from "@/lib/serverProviders";
import type { ChatRequestBody, ChatStreamEvent, WireContent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Models that accept adaptive thinking and `output_config.effort`. Older models
 * (Haiku 4.5 and anything before it) reject both with a 400.
 */
const MODERN_MODELS = new Set([
  "claude-opus-5",
  "claude-opus-4-8",
  "claude-opus-4-7",
  "claude-opus-4-6",
  "claude-sonnet-5",
  "claude-sonnet-4-6",
  "claude-fable-5",
]);

/** Server-side refusal fallbacks are an Opus 5 / Fable 5 feature. */
const FALLBACK_MODELS = new Set(["claude-opus-5", "claude-fable-5"]);

/**
 * Smallest prefix each model will actually cache. A breakpoint on a shorter
 * prefix is silently ignored, so this is only used to report honestly in logs.
 */
const CACHE_MINIMUM_TOKENS: Record<string, number> = {
  "claude-opus-5": 512,
  "claude-fable-5": 512,
  "claude-sonnet-5": 1024,
  "claude-opus-4-8": 1024,
  "claude-sonnet-4-6": 1024,
  "claude-haiku-4-5": 4096,
};

const MAX_TOKENS: Record<string, number> = {
  "claude-haiku-4-5": 16000,
};
const DEFAULT_MAX_TOKENS = 64000;

const encoder = new TextEncoder();

function frame(event: ChatStreamEvent): Uint8Array {
  return encoder.encode(`${JSON.stringify(event)}\n`);
}

function describeError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) {
    return "That API key was rejected. Check it in Settings. It should start with “sk-ant-”.";
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return "This API key does not have access to that model. Pick a different model in Settings.";
  }
  if (error instanceof Anthropic.NotFoundError) {
    return "That model ID was not found. Pick a different model in Settings.";
  }
  if (error instanceof Anthropic.RateLimitError) {
    return "Rate limited by the Anthropic API. Wait a moment and send it again.";
  }
  if (error instanceof Anthropic.BadRequestError) {
    // The single most likely 400 on a first run, and the raw message does not
    // say where to put the id.
    if (error.message.includes("anthropic-workspace-id")) {
      return (
        "This API key is identity-linked, so it needs a workspace ID. Find it in the " +
        "Anthropic Console under Settings, Workspaces (it starts with wrkspc_) and put " +
        "it in Settings here, or set ANTHROPIC_WORKSPACE_ID on the server."
      );
    }
    return `The request was rejected: ${error.message}`;
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return "Could not reach the Anthropic API. Check your network connection.";
  }
  if (error instanceof Anthropic.APIError) {
    return `Anthropic API error${error.status ? ` (${error.status})` : ""}: ${error.message}`;
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong while contacting the model.";
}

/**
 * Attachments are inlined as base64, so a conversation carrying a few
 * screenshots is legitimately large. Twenty megabytes is well past anything the
 * composer will send and far short of what would hurt the instance.
 */
const MAX_BODY_BYTES = 20_000_000;

/** Generous enough never to be met by hand, tight enough to stop a stuck loop. */
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;

/**
 * The key belonging to the workspace this request is acting in.
 *
 * Empty for anyone signed in to nothing, and for a checkout with no database,
 * both of which fall through to the header below.
 */
async function keyForRequester(provider: Provider): Promise<string> {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return "";
  const membership = await membershipFor(email);
  if (!membership) return "";
  return workspaceKey(membership.workspaceId, provider);
}

export async function POST(request: NextRequest) {
  // This route spends money. It checks for itself rather than trusting that the
  // proxy matcher still covers it.
  const session = await requireSession();
  if (!session.ok) {
    return Response.json({ error: session.error }, { status: session.status });
  }

  if (!withinRate(`chat:${session.email ?? "local"}`, RATE_LIMIT, RATE_WINDOW_MS)) {
    return Response.json(
      { error: "Too many requests in a row. Wait a moment and try again." },
      { status: 429 },
    );
  }

  const parsed = await readJsonWithin<ChatRequestBody>(request, MAX_BODY_BYTES);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: parsed.status });
  }
  const body = parsed.body;

  /**
   * Three places a key can come from, in this order, and the first one wins.
   *
   * 1. The deployment's own environment. An operator running the panel for one
   *    company, or a local checkout.
   * 2. The workspace. This is the normal case for a business: the owner sets
   *    it once and everyone they invited spends against it, without any of
   *    them ever holding the credential.
   * 3. A header from the browser, which is what a local checkout with no
   *    database still uses.
   *
   * The header is last rather than first on purpose. A member could otherwise
   * put their own key in a browser and bill themselves for company work by
   * accident, and the workspace's key is the answer to who pays.
   */
  const provider: Provider = body.provider ?? providerOf(body.model);
  const info = providerInfo(provider);

  const serverKey = process.env[info.envVar]?.trim();
  const fromWorkspace = serverKey ? "" : await keyForRequester(provider);
  const apiKey = serverKey || fromWorkspace || request.headers.get(info.header)?.trim();

  /**
   * An identity-linked key refuses any request that does not say which
   * workspace it is acting in. The workspace follows whichever key is in use,
   * so a server key never picks up a workspace typed into a browser.
   */
  const workspaceId =
    provider !== "anthropic"
      ? undefined
      : serverKey
        ? process.env.ANTHROPIC_WORKSPACE_ID?.trim()
        : fromWorkspace
          ? undefined
          : request.headers.get("x-anthropic-workspace")?.trim();

  if (!apiKey) {
    // Which server is answering matters here. The deployment holds the key in
    // its environment and a local checkout usually does not, so the same
    // message on both reads as a bug on whichever one is configured.
    const local = process.env.NODE_ENV !== "production";
    return Response.json(
      {
        error: local
          ? `No ${info.label} key on this development server. Add ${info.envVar} to .env.local and restart, or paste one into Settings for this browser.`
          : `No ${info.label} key on the server. Set ${info.envVar} in the deployment's environment variables and redeploy.`,
      },
      { status: 401 },
    );
  }

  const messages = (body.messages ?? []).filter((m) =>
    typeof m.content === "string" ? m.content.trim().length > 0 : m.content.length > 0,
  );

  if (messages.length === 0) {
    return Response.json({ error: "No messages to send." }, { status: 400 });
  }

  const model = body.model || "claude-sonnet-5";

  /**
   * Anything that is not Anthropic streams through its own adapter and returns
   * here. Anthropic keeps the path below because prompt caching, server-side
   * fallbacks, and adaptive thinking have no equivalent in the others, and a
   * shared abstraction would end up shaped like Anthropic anyway.
   */
  if (provider === "openai" || provider === "google") {
    return streamThroughAdapter({ provider, model, apiKey, body, request });
  }

  const client = new Anthropic({
    apiKey,
    maxRetries: 2,
    // The SDK has no first-class option for this, and the header is the
    // documented way to name the workspace.
    ...(workspaceId ? { defaultHeaders: { "anthropic-workspace-id": workspaceId } } : {}),
  });

  /**
   * Two cache breakpoints, in render order (tools, then system, then messages).
   *
   * 1. The whole system block. Identity, persona, department prompt, company
   *    profile, and house rules are byte-identical for every message in a
   *    department, and across conversations, so this is the expensive part
   *    worth holding. It gets the 1 hour TTL because the gap between one
   *    question and the next is usually longer than five minutes.
   * 2. The final message. Today's tail is tomorrow's prefix, so each turn reads
   *    everything before it and writes only what the last turn added.
   *
   * Longer TTLs must render before shorter ones, which the order above satisfies.
   */
  const buildParams = (cached: boolean) => {
    // Anthropic wants image bytes under source.data with an explicit media
    // type, so a mixed turn is expanded into blocks here rather than upstream.
    const toBlocks = (content: string | WireContent[]): Record<string, unknown>[] =>
      typeof content === "string"
        ? [{ type: "text", text: content }]
        : content.map((block) => {
            if (block.type === "image") {
              return {
                type: "image",
                source: {
                  type: "base64",
                  media_type: block.mediaType,
                  data: block.data,
                },
              };
            }
            if (block.type === "document") {
              // PDFs are read natively. Word and text files are converted to
              // text on the client, so they never reach this branch.
              return {
                type: "document",
                title: block.name,
                source: {
                  type: "base64",
                  media_type: block.mediaType,
                  data: block.data,
                },
              };
            }
            return { type: "text", text: block.text };
          });

    const apiMessages: unknown[] = messages.map((m) => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content : toBlocks(m.content),
    }));

    if (cached && apiMessages.length > 0) {
      const last = messages[messages.length - 1];
      const blocks = toBlocks(last.content);
      // The breakpoint goes on the final block, whatever kind it is, so a turn
      // ending in an image still caches the whole prefix behind it.
      blocks[blocks.length - 1] = {
        ...blocks[blocks.length - 1],
        cache_control: { type: "ephemeral" },
      };
      apiMessages[apiMessages.length - 1] = { role: last.role, content: blocks };
    }

    return {
      model,
      max_tokens: MAX_TOKENS[model] ?? DEFAULT_MAX_TOKENS,
      /**
       * Tools render before the system block, so they sit inside the same
       * cached prefix rather than in front of it. A department's tool list is
       * as stable as its prompt, so this costs nothing after the first message.
       */
      ...(body.tools?.length
        ? {
            tools: body.tools.map((tool) => ({
              name: tool.name,
              description: tool.description,
              input_schema: tool.schema,
            })),
          }
        : {}),
      system: cached
        ? [
            {
              type: "text",
              text: body.system,
              cache_control: { type: "ephemeral", ttl: "1h" },
            },
          ]
        : body.system,
      messages: apiMessages,
      ...(MODERN_MODELS.has(model)
        ? {
            // display: "summarized" is opt-in, and the default returns empty
            // thinking text, which reads as a long pause in a chat UI.
            thinking: { type: "adaptive" as const, display: "summarized" as const },
            output_config: { effort: body.effort || "medium" },
          }
        : {}),
    };
  };

  // Holds whichever upstream stream is currently open, so a client that hangs
  // up can tear it down. Without this the browser fetch aborts, the model keeps
  // generating on Anthropic's side, and the full response is still billed.
  let upstream: { abort: () => void } | null = null;
  let clientGone = false;

  const stopUpstream = () => {
    clientGone = true;
    try {
      upstream?.abort();
    } catch {
      // Already finished or already torn down.
    }
    upstream = null;
  };

  // Fires when the browser disconnects: Stop, a closed tab, or a navigation.
  request.signal.addEventListener("abort", stopUpstream, { once: true });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let wroteContent = false;

      const runStream = async (useFallbacks: boolean, cached: boolean) => {
        const params = buildParams(cached);

        const messageStream = useFallbacks
          ? client.beta.messages.stream({
              ...params,
              betas: ["server-side-fallback-2026-07-01"],
              // Routes a refused request to a suitable model automatically.
              fallbacks: "default",
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any)
          : // eslint-disable-next-line @typescript-eslint/no-explicit-any
            client.messages.stream(params as any);

        upstream = messageStream;
        if (clientGone) {
          stopUpstream();
          return;
        }

        for await (const event of messageStream) {
          if (clientGone) break;
          if (event.type !== "content_block_delta") continue;

          if (event.delta.type === "thinking_delta") {
            controller.enqueue(frame({ type: "thinking", text: event.delta.thinking }));
          } else if (event.delta.type === "text_delta") {
            wroteContent = true;
            controller.enqueue(frame({ type: "text", text: event.delta.text }));
          }
        }

        if (clientGone) return;

        if (clientGone) return;

        const final = await messageStream.finalMessage();

        /**
         * Tool calls arrive complete rather than as deltas, so they are read
         * off the finished message. Nothing runs here: the browser owns the
         * workspace, and a write has to be approved by the person reading
         * before it happens.
         */
        for (const block of final.content) {
          if (block.type !== "tool_use") continue;
          wroteContent = true;
          controller.enqueue(
            frame({
              type: "tool",
              call: {
                id: block.id,
                name: block.name,
                input: (block.input ?? {}) as Record<string, unknown>,
              },
            }),
          );
        }

        const usage = final.usage as Anthropic.Usage & {
          cache_creation_input_tokens?: number | null;
          cache_read_input_tokens?: number | null;
        };

        const cacheRead = usage.cache_read_input_tokens ?? 0;
        const cacheWrite = usage.cache_creation_input_tokens ?? 0;

        // The usage fields are the only ground truth that caching still works,
        // so log them on every request rather than trusting it stays fixed.
        console.log(
          `[api/chat] ${model} in=${usage.input_tokens} cacheRead=${cacheRead} ` +
            `cacheWrite=${cacheWrite} out=${usage.output_tokens}` +
            (cached && cacheRead === 0 && cacheWrite === 0
              ? ` (nothing cached: prefix is likely under this model's ${
                  CACHE_MINIMUM_TOKENS[model] ?? 1024
                } token minimum)`
              : ""),
        );

        controller.enqueue(
          frame({
            type: "usage",
            usage: {
              input: usage.input_tokens,
              output: usage.output_tokens,
              cacheRead,
              cacheWrite,
            },
          }),
        );

        if (final.stop_reason === "refusal") {
          controller.enqueue(
            frame({
              type: "error",
              message:
                "The model declined to answer this one. Try rephrasing, or move it to a different department.",
            }),
          );
        } else if (final.stop_reason === "max_tokens") {
          controller.enqueue(
            frame({
              type: "error",
              message: "The response hit the length limit and stopped early.",
            }),
          );
        }
      };

      // Best request first, then degrade. Each fallback drops one optional
      // feature, so an account without a given beta still gets an answer
      // instead of an error. Only retried while nothing has been streamed yet.
      const attempts: { fallbacks: boolean; cached: boolean }[] = FALLBACK_MODELS.has(model)
        ? [
            { fallbacks: true, cached: true },
            { fallbacks: false, cached: true },
            { fallbacks: false, cached: false },
          ]
        : [
            { fallbacks: false, cached: true },
            { fallbacks: false, cached: false },
          ];

      try {
        let lastError: unknown;
        for (const attempt of attempts) {
          try {
            await runStream(attempt.fallbacks, attempt.cached);
            lastError = undefined;
            break;
          } catch (error) {
            lastError = error;
            if (clientGone) {
              lastError = undefined;
              break;
            }
            if (wroteContent) break;
            console.warn(
              `[api/chat] attempt failed (fallbacks=${attempt.fallbacks} cached=${attempt.cached}):`,
              error instanceof Error ? error.message : error,
            );
          }
        }
        if (lastError) throw lastError;
        if (!clientGone) controller.enqueue(frame({ type: "done" }));
      } catch (error) {
        if (!clientGone) {
          console.error("[api/chat]", error);
          controller.enqueue(frame({ type: "error", message: describeError(error) }));
        }
      } finally {
        request.signal.removeEventListener("abort", stopUpstream);
        upstream = null;
        try {
          controller.close();
        } catch {
          // Already closed by the cancel handler below.
        }
      }
    },

    // Called when the consumer tears the stream down rather than reading it out.
    cancel() {
      stopUpstream();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
    },
  });
}

/**
 * The streaming response for OpenAI and Gemini.
 *
 * Same NDJSON frames as the Anthropic path, so the client cannot tell which
 * provider answered except by what the reply says.
 */
function streamThroughAdapter({
  provider,
  model,
  apiKey,
  body,
  request,
}: {
  provider: Exclude<Provider, "anthropic">;
  model: string;
  apiKey: string;
  body: ChatRequestBody;
  request: NextRequest;
}): Response {
  let upstream: { abort: () => void } | null = null;
  let clientGone = false;

  const stopUpstream = () => {
    clientGone = true;
    try {
      upstream?.abort();
    } catch {
      // Already finished or already torn down.
    }
    upstream = null;
  };

  request.signal.addEventListener("abort", stopUpstream, { once: true });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: ChatStreamEvent) => {
        if (!clientGone) controller.enqueue(frame(event));
      };

      try {
        // Said before the answer, so a missing attachment is not discovered by
        // wondering why the reply ignored it.
        const dropped = droppedAttachments(body.messages ?? [], provider);
        if (dropped) emit({ type: "error", message: dropped });

        const args = {
          apiKey,
          model,
          system: body.system,
          messages: body.messages ?? [],
          effort: body.effort || ("medium" as const),
          // The same ceiling Anthropic gets, from the same table, so a reply
          // costs the same at most whichever provider answers it.
          maxTokens: MAX_TOKENS[model] ?? DEFAULT_MAX_TOKENS,
          tools: body.tools,
          emit,
          stopped: () => clientGone,
          onOpen: (handle: { abort: () => void }) => {
            upstream = handle;
            if (clientGone) stopUpstream();
          },
        };

        if (provider === "openai") await streamOpenAi(args);
        else await streamGemini(args);

        if (!clientGone) controller.enqueue(frame({ type: "done" }));
      } catch (error) {
        if (!clientGone) {
          console.error(`[api/chat] ${provider}`, error);
          emit({ type: "error", message: describeProviderError(provider, error) });
        }
      } finally {
        request.signal.removeEventListener("abort", stopUpstream);
        upstream = null;
        try {
          controller.close();
        } catch {
          // Already closed by the cancel handler below.
        }
      }
    },

    cancel() {
      stopUpstream();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
    },
  });
}

/** Reads the status off whatever the provider threw, without pretending to know its shape. */
function describeProviderError(provider: Provider, error: unknown): string {
  const info = providerInfo(provider);
  const status =
    typeof error === "object" && error && "status" in error
      ? Number((error as { status: unknown }).status)
      : undefined;

  if (status === 401 || status === 403) {
    return `That ${info.label} key was rejected. Check it in Settings.`;
  }
  if (status === 404) {
    return "That model was not found on this account. Pick a different one in Settings.";
  }
  if (status === 429) {
    return `${info.label} is rate limiting this key. Wait a moment and try again.`;
  }
  if (status && status >= 500) {
    return `${info.label} had a problem at their end. Try again in a moment.`;
  }
  /*
   * Anything unrecognised is described, not forwarded.
   *
   * This used to return `error.message` straight through to the browser. That
   * string comes from a third party's SDK and nobody here decides what is in
   * it: a request URL, an internal hostname, whatever a future version starts
   * including. None of that is the customer's to see, and the one case where
   * it would have helped is already covered by the statuses above. The real
   * error is logged where it is caught, which is where somebody debugging
   * would look anyway.
   */
  return `${info.label} could not be reached.`;
}
