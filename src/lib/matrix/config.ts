/**
 * Where the homeserver is, and the two secrets that talk to it.
 *
 * The panel is not a Matrix client. It is an application service: a thing the
 * homeserver knows about by name, which may act as any user inside a namespace
 * it owns. That is the right shape here because the panel already knows who
 * everybody is and has already signed them in, so making each of them log into
 * Matrix separately would be a second password for the same person.
 *
 * Two tokens, pointing opposite ways, and mixing them up is the classic mistake:
 *
 *   as_token  the panel sends this to the homeserver, to prove it is the
 *             appservice. It goes out.
 *   hs_token  the homeserver sends this to the panel, to prove a transaction
 *             really came from the homeserver. It comes in.
 *
 * Everything is absent until somebody sets it, and absent means off. A
 * deployment with no homeserver behaves exactly as the panel does today rather
 * than failing on a missing variable, because the migration is meant to run
 * with both message stores live and only one of them switched on.
 */

/** The base URL of the homeserver, with no trailing slash. */
export function homeserverUrl(): string {
  return (process.env.MATRIX_HOMESERVER_URL?.trim() ?? "").replace(/\/+$/, "");
}

/**
 * The server's own name, which is the part after the colon in a user id.
 *
 * Not the same thing as the URL and routinely confused with it: a server
 * reachable at https://matrix.example.com can perfectly well call itself
 * example.com, and the user ids say the latter.
 */
export function serverName(): string {
  return process.env.MATRIX_SERVER_NAME?.trim() ?? "";
}

/** Sent by the panel, to prove it is the appservice. */
export function appserviceToken(): string {
  return process.env.MATRIX_AS_TOKEN?.trim() ?? "";
}

/** Sent by the homeserver, to prove a transaction came from it. */
export function homeserverToken(): string {
  return process.env.MATRIX_HS_TOKEN?.trim() ?? "";
}

/**
 * The appservice's own user, which owns the namespace and creates the rooms.
 *
 * A room has to be made by somebody, and making it as one of the two people in
 * it means that person can leave and take the room's only administrator with
 * them.
 */
export function botLocalpart(): string {
  return process.env.MATRIX_BOT_LOCALPART?.trim() || "_eterneon_bot";
}

/**
 * Whether there is a homeserver to talk to at all.
 *
 * Checked before every call rather than at import, because the environment on a
 * running deployment is not a compile time fact and a missing variable should
 * read as "not turned on here" rather than as a crash on the first message
 * somebody sends.
 */
export function matrixConfigured(): boolean {
  return Boolean(
    homeserverUrl() && serverName() && appserviceToken() && homeserverToken(),
  );
}

/**
 * Whether messages are written to Matrix as well as to Postgres.
 *
 * Separate from being configured, so a homeserver can be stood up, pointed at,
 * and proven to work before a single real message goes near it.
 */
export function matrixDualWrite(): boolean {
  return matrixConfigured() && process.env.MATRIX_DUAL_WRITE?.trim() === "on";
}
