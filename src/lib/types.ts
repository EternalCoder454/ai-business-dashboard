export type Role = "user" | "assistant";

export type AttachmentKind = "image" | "pdf" | "document";

/**
 * Something attached to a message, or held in the Library.
 *
 * Images and PDFs travel to the API as bytes. Word and text files are converted
 * to text on the way in, because the API reads PDFs natively but not .docx.
 */
export interface Attachment {
  id: string;
  kind: AttachmentKind;
  mediaType: string;
  name: string;
  /** Base64 with no data: prefix, which is the shape the API wants. Empty for documents. */
  data: string;
  /** Extracted text, for documents the API cannot read directly. */
  text?: string;
  width: number;
  height: number;
  /** Original byte size, before base64. */
  size?: number;
}

/** A file kept in the Library, reusable across conversations. */
export interface LibraryFile extends Attachment {
  /** Optional owning head, purely for filtering. */
  departmentId?: string;
  projectId?: string;
  note?: string;
  createdAt: number;
  updatedAt: number;
}

/** One block of a message as it goes over the wire to /api/chat. */
export type WireContent =
  | { type: "text"; text: string }
  | { type: "image"; mediaType: string; data: string }
  | { type: "document"; mediaType: string; data: string; name: string };

export type DepartmentStatus = "online" | "busy" | "offline";

export interface Message {
  id: string;
  role: Role;
  content: string;
  timestamp: number;
  /** Summarized reasoning, when the model returned any. Not sent back to the API. */
  thinking?: string;
  /** Set while a response is still streaming in. */
  pending?: boolean;
  /** Set when the request failed, so the bubble can render an error state. */
  error?: boolean;
  /** Images sent with this message. User messages only. */
  attachments?: Attachment[];
}

/**
  * A project cuts across the org chart. A department owns a head and their
  * conversations; a project owns whatever work belongs to it, wherever in the
  * company that work happened to be done.
  */
export type ProjectStatus = "active" | "paused" | "shipped" | "archived";

export interface Project {
  id: string;
  name: string;
  /** What it is and what finishing looks like. Shown on the project page. */
  summary: string;
  status: ProjectStatus;
  /** One of the accent keys in PROJECT_ACCENTS, so a project is recognisable at a glance. */
  accent: string;
  /** Optional target date as an ISO day, no time. Empty when there is no date. */
  dueOn: string;
  createdAt: number;
  updatedAt: number;
}

export interface Conversation {
  id: string;
  departmentId: string;
  /** The project this belongs to, when it belongs to one. */
  projectId?: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

export interface Department {
  id: string;
  name: string;
  emoji: string;
  /** The head's first name, how the user addresses them. */
  personaName: string;
  roleTitle: string;
  /** Temperament and voice, injected ahead of the scoped system prompt. */
  persona: string;
  systemPrompt: string;
  /** Legacy seed value. The real count is derived from the skills table. */
  skillCount?: number;
  status: DepartmentStatus;
  /** Sort order in the sidebar and org chart. */
  order: number;
  /** True only for the CEO orchestrator, which sits above the department row. */
  isCeo?: boolean;
  /** Populated on read by `listDepartmentsWithConversations`; not stored inline. */
  conversations?: Conversation[];
}

/** A SKILL.md document belonging to one department. */
export interface Skill {
  id: string;
  departmentId: string;
  /** Short human name, shown in the list and quoted by the head when used. */
  name: string;
  /** The "when to use" trigger line. This is what the model matches against. */
  description: string;
  /** The markdown body: the actual playbook. */
  content: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

/**
 * The person using the app, as distinct from the company they run.
 *
 * CompanyProfile is business context every head shares. This is identity: who
 * is asking, what to call them, and where in the world they are.
 */
export interface UserAccount {
  /** What the heads call you. Defaults to the Google given name. */
  displayName: string;
  /** Your role at the company, so a head knows who is asking. */
  roleTitle: string;
  /** Optional, and used verbatim so nobody has to guess from a name. */
  pronouns: string;
  /** IANA zone, so "this week" and "by Friday" mean something. */
  timezone: string;
  /** From Google, cached for display. Never editable here. */
  email?: string;
  avatarUrl?: string;
  updatedAt: number;
}

export interface CompanyProfile {
  mission: string;
  audience: string;
  brandVoice: string;
  keyFacts: string;
}

export type DeliverableStatus = "backlog" | "in-progress" | "done";

export interface Deliverable {
  id: string;
  title: string;
  body: string;
  departmentId: string;
  projectId?: string;
  status: DeliverableStatus;
  createdAt: number;
  updatedAt: number;
  /** Conversation this was captured from, when it came out of a chat. */
  sourceConversationId?: string;
}

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export type ThemeMode = "dark" | "light";

/** How long a head may answer for in an All Hands room. */
export type RoomBrevity = "tight" | "standard";

export interface Settings {
  id: "app";
  apiKey: string;
  /**
   * Required only for an identity-linked API key, which refuses any request
   * that does not name the workspace it acts in. Ordinary keys ignore it.
   */
  workspaceId: string;
  model: string;
  effort: Effort;
  theme: ThemeMode;
  companyName: string;
  companySubtitle: string;
  /** House writing rules injected last into every department prompt. */
  writingRules: string;
  /** Word budget applied to every head in an All Hands room. */
  roomBrevity: RoomBrevity;
}

export interface AllHandsResponse {
  departmentId: string;
  content: string;
  thinking?: string;
  usage?: TokenUsage;
  error?: boolean;
  /** True while this department is still answering. */
  pending?: boolean;
}

/** One question put to the room, and everything that came back. */
export interface AllHandsRound {
  id: string;
  question: string;
  responses: AllHandsResponse[];
  /** The CEO's read across the round, once every head has answered. */
  synthesis?: string;
  synthesisError?: boolean;
  createdAt: number;
}

/** A group thread: the whole room, across as many rounds as you ask. */
export interface AllHandsRun {
  id: string;
  title: string;
  rounds: AllHandsRound[];
  status: "running" | "done" | "cancelled";
  createdAt: number;
  updatedAt: number;
}

/** Wire format for POST /api/chat. */
export interface ChatRequestBody {
  system: string;
  /** Content is a plain string unless the turn carries images. */
  messages: { role: Role; content: string | WireContent[] }[];
  model: string;
  effort: Effort;
}

export interface TokenUsage {
  input: number;
  output: number;
  /** Prefix tokens served from cache at roughly a tenth of the input price. */
  cacheRead: number;
  /** Prefix tokens written to cache this request, billed at 1.25x or 2x. */
  cacheWrite: number;
}

/** One newline-delimited JSON frame streamed back from POST /api/chat. */
export type ChatStreamEvent =
  | { type: "thinking"; text: string }
  | { type: "text"; text: string }
  | { type: "usage"; usage: TokenUsage }
  | { type: "error"; message: string }
  | { type: "done" };

/* ------------------------------------------------------------------ *
 * Messages
 *
 * Person to person, as opposed to the Message type above, which is a turn
 * in a conversation with a department head. These are the only records in
 * the app that belong to two accounts rather than one.
 * ------------------------------------------------------------------ */

export interface DirectMessage {
  id: string;
  fromEmail: string;
  toEmail: string;
  body: string;
  sentAt: number;
  /** Set once the recipient has opened the thread. */
  readAt?: number;
}

/** One row in the message list: who, the last thing said, and what is unread. */
export interface MessageThread {
  /** The other person. The thread is identified by them, not by an id. */
  email: string;
  lastBody: string;
  lastSentAt: number;
  lastFromSelf: boolean;
  unread: number;
}

/** Someone who can be written to. */
export interface Colleague {
  email: string;
  displayName?: string;
  roleTitle?: string;
  avatarUrl?: string;
  /**
   * False for someone on the allowlist who has never signed in. They can still
   * be written to; the message is waiting when they arrive.
   */
  hasSignedIn: boolean;
}
