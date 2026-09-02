import { and, eq, isNull, lt } from "drizzle-orm";
import { requireDb } from "./client";
import * as t from "./schema";

/**
 * Making a repeated write safe to repeat.
 *
 * The case this exists for: an addon posts a task, the connection drops before
 * the reply arrives, and it has no way to tell whether the task was created.
 * Retrying is the right thing for it to do and the wrong thing for us to
 * allow, unless the second attempt returns the first one's answer.
 *
 * Claim first, then work. The claim is an insert that does nothing on
 * conflict, so two attempts racing each other resolve in the database rather
 * than in a check that was true a moment ago.
 */

/** A day is long enough for any retry worth honouring, and short enough to forget. */
const KEEP_MS = 24 * 60 * 60 * 1000;

export type Claim =
  | { state: "fresh" }
  | { state: "replay"; status: number; response: unknown }
  | { state: "running" }
  | { state: "conflict" };

/**
 * Takes the key, or says why it could not.
 *
 * - `fresh`: nobody has used this key. Do the work and call `finish`.
 * - `replay`: the same key and the same body already succeeded. Send that back.
 * - `running`: a first attempt is still in flight. The caller should try later
 *   rather than have two of these run at once.
 * - `conflict`: the key has been used with a different body, which means the
 *   caller reused a value they should not have.
 */
export async function claim(
  id: string,
  workspaceId: string,
  bodyHash: string,
): Promise<Claim> {
  const db = requireDb();

  const inserted = await db
    .insert(t.idempotency)
    .values({ id, workspaceId, bodyHash })
    .onConflictDoNothing({ target: t.idempotency.id })
    .returning({ id: t.idempotency.id });

  if (inserted.length > 0) return { state: "fresh" };

  const [existing] = await db
    .select()
    .from(t.idempotency)
    .where(and(eq(t.idempotency.id, id), eq(t.idempotency.workspaceId, workspaceId)))
    .limit(1);

  // The row belongs to another workspace, which cannot happen while the id is
  // prefixed with the API key, but a missing row here would otherwise read as
  // a fresh claim and defeat the point.
  if (!existing) return { state: "conflict" };
  if (existing.bodyHash !== bodyHash) return { state: "conflict" };
  if (existing.status === null || existing.response === null) return { state: "running" };

  return { state: "replay", status: existing.status, response: existing.response };
}

/** Records what the first attempt answered, so a retry can be given the same. */
export async function finish(
  id: string,
  status: number,
  response: unknown,
): Promise<void> {
  await requireDb()
    .update(t.idempotency)
    .set({ status, response })
    .where(eq(t.idempotency.id, id));
}

/**
 * Gives the key back when the work failed.
 *
 * A claim left behind by a request that errored would lock that key out for a
 * day, so a caller retrying after a genuine failure would be told their attempt
 * was already running and never get through.
 */
export async function release(id: string): Promise<void> {
  // isNull, not eq(status, null). In SQL `status = NULL` is never true, so the
  // eq form deleted nothing and quietly left the key claimed: a caller who
  // fixed their body and retried was told their first attempt was still
  // running, for a day. Caught by the test that retries after a 400.
  await requireDb()
    .delete(t.idempotency)
    .where(and(eq(t.idempotency.id, id), isNull(t.idempotency.status)))
    .catch(() => {});
}

/**
 * Forgets old keys.
 *
 * Called opportunistically from the write path rather than on a schedule: the
 * table only grows when somebody writes, so the writes are the right place to
 * pay for it, and one delete a day costs nothing.
 */
let sweptAt = 0;

export function sweep(): void {
  const now = Date.now();
  if (now - sweptAt < 60 * 60 * 1000) return;
  sweptAt = now;
  void requireDb()
    .delete(t.idempotency)
    .where(lt(t.idempotency.createdAt, new Date(now - KEEP_MS)))
    .catch(() => {});
}
