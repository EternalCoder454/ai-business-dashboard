import { z } from "zod";

/**
 * The shapes the API accepts.
 *
 * Kept together rather than beside each route, because most of these are the
 * same few fields and the point of writing them down is that an address is
 * validated the same way wherever one arrives.
 *
 * Every string is bounded. An unbounded one is a body limit away from being
 * the only thing standing between a caller and a column, and the body limit is
 * measured in megabytes.
 */

/** Trimmed, lowercased, and actually an address. */
export const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(320)
  .refine((value) => /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(value), "not an email address");

/** An id this app generated: a prefix, then base36. Never user text. */
export const id = z.string().trim().min(1).max(128);

export const shortText = z.string().max(200);
export const mediumText = z.string().max(4_000);

export const workspaceRole = z.enum(["member", "admin"]);

/** What an administrator may change about a colleague. */
export const membersBody = z.object({
  action: z.enum(["invite", "role", "remove", "permissions"]),
  email,
  role: z.string().max(20).optional(),
  note: shortText.optional(),
  invite: z.boolean().optional(),
  // Checked again by parsePermissions, which is the one that decides what a
  // stored value means. This only keeps a string or an array out of the column.
  permissions: z.looseObject({}).nullable().optional(),
});

/** Deleting a business, which asks for the name twice on purpose. */
export const adminDeleteBody = z.object({
  person: z.string().trim().max(320).optional(),
  confirm: z.string().trim().max(320).optional(),
});

export const feedbackBody = z.object({ body: mediumText });

export const feedbackPatchBody = z.object({
  id,
  status: z.enum(["new", "done"]).optional(),
});

export const feedbackDeleteBody = z.object({ id });

export const reportsBody = z.object({
  action: z.enum(["run", "status", "delete"]),
  id: id.optional(),
  status: z.enum(["new", "reviewed", "dismissed"]).optional(),
  scope: z.enum(["deployment", "workspace"]).optional(),
});

export const messagesBody = z.object({
  to: email.optional(),
  body: mediumText.optional(),
  markRead: email.optional(),
});

export const keysBody = z.object({
  provider: z.enum(["anthropic", "openai", "google"]),
  // Empty clears the key, which is how a business removes one.
  key: z.string().max(500),
});

export const switchBody = z.object({ workspaceId: id });

export const titleBody = z.object({
  question: z.string().max(20_000).optional(),
  answer: z.string().max(20_000).optional(),
});

/** One measurement from a browser. The route checks the name against its own
 *  allowlist, so anything unrecognised is dropped rather than recorded. */
export const telemetryBody = z.object({
  operation: z.string().max(80).optional(),
  ms: z.number().finite().nonnegative().max(600_000).optional(),
  ok: z.boolean().optional(),
  errorKind: z.string().max(80).optional(),
  errorNote: z.string().max(300).optional(),
});

export const apiKeysBody = z.object({
  action: z.enum(["create", "revoke"]),
  id: id.optional(),
  name: shortText.optional(),
  scopes: z.array(z.string().max(40)).max(20).optional(),
});

export const schedulesBody = z.object({
  action: z.enum(["save", "delete", "read"]),
  id: id.optional(),
  name: shortText.optional(),
  departmentId: id.optional(),
  prompt: z.string().max(16_000).optional(),
  cadence: z.enum(["daily", "weekly", "monthly"]).optional(),
  weekday: z.number().int().min(0).max(6).optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  enabled: z.boolean().optional(),
});

export const googleIntegrationBody = z.object({
  action: z.enum(["connect", "disconnect"]),
});

/** Everything the operator screen can ask for, across every business. */
export const operatorBody = z.object({
  action: z.enum([
    "createWorkspace",
    "renameWorkspace",
    "deleteWorkspace",
    "grant",
    "revoke",
  ]),
  email: email.optional(),
  workspaceId: id.optional(),
  role: z.string().max(20).optional(),
  note: shortText.optional(),
  name: shortText.optional(),
  invite: z.boolean().optional(),
});
