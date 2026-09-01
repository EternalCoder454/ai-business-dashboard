import type { Effort } from "./types";

/**
 * Which service answers a department.
 *
 * Anthropic is the default and stays the default. A workspace that predates
 * this has no provider recorded anywhere, and everything below treats a
 * missing value as Anthropic, so nothing has to be migrated or re-saved.
 */
export type Provider = "anthropic" | "openai" | "google";

export const DEFAULT_PROVIDER: Provider = "anthropic";

export interface ProviderInfo {
  id: Provider;
  label: string;
  /** The environment variable the server reads for this provider. */
  envVar: string;
  /** What a key from this provider looks like, for the error when one is wrong. */
  keyPrefix: string;
  /** Sent as this header when the key is held in a browser rather than on the server. */
  header: string;
  consoleUrl: string;
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: "anthropic",
    label: "Anthropic",
    envVar: "ANTHROPIC_API_KEY",
    keyPrefix: "sk-ant-",
    header: "x-anthropic-key",
    consoleUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "openai",
    label: "OpenAI",
    envVar: "OPENAI_API_KEY",
    keyPrefix: "sk-",
    header: "x-openai-key",
    consoleUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "google",
    label: "Google Gemini",
    envVar: "GEMINI_API_KEY",
    keyPrefix: "AIza",
    header: "x-google-key",
    consoleUrl: "https://aistudio.google.com/apikey",
  },
];

export function providerInfo(id: Provider | undefined): ProviderInfo {
  return PROVIDERS.find((p) => p.id === (id ?? DEFAULT_PROVIDER)) ?? PROVIDERS[0];
}

export interface ModelOption {
  id: string;
  label: string;
  hint: string;
  provider: Provider;
}

/**
 * The models offered per provider.
 *
 * A short list on purpose. Every entry is one someone has to choose between,
 * and a dropdown of forty is a worse tool than a dropdown of three.
 */
export const MODELS: ModelOption[] = [
  // ------------------------------------------------------------- Anthropic
  {
    id: "claude-sonnet-5",
    label: "Claude Sonnet 5",
    hint: "default, best cost per token",
    provider: "anthropic",
  },
  {
    id: "claude-opus-5",
    label: "Claude Opus 5",
    hint: "most capable, roughly 2.5x the cost",
    provider: "anthropic",
  },
  {
    id: "claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    hint: "fastest and cheapest",
    provider: "anthropic",
  },
  // ---------------------------------------------------------------- OpenAI
  { id: "gpt-5.1", label: "GPT-5.1", hint: "general purpose", provider: "openai" },
  { id: "gpt-5.1-mini", label: "GPT-5.1 mini", hint: "cheaper and faster", provider: "openai" },
  { id: "o4-mini", label: "o4-mini", hint: "reasoning, cheap", provider: "openai" },
  // ---------------------------------------------------------------- Google
  {
    id: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    hint: "long context, strong reasoning",
    provider: "google",
  },
  {
    id: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    hint: "fast and cheap",
    provider: "google",
  },
];

/** The provider a model belongs to, or the default when the id is unknown. */
export function providerOf(model: string | undefined): Provider {
  return MODELS.find((m) => m.id === model)?.provider ?? DEFAULT_PROVIDER;
}

export function modelsFor(provider: Provider): ModelOption[] {
  return MODELS.filter((m) => m.provider === provider);
}

export function defaultModelFor(provider: Provider): string {
  return modelsFor(provider)[0]?.id ?? MODELS[0].id;
}

/**
 * How hard each provider is told to think.
 *
 * The five levels are Anthropic's. OpenAI takes four, and Gemini takes a
 * thinking budget in tokens, so both are mapped rather than passed through.
 */
export function openAiEffort(effort: Effort): "minimal" | "low" | "medium" | "high" {
  if (effort === "low") return "low";
  if (effort === "medium") return "medium";
  return "high";
}

export function geminiThinkingBudget(effort: Effort): number {
  switch (effort) {
    case "low":
      return 1024;
    case "medium":
      return 4096;
    case "high":
      return 8192;
    case "xhigh":
      return 16384;
    default:
      // -1 asks Gemini to decide for itself, which is what "max" means here.
      return -1;
  }
}
