/**
 * The API key and workspace id, held in this browser and nowhere else.
 *
 * Neither one is ever written to Postgres. `StoredSettings` omits them
 * deliberately: a hosted workspace syncs between machines, and a credential
 * that follows you between machines is a credential sitting in a database
 * waiting to leak. They are not sent to the server at rest either, only as a
 * request header on the call that needs them.
 *
 * That decision left them with nowhere to live once the workspace went hosted,
 * which is why the key appeared to vanish on save. This is that home.
 */

const STORE_KEY = "eterneon.credentials.v1";

export interface Credentials {
  /** The Anthropic key. Named without a provider because it predates the others. */
  apiKey: string;
  workspaceId: string;
  openaiKey?: string;
  googleKey?: string;
}

export const EMPTY_CREDENTIALS: Credentials = { apiKey: "", workspaceId: "" };

/** Null when this browser has never been told, which is distinct from told and empty. */
export function readCredentials(): Credentials | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Credentials>;
    return {
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
      workspaceId: typeof parsed.workspaceId === "string" ? parsed.workspaceId : "",
      openaiKey: typeof parsed.openaiKey === "string" ? parsed.openaiKey : "",
      googleKey: typeof parsed.googleKey === "string" ? parsed.googleKey : "",
    };
  } catch {
    // Private browsing, a disabled store, or a value someone hand edited.
    return null;
  }
}

/** Merges a patch over what is there and returns the result, saved or not. */
export function writeCredentials(patch: Partial<Credentials>): Credentials {
  const next = { ...(readCredentials() ?? EMPTY_CREDENTIALS), ...patch };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(next));
    } catch {
      // Nothing to do but keep it in memory for this session.
    }
  }
  return next;
}
