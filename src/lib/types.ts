import type { Provider } from "./providers";

export type { Provider };

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
  /**
   * Base64 with no data: prefix, which is the shape the API wants.
   *
   * Absent on a hosted workspace. The bytes used to ride in the snapshot the
   * browser downloads on every load, which for eight screenshots was eleven
   * megabytes on every page, on every device, whether or not anything was
   * opened. They are served from /api/files/[id] instead and cached by the
   * browser. A local workspace keeps them inline, since reading IndexedDB in
   * the same browser costs nothing.
   */
  data?: string;
  /** Extracted text, for documents the API cannot read directly. */
  text?: string;
  width: number;
  height: number;
  /** Original byte size, before base64. */
  size?: number;
  /**
   * Where the bytes are, when they are not in the row.
   *
   * Set by the client after it uploads, and read by the server when it
   * writes the row. It goes no further than that: the workspace snapshot
   * never carries it, because the browser fetches files through this app's
   * own route and a URL it never receives is one it cannot leak.
   */
  blobUrl?: string;
}

/** A file kept in the Library, reusable across conversations. */
export interface LibraryFile extends Attachment {
  /**
   * Who can reach this file: a department id, COMPANY_ID for every department,
   * or undefined for nobody but you. Same shape as a skill's owner, so the two
   * behave the same way and there is one idea to learn rather than two.
   */
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
  /** What the reply cost. Assistant messages only, recorded when it arrived. */
  usage?: TokenUsage;
  /** Who wrote it, on a shared conversation. Absent means the owner. */
  authorEmail?: string;
  /** The model that produced it, since the setting can change between replies. */
  model?: string;
  /**
   * Actions this reply proposed, and what became of them.
   *
   * Kept on the message rather than run and forgotten, so the transcript shows
   * what was offered as well as what was approved.
   */
  toolCalls?: ToolCallRecord[];
}

export interface ToolCallRecord {
  id: string;
  name: string;
  input: Record<string, unknown>;
  /** Pending until someone decides, then whichever they chose. */
  state: "pending" | "approved" | "declined" | "failed";
  /** What happened, once it has run. */
  result?: string;
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
  /** Set when this project belongs to someone else and was shared with you. */
}

export interface Conversation {
  id: string;
  departmentId: string;
  /** Set when the conversation belongs to someone else, through a shared project. */
  /** The project this belongs to, when it belongs to one. */
  projectId?: string;
  title: string;
  /**
   * What has been fetched, not what exists.
   *
   * The workspace snapshot no longer carries message bodies: it used to load
   * every message in the business on every page load, which was most of the
   * time a page took and grew forever. A conversation's messages arrive when it
   * is opened. `messageCount` is the real total either way, so a list can say
   * whether a thread has anything in it without reading any of it.
   */
  messages: Message[];
  messageCount: number;
  /** True once the messages above are the whole conversation. */
  loaded?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Department {
  id: string;
  name: string;
  /** A data URL when one has been uploaded; initials stand in until then. */
  avatarUrl?: string;
  /**
   * Yours rather than the company's. A personal workspace sits outside the org
   * chart and stays out of All Hands, since asking a coach for a campaign plan
   * is not a question anyone means to ask.
   */
  personal?: boolean;
  /** The head's first name, how the user addresses them. */
  personaName: string;
  roleTitle: string;
  /** Temperament and voice, injected ahead of the scoped system prompt. */
  persona: string;
  systemPrompt: string;
  /**
   * Which model answers for this department, and therefore which provider.
   *
   * Undefined means the workspace default, which is what every department has
   * until someone changes one, so a workspace that predates this needs no
   * migration and behaves exactly as before.
   */
  model?: string;
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
  /** What you know well and what you would rather have explained. */
  expertise: string;
  /** How you like answers: length, directness, format. */
  preferences: string;
  /** What you are working on now, so answers land on the current thing. */
  currentFocus: string;
  /** Anything else worth knowing. */
  notes: string;
  /**
   * auto or dnd. Auto follows whether they are actually here; do-not-disturb
   * is a thing a person says about themselves and activity does not override
   * it.
   */
  presence?: "auto" | "dnd";
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
  /** What the company actually sells or makes. */
  products: string;
  /** Size, age, revenue, headcount: how established this is. */
  stage: string;
  /** Who else is in the space, and how this differs. */
  competitors: string;
  /** Budget, headcount, time, anything off the table. */
  constraints: string;
  /** What is being aimed at, and by when. */
  goals: string;
}

export type DeliverableStatus = "backlog" | "in-progress" | "done";

/**
 * What the studio has decided and what it has measured.
 *
 * The panel was advice with no memory: every conversation started from the
 * same static Company Profile, so a head would happily contradict a decision
 * made last month and had no figure to reason from. This is the part that
 * accumulates. Entries are written by hand or captured from a reply, and are
 * injected into every head's prompt.
 *
 * Two kinds, because they age differently. A decision stands until something
 * overtakes it. A figure is true on a date and is replaced by the next
 * reading rather than corrected, so a series shares one label.
 */
export type MemoryKind = "decision" | "figure";

export interface MemoryEntry {
  id: string;
  kind: MemoryKind;
  /**
   * A decision in one line, or what a figure measures.
   *
   * For figures this is the series key, so "Wishlists" written the same way
   * each time reads as a trend rather than as unrelated numbers.
   */
  label: string;
  /** Figures only: the reading as written, units included. */
  value: string;
  /** Decisions only: the reasoning worth keeping, so it is not relitigated. */
  detail: string;
  /** Decisions only: what would reopen this. Without one it is permanent. */
  revisitWhen: string;
  /** The head this belongs to, or the company id for every head. */
  departmentId: string;
  projectId?: string;
  /** When it was decided or measured, which is rarely when it was typed. */
  occurredAt: number;
  /** Overtaken entries stay for history and leave the prompt. */
  archived: boolean;
  /** The conversation it was captured from, when it came out of a chat. */
  sourceConversationId?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Something to do, as opposed to something produced.
 *
 * Deliverables are output: a reply worth keeping. A task is the other half,
 * the thing that has not happened yet. Keeping them apart matters because they
 * are answered by different questions: "what have we made" and "what is
 * outstanding" are not the same list, and merging them makes both useless.
 *
 * Open tasks for a department are injected into its prompt, so asking a head
 * what to focus on is answered against what is actually outstanding rather
 * than against nothing.
 */
export type TaskStatus = "todo" | "doing" | "done";

/** Ordered, because a plan with everything at the same priority is not a plan. */
export const TASK_STATUSES: TaskStatus[] = ["todo", "doing", "done"];

export interface Task {
  id: string;
  title: string;
  /** Anything the title cannot carry: links, constraints, what done looks like. */
  notes: string;
  status: TaskStatus;
  /** The head whose area this sits in, or the company id for unassigned. */
  departmentId: string;
  projectId?: string;
  /** Midnight-agnostic day stamp, or undefined for no date. */
  dueAt?: number;
  /** Ordering within a status column, so a list can be prioritised by hand. */
  order: number;
  /** The conversation it came out of, when it was captured from a reply. */
  sourceConversationId?: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

/**
 * One page of the internal wiki.
 *
 * Stored rather than written into the app, so an installation can say what it
 * needs to say. The shipped pages describe the panel itself and nothing about
 * whoever built it, which is what makes it sellable as a product.
 */
/**
 * How a card is drawn. Tone is the only styling anyone gets: a wiki where
 * every card can be any colour stops meaning anything after the third page.
 */
export type WikiBlockTone = "default" | "warning" | "note";

/** One card on a page. */
export interface WikiBlock {
  id: string;
  /** Optional. A card with no heading is a plain run of text. */
  title: string;
  /** Markdown. */
  body: string;
  tone: WikiBlockTone;
}

export interface WikiPage {
  id: string;
  title: string;
  /** One line under the title in the contents list. */
  blurb: string;
  /**
   * The cards on this page.
   *
   * Pages were one markdown body first. That made a page a wall of text where
   * the old hardcoded wiki had separate cards, so the structure came back as
   * data rather than as components.
   */
  blocks: WikiBlock[];
  /** The single body a page had before it held cards. Migrated on load. */
  body?: string;
  order: number;
  /** A page can be put away without deleting what it said. */
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Deliverable {
  id: string;
  title: string;
  /**
   * What has been fetched, not what exists.
   *
   * The snapshot carries the first couple of hundred characters, which is all
   * the card shows. The whole thing arrives when one is opened. Measured at 120
   * deliverables, the bodies were half a megabyte on every page load of every
   * screen, and they grow for as long as somebody uses the product.
   */
  body: string;
  /** True when `body` is the whole document rather than the opening of it. */
  bodyLoaded?: boolean;
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
  /** Held in this browser like the Anthropic key, never written to the database. */
  openaiKey?: string;
  googleKey?: string;
  /** The workspace default. A department with no model of its own uses this. */
  model: string;
  effort: Effort;
  theme: ThemeMode;
  companyName: string;
  companySubtitle: string;
  /** House writing rules injected last into every department prompt. */
  writingRules: string;
  /** Word budget applied to every head in an All Hands room. */
  roomBrevity: RoomBrevity;
  /** Up to two letters shown on the mark when there is no logo. */
  companyMark: string;
  /** A data URL, which replaces the letters when set. */
  companyLogoUrl?: string;
  /** Which edge the navigation sits on. */
  sidebarSide: SidebarSide;
  /** The single key that opens search. "none" turns the bare key off. */
  searchShortcut: SearchShortcut;
  /** What the internal wiki is called here. */
  wikiTitle: string;
  /** The line under it, usually a reading time. */
  wikiSubtitle: string;
}

/** Which edge the drawer and rail sit on. */
export type SidebarSide = "left" | "right";

/** The bare key that opens search. Cmd and Ctrl K always work regardless. */
export type SearchShortcut = "slash" | "k" | "none";

export interface AllHandsResponse {
  departmentId: string;
  content: string;
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
  /**
   * Which service answers. Omitted by anything written before providers were
   * a choice, and the server then reads it off the model id, so an old client
   * naming a Claude model still reaches Anthropic.
   */
  provider?: Provider;
  /** Content is a plain string unless the turn carries images. */
  messages: { role: Role; content: string | WireContent[] }[];
  model: string;
  effort: Effort;
  /**
   * What this department may do beyond replying. Omitted by a caller that does
   * not use tools, and the provider is then asked for a plain reply.
   */
  tools?: { name: string; description: string; schema: unknown }[];
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
/** One action a department has proposed, waiting on approval. */
export interface ProposedToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export type ChatStreamEvent =
  | { type: "thinking"; text: string }
  | { type: "tool"; call: ProposedToolCall }
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
  /**
   * Client only, and never on anything the server returned: where a send of
   * mine has got to. A failed one keeps this and stays on screen, because the
   * draft box was already cleared and the text exists nowhere else.
   */
  local?: "sending" | "failed";
}

/**
 * How far one of my own messages has got. Shown on mine only: what I have read
 * of theirs is not news to me.
 *
 * "sent" and "not seen" are the same fact, so they are one state. It arrived,
 * and nobody has opened it.
 */
export type Delivery = "sending" | "failed" | "sent" | "seen";

export const DELIVERY_LABEL: Record<Delivery, string> = {
  sending: "Sending",
  failed: "Not sent",
  sent: "Not seen",
  seen: "Seen",
};

/**
 * @param seenThrough the newest thing of mine the other person has read, as a
 *   timestamp. Read state moves forwards only, so anything at or before it has
 *   been seen.
 */
export function deliveryOf(
  message: DirectMessage,
  self: string | undefined,
  seenThrough: number,
): Delivery | undefined {
  if (!self || message.fromEmail !== self) return undefined;
  if (message.local) return message.local === "failed" ? "failed" : "sending";
  if (message.readAt != null || message.sentAt <= seenThrough) return "seen";
  return "sent";
}

/** One row in the message list: who, the last thing said, and what is unread. */
export interface MessageThread {
  /** The other person. The thread is identified by them, not by an id. */
  email: string;
  lastBody: string;
  lastSentAt: number;
  lastFromSelf: boolean;
  /** Whether that last message has been read. Only meaningful if it was mine. */
  lastSeen: boolean;
  unread: number;
}

/** Someone who can be written to. */
export type PresenceStatus = "online" | "offline" | "dnd";

export const PRESENCE_LABEL: Record<PresenceStatus, string> = {
  online: "Online",
  offline: "Offline",
  dnd: "Do not disturb",
};

export interface Colleague {
  email: string;
  displayName?: string;
  roleTitle?: string;
  avatarUrl?: string;
  /**
   * Where they are now, not whether they have ever been here.
   *
   * Do-not-disturb is theirs to set and outranks activity; online means seen
   * within the last few minutes; everything else is offline, including someone
   * who was invited this morning and has not arrived.
   */
  presence: PresenceStatus;
}
