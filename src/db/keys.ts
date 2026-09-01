import { eq } from "drizzle-orm";
import { databaseEnabled, db, requireDb } from "./client";
import * as t from "./schema";
import type { Provider } from "@/lib/providers";

/**
 * The model keys a business holds.
 *
 * Kept apart from the rest of the settings so that the difference between the
 * two is visible in the imports: everything in `repo.ts` is read into a
 * snapshot the browser gets, and nothing in this file ever is.
 */

/**
 * One name per provider, and the only place the mapping lives.
 *
 * Typed as a full record on purpose: adding a fourth provider without giving
 * it a column here is a compile error, rather than a provider that quietly
 * cannot hold a workspace key. Drizzle types each column by its own name, so
 * this holds the field and the column is looked up from it.
 */
const FIELD = {
  anthropic: "anthropicKey",
  openai: "openaiKey",
  google: "googleKey",
} satisfies Record<Provider, keyof typeof t.settings.$inferSelect>;

/** What the interface is allowed to know: whether there is one, and its tail. */
export interface KeySummary {
  set: boolean;
  /** The last four characters, so someone can tell which key is in there. */
  tail: string;
}

export type KeySummaries = Record<Provider, KeySummary>;

export const NO_KEYS: KeySummaries = {
  anthropic: { set: false, tail: "" },
  openai: { set: false, tail: "" },
  google: { set: false, tail: "" },
};

function summarise(value: string | null | undefined): KeySummary {
  const key = value?.trim() ?? "";
  return { set: Boolean(key), tail: key ? key.slice(-4) : "" };
}

/**
 * The key to bill this workspace's requests to.
 *
 * Server side only, and never returned to a browser. The caller is the chat
 * route, which already knows the workspace because it had to resolve one to
 * read anything at all.
 */
export async function workspaceKey(
  workspaceId: string,
  provider: Provider,
): Promise<string> {
  if (!databaseEnabled || !db) return "";
  try {
    const [row] = await db
      .select({ key: t.settings[FIELD[provider]] })
      .from(t.settings)
      .where(eq(t.settings.workspaceId, workspaceId))
      .limit(1);
    return row?.key?.trim() ?? "";
  } catch (error) {
    // A key that cannot be read is a reply that cannot be sent, which the
    // route reports as a missing key. Failing loudly here would turn a brief
    // database problem into a stack trace in the chat.
    console.error("[keys] could not read a workspace key", error);
    return "";
  }
}

/** Which providers this workspace can reach, for Settings. Never the keys. */
export async function keySummaries(workspaceId: string): Promise<KeySummaries> {
  if (!databaseEnabled || !db) return NO_KEYS;
  try {
    const [row] = await db
      .select({
        anthropic: t.settings.anthropicKey,
        openai: t.settings.openaiKey,
        google: t.settings.googleKey,
      })
      .from(t.settings)
      .where(eq(t.settings.workspaceId, workspaceId))
      .limit(1);
    if (!row) return NO_KEYS;
    return {
      anthropic: summarise(row.anthropic),
      openai: summarise(row.openai),
      google: summarise(row.google),
    };
  } catch (error) {
    console.error("[keys] could not read the key summary", error);
    return NO_KEYS;
  }
}

/**
 * Sets or clears one provider's key for a workspace.
 *
 * An empty string clears it, which is the only way to take one away: there is
 * no read-back, so an administrator who wants to be sure has to replace it.
 */
export async function setWorkspaceKey(
  workspaceId: string,
  provider: Provider,
  key: string,
): Promise<void> {
  const database = requireDb();
  const value = key.trim();
  const column = FIELD[provider];

  await database
    .insert(t.settings)
    .values({ workspaceId, [column]: value })
    .onConflictDoUpdate({ target: t.settings.workspaceId, set: { [column]: value } });
}
