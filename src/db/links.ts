import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { databaseEnabled, db, requireDb } from "./client";
import * as t from "./schema";
import { normaliseDomain } from "@/lib/links";

/**
 * The link hosts one business has agreed to, and the record of what was taken
 * out of a message because it was not on the list.
 *
 * @see lib/links for the matching, and api/messages for where it runs.
 */

export interface AllowedLink {
  domain: string;
  addedBy: string;
  createdAt: number;
}

/** Everything this business allows, oldest first. */
export async function allowedLinks(workspaceId: string): Promise<AllowedLink[]> {
  if (!databaseEnabled || !db) return [];
  const rows = await db
    .select({
      domain: t.linkAllowlist.domain,
      addedBy: t.linkAllowlist.addedBy,
      createdAt: t.linkAllowlist.createdAt,
    })
    .from(t.linkAllowlist)
    .where(eq(t.linkAllowlist.workspaceId, workspaceId))
    .orderBy(asc(t.linkAllowlist.createdAt));

  return rows.map((row) => ({
    domain: row.domain,
    addedBy: row.addedBy,
    createdAt: row.createdAt.getTime(),
  }));
}

/** Off, or keeping only the hosts on the list. */
export type LinkPolicy = "open" | "allowlist";

export interface LinkFilter {
  policy: LinkPolicy;
  domains: string[];
}

/**
 * What to do about links in this business's messages.
 *
 * Open unless somebody turned it on, because a filter nobody asked for that
 * quietly edits what colleagues send each other is not a safety feature, it is
 * a support ticket. A business switches it on when it wants it.
 *
 * Every failure here answers `open`. This runs on the send path, and a filter
 * that cannot read its own settings must not be able to stop people talking to
 * each other: the version of this that threw took every message in the product
 * down with it, including "Hey", because the table had not been created yet.
 */
export async function linkFilterFor(workspaceId: string): Promise<LinkFilter> {
  const off: LinkFilter = { policy: "open", domains: [] };
  if (!databaseEnabled || !db) return off;

  try {
    const [row] = await db
      .select({ policy: t.settings.linkPolicy })
      .from(t.settings)
      .where(eq(t.settings.workspaceId, workspaceId))
      .limit(1);

    if (row?.policy !== "allowlist") return off;

    const rows = await db
      .select({ domain: t.linkAllowlist.domain })
      .from(t.linkAllowlist)
      .where(eq(t.linkAllowlist.workspaceId, workspaceId));

    return { policy: "allowlist", domains: rows.map((entry) => entry.domain) };
  } catch (error) {
    console.error("[links] could not read the filter, leaving links alone", error);
    return off;
  }
}

/** Reads the policy on its own, for the screen that sets it. */
export async function linkPolicyFor(workspaceId: string): Promise<LinkPolicy> {
  return (await linkFilterFor(workspaceId)).policy;
}

/** Switches the filter on or off for one business. */
export async function setLinkPolicy(
  workspaceId: string,
  policy: LinkPolicy,
): Promise<void> {
  await requireDb()
    .update(t.settings)
    .set({ linkPolicy: policy })
    .where(eq(t.settings.workspaceId, workspaceId));
}

/**
 * Adds a domain, or returns why it could not be added.
 *
 * The input is normalised rather than trusted, so pasting a whole URL works
 * and a value that is not a domain is refused instead of being stored as an
 * entry that can never match anything.
 */
export async function allowLink(
  workspaceId: string,
  input: string,
  addedBy: string,
): Promise<{ ok: true; domain: string } | { ok: false; error: string }> {
  const domain = normaliseDomain(input);
  if (!domain) return { ok: false, error: "That is not a domain." };

  await requireDb()
    .insert(t.linkAllowlist)
    .values({ workspaceId, domain, addedBy })
    // Adding one twice is not a failure, and the first person to add it keeps
    // their name on it.
    .onConflictDoNothing({
      target: [t.linkAllowlist.workspaceId, t.linkAllowlist.domain],
    });

  return { ok: true, domain };
}

/** Removes one. Messages already sent are not changed: the link is long gone. */
export async function disallowLink(workspaceId: string, domain: string): Promise<void> {
  await requireDb()
    .delete(t.linkAllowlist)
    .where(
      and(
        eq(t.linkAllowlist.workspaceId, workspaceId),
        eq(t.linkAllowlist.domain, domain.trim().toLowerCase()),
      ),
    );
}

/**
 * Writes what was taken out of a message, so it reaches the Reports screen.
 *
 * A report rather than a table of its own, because it is the same job: a thing
 * somebody should look at, dismissed the same way, in the one place people
 * already check. It is also how a domain gets onto the allowlist, since the
 * row names the host and the screen puts an Allow button next to it.
 *
 * Never fails the send. A message that arrived and was not recorded is a
 * smaller problem than a message that would not send because a log did not.
 */
export async function recordStrippedLinks(input: {
  workspaceId: string;
  messageId: string;
  authorEmail: string;
  hosts: string[];
}): Promise<void> {
  if (!databaseEnabled || !db || input.hosts.length === 0) return;
  try {
    // Looked up here rather than carried in, because this runs only when a
    // link was actually taken out and the send path should not pay for a join
    // it almost never needs.
    const [space] = await db
      .select({ name: t.workspaces.name })
      .from(t.workspaces)
      .where(eq(t.workspaces.id, input.workspaceId))
      .limit(1);

    await db.insert(t.reports).values({
      id: randomUUID(),
      workspaceId: input.workspaceId,
      workspaceName: space?.name ?? "",
      source: "message",
      sourceId: input.messageId,
      authorEmail: input.authorEmail,
      category: "suspicious-link",
      severity: "low",
      reason:
        input.hosts.length === 1
          ? "A link was removed because its address is not on the allowed list."
          : `${input.hosts.length} links were removed because their addresses are not on the allowed list.`,
      // The hosts themselves, which is what somebody deciding needs to see and
      // what the Allow button on the report reads.
      quote: input.hosts.join(" "),
      transcript: "",
    });
  } catch (error) {
    console.error("[links] could not record a stripped link", error);
  }
}
