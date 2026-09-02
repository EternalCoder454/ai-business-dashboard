import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { databaseEnabled, db, requireDb } from "@/db/client";
import * as t from "@/db/schema";
import { decryptSecret, encryptSecret } from "@/db/secrets";

/**
 * Reading somebody's Google Calendar, and nothing else.
 *
 * A separate consent from signing in, on purpose. The sign-in flow asks for a
 * name and an address; this asks to read a diary. Bundling the two would mean
 * every new person meets a consent screen listing calendar access to use a
 * panel that mostly has nothing to do with their calendar, which is how people
 * learn to click through consent screens without reading them.
 *
 * Read only, and one scope. There is no version of this feature that needs to
 * write to somebody's calendar, and asking for less is the only part of OAuth
 * that is entirely under our control.
 */

const SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

export const googleEnabled = () =>
  Boolean(process.env.AUTH_GOOGLE_ID?.trim() && process.env.AUTH_GOOGLE_SECRET?.trim());

/** Where Google sends somebody back to. Has to match the console exactly. */
export function redirectUri(): string {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "") ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000");
  return `${base}/api/integrations/google/callback`;
}

/**
 * A state parameter that proves the callback answers a request we made.
 *
 * Without it, anybody can send a signed-in person to our callback with their
 * own authorization code and connect their calendar to that person's account.
 * That is the standard OAuth CSRF, and it is a real one here: the connection is
 * per person, so the attacker would be reading nothing, but the victim would
 * unknowingly be looking at somebody else's diary inside their own panel.
 *
 * Signed rather than stored, so no round trip and nothing to expire, with the
 * signing key being AUTH_SECRET, which already exists and is already the thing
 * that must not leak.
 */
function sign(payload: string): string {
  return createHmac("sha256", process.env.AUTH_SECRET ?? "")
    .update(payload)
    .digest("base64url");
}

export function makeState(email: string): string {
  const payload = `${email}:${Date.now()}:${randomBytes(9).toString("base64url")}`;
  return `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`;
}

/** Returns the address the flow was started for, or null. */
export function readState(state: string | null): string | null {
  if (!state) return null;
  const [encoded, signature] = state.split(".");
  if (!encoded || !signature) return null;

  let payload: string;
  try {
    payload = Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const [email, at] = payload.split(":");
  // Ten minutes is longer than any honest consent screen takes and short
  // enough that a link left in a browser history is not a working one.
  if (!email || !at || Date.now() - Number(at) > 10 * 60_000) return null;
  return email;
}

export function consentUrl(email: string): string {
  const params = new URLSearchParams({
    client_id: process.env.AUTH_GOOGLE_ID ?? "",
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPE,
    // Offline, or there is no refresh token and the connection lasts an hour.
    access_type: "offline",
    // Google only returns a refresh token on the first consent unless this is
    // set, so somebody reconnecting after a revoke would otherwise get a
    // connection with nothing to refresh it.
    prompt: "consent",
    include_granted_scopes: "true",
    state: makeState(email),
    login_hint: email,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

async function postToken(body: Record<string, string>): Promise<TokenResponse | null> {
  try {
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body).toString(),
    });
    const json = (await response.json()) as TokenResponse;
    if (!response.ok || json.error) {
      console.error("[google] token exchange refused", json.error, json.error_description);
      return null;
    }
    return json;
  } catch (error) {
    console.error("[google] token exchange failed", error);
    return null;
  }
}

/** Trades the one-time code for a refresh token, and stores it encrypted. */
export async function connect(
  email: string,
  workspaceId: string,
  code: string,
): Promise<string | null> {
  const token = await postToken({
    code,
    client_id: process.env.AUTH_GOOGLE_ID ?? "",
    client_secret: process.env.AUTH_GOOGLE_SECRET ?? "",
    redirect_uri: redirectUri(),
    grant_type: "authorization_code",
  });

  if (!token?.refresh_token) {
    return "Google did not return a refresh token. Try disconnecting it in your Google account and connecting again.";
  }
  if (!token.scope?.includes("calendar")) {
    return "Calendar access was not granted, so there is nothing to read.";
  }

  // Which Google account this actually was. Somebody signed into the panel as
  // one address can consent as another, and the screen should say which.
  let googleEmail = "";
  try {
    const who = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (who.ok) googleEmail = ((await who.json()) as { email?: string }).email ?? "";
  } catch {
    // A missing label is not worth failing the connection over.
  }

  const values = {
    userEmail: email,
    workspaceId,
    refreshToken: encryptSecret(token.refresh_token, email, "refreshToken"),
    scope: token.scope ?? "",
    googleEmail,
    updatedAt: new Date(),
  };

  await requireDb()
    .insert(t.googleConnections)
    .values(values)
    .onConflictDoUpdate({ target: t.googleConnections.userEmail, set: values });

  return null;
}

export async function disconnect(email: string): Promise<void> {
  await requireDb()
    .delete(t.googleConnections)
    .where(eq(t.googleConnections.userEmail, email));
}

export interface Connection {
  connected: boolean;
  googleEmail: string;
  connectedAt: number | null;
}

export async function connectionFor(email: string): Promise<Connection> {
  if (!databaseEnabled || !db) return { connected: false, googleEmail: "", connectedAt: null };
  const [row] = await db
    .select()
    .from(t.googleConnections)
    .where(eq(t.googleConnections.userEmail, email))
    .limit(1);
  return row
    ? { connected: true, googleEmail: row.googleEmail, connectedAt: row.createdAt.getTime() }
    : { connected: false, googleEmail: "", connectedAt: null };
}

/**
 * A fresh access token, from the stored refresh token.
 *
 * Not cached. An access token lives an hour and caching one would mean holding
 * a live credential in memory across requests on a platform that may or may not
 * be the same instance next time, to save a round trip on a page somebody opens
 * a few times a day.
 */
async function accessToken(email: string): Promise<string | null> {
  if (!databaseEnabled || !db) return null;

  const [row] = await db
    .select()
    .from(t.googleConnections)
    .where(eq(t.googleConnections.userEmail, email))
    .limit(1);
  if (!row) return null;

  const refresh = decryptSecret(row.refreshToken, email, "refreshToken");
  if (!refresh) return null;

  const token = await postToken({
    refresh_token: refresh,
    client_id: process.env.AUTH_GOOGLE_ID ?? "",
    client_secret: process.env.AUTH_GOOGLE_SECRET ?? "",
    grant_type: "refresh_token",
  });

  if (!token?.access_token) {
    // A revoked or expired grant. The row is removed rather than left to fail
    // every time, so the screen can offer to connect again instead of showing
    // an error nobody can act on.
    console.warn("[google] refresh failed, removing the connection for", email);
    await disconnect(email);
    return null;
  }

  void requireDb()
    .update(t.googleConnections)
    .set({ lastUsedAt: new Date() })
    .where(eq(t.googleConnections.userEmail, email))
    .catch(() => {});

  return token.access_token;
}

export interface CalendarEvent {
  id: string;
  title: string;
  /** Milliseconds. Both are set even for an all-day event. */
  start: number;
  end: number;
  allDay: boolean;
  location: string;
  /** Whether the person has said they are going. */
  status: string;
}

export interface CalendarResult {
  events: CalendarEvent[];
  /** Set when there is nothing to show and it is worth saying why. */
  problem?: "not-connected" | "unavailable";
}

/**
 * The next few days.
 *
 * Deliberately narrow: a start, an end, a title, and where. Not the guest list,
 * not the description, not the conferencing links. This exists so somebody can
 * see what their day looks like beside their work, and the rest of a calendar
 * entry is other people's information that the panel has no reason to hold.
 */
export async function upcoming(email: string, days = 7): Promise<CalendarResult> {
  const token = await accessToken(email);
  if (!token) return { events: [], problem: "not-connected" };

  const now = new Date();
  const until = new Date(now.getTime() + days * 86_400_000);

  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: until.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "50",
  });

  try {
    const response = await fetch(`${EVENTS_URL}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      console.error("[google] calendar refused", response.status);
      return { events: [], problem: "unavailable" };
    }

    const body = (await response.json()) as {
      items?: {
        id?: string;
        summary?: string;
        location?: string;
        status?: string;
        start?: { dateTime?: string; date?: string };
        end?: { dateTime?: string; date?: string };
      }[];
    };

    const events: CalendarEvent[] = [];
    for (const item of body.items ?? []) {
      const startsAt = item.start?.dateTime ?? item.start?.date;
      const endsAt = item.end?.dateTime ?? item.end?.date;
      if (!item.id || !startsAt) continue;
      events.push({
        id: item.id,
        // An untitled entry is a real thing in Google Calendar and reads as a
        // blank row rather than as an event without a name.
        title: item.summary?.trim() || "Busy",
        start: new Date(startsAt).getTime(),
        end: new Date(endsAt ?? startsAt).getTime(),
        allDay: Boolean(item.start?.date),
        location: item.location?.trim() ?? "",
        status: item.status ?? "confirmed",
      });
    }

    return { events };
  } catch (error) {
    console.error("[google] calendar failed", error);
    return { events: [], problem: "unavailable" };
  }
}
