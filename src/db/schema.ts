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
} from "drizzle-orm/pg-core";
import type { AllHandsResponse, Attachment } from "@/lib/types";

/**
 * Every row is scoped by the signed-in email.
 *
 * There is no users table on purpose. Auth is JWT only with a Google provider
 * and an allowlist, so the email is the whole identity and a table mapping it
 * to itself would earn nothing.
 */
const owner = () => text("user_email").notNull();
const created = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updated = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const departments = pgTable(
  "departments",
  {
    id: text("id").notNull(),
    userEmail: owner(),
    name: text("name").notNull(),
    emoji: text("emoji").notNull(),
    personaName: text("persona_name").notNull().default(""),
    roleTitle: text("role_title").notNull(),
    persona: text("persona").notNull().default(""),
    systemPrompt: text("system_prompt").notNull().default(""),
    status: text("status").notNull().default("online"),
    sortOrder: integer("sort_order").notNull().default(0),
    isCeo: boolean("is_ceo").notNull().default(false),
    createdAt: created(),
    updatedAt: updated(),
  },
  (table) => [
    primaryKey({ columns: [table.userEmail, table.id] }),
    index("departments_owner_idx").on(table.userEmail, table.sortOrder),
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
    userEmail: owner(),
    name: text("name").notNull(),
    summary: text("summary").notNull().default(""),
    status: text("status").notNull().default("active"),
    accent: text("accent").notNull().default("violet"),
    dueOn: text("due_on").notNull().default(""),
    createdAt: created(),
    updatedAt: updated(),
  },
  (table) => [
    primaryKey({ columns: [table.userEmail, table.id] }),
    index("projects_owner_idx").on(table.userEmail, table.updatedAt),
  ],
);

export const conversations = pgTable(
  "conversations",
  {
    id: text("id").notNull(),
    userEmail: owner(),
    departmentId: text("department_id").notNull(),
    projectId: text("project_id"),
    title: text("title").notNull(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (table) => [
    primaryKey({ columns: [table.userEmail, table.id] }),
    index("conversations_owner_idx").on(table.userEmail, table.updatedAt),
    index("conversations_project_idx").on(table.userEmail, table.projectId),
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
    userEmail: owner(),
    conversationId: text("conversation_id").notNull(),
    role: text("role").notNull(),
    content: text("content").notNull().default(""),
    thinking: text("thinking"),
    isError: boolean("is_error").notNull().default(false),
    /** File ids, resolved against the files table. Kept out of the row itself. */
    attachmentIds: jsonb("attachment_ids").$type<string[]>().notNull().default([]),
    sentAt: bigint("sent_at", { mode: "number" }).notNull(),
    createdAt: created(),
  },
  (table) => [
    primaryKey({ columns: [table.userEmail, table.id] }),
    index("messages_conversation_idx").on(table.userEmail, table.conversationId, table.sentAt),
  ],
);

export const skills = pgTable(
  "skills",
  {
    id: text("id").notNull(),
    userEmail: owner(),
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
    primaryKey({ columns: [table.userEmail, table.id] }),
    index("skills_owner_idx").on(table.userEmail, table.departmentId),
  ],
);

export const deliverables = pgTable(
  "deliverables",
  {
    id: text("id").notNull(),
    userEmail: owner(),
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
    primaryKey({ columns: [table.userEmail, table.id] }),
    index("deliverables_owner_idx").on(table.userEmail, table.status),
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
    userEmail: owner(),
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
    primaryKey({ columns: [table.userEmail, table.id] }),
    index("files_owner_idx").on(table.userEmail, table.kind),
  ],
);

export const allHandsRuns = pgTable(
  "all_hands_runs",
  {
    id: text("id").notNull(),
    userEmail: owner(),
    title: text("title").notNull(),
    status: text("status").notNull().default("done"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (table) => [
    primaryKey({ columns: [table.userEmail, table.id] }),
    index("all_hands_owner_idx").on(table.userEmail, table.updatedAt),
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
    userEmail: owner(),
    runId: text("run_id").notNull(),
    question: text("question").notNull(),
    responses: jsonb("responses").$type<AllHandsResponse[]>().notNull().default([]),
    synthesis: text("synthesis"),
    synthesisError: boolean("synthesis_error").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: created(),
  },
  (table) => [
    primaryKey({ columns: [table.userEmail, table.id] }),
    index("rounds_run_idx").on(table.userEmail, table.runId, table.sortOrder),
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
  avatarUrl: text("avatar_url"),
  updatedAt: updated(),
});

export const profiles = pgTable("profiles", {
  userEmail: text("user_email").primaryKey(),
  mission: text("mission").notNull().default(""),
  audience: text("audience").notNull().default(""),
  brandVoice: text("brand_voice").notNull().default(""),
  keyFacts: text("key_facts").notNull().default(""),
  updatedAt: updated(),
});

/**
 * Deliberately has no api key column. The key is a server environment variable
 * now, so a database dump cannot leak it and a second device cannot pick up a
 * key that was typed into the first.
 */
export const settings = pgTable("settings", {
  userEmail: text("user_email").primaryKey(),
  model: text("model").notNull().default("claude-sonnet-5"),
  effort: text("effort").notNull().default("medium"),
  theme: text("theme").notNull().default("dark"),
  companyName: text("company_name").notNull().default("Eterneon"),
  companySubtitle: text("company_subtitle").notNull().default(""),
  writingRules: text("writing_rules").notNull().default(""),
  roomBrevity: text("room_brevity").notNull().default("tight"),
  updatedAt: updated(),
});

export const conversationRelations = relations(conversations, ({ many }) => ({
  messages: many(messages),
}));

export const messageRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.userEmail, messages.conversationId],
    references: [conversations.userEmail, conversations.id],
  }),
}));

export const runRelations = relations(allHandsRuns, ({ many }) => ({
  rounds: many(allHandsRounds),
}));

export const roundRelations = relations(allHandsRounds, ({ one }) => ({
  run: one(allHandsRuns, {
    fields: [allHandsRounds.userEmail, allHandsRounds.runId],
    references: [allHandsRuns.userEmail, allHandsRuns.id],
  }),
}));

export type AttachmentRow = typeof files.$inferSelect;
export type StoredAttachment = Attachment;
