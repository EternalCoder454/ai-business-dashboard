import { providerOf, type Provider } from "./providers";

/**
 * Whether a reply can actually be produced.
 *
 * Three places can hold the key, and the chat route reads them in this order:
 * the deployment's environment, then the business's own, then one typed into
 * this browser. Anything asking "is there a key" has to ask about all three or
 * it is asking about something else.
 *
 * It did not. The condition was `!serverKey && !settings.apiKey`, which skips
 * the business's own key: the whole bring-your-own-key model, and the only one
 * of the three that most people ever use. So an administrator set the key,
 * invited a colleague, and that colleague was told on every screen that there
 * was no key, because they personally had never typed one into their own
 * browser. The chat worked. Everything about it said it would not.
 *
 * By provider, because a key is not a general fact. A business on Anthropic
 * with a department pointed at Gemini has a key for one and not the other, and
 * the honest answer depends on which model is about to be used.
 */
export interface KeySources {
  /** Whether the deployment holds one, per provider. */
  serverKeys: Record<Provider, boolean>;
  /** Whether the business holds one, per provider. */
  workspaceKeys: Record<Provider, { set: boolean }>;
  /** A key typed into this browser, which is the local development case. */
  browserKey?: string;
}

export function hasKeyFor(model: string | undefined, sources: KeySources): boolean {
  const provider = providerOf(model);
  return (
    Boolean(sources.serverKeys?.[provider]) ||
    Boolean(sources.workspaceKeys?.[provider]?.set) ||
    Boolean(sources.browserKey?.trim())
  );
}
