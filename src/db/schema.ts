import { relations } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type {
  AllHandsResponse,
  Attachment,
  ToolCallRecord,
  WikiBlock,
} from "@/lib/types";

/**
 * Every row belongs to a workspace, not to a person.
 *
 * It used to be the signed-in email, which made one account and one workspace
 * the same thing and left no way for two people at the same business to see
 * the same departments, skills, and memory. The workspace is now its own
 * record, `access` says who may open which one, and the email is only ever an
 * identity.
 *
 * Identity that follows the person rather than the business stays keyed by
 * email: see `accounts` below, which is who you are, not where you work.
 */
const workspace = () => text("workspace_id").notNull();
const created = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updated = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const departments = pgTable(
  "departments",
  {
    id: text("id").notNull(),
    workspaceId: workspace(),
    name: text("name").notNull(),
    avatarUrl: text("avatar_url"),
    personal: boolean("personal").notNull().default(false),
    personaName: text("persona_name").notNull().default(""),
    roleTitle: text("role_title").notNull(),
    persona: text("persona").notNull().default(""),
    systemPrompt: text("system_prompt").notNull().default(""),
    // Null means the workspace default, which is every department until one is
    // pointed somewhere else.
    model: text("model"),
    status: text("status").notNull().default("online"),
    sortOrder: integer("sort_order").notNull().default(0),
    isCeo: boolean("is_ceo").notNull().default(false),
    createdAt: created(),
    updatedAt: updated(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    index("departments_ws_idx").on(table.workspaceId, table.sortOrder),
  ],
);

/**
 * Projects cut across departments, so they are their own table rather than a
 * column on anything. Membership is a nullable project_id on the rows that can
 * belong to one, which keeps a conversation perfectly usable with no project.
 *
 * There is no foreign key to projects on purpose. Deleting a project unlinks
 * its work rather than cascading, and a nullable column expresses that without
 * needing ON DELETE SET NULL to agree with the client reducer.
 */
export const projects = pgTable(
  "projects",
  {
    id: text("id").notNull(),
    workspaceId: workspace(),
    name: text("name").notNull(),
    summary: text("summary").notNull().default(""),
    status: text("status").notNull().default("active"),
    accent: text("accent").notNull().default("violet"),
    dueOn: text("due_on").notNull().default(""),
    createdAt: created(),
    updatedAt: updated(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    index("projects_ws_idx").on(table.workspaceId, table.updatedAt),
  ],
);

export const conversations = pgTable(
  "conversations",
  {
    id: text("id").notNull(),
    workspaceId: workspace(),
    departmentId: text("department_id").notNull(),
    projectId: text("project_id"),
    title: text("title").notNull(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    index("conversations_ws_idx").on(table.workspaceId, table.updatedAt),
    index("conversations_project_idx").on(table.workspaceId, table.projectId),
  ],
);

/**
 * Messages are their own table rather than a JSON array on the conversation.
 *
 * The Dexie version rewrote the entire message array on every turn, which was
 * survivable locally and would be absurd over the wire: one reply to a thread
 * holding three screenshots meant re-uploading all of them.
 */
export const messages = pgTable(
  "messages",
  {
    id: text("id").notNull(),
    workspaceId: workspace(),
    conversationId: text("conversation_id").notNull(),
    role: text("role").notNull(),
    content: text("content").notNull().default(""),
    thinking: text("thinking"),
    isError: boolean("is_error").notNull().default(false),
    /** File ids, resolved against the files table. Kept out of the row itself. */
    attachmentIds: jsonb("attachment_ids").$type<string[]>().notNull().default([]),
    /**
     * Who wrote it, when that is not the conversation's owner.
     *
     * user_email stays the scope key so a conversation's rows are found
     * together. In a shared project several people write into one conversation,
     * and without this every message would appear to be the owner's.
     */
    authorEmail: text("author_email"),
    /**
     * Actions this reply proposed, and what became of each.
     *
     * On the message rather than in its own table: they are only ever read
     * back with the message they belong to, and a card that has been approved
     * is part of the transcript rather than a record in its own right.
     */
    toolCalls: jsonb("tool_calls").$type<ToolCallRecord[]>(),
    /**
     * What the reply cost, on assistant rows only.
     *
     * Recorded per message rather than summed somewhere, because the question
     * an owner asks later is which person and which department spent it, and
     * a running total cannot be taken apart again.
     */
    model: text("model"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    sentAt: bigint("sent_at", { mode: "number" }).notNull(),
    createdAt: created(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    index("messages_conversation_idx").on(table.workspaceId, table.conversationId, table.sentAt),
  ],
);

export const skills = pgTable(
  "skills",
  {
    id: text("id").notNull(),
    workspaceId: workspace(),
    /** A department id, or the company sentinel for one every head inherits. */
    departmentId: text("department_id").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    content: text("content").notNull().default(""),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: created(),
    updatedAt: updated(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    index("skills_ws_idx").on(table.workspaceId, table.departmentId),
  ],
);

export const deliverables = pgTable(
  "deliverables",
  {
    id: text("id").notNull(),
    workspaceId: workspace(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    departmentId: text("department_id").notNull(),
    projectId: text("project_id"),
    status: text("status").notNull().default("backlog"),
    sourceConversationId: text("source_conversation_id"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    index("deliverables_ws_idx").on(table.workspaceId, table.status),
  ],
);

/**
 * Every attachment lives here, whether it was uploaded to the Library or
 * dropped straight into a chat. Storing them once means a file used in three
 * conversations is held once, and the Library can show everything the studio
 * has ever handed to a head.
 */
export const files = pgTable(
  "files",
  {
    id: text("id").notNull(),
    workspaceId: workspace(),
    kind: text("kind").notNull(),
    mediaType: text("media_type").notNull(),
    name: text("name").notNull(),
    /** Base64 for images and PDFs, empty for documents. */
    data: text("data").notNull().default(""),
    /** Extracted text for documents the API cannot read directly. */
    textContent: text("text_content"),
    width: integer("width").notNull().default(0),
    height: integer("height").notNull().default(0),
    size: integer("size").notNull().default(0),
    departmentId: text("department_id"),
    projectId: text("project_id"),
    note: text("note"),
    /** upload for the Library, chat for something attached in a conversation. */
    origin: text("origin").notNull().default("upload"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    index("files_ws_idx").on(table.workspaceId, table.kind),
  ],
);

export const allHandsRuns = pgTable(
  "all_hands_runs",
  {
    id: text("id").notNull(),
    workspaceId: workspace(),
    title: text("title").notNull(),
    status: text("status").notNull().default("done"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    index("all_hands_ws_idx").on(table.workspaceId, table.updatedAt),
  ],
);

/**
 * A round's responses stay as jsonb. They are written once when the round
 * finishes and only ever read as a set, so splitting them into rows would add
 * a join for no query anyone makes.
 */
export const allHandsRounds = pgTable(
  "all_hands_rounds",
  {
    id: text("id").notNull(),
    workspaceId: workspace(),
    runId: text("run_id").notNull(),
    question: text("question").notNull(),
    responses: jsonb("responses").$type<AllHandsResponse[]>().notNull().default([]),
    synthesis: text("synthesis"),
    synthesisError: boolean("synthesis_error").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: created(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    index("rounds_run_idx").on(table.workspaceId, table.runId, table.sortOrder),
  ],
);

/**
 * Identity, as opposed to the company profile below. Name and avatar come from
 * Google on each sign in; the rest is the person's own.
 */
export const accounts = pgTable("accounts", {
  userEmail: text("user_email").primaryKey(),
  displayName: text("display_name").notNull().default(""),
  roleTitle: text("role_title").notNull().default("Founder"),
  pronouns: text("pronouns").notNull().default(""),
  timezone: text("timezone").notNull().default(""),
  expertise: text("expertise").notNull().default(""),
  preferences: text("preferences").notNull().default(""),
  currentFocus: text("current_focus").notNull().default(""),
  notes: text("notes").notNull().default(""),
  avatarUrl: text("avatar_url"),
  /**
   * auto or dnd. Auto means the dot follows whether they are actually here;
   * do-not-disturb is a thing a person says about themselves and no amount of
   * activity should override it.
   */
  presence: text("presence").notNull().default("auto"),
  /** Touched while the app is open, so "here now" can be told from "has an account". */
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  updatedAt: updated(),
});

export const profiles = pgTable("profiles", {
  workspaceId: text("workspace_id").primaryKey(),
  mission: text("mission").notNull().default(""),
  audience: text("audience").notNull().default(""),
  brandVoice: text("brand_voice").notNull().default(""),
  keyFacts: text("key_facts").notNull().default(""),
  products: text("products").notNull().default(""),
  stage: text("stage").notNull().default(""),
  competitors: text("competitors").notNull().default(""),
  constraints: text("constraints").notNull().default(""),
  goals: text("goals").notNull().default(""),
  updatedAt: updated(),
});

/**
 * Settings for one business, including its model keys.
 *
 * The keys used to be refused a column here on the grounds that a credential
 * in a database is a credential in a database dump. That was right when a
 * workspace was one person: the key lived in their browser and rode along as a
 * request header. It stops being right when a workspace is a company. The
 * owner buys the capacity and the staff use it, so a key in each employee's
 * browser means every one of them holds the company's billing credential, on
 * every device they sign in from, and losing one is a rotation.
 *
 * So they live here, and the trade is paid for rather than ignored: these
 * columns are never read into the workspace snapshot, only ever a boolean and
 * the last four characters, and only an admin can write them. The key itself
 * goes from this table to the model and nowhere else, which also takes it out
 * of the request headers it used to travel in.
 */
export const settings = pgTable("settings", {
  workspaceId: text("workspace_id").primaryKey(),
  anthropicKey: text("anthropic_key").notNull().default(""),
  openaiKey: text("openai_key").notNull().default(""),
  googleKey: text("google_key").notNull().default(""),
  model: text("model").notNull().default("claude-sonnet-5"),
  effort: text("effort").notNull().default("medium"),
  theme: text("theme").notNull().default("dark"),
  companyName: text("company_name").notNull().default("Your Company"),
  companySubtitle: text("company_subtitle").notNull().default(""),
  writingRules: text("writing_rules").notNull().default(""),
  roomBrevity: text("room_brevity").notNull().default("tight"),
  companyMark: text("company_mark").notNull().default("HQ"),
  companyLogoUrl: text("company_logo_url"),
  sidebarSide: text("sidebar_side").notNull().default("left"),
  searchShortcut: text("search_shortcut").notNull().default("slash"),
  wikiTitle: text("wiki_title").notNull().default("Internal Wiki"),
  wikiSubtitle: text("wiki_subtitle").notNull().default("2 minute read"),
  updatedAt: updated(),
});

/**
 * The studio's own record: decisions that stand, and figures that were true on
 * a date. Read into every head's prompt, so this is the table that makes the
 * advice specific to this business rather than to businesses in general.
 */
export const memory = pgTable(
  "memory",
  {
    id: text("id").notNull(),
    workspaceId: workspace(),
    kind: text("kind").notNull(),
    label: text("label").notNull(),
    value: text("value").notNull().default(""),
    detail: text("detail").notNull().default(""),
    revisitWhen: text("revisit_when").notNull().default(""),
    departmentId: text("department_id").notNull(),
    projectId: text("project_id"),
    occurredAt: bigint("occurred_at", { mode: "number" }).notNull(),
    archived: boolean("archived").notNull().default(false),
    sourceConversationId: text("source_conversation_id"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    // The prompt reads the live entries for one head, newest first.
    index("memory_ws_idx").on(table.workspaceId, table.archived, table.occurredAt),
  ],
);

/**
 * Things to do. Separate from deliverables, which are things produced: "what
 * have we made" and "what is outstanding" are different questions.
 */
export const tasks = pgTable(
  "tasks",
  {
    id: text("id").notNull(),
    workspaceId: workspace(),
    title: text("title").notNull(),
    notes: text("notes").notNull().default(""),
    status: text("status").notNull().default("todo"),
    departmentId: text("department_id").notNull(),
    projectId: text("project_id"),
    dueAt: bigint("due_at", { mode: "number" }),
    sortOrder: integer("sort_order").notNull().default(0),
    sourceConversationId: text("source_conversation_id"),
    completedAt: bigint("completed_at", { mode: "number" }),
    createdAt: created(),
    updatedAt: updated(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    index("tasks_ws_idx").on(table.workspaceId, table.status, table.sortOrder),
  ],
);

/** The internal wiki, so an installation can write its own. */
export const wikiPages = pgTable(
  "wiki_pages",
  {
    id: text("id").notNull(),
    workspaceId: workspace(),
    title: text("title").notNull(),
    blurb: text("blurb").notNull().default(""),
    body: text("body").notNull().default(""),
    blocks: jsonb("blocks").$type<WikiBlock[]>(),
    sortOrder: integer("sort_order").notNull().default(0),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: created(),
    updatedAt: updated(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    index("wiki_ws_idx").on(table.workspaceId, table.sortOrder),
  ],
);

export const conversationRelations = relations(conversations, ({ many }) => ({
  messages: many(messages),
}));

export const messageRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.workspaceId, messages.conversationId],
    references: [conversations.workspaceId, conversations.id],
  }),
}));

export const runRelations = relations(allHandsRuns, ({ many }) => ({
  rounds: many(allHandsRounds),
}));

export const roundRelations = relations(allHandsRounds, ({ one }) => ({
  run: one(allHandsRuns, {
    fields: [allHandsRounds.workspaceId, allHandsRounds.runId],
    references: [allHandsRuns.workspaceId, allHandsRuns.id],
  }),
}));

export type AttachmentRow = typeof files.$inferSelect;
export type StoredAttachment = Attachment;

/**
 * Direct messages between two people.
 *
 * The only table here that is not scoped by a single owner, and deliberately
 * so. Every other row belongs to one workspace; a message belongs to two, and
 * scoping it by `user_email` would mean storing it twice and keeping the copies
 * in step forever.
 *
 * `thread_key` is the two addresses sorted and joined, so a conversation has
 * one stable key whichever direction a message travels. Sorting is what makes
 * it stable: without it, A-to-B and B-to-A would be different threads.
 */
export const directMessages = pgTable(
  "direct_messages",
  {
    id: text("id").primaryKey(),
    /** Whose workspace this conversation happened in. */
    workspaceId: workspace(),
    threadKey: text("thread_key").notNull(),
    fromEmail: text("from_email").notNull(),
    toEmail: text("to_email").notNull(),
    body: text("body").notNull(),
    sentAt: bigint("sent_at", { mode: "number" }).notNull(),
    /** Null until the recipient has actually opened the thread. */
    readAt: bigint("read_at", { mode: "number" }),
    createdAt: created(),
  },
  (table) => [
    // Reading one thread, newest last. The common query by a wide margin.
    index("dm_thread_idx").on(table.threadKey, table.sentAt),
    // Unread counts, which the navigation badge asks for on a timer.
    index("dm_unread_idx").on(table.toEmail, table.readAt),
    // The overview needs everything either address touched, in one pass.
    index("dm_from_idx").on(table.fromEmail, table.sentAt),
  ],
);

/**
 * Who a project is shared with.
 *
 * A project still belongs to the person who made it; this grants read and write
 * to other people rather than transferring ownership. Membership is what makes
 * the project's conversations reachable by more than one account, so it is the
 * single place a sharing decision is recorded.
 */

/**
 * Who is allowed to sign in, and who may review other people's work.
 *
 * This used to be two environment variables, which meant adding one beta
 * tester was a dashboard edit and a redeploy, and revoking someone was the
 * same again. The addresses in ALLOWED_EMAILS and ADMIN_EMAILS still work and
 * still win: they are the way back in if this table is empty, wrong, or the
 * database is unreachable during a sign-in.
 *
 * Revoking sets `revokedAt` rather than deleting the row, so a mistake is
 * reversible and there is a record of who was invited and by whom.
 */
export const access = pgTable(
  "access",
  {
    /** Lowercased. Google's address is the whole identity, as everywhere else. */
    email: text("email").primaryKey(),
    /** The workspace this address opens. One each, for now. */
    workspaceId: text("workspace_id").notNull(),
    /** member or admin. Admin adds reviewing other people's conversations. */
    role: text("role").notNull().default("member"),
    /** Who this is, in the inviter's words. Shown in Admin, never sent anywhere. */
    note: text("note"),
    invitedBy: text("invited_by"),
    createdAt: created(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    /** Set on each successful sign-in, so an unused invite is visible as one. */
    lastSignedInAt: timestamp("last_signed_in_at", { withTimezone: true }),
  },
  (table) => [index("access_revoked_idx").on(table.revokedAt)],
);

/**
 * One business.
 *
 * Every data table above is scoped to one of these rather than to a person, so
 * inviting a second colleague into a company means adding a row to `access`
 * pointing at the same workspace, not copying anything.
 */
export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey(),
  /** What the business is called, shown in the operator list. */
  name: text("name").notNull(),
  /** Why it exists, in the operator's words. Never shown to the customer. */
  note: text("note"),
  createdBy: text("created_by"),
  createdAt: created(),
  updatedAt: updated(),
});

/**
 * What someone using the panel wanted to say about it.
 *
 * The name, address, and business are copied in at the time of writing rather
 * than joined at read time. A person leaves, a business is renamed, a
 * workspace is deleted, and the note should still say who sent it and from
 * where. It is a record of a moment, not a live view of one.
 */
export const feedback = pgTable(
  "feedback",
  {
    id: text("id").primaryKey(),
    workspaceId: workspace(),
    /** As it was called when this was sent. */
    workspaceName: text("workspace_name").notNull().default(""),
    email: text("email").notNull(),
    displayName: text("display_name").notNull().default(""),
    body: text("body").notNull(),
    /** new or done. An operator marks it off once it has been dealt with. */
    status: text("status").notNull().default("new"),
    createdAt: created(),
  },
  (table) => [index("feedback_status_idx").on(table.status, table.createdAt)],
);

/**
 * A key that lets something outside the panel act as one business.
 *
 * Only the SHA-256 of the token is kept. There is no route that returns a key
 * and no column that could: the plaintext exists once, in the response that
 * created it, and after that the only things anyone can see are the prefix and
 * the last four characters. A stolen database dump is a list of hashes.
 *
 * Scoped to a workspace rather than to a person on purpose. An addon belongs to
 * the business and should keep working when the person who set it up leaves,
 * which is the opposite of how a session behaves.
 */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    workspaceId: workspace(),
    /** What it is for, in the owner's words. */
    name: text("name").notNull().default(""),
    /** SHA-256 of the token, hex. Never the token. */
    tokenHash: text("token_hash").notNull(),
    /** The visible head of the key, so a row can be told apart at a glance. */
    prefix: text("prefix").notNull(),
    last4: text("last4").notNull().default(""),
    /** Space separated. `tasks:read`, `tasks:write`, and so on. */
    scopes: text("scopes").notNull().default("tasks:read"),
    createdBy: text("created_by").notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: created(),
  },
  (table) => [
    uniqueIndex("api_keys_hash_idx").on(table.tokenHash),
    index("api_keys_ws_idx").on(table.workspaceId, table.createdAt),
  ],
);

/**
 * Something in a business's own writing that a person should look at.
 *
 * Written by the reviewer, read only by an operator. It deliberately stores a
 * short quote and a reason rather than the conversation: the point is to raise
 * a hand, not to build a searchable copy of everybody's messages somewhere
 * else. Whoever acts on one can open the original.
 */
export const reports = pgTable(
  "reports",
  {
    id: text("id").primaryKey(),
    workspaceId: workspace(),
    /** As it was called when this was raised. */
    workspaceName: text("workspace_name").notNull().default(""),
    /** `message` or `conversation`. */
    source: text("source").notNull(),
    /** The message or conversation row this came from, for opening it. */
    sourceId: text("source_id").notNull().default(""),
    /** Who wrote the thing, when the source has an author. */
    authorEmail: text("author_email").notNull().default(""),
    /** harassment, malware, threat, and so on. The reviewer's own word. */
    category: text("category").notNull(),
    /** low, medium, high. */
    severity: text("severity").notNull().default("medium"),
    /** Why this was raised, in a sentence. */
    reason: text("reason").notNull().default(""),
    /** A short verbatim quote, so an operator can judge without reading everything. */
    quote: text("quote").notNull().default(""),
    /** new, reviewed, or dismissed. */
    status: text("status").notNull().default("new"),
    createdAt: created(),
  },
  (table) => [
    index("reports_status_idx").on(table.status, table.createdAt),
    index("reports_ws_idx").on(table.workspaceId, table.createdAt),
  ],
);

/**
 * How far the reviewer has read, per workspace.
 *
 * Without it every run would re-read the whole history and raise the same
 * report again. Keyed by workspace so one busy business never delays another.
 */
export const reviewCursors = pgTable("review_cursors", {
  workspaceId: text("workspace_id").primaryKey(),
  /** Newest message timestamp already considered. */
  messagesThrough: bigint("messages_through", { mode: "number" }).notNull().default(0),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  updatedAt: updated(),
});

/**
 * One remembered answer per write somebody promised not to repeat.
 *
 * An addon that times out waiting for a reply has no way to know whether the
 * task was created, so the safe thing for it to do is try again, and the safe
 * thing for us to do is make the second attempt return the first one's answer
 * instead of a second task.
 *
 * The body is fingerprinted alongside the key, so replaying the same
 * Idempotency-Key with different content is refused rather than quietly
 * handed somebody else's result. Rows are keyed per API key, so two
 * integrations picking the same value never collide.
 */
export const idempotency = pgTable(
  "idempotency",
  {
    /** `<api key id>:<the Idempotency-Key header>`. */
    id: text("id").primaryKey(),
    workspaceId: workspace(),
    /** SHA-256 of the request body, so a different body is a conflict. */
    bodyHash: text("body_hash").notNull(),
    /** Null while the first attempt is still running. */
    status: integer("status"),
    response: jsonb("response").$type<unknown>(),
    createdAt: created(),
  },
  (table) => [index("idempotency_age_idx").on(table.createdAt)],
);

/**
 * Something a business asks for on a rhythm rather than by remembering.
 *
 * Two of the shipped skills are called Weekly Priority Call and Monthly Books
 * Check. Those are rhythms, and nothing ran them, so they happened twice and
 * then never. A schedule is a question put to one head on a cadence, and the
 * answer waits in the panel for whenever somebody next opens it.
 *
 * Cadence is stored as its parts rather than a cron string. Nobody setting up
 * a weekly review should have to write `0 9 * * 1`, and the parts are what the
 * screen asks for anyway.
 */
export const schedules = pgTable(
  "schedules",
  {
    id: text("id").primaryKey(),
    workspaceId: workspace(),
    /** What it is called on the screen. */
    name: text("name").notNull(),
    /** Which head answers it. */
    departmentId: text("department_id").notNull(),
    /** The question, in the owner's words. */
    prompt: text("prompt").notNull(),
    /** daily, weekly, or monthly. */
    cadence: text("cadence").notNull().default("weekly"),
    /** 0 is Sunday. Only read for a weekly cadence. */
    weekday: integer("weekday").notNull().default(1),
    /** 1 to 28, kept below 29 so every month has one. Monthly only. */
    dayOfMonth: integer("day_of_month").notNull().default(1),
    enabled: boolean("enabled").notNull().default(true),
    createdBy: text("created_by").notNull(),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    createdAt: created(),
    updatedAt: updated(),
  },
  (table) => [index("schedules_ws_idx").on(table.workspaceId, table.enabled)],
);

/**
 * One answer a schedule produced.
 *
 * Kept rather than emailed, because the panel is already somewhere they sign
 * in and an email is one more thing to unsubscribe from. Read state is per
 * business rather than per person: a briefing is addressed to the business, and
 * two administrators do not each need to dismiss it.
 */
export const briefings = pgTable(
  "briefings",
  {
    id: text("id").primaryKey(),
    workspaceId: workspace(),
    /** Null once the schedule that made it has been deleted. */
    scheduleId: text("schedule_id"),
    /** As the schedule was called when this ran. */
    scheduleName: text("schedule_name").notNull().default(""),
    departmentId: text("department_id").notNull(),
    title: text("title").notNull(),
    /** Markdown, the same as a deliverable, so it exports the same way. */
    body: text("body").notNull().default(""),
    /** Set when somebody in the business has opened it. */
    readAt: timestamp("read_at", { withTimezone: true }),
    /** What it cost, so a business can see what its rhythms are worth. */
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    createdAt: created(),
  },
  (table) => [index("briefings_ws_idx").on(table.workspaceId, table.createdAt)],
);

/**
 * One person's connection to their own Google Calendar.
 *
 * Keyed by the person rather than the business, because it is their calendar.
 * Two people in the same company connect separately and see their own, and
 * somebody leaving takes their connection with them.
 *
 * The refresh token is encrypted with the same master key the model keys use.
 * It is the more dangerous of the two: a model key spends money, and this reads
 * somebody's diary until it is revoked.
 *
 * Deliberately not part of signing in. Asking every new person for calendar
 * access at the door, to use a panel that mostly has nothing to do with their
 * calendar, is how a consent screen teaches people to click through consent
 * screens.
 */
export const googleConnections = pgTable("google_connections", {
  userEmail: text("user_email").primaryKey(),
  workspaceId: workspace(),
  /** Encrypted. There is no route that returns it. */
  refreshToken: text("refresh_token").notNull(),
  /** What Google actually granted, which can be less than was asked for. */
  scope: text("scope").notNull().default(""),
  /** The Google account that was connected, which need not be the sign-in one. */
  googleEmail: text("google_email").notNull().default(""),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: created(),
  updatedAt: updated(),
});

/**
 * How the deployment is behaving, per business, in hourly buckets.
 *
 * Rolled up rather than one row per request. A row per request is a second
 * database write on every request, and a table that grows faster than
 * everything it is measuring, which is a strange thing to add during a
 * performance pass. An hour of one operation in one business is one row no
 * matter how many times it ran.
 *
 * The id is derived from those three things rather than random, so instances
 * that never speak to each other still merge into the same row: every write is
 * an upsert that adds to what is already there.
 *
 * What is deliberately not here: no email, no address, no title, no message,
 * no prompt, no query string, no user agent. A workspace id and the name of an
 * operation. The error note is scrubbed and truncated before it is stored, and
 * the scrubbing happens where the error is caught rather than here.
 */
export const telemetry = pgTable(
  "telemetry",
  {
    /** `${workspaceId}:${operation}:${bucket}`. */
    id: text("id").primaryKey(),
    workspaceId: workspace(),
    /** `workspace.load`, `chat.stream`, and so on. Ours, never user text. */
    operation: text("operation").notNull(),
    /** Whether this came from a server route or a browser. */
    source: text("source").notNull().default("server"),
    /** Start of the hour this row covers, epoch ms. */
    bucket: bigint("bucket", { mode: "number" }).notNull(),
    calls: integer("calls").notNull().default(0),
    errors: integer("errors").notNull().default(0),
    /**
     * Summed, not averaged. An average cannot be merged across instances
     * without knowing how many each one saw; a sum and a count can.
     */
    totalMs: bigint("total_ms", { mode: "number" }).notNull().default(0),
    maxMs: integer("max_ms").notNull().default(0),
    /** Calls over the slow threshold. A cheap stand-in for a percentile. */
    slow: integer("slow").notNull().default(0),
    /** A short classification we assign, never the raw message. */
    lastErrorKind: text("last_error_kind"),
    /** Scrubbed and truncated. Empty when nothing has failed. */
    lastErrorNote: text("last_error_note").notNull().default(""),
    lastErrorAt: bigint("last_error_at", { mode: "number" }),
    updatedAt: updated(),
  },
  (table) => [
    // The operator view: one business, newest hours first.
    index("telemetry_ws_idx").on(table.workspaceId, table.bucket),
    // The prune, and the deployment-wide view across every business.
    index("telemetry_bucket_idx").on(table.bucket),
  ],
);
