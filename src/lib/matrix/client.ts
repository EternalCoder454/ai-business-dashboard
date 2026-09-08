import { appserviceToken, homeserverUrl, matrixConfigured, serverName } from "./config";
import { localpartFor, userIdFor } from "./ids";

/**
 * The homeserver calls the panel makes, and nothing else.
 *
 * A deliberately small surface. There are Matrix client libraries and they are
 * built for clients: sync loops, device management, key storage, local echo.
 * The panel is none of those things. It is a server talking to another server
 * about five verbs, and events arrive by being pushed to a route rather than by
 * a sync loop, so a library would be a large dependency for a handful of POSTs
 * plus a lot of machinery to keep switched off.
 *
 * Everything here acts as somebody. The appservice may masquerade as any user
 * inside its namespace by putting the id in a query parameter, which is how the
 * panel sends a message that really is from the person who wrote it rather than
 * from a bot repeating what they said.
 */

/** What went wrong, kept as data because most callers want to carry on. */
export interface MatrixFailure {
  error: string;
  status?: number;
}

const TIMEOUT_MS = 10_000;

async function call<T>(
  method: "GET" | "POST" | "PUT",
  path: string,
  options: { as?: string; body?: unknown } = {},
): Promise<T | MatrixFailure> {
  if (!matrixConfigured()) return { error: "No homeserver is configured." };

  const url = new URL(`${homeserverUrl()}${path}`);
  // Masquerading. Absent means the appservice's own user, which is what makes
  // the room and invites people into it.
  if (options.as) url.searchParams.set("user_id", options.as);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${appserviceToken()}`,
        "Content-Type": "application/json",
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });

    const text = await response.text();
    const parsed: unknown = text ? JSON.parse(text) : {};
    if (!response.ok) {
      const body = parsed as { errcode?: string; error?: string };
      return {
        error: body.error || body.errcode || `Homeserver said ${response.status}.`,
        status: response.status,
      };
    }
    return parsed as T;
  } catch (error) {
    // A homeserver being down must not take the inbox with it. Every caller
    // treats a failure as "not mirrored yet" rather than as "not sent".
    return {
      error: error instanceof Error ? error.message : "The homeserver did not answer.",
    };
  } finally {
    clearTimeout(timer);
  }
}

export function failed<T>(result: T | MatrixFailure): result is MatrixFailure {
  return Boolean(result) && typeof result === "object" && "error" in (result as object);
}

/**
 * Makes sure a person exists on the homeserver.
 *
 * M_USER_IN_USE is success, not failure: the point is that the user exists
 * afterwards, and the second call to this for the same person is the normal
 * case rather than an error worth telling anybody about.
 */
export async function ensureUser(
  email: string,
  displayName?: string,
): Promise<{ userId: string } | MatrixFailure> {
  const userId = userIdFor(email, serverName());

  const made = await call<unknown>("POST", "/_matrix/client/v3/register", {
    body: { type: "m.login.application_service", username: localpartFor(email) },
  });
  if (failed(made) && made.status !== 400) return made;

  if (displayName) {
    // Best effort. A person with the wrong name on the homeserver is a
    // cosmetic problem, and refusing to send their message over it is not.
    await call<unknown>(
      "PUT",
      `/_matrix/client/v3/profile/${encodeURIComponent(userId)}/displayname`,
      { as: userId, body: { displayname: displayName } },
    );
  }

  return { userId };
}

/**
 * A private room for two people.
 *
 * Made by the appservice's own user and left in it, so the room keeps an
 * administrator when somebody leaves the business. `is_direct` is what makes a
 * client file it under people rather than under rooms.
 *
 * Unencrypted, deliberately, and the reason is written down in the migration
 * notes: the panel's withdraw-for-review keeps a transcript an administrator
 * can read, which a server that cannot read the room cannot produce. Turning
 * encryption on here without removing that feature would be claiming a
 * guarantee the panel does not make.
 */
export async function createDirectRoom(
  members: string[],
  name?: string,
): Promise<{ roomId: string } | MatrixFailure> {
  const made = await call<{ room_id: string }>("POST", "/_matrix/client/v3/createRoom", {
    body: {
      preset: "trusted_private_chat",
      is_direct: true,
      invite: members,
      name,
      // Nobody outside is meant to find this, and history is for the people in
      // it rather than for anybody who joins later.
      visibility: "private",
      initial_state: [
        {
          type: "m.room.history_visibility",
          state_key: "",
          content: { history_visibility: "invited" },
        },
      ],
    },
  });
  if (failed(made)) return made;
  return { roomId: made.room_id };
}

/** Accepting an invitation on somebody's behalf, which the appservice may do. */
export async function joinRoom(
  roomId: string,
  userId: string,
): Promise<{ ok: true } | MatrixFailure> {
  const done = await call<unknown>(
    "POST",
    `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/join`,
    { as: userId },
  );
  if (failed(done)) return done;
  return { ok: true };
}

/**
 * One message, sent as the person who wrote it.
 *
 * The transaction id is the panel's own message id, which makes this safe to
 * retry: the homeserver treats a repeat of the same transaction id from the
 * same user as the same message rather than as a second one.
 */
export async function sendText(
  roomId: string,
  userId: string,
  body: string,
  txnId: string,
): Promise<{ eventId: string } | MatrixFailure> {
  const sent = await call<{ event_id: string }>(
    "PUT",
    `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${encodeURIComponent(txnId)}`,
    { as: userId, body: { msgtype: "m.text", body } },
  );
  if (failed(sent)) return sent;
  return { eventId: sent.event_id };
}

/** Whether the homeserver is up and knows who we are. Used by the check script. */
export async function whoami(): Promise<{ user_id: string } | MatrixFailure> {
  return call<{ user_id: string }>("GET", "/_matrix/client/v3/account/whoami");
}
