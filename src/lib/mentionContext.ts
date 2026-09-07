import type { StoreValue } from "./store";
import { mentionBlock, type Mention } from "./mentions";

/**
 * Reading what an @ pointed at.
 *
 * The parsing is in mentions.ts and is pure. This is the half that touches the
 * workspace, and it is separate for one reason: what may be read is a question
 * about who is asking, and that answer lives in the store.
 *
 * Two rules, taken from read_department because they are the same rules and
 * there is no version of this where they differ. A personal head is that
 * person's alone and sits outside the org chart by design, so it is never
 * readable however it is named. And a member whose permissions deny a
 * department does not reach it by typing its name either: this runs on their
 * behalf and gets their access, not more.
 *
 * Everything is trimmed hard. It lands in a prompt already carrying the
 * profile, the memory, the tasks and the conversation being had, and a
 * mentioned thread that arrives whole pushes out the question that mentioned
 * it.
 */

/** Threads read from a mentioned head. Enough to see what it is working on. */
const THREADS_PER_HEAD = 2;
/** Messages taken from the end of each of those. */
const MESSAGES_PER_THREAD = 6;
/** Messages taken from a conversation somebody named directly. */
const MESSAGES_PER_NAMED_THREAD = 12;
/** Where one message stops being quoted and starts being pasted. */
const MAX_MESSAGE = 600;

const oneLine = (text: string) => {
  const body = text.trim().replace(/\s+/g, " ");
  return body.length > MAX_MESSAGE ? `${body.slice(0, MAX_MESSAGE)}…` : body;
};

/** A thread as "who said what", newest exchanges only. */
async function transcript(
  store: StoreValue,
  conversationId: string,
  speaker: string,
  take: number,
): Promise<string> {
  const loaded = await store.openConversation(conversationId);
  const recent = loaded.slice(-take).filter((message) => message.content.trim());
  if (recent.length === 0) return "";

  return recent
    .map((message) => `${message.role === "user" ? "Owner" : speaker}: ${oneLine(message.content)}`)
    .join("\n");
}

async function readDepartment(store: StoreValue, id: string): Promise<string> {
  const department = store.allDepartments.find((entry) => entry.id === id);
  if (!department) return "";
  if (department.personal || !store.canOpenHead(department.id)) return "";

  const speaker = department.personaName || department.name;
  const parts: string[] = [];
  if (department.roleTitle) parts.push(`Role: ${department.roleTitle}`);

  const threads = store
    .conversationsFor(department.id)
    .filter((conversation) => conversation.messageCount > 0)
    .slice(0, THREADS_PER_HEAD);

  for (const conversation of threads) {
    const body = await transcript(store, conversation.id, speaker, MESSAGES_PER_THREAD);
    if (body) parts.push(`${conversation.title}\n${body}`);
  }

  return parts.length ? parts.join("\n\n") : `${department.name} has had no conversations yet.`;
}

async function readConversation(store: StoreValue, id: string): Promise<string> {
  const conversation = store.conversations.find((entry) => entry.id === id);
  if (!conversation) return "";

  const department = store.allDepartments.find((entry) => entry.id === conversation.departmentId);
  if (department?.personal || !store.canOpenHead(conversation.departmentId)) return "";

  const speaker = department?.personaName || department?.name || "Head";
  const body = await transcript(store, conversation.id, speaker, MESSAGES_PER_NAMED_THREAD);
  return body || "That conversation is empty.";
}

function readProject(store: StoreValue, id: string): string {
  const project = store.projects.find((entry) => entry.id === id);
  if (!project) return "";

  const parts = [`Status: ${project.status}`];
  if (project.dueOn) parts.push(`Due: ${project.dueOn}`);
  if (project.summary.trim()) parts.push(project.summary.trim());

  const open = store.tasks.filter((task) => task.projectId === id && task.status !== "done");
  if (open.length) {
    parts.push(
      `Outstanding:\n${open.slice(0, 12).map((task) => `- ${task.title}`).join("\n")}`,
    );
  }

  const threads = store.conversations.filter((entry) => entry.projectId === id);
  if (threads.length) {
    parts.push(`Conversations: ${threads.map((entry) => entry.title).join(", ")}`);
  }

  return parts.join("\n");
}

/**
 * Everything the message named, as one block to send ahead of it.
 *
 * Empty when nothing was named or nothing named could be read, and an
 * unreadable one is simply absent: telling a head that there is a department it
 * is not allowed to see is telling it something it does not need and the person
 * asking already knows.
 */
export async function resolveMentions(
  mentions: Mention[],
  store: StoreValue,
): Promise<string> {
  if (mentions.length === 0) return "";

  const parts: { label: string; kind: Mention["kind"]; body: string }[] = [];

  for (const mention of mentions) {
    let body = "";
    try {
      if (mention.kind === "department") body = await readDepartment(store, mention.id);
      else if (mention.kind === "conversation") body = await readConversation(store, mention.id);
      else body = readProject(store, mention.id);
    } catch {
      // A thread that will not load is one the head is not told about, rather
      // than a message that fails to send.
      body = "";
    }
    if (body.trim()) parts.push({ label: mention.label, kind: mention.kind, body });
  }

  return mentionBlock(parts);
}
