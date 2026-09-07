import type { TokenUsage } from "./types";

/**
 * What a reply costs, so a business can see its own bill.
 *
 * The panel is bring-your-own-key, which means the invoice arrives from
 * Anthropic or OpenAI and says nothing about which head spent it or on what.
 * The panel is the only thing that knows that: it records the tokens and the
 * model on every message. All that was missing was the price.
 *
 * Published list prices, read from each vendor's own pricing page on the date
 * below. They are an estimate and the product says so wherever a figure is
 * shown, for three reasons that are worth being honest about rather than
 * hiding: prices change and this table does not, a workspace may have
 * negotiated rates, and a business on a cloud reseller pays that reseller
 * instead. It is close enough to answer "is this costing me pounds or pence",
 * which is the question, and not close enough to reconcile an invoice with.
 *
 * A model with no entry is not free. It is unpriced, and everything downstream
 * reports it as unpriced rather than folding a zero into a total, because a
 * total that quietly omits a provider is worse than one that says it cannot
 * see it.
 */

/** When each figure below was read from the vendor's own page. */
export const PRICED_ON = "2026-09-06";

export interface ModelPrice {
  /** Dollars per million tokens. */
  input: number;
  /**
   * Writing to the cache.
   *
   * Anthropic charges a premium for this and the panel asks for the one hour
   * cache, which is 2x base input rather than the 1.25x of the five minute
   * one. Where a vendor has no separate write charge, this is the input price.
   */
  cacheWrite: number;
  /** Reading from it, which is where prompt caching actually pays. */
  cacheRead: number;
  output: number;
}

/**
 * Only what was verified.
 *
 * Deliberately not exhaustive. gpt-5.1-mini is absent because OpenAI's pricing
 * page does not list it, and the DeepSeek models are absent because their
 * pricing page could not be read. Guessing at either would produce a number
 * that looks exactly as authoritative as the six that are real.
 */
export const PRICES: Record<string, ModelPrice> = {
  // Anthropic. Cache write is the 1h rate, which is what the panel asks for.
  "claude-opus-5": { input: 5, cacheWrite: 10, cacheRead: 0.5, output: 25 },
  "claude-sonnet-5": { input: 2, cacheWrite: 4, cacheRead: 0.2, output: 10 },
  "claude-haiku-4-5": { input: 1, cacheWrite: 2, cacheRead: 0.1, output: 5 },

  // OpenAI. No separate write charge: a cached input token is simply cheaper.
  "gpt-5.1": { input: 1.25, cacheWrite: 1.25, cacheRead: 0.125, output: 10 },
  "o4-mini": { input: 1.1, cacheWrite: 1.1, cacheRead: 0.275, output: 4.4 },

  /*
   * Google. Gemini 2.5 Pro is tiered: these are the rates for prompts under
   * 200k tokens, which every prompt this panel builds is by a wide margin. A
   * head carries roughly five to fifteen thousand tokens of context, so the
   * larger tier would only ever apply to a conversation long past the point
   * where something else has gone wrong.
   */
  "gemini-2.5-pro": { input: 1.25, cacheWrite: 1.25, cacheRead: 0.125, output: 10 },
  "gemini-2.5-flash": { input: 0.3, cacheWrite: 0.3, cacheRead: 0.03, output: 2.5 },
};

/** What one search costs, on top of the tokens it puts into the answer. */
export const SEARCH_PRICES = {
  /** Anthropic's own, billed per search on the key the business already has. */
  native: 10 / 1_000,
  /** Perplexity's Search API, billed per request with no token charge. */
  perplexity: 5 / 1_000,
} as const;

/** Whether a figure can be given for this model at all. */
export function isPriced(model: string | undefined): boolean {
  return Boolean(model && model in PRICES);
}

/**
 * What one reply cost, in dollars, or null when the model has no price.
 *
 * Null rather than zero, everywhere and on purpose. A zero is a claim that the
 * reply was free, and it would sum into a total that reads as complete while
 * silently missing a provider.
 */
export function costOf(model: string | undefined, usage: TokenUsage | undefined): number | null {
  if (!model || !usage) return null;
  const price = PRICES[model];
  if (!price) return null;

  return (
    (usage.input * price.input +
      usage.output * price.output +
      usage.cacheRead * price.cacheRead +
      usage.cacheWrite * price.cacheWrite) /
    1_000_000
  );
}

/**
 * Money, at the precision the number deserves.
 *
 * A month's spend on a small business is often under a pound, and rounding it
 * to two places turns "you have spent 40 pence" into "$0.40" or, worse, four
 * separate heads each showing "$0.00" while the total is not zero. So small
 * figures keep enough places to be true, and large ones stop pretending to a
 * precision the estimate does not have.
 */
export function money(amount: number): string {
  if (amount === 0) return "$0";
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  if (amount < 1) return `$${amount.toFixed(3)}`;
  if (amount < 100) return `$${amount.toFixed(2)}`;
  return `$${Math.round(amount).toLocaleString()}`;
}
