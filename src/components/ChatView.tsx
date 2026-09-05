"use client";

import Link from "next/link";
import { ConversationList } from "./ConversationList";
import { DepartmentAvatar } from "./DepartmentAvatar";
import { HeadProfile } from "./HeadProfile";
import { allToBlob } from "@/lib/blobUpload";
import { useRouter, useSearchParams } from "next/navigation";
import { setConversationOpen, showsConversationList } from "@/lib/chatRoute";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { newId } from "@/lib/ids";
import { hasKeyFor } from "@/lib/hasKey";
import {
  ACCEPTED_FILE_TYPES,
  FILE_ICON,
  estimateAttachmentTokens,
  fileToAttachmentAny,
  filesForDepartment,
  formatBytes,
} from "@/lib/files";
import { AttachmentError, MAX_ATTACHMENTS_PER_MESSAGE, attachmentSrc } from "@/lib/images";
import { providerOf } from "@/lib/providers";
import { runTool } from "@/lib/runTool";
import { findTool, toolsFor } from "@/lib/tools";
import { COMPANY_ID } from "@/lib/seed";
import { buildSystemPrompt, deriveConversationTitle, hasProfileContent } from "@/lib/prompts";
import { conversationHref, departmentHrefById } from "@/lib/routes";
import { STATUS_MEANING, setDepartmentActivity, useDepartmentStatus } from "@/lib/presence";
import { useStore } from "@/lib/store";
import { ProfileMenu } from "./ProfileMenu";
import { ProjectPicker } from "./ProjectBits";
import type {
  Attachment,
  Conversation,
  Message,
  TokenUsage,
  ToolCallRecord,
  WireContent,
} from "@/lib/types";
import { streamChat } from "@/lib/chatClient";
import { useEnter } from "@/lib/motion";
import {
  BookmarkIcon,
  Button,
  CheckIcon,
  ChevronIcon,
  CloseIcon,
  CopyIcon,
  Chip,
  Dialog,
  DocIcon,
  Field,
  SendIcon,
  SparkIcon,
  StatusDot,
  TextArea,
  TextInput,
  TrashIcon,
  cx,
} from "./ui";
import { Markdown } from "./Markdown";
import { createRipple } from "./ui/ripple";


/**
 * The prompt as the chat route wants it: the stable half under `system`,
 * the part that changes under `systemVolatile`, so the cache breakpoint
 * lands between them.
 */
function splitPrompt(...args: Parameters<typeof buildSystemPrompt>) {
  const { stable, volatile } = buildSystemPrompt(...args);
  return { system: stable, systemVolatile: volatile };
}

interface StreamState {
  text: string;
  thinking: string;
}

const EMPTY_STREAM: StreamState = { text: "", thinking: "" };

/**
 * The bytes for one file, fetched once and kept for the session.
 *
 * A hosted workspace no longer carries them in its snapshot, so a message
 * being re-sent has metadata and no data. The cache is per tab: a long
 * conversation re-sends its history on every turn, and fetching the same
 * attachment on each of them would undo the point of not shipping them.
 */
const byteCache = new Map<string, string>();

/*
 * A ceiling on the cache, in characters of base64: roughly 24 MB of held
 * bytes. Without one it grows for the life of the tab, since every attachment
 * ever re-sent stays in memory.
 */
const MAX_CACHED_CHARS = 32_000_000;
let cachedChars = 0;

function remember(id: string, data: string): void {
  // Nothing to gain from caching something that would evict everything else.
  if (data.length > MAX_CACHED_CHARS / 2) return;

  // Oldest first, which is insertion order in a Map and close enough to least
  // recently useful: a conversation re-sends its history in order.
  while (cachedChars + data.length > MAX_CACHED_CHARS && byteCache.size > 0) {
    const oldest = byteCache.keys().next().value as string;
    cachedChars -= byteCache.get(oldest)?.length ?? 0;
    byteCache.delete(oldest);
  }

  byteCache.set(id, data);
  cachedChars += data.length;
}

async function bytesFor(attachment: Attachment): Promise<string> {
  if (attachment.data) return attachment.data;
  const cached = byteCache.get(attachment.id);
  if (cached !== undefined) return cached;
  try {
    const response = await fetch(`/api/files/${encodeURIComponent(attachment.id)}?json=1`);
    if (!response.ok) return "";
    const body = (await response.json()) as { data?: string };
    const data = body.data ?? "";
    remember(attachment.id, data);
    return data;
  } catch {
    // An attachment that will not load is better than a turn that will not send.
    return "";
  }
}

/**
 * A turn with attachments becomes content blocks. Files lead, because the API
 * answers a question about a document better when the document comes first.
 */
async function toWire(message: Message): Promise<string | WireContent[]> {
  if (!message.attachments?.length) return message.content;

  const blocks: WireContent[] = [];
  for (const attachment of message.attachments) {
    if (attachment.kind === "image" || attachment.kind === "pdf") {
      const data = await bytesFor(attachment);
      // Nothing to send rather than an empty block the API would reject.
      if (!data) continue;
      blocks.push(
        attachment.kind === "image"
          ? { type: "image", mediaType: attachment.mediaType, data }
          : {
              type: "document",
              mediaType: attachment.mediaType,
              data,
              name: attachment.name,
            },
      );
    } else if (attachment.text) {
      // Converted on the way in, so it travels as plain text with a header
      // naming the file, which is what makes it quotable in a reply.
      blocks.push({
        type: "text",
        text: `<file name="${attachment.name}">\n${attachment.text}\n</file>`,
      });
    }
  }

  if (message.content.trim()) blocks.push({ type: "text", text: message.content });
  return blocks;
}

/**
 * Splits a reply into a one-line decision and the reasoning under it.
 *
 * A first pass only. What matters is that the label is short enough to sit in
 * every future prompt, so both halves are capped and the user edits from here.
 */
function splitForCapture(content: string): { label: string; detail: string; revisitWhen: string } {
  const clean = content
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*/g, "")
    .trim();
  const [first = "", ...rest] = clean.split(/\n{2,}/);
  const sentence = first.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? first;
  return {
    label: sentence.trim().slice(0, 160),
    detail: [first.slice(sentence.length), ...rest].join(" ").replace(/\s+/g, " ").trim().slice(0, 400),
    revisitWhen: "",
  };
}

const MAX_COMPOSER_HEIGHT = 220;

/** Grows the composer with its content, up to a cap, then lets it scroll. */
function autoGrow(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, MAX_COMPOSER_HEIGHT)}px`;
}

export function ChatView({ departmentId }: { departmentId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    ready,
    getDepartment,
    conversationsFor,
    createConversation,
    updateConversation,
    setMessages,
    deleteConversation,
    createDeliverable,
    saveMemory,
    files,
    projects,
    serverKeys,
    workspaceKeys,
    memory,
    tasks,
    createTask,
    pullShared,
    openConversation,
    calendar,
    calendarStatus,
    skillsFor,
    profile,
    settings,
    account,
    workspacePeople,
    canOpenHead,
    can,
  } = useStore();
  const store = useStore();

  // Decides which tools the department is told about. The server decides what
  // it may actually do, so this is presentation rather than a permission.
  const admin = store.workspaceRole === "admin";

  const department = getDepartment(departmentId);
  const liveStatus = useDepartmentStatus(
    hasKeyFor(getDepartment(departmentId)?.model || settings.model, {
      serverKeys,
      workspaceKeys,
      browserKey: settings.apiKey,
    }),
  )(departmentId);

  /** Library files scoped to this department, or shared with every one. */
  const shared = useMemo(
    () => filesForDepartment(files, departmentId),
    [files, departmentId],
  );
  const conversations = conversationsFor(departmentId);
  const requestedId = searchParams.get("c");

  /*
   * What the department opens to. `?c=<id>` is that conversation, `?c=new` is
   * a blank one, and nothing at all means the list, unless there is nothing to
   * list. Deliberately never the newest thread, which leaves no way to start a
   * second subject.
   */
  const started = useMemo(
    () => conversations.filter((c) => c.messageCount > 0),
    [conversations],
  );

  const showList = showsConversationList(requestedId, started.length);

  /*
   * Tells the shell which of the two this is, because it strips the top and
   * bottom bars for a conversation and a list needs them. The path alone
   * cannot say. Cleared on the way out, or leaving a department leaves the
   * navigation hidden on whatever comes next.
   */
  useEffect(() => {
    setConversationOpen(!showList);
    return () => setConversationOpen(false);
  }, [showList]);

  const active: Conversation | undefined = useMemo(() => {
    if (requestedId === "new") return undefined;
    if (requestedId) {
      const match = conversations.find((c) => c.id === requestedId);
      if (match) return match;
    }
    // A conversation that exists but has nothing in it yet is the one a blank
    // chat already made, so reuse it rather than leaving empties behind.
    return started.length > 0 ? undefined : conversations[0];
  }, [conversations, started.length, requestedId]);

  const [draft, setDraft] = useState("");
  const [stream, setStream] = useState<StreamState>(EMPTY_STREAM);
  const [isStreaming, setIsStreaming] = useState(false);
  const [lastUsage, setLastUsage] = useState<TokenUsage | null>(null);
  const [pending, setPending] = useState<Attachment[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  /**
   * A decision being captured out of a reply.
   *
   * Deliberately a dialog rather than a one-click save. Every entry goes into
   * every prompt from here on, so a four hundred word answer pasted in whole
   * would cost tokens on every message and bury the line that mattered. The
   * prefill is a starting point to cut down, not the finished entry.
   */
  const [capture, setCapture] = useState<{ label: string; detail: string; revisitWhen: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const stickToBottom = useRef(true);

  // Reset transient state when the visible conversation changes.
  useEffect(() => {
    setStream(EMPTY_STREAM);
  }, [active?.id]);

  /**
   * A shared thread pulls in what other people wrote.
   *
   * Five seconds while the tab is visible, nothing while it is not, and
   * nothing at all on a conversation only one person can reach, which is
   * almost all of them.
   */
  // Polling used to depend on a project being shared across workspaces, which
  // is gone. Everyone in a business shares every conversation in it, so the
  // question is simply whether anyone else could be typing.
  const isShared = workspacePeople > 1;

  useEffect(() => {
    if (!isShared || !active?.id) return;
    const id = active.id;

    const pull = () => {
      if (document.visibilityState !== "visible" || isStreaming) return;
      void pullShared(id);
    };

    const timer = window.setInterval(pull, 5_000);
    document.addEventListener("visibilitychange", pull);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", pull);
    };
  }, [isShared, active?.id, isStreaming, pullShared]);

  /**
   * "Send to" in the Library opens a fresh conversation with a file already
   * attached. It is handed over in sessionStorage rather than the URL, because
   * a base64 PDF does not belong in a query string.
   */
  useEffect(() => {
    if (!active?.id) return;
    const key = `prefill:${active.id}`;
    const raw = sessionStorage.getItem(key);
    if (!raw) return;
    sessionStorage.removeItem(key);
    try {
      const incoming = JSON.parse(raw) as Attachment[];
      if (Array.isArray(incoming) && incoming.length) setPending(incoming);
    } catch {
      // Malformed handover, nothing worth recovering.
    }
  }, [active?.id]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  /*
   * The snapshot carries counts rather than message bodies, so a conversation
   * arrives empty and fills in here. `openConversation` returns immediately
   * for one already loaded.
   */
  useEffect(() => {
    if (active?.id) void openConversation(active.id);
  }, [active?.id, openConversation]);

  const messages = active?.messages ?? [];

  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node || !stickToBottom.current) return;
    node.scrollTop = node.scrollHeight;
  }, [messages.length, stream.text, stream.thinking, active?.id]);

  const onScroll = () => {
    const node = scrollRef.current;
    if (!node) return;
    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    stickToBottom.current = distanceFromBottom < 120;
  };

  const attach = useCallback(
    async (files: FileList | File[]) => {
      setAttachError(null);
      const room = MAX_ATTACHMENTS_PER_MESSAGE - pending.length;
      if (room <= 0) {
        setAttachError(`${MAX_ATTACHMENTS_PER_MESSAGE} files per message is the limit.`);
        return;
      }

      const added: Attachment[] = [];
      for (const file of Array.from(files).slice(0, room)) {
        try {
          added.push(await fileToAttachmentAny(file));
        } catch (error) {
          setAttachError(
            error instanceof AttachmentError
              ? error.message
              : "That file could not be read.",
          );
        }
      }
      if (added.length) setPending((current) => [...current, ...added]);
    },
    [pending.length],
  );

  const send = useCallback(async () => {
    const text = draft.trim();
    if ((!text && pending.length === 0) || isStreaming || !department) return;

    let conversation = active;
    if (!conversation) {
      conversation = await createConversation(departmentId, deriveConversationTitle(text));
      router.replace(conversationHref(departmentId, conversation.id));
    }

    /*
     * Attachments reach the blob store on send rather than on pick, so
     * something attached and then removed is never paid for. The bytes are in
     * memory either way, which is where the model reads them from.
     */
    const attached = pending.length ? await allToBlob(pending) : [];

    const userMessage: Message = {
      id: newId("msg"),
      role: "user",
      content: text,
      timestamp: Date.now(),
      attachments: attached.length ? attached : undefined,
    };

    /*
     * The thread has to be in hand before anything is sent: a conversation
     * opened and typed into within the same second still has empty `messages`,
     * and sending from that asks the model a question with no conversation
     * behind it. Read from what `openConversation` returns rather than from
     * this closure, which holds the conversation from before it ran.
     */
    const prior = conversation.loaded
      ? conversation.messages
      : await openConversation(conversation.id);

    const history = [...prior, userMessage];

    setDraft("");
    setPending([]);
    setAttachError(null);
    if (inputRef.current) inputRef.current.style.height = "auto";
    stickToBottom.current = true;
    setStream(EMPTY_STREAM);
    setIsStreaming(true);
    setDepartmentActivity(departmentId, "busy");

    await setMessages(conversation.id, history);
    // The count, not what is loaded: a thread that has messages but has not
    // been fetched yet is not a new one, and renaming it here would rename
    // somebody's conversation out from under them.
    const firstExchange = conversation.messageCount === 0 && prior.length === 0;
    if (firstExchange) {
      await updateConversation(conversation.id, { title: deriveConversationTitle(text) });
    }

    const controller = new AbortController();
    abortRef.current = controller;

    // Filled by onSources below, once the answer is finished.
    let sources: { title: string; url: string }[] = [];
    const result = await streamChat(
      {
        ...splitPrompt(
          department,
          profile,
          settings.companyName,
          skillsFor(departmentId),
          settings.writingRules,
          account,
          memory,
          tasks,
          toolsFor(departmentId, { admin, webSearch: settings.webSearch }),
          calendar,
          calendarStatus,
        ),
        messages: await Promise.all(
          history.map(async (m) => ({ role: m.role, content: await toWire(m) })),
        ),
        // A department pointed at its own model wins; otherwise the
        // workspace default, which is what every department has until one is
        // changed.
        model: department.model || settings.model,
        provider: providerOf(department.model || settings.model),
        effort: settings.effort,
        // Only this department's, so nothing can act outside its own area.
        tools: toolsFor(departmentId, { admin, webSearch: settings.webSearch }).map((tool) => ({
          name: tool.name,
          description: tool.description,
          schema: tool.schema,
        })),
        // Off unless the business turned it on, and the mode it chose.
        webSearch: settings.webSearch ?? "off",
      },
      settings.apiKey,
      settings.workspaceId,
      {
        onText: (_delta, full) => setStream((current) => ({ ...current, text: full })),
        onThinking: (_delta, full) =>
          setStream((current) => ({ ...current, thinking: full })),
        onUsage: setLastUsage,
        onSources: (found) => {
          sources = found;
        },
      },
      controller.signal,
      { openai: settings.openaiKey, google: settings.googleKey },
    );

    const collectedThinking = result.thinking;
    const failure = result.error ?? "";

    /*
     * Written into the reply rather than kept beside it.
     *
     * A cited answer is worth nothing if the citations are lost the moment the
     * conversation is reloaded, and the messages table has no column for them.
     * As markdown they are saved with the answer, render as links through the
     * same component as everything else, and export with the rest of the work.
     */
    const collectedText =
      sources.length && result.text
        ? result.text +
          "\n\n**Sources**\n\n" +
          sources.map((source) => `- [${source.title}](${source.url})`).join("\n")
        : result.text;

    const assistantMessage: Message = {
      id: newId("msg"),
      role: "assistant",
      content: collectedText || failure || "No response was returned.",
      thinking: collectedThinking || undefined,
      timestamp: Date.now(),
      error: !collectedText && Boolean(failure),
      // Recorded on the message rather than only shown under the composer, so
      // spend can still be attributed to a person and a head months later.
      usage: result.usage,
      model: result.usage ? settings.model : undefined,
      // Proposed, not run. Each one waits on the card in the transcript.
      toolCalls: result.toolCalls.length
        ? result.toolCalls.map((call) => ({ ...call, state: "pending" as const }))
        : undefined,
    };

    // A trailing error after partial text is appended so it is not lost.
    const finalContent =
      collectedText && failure
        ? `${collectedText}\n\n> ⚠️ ${failure}`
        : assistantMessage.content;

    await setMessages(conversation.id, [
      ...history,
      { ...assistantMessage, content: finalContent },
    ]);

    abortRef.current = null;
    setIsStreaming(false);
    // A failed reply leaves the dot showing the department cannot be reached,
    // which is the state someone needs to see rather than a green light.
    setDepartmentActivity(
      departmentId,
      !collectedText && failure ? "error" : "idle",
    );
    setStream(EMPTY_STREAM);
    inputRef.current?.focus();

    /*
     * A better name for the thread, read from the answer as well as the
     * question. After the reply is on screen, because the result is only a
     * rename and nobody is waiting on it.
     */
    if (firstExchange && collectedText) {
      void (async () => {
        try {
          const response = await fetch("/api/workspace/title", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question: text, answer: collectedText }),
          });
          const body = (await response.json()) as { title?: string };
          const named = body.title?.trim();
          if (named) await updateConversation(conversation.id, { title: named });
        } catch {
          // The title written from the text stays, which is the whole cost.
        }
      })();
    }
  }, [
    draft,
    pending,
    memory,
    tasks,
    isStreaming,
    department,
    active,
    calendar,
    calendarStatus,
    createConversation,
    departmentId,
    openConversation,
    router,
    setMessages,
    updateConversation,
    settings,
    profile,
    skillsFor,
    account,
    admin,
  ]);

  /**
   * Until the workspace has loaded there is no list for a department to be
   * missing from, so "not found" would be a lie for the length of one fetch,
   * which is exactly long enough to read on every refresh. Same placeholder
   * the route's Suspense boundary uses, so nothing moves when it resolves.
   */
  if (!ready) return <div className="flex-1" />;

  /*
   * A head this person was not given. Said plainly rather than as "not found",
   * because it is not missing and they may have been sent the link by somebody
   * who can open it.
   */
  if (department && !canOpenHead(department.id)) {
    return (
      <div className="flex flex-1 items-center justify-center p-10 text-center">
        <div>
          <p className="md-title-lg">Not available</p>
          <p className="md-body mt-2 text-on-variant">
            An administrator of this business decides who works with each head.
          </p>
          <Link href="/" className="md-label mt-5 inline-block text-primary underline">
            Back to the org chart
          </Link>
        </div>
      </div>
    );
  }

  if (!department) {
    return (
      <div className="flex flex-1 items-center justify-center p-10 text-center">
        <div>
          <p className="md-title-lg">Department not found</p>
          <p className="md-body mt-2 text-on-variant">
            It may have been removed in Settings. A conversation shared with you
            can also land here, when it belongs to a department the person who
            shared it has and you do not.
          </p>
          <Link href="/" className="md-label mt-5 inline-block text-primary underline">
            Back to the org chart
          </Link>
        </div>
      </div>
    );
  }

  /*
   * After the not-found branch, so a bad department id still says so, and
   * before anything that assumes a conversation, because there is not one.
   */
  if (showList) {
    return (
      <ConversationList
        department={department}
        conversations={started}
        onDelete={(id) => void deleteConversation(id)}
      />
    );
  }

  // A key on the server answers just as well as one typed into Settings,
  // so testing only the local one told a hosted workspace it had none.
  // This department's model, not the workspace default: a business on
  // Anthropic with one head pointed at Gemini genuinely lacks a key for that
  // one, and the banner should be right about which.
  const needsKey = !hasKeyFor(department?.model || settings.model, {
    serverKeys,
    workspaceKeys,
    browserKey: settings.apiKey,
  });
  const profileMissing = !hasProfileContent(profile);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="safe-top safe-pt-3 medium:safe-pt-4 safe-x safe-px-3 medium:safe-px-6 flex flex-none items-center gap-3 border-b border-outline-variant pb-3 medium:gap-4 medium:pb-4">
        <button
          onClick={() => {
            if (window.history.length > 1) router.back();
            else router.push("/");
          }}
          aria-label="Go back"
          className="md-state grid h-11 w-11 flex-none place-items-center rounded-full text-on-surface medium:hidden"
        >
          <ChevronIcon className="h-5 w-5 rotate-180" />
        </button>
        {/* Back to this head's other conversations, once there are any. The
            arrow above is the phone's back gesture and goes wherever they came
            from; this always goes to the list. */}
        {started.length > 0 ? (
          <Link
            href={departmentHrefById(departmentId)}
            aria-label={`All conversations with ${department.personaName || department.name}`}
            onClick={createRipple}
            className="md-state md-target hidden flex-none place-items-center rounded-full text-on-variant medium:grid"
          >
            <ChevronIcon className="h-5 w-5 rotate-180" />
          </Link>
        ) : null}

        {/*
          * The picture opens who they are.
          *
          * It used to be shown only when there was no back arrow, so on every
          * screen with a list behind it the person you were talking to had no
          * face at all. It is always here now, and it is the way in to their
          * brief and what they can do, because a name and a job title above a
          * chat box does not tell you which of them to ask.
          */}
        <button
          type="button"
          onClick={() => setProfileOpen(true)}
          aria-label={`About ${department.personaName || department.name}`}
          className="md-state hidden flex-none rounded-full medium:block"
        >
          <DepartmentAvatar department={department} size={44} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="md-title-lg truncate">{department.name}</h1>
            <StatusDot status={liveStatus} />
            {/* The dot says the same thing in a tenth of the width. On a phone
                the words were wrapping to two lines and truncating the name
                they were meant to annotate. */}
            <span className="md-label-sm hidden flex-none text-on-variant medium:inline">
              {STATUS_MEANING[liveStatus]}
            </span>
          </div>
          <p className="md-label truncate text-on-variant">
            {department.personaName
              ? `${department.personaName}, ${department.roleTitle}`
              : department.roleTitle}
            {active ? ` · ${active.title}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Filing a thread is a chat-level decision, so it sits with the
              thread rather than on a separate page. */}
          {active ? (
            <div className="hidden medium:block">
              <ProjectPicker conversationId={active.id} currentProjectId={active.projectId} />
            </div>
          ) : null}
          <Link
            href={`/library/skills?dept=${encodeURIComponent(departmentId)}`}
            className="hidden medium:block"
          >
            <Chip tone="primary" title="SKILL.md playbooks followed here">
              <SparkIcon className="h-3.5 w-3.5" />
              {skillsFor(departmentId).length} skills
            </Chip>
          </Link>
          {active && messages.length > 0 ? (
            <button
              onClick={async (event) => {
                createRipple(event);
                const id = active.id;
                await deleteConversation(id);
                const next = conversations.find((c) => c.id !== id);
                router.replace(
                  next
                    ? conversationHref(departmentId, next.id)
                    : departmentHrefById(departmentId),
                );
              }}
              title="Delete this conversation"
              className="md-state md-target grid h-9 w-9 place-items-center rounded-full text-on-variant"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          ) : null}
          <ProfileMenu />
        </div>
      </header>

      {needsKey ? (
        <Banner tone="warning">
          No API key yet. Add one in{" "}
          <Link href="/settings" className="underline">
            Settings
          </Link>{" "}
          (or set <code className="font-mono">ANTHROPIC_API_KEY</code> in{" "}
          <code className="font-mono">.env.local</code>) before sending a message.
        </Banner>
      ) : null}
      {/* The empty-profile nudge used to sit here, at the top of every
          conversation, which is a standing chore printed above the work. It is
          a notification, where it is seen once and stops being seen when it is
          done. */}

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto px-4 medium:px-6 expanded:px-8 py-6"
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-5">
          {messages.length === 0 && !isStreaming ? (
            <Welcome
              department={department.name}
              personaName={department.personaName}
              roleTitle={department.roleTitle}
              avatarUrl={department.avatarUrl}
              ready={ready}
              onPick={(prompt) => {
                setDraft(prompt);
                inputRef.current?.focus();
              }}
            />
          ) : null}

          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              onSaveDeliverable={async () => {
                await createDeliverable({
                  title: deriveConversationTitle(message.content),
                  body: message.content,
                  departmentId,
                  sourceConversationId: active?.id,
                });
              }}
              onRecordDecision={() => setCapture(splitForCapture(message.content))}
              onDecideTool={async (callId, approve) => {
                const call = message.toolCalls?.find((entry) => entry.id === callId);
                if (!call || call.state !== "pending" || !active) return;

                let next: ToolCallRecord = { ...call, state: "declined" };
                if (approve) {
                  try {
                    const result = await runTool(call, departmentId, store);
                    next = { ...call, state: "approved", result };
                  } catch (error) {
                    next = {
                      ...call,
                      state: "failed",
                      result: error instanceof Error ? error.message : "It did not run.",
                    };
                  }
                }

                await setMessages(
                  active.id,
                  active.messages.map((entry) =>
                    entry.id === message.id
                      ? {
                          ...entry,
                          toolCalls: entry.toolCalls?.map((c) => (c.id === callId ? next : c)),
                        }
                      : entry,
                  ),
                );
              }}
            />
          ))}

          {isStreaming ? (
            <StreamingBubble text={stream.text} thinking={stream.thinking} />
          ) : null}
        </div>
      </div>

      <div
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes("Files")) {
            event.preventDefault();
            setDragging(true);
          }
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          if (!event.dataTransfer.files.length) return;
          event.preventDefault();
          setDragging(false);
          void attach(event.dataTransfer.files);
        }}
        className={cx(
          "safe-bottom safe-x flex-none border-t px-4 py-3 transition-colors medium:px-6 medium:py-4 expanded:px-8",
          dragging ? "border-primary bg-primary-container/20" : "border-outline-variant",
        )}
      >
        <div className="mx-auto max-w-3xl">
          {pending.length > 0 ? (
            <ul className="mb-2.5 flex flex-wrap items-end gap-2">
              {pending.map((attachment) => (
                <li key={attachment.id} className="relative">
                  {attachment.kind === "image" ? (
                    <img
                      src={attachmentSrc(attachment)}
                      alt={attachment.name}
                      className="h-16 w-16 rounded-xl border border-outline-variant object-cover"
                    />
                  ) : (
                    <div
                      title={attachment.name}
                      className="flex h-16 w-40 flex-col justify-center gap-0.5 rounded-xl border border-outline-variant bg-low px-3"
                    >
                      <span className="md-label truncate">
                        {FILE_ICON[attachment.kind]} {attachment.name}
                      </span>
                      <span className="md-label-sm text-on-variant/75">
                        {attachment.kind === "pdf"
                          ? formatBytes(attachment.size ?? 0)
                          : `${(attachment.text?.length ?? 0).toLocaleString()} chars`}
                      </span>
                    </div>
                  )}
                  <button
                    onClick={() =>
                      setPending((current) =>
                        current.filter((item) => item.id !== attachment.id),
                      )
                    }
                    aria-label={`Remove ${attachment.name}`}
                    className="md-state absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-highest text-on-surface shadow-e1"
                  >
                    <CloseIcon className="h-3 w-3" />
                  </button>
                </li>
              ))}
              <li className="md-label-sm pb-1 text-on-variant/75">
                about{" "}
                {pending
                  .reduce((total, item) => total + estimateAttachmentTokens(item), 0)
                  .toLocaleString()}{" "}
                tokens
              </li>
            </ul>
          ) : null}

          {attachError ? <p className="md-label mb-2 text-error">{attachError}</p> : null}
          {/* items-end keeps the buttons on the last line as the field grows,
              which needs every control in the row to be the same height as one
              line. md-target and md-composer-field are that height. */}
          <div className="flex items-end gap-2 rounded-3xl border border-outline-variant bg-lowest py-2 pl-3 pr-2 transition-colors focus-within:border-primary">
            {/* Uploads can be switched off for one person, and the Library
                picker goes with them: both put a file into the business. */}
            {can("files") ? (
              <button
                onClick={() => fileRef.current?.click()}
                aria-label="Attach a file"
                title="Images, PDFs, Word documents and text files."
                className="md-state md-target grid h-10 w-10 flex-none place-items-center rounded-full text-on-variant"
              >
                <PaperclipIcon className="h-5 w-5" />
              </button>
            ) : null}
            {shared.length && can("library") ? (
              <button
                onClick={() => setPickerOpen(true)}
                aria-label="Attach from the Library"
                title={`${shared.length} file${shared.length === 1 ? "" : "s"} shared with this department`}
                className="md-state md-target grid h-10 w-10 flex-none place-items-center rounded-full text-on-variant"
              >
                <DocIcon className="h-5 w-5" />
              </button>
            ) : null}
            <textarea
              ref={inputRef}
              value={draft}
              rows={1}
              onPaste={(event) => {
                const files = Array.from(event.clipboardData.files);
                if (files.length) {
                  event.preventDefault();
                  void attach(files);
                }
              }}
              placeholder={`Ask ${department.personaName || department.name} anything…`}
              onChange={(event) => {
                setDraft(event.target.value);
                autoGrow(event.target);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
              className="md-body md-composer-field max-h-[220px] w-full resize-none bg-transparent text-on-surface placeholder:text-on-variant/70 focus:outline-none"
            />
            {isStreaming ? (
              <Button
                variant="outlined"
                onClick={() => abortRef.current?.abort()}
                className="md-target flex-none"
              >
                Stop
              </Button>
            ) : (
              <button
                onClick={(event) => {
                  createRipple(event);
                  void send();
                }}
                disabled={!draft.trim() && pending.length === 0}
                aria-label="Send message"
                className={cx(
                  "md-state md-target grid h-10 w-10 flex-none place-items-center rounded-full transition-colors",
                  "bg-primary text-on-primary shadow-e1",
                  "disabled:bg-highest disabled:text-on-variant/75 disabled:shadow-none",
                )}
              >
                <SendIcon className="h-5 w-5" />
              </button>
            )}
          </div>
          <p className="md-label-sm mt-2 text-center text-on-variant/70">
            <span className="hidden medium:inline">
              Enter to send · Shift+Enter for a new line ·{" "}
            </span>
            {settings.model} · {settings.effort} effort
            {lastUsage ? (
              <>
                {" · "}
                <span
                  title="Cached tokens cost about a tenth of full price."
                  className={lastUsage.cacheRead > 0 ? "text-success" : undefined}
                >
                  {lastUsage.cacheRead > 0
                    ? `${lastUsage.cacheRead.toLocaleString()} cached`
                    : "no cache hit"}
                </span>
                {` · ${lastUsage.input.toLocaleString()} new in · ${lastUsage.output.toLocaleString()} out`}
              </>
            ) : null}
          </p>

          <HeadProfile
            department={department}
            open={profileOpen}
            onClose={() => setProfileOpen(false)}
          />

          <Dialog
            open={pickerOpen}
            title="Attach from the Library"
            width="max-w-lg"
            onClose={() => setPickerOpen(false)}
            footer={
              <Button variant="text" onClick={() => setPickerOpen(false)}>
                Done
              </Button>
            }
          >
            <ul className="flex flex-col gap-1">
              {shared.map((file) => {
                const already = pending.some((item) => item.id === file.id);
                return (
                  <li key={file.id}>
                    <button
                      type="button"
                      disabled={already || pending.length >= MAX_ATTACHMENTS_PER_MESSAGE}
                      onClick={() => {
                        setPending((current) => [...current, file]);
                        setPickerOpen(false);
                      }}
                      className={cx(
                        "md-state flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left",
                        "transition-colors disabled:opacity-[0.38]",
                      )}
                    >
                      <span aria-hidden className="text-lg">
                        {FILE_ICON[file.kind]}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="md-body block truncate">{file.name}</span>
                        <span className="md-label-sm block truncate text-on-variant/75">
                          {file.departmentId === COMPANY_ID
                            ? "Shared with every department"
                            : "Shared with this department"}
                        </span>
                      </span>
                      {already ? <Chip>Added</Chip> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Dialog>

          <Dialog
            open={Boolean(capture)}
            title="Record a decision"
            onClose={() => setCapture(null)}
            footer={
              <>
                <Button variant="text" onClick={() => setCapture(null)}>
                  Cancel
                </Button>
                <Button
                  disabled={!capture?.label.trim()}
                  onClick={async () => {
                    if (!capture?.label.trim()) return;
                    await saveMemory({
                      kind: "decision",
                      label: capture.label,
                      detail: capture.detail,
                      revisitWhen: capture.revisitWhen,
                      departmentId,
                      projectId: active?.projectId,
                      sourceConversationId: active?.id,
                    });
                    setCapture(null);
                  }}
                >
                  Record it
                </Button>
              </>
            }
          >
            {capture ? (
              <div className="space-y-4">
                <p className="md-body text-on-variant">
                  This goes into {department.personaName || department.name}&apos;s prompt from
                  now on, so cut it to the line that will still matter in a month.
                </p>
                <Field label="The decision" hint="One line, in the past tense.">
                  <TextInput
                    autoFocus
                    value={capture.label}
                    onChange={(e) => setCapture({ ...capture, label: e.target.value })}
                  />
                </Field>
                <Field label="Why" hint="Why it was decided.">
                  <TextArea
                    rows={3}
                    value={capture.detail}
                    onChange={(e) => setCapture({ ...capture, detail: e.target.value })}
                  />
                </Field>
                <Field
                  label="Revisit when"
                  hint="What would reopen this."
                >
                  <TextInput
                    value={capture.revisitWhen}
                    onChange={(e) => setCapture({ ...capture, revisitWhen: e.target.value })}
                    placeholder="What would make you look at this again"
                  />
                </Field>
              </div>
            ) : null}
          </Dialog>

          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED_FILE_TYPES.join(",")}
            multiple
            className="hidden"
            onChange={(event) => {
              // Copied before the input is cleared. `files` is a live view of
              // the input, so resetting the value empties the very list being
              // passed on, and the picker silently did nothing at all.
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              if (files.length) void attach(files);
            }}
          />
        </div>
      </div>
    </div>
  );
}

function Banner({
  tone,
  children,
}: {
  tone: "warning" | "info";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cx(
        "md-label flex-none border-b px-4 medium:px-6 expanded:px-8 py-2.5",
        tone === "warning"
          ? "border-warning/25 bg-warning/10 text-warning"
          : "border-outline-variant bg-low text-on-variant",
      )}
    >
      {children}
    </div>
  );
}

function Welcome({
  department,
  personaName,
  roleTitle,
  avatarUrl,
  ready,
  onPick,
}: {
  department: string;
  personaName: string;
  roleTitle: string;
  avatarUrl?: string;
  ready: boolean;
  onPick: (prompt: string) => void;
}) {
  const entered = useEnter();
  const who = personaName || department;
  const starters = [
    `What should ${department} be focused on this month?`,
    `Give me your read on where we're weakest right now.`,
    `Draft something I can use today.`,
  ];

  return (
    <div ref={entered} className="rounded-3xl border border-outline-variant bg-container/60 px-7 py-9 text-center">
      <div className="mb-3 flex justify-center">
        <DepartmentAvatar
          department={{ name: department, personaName, avatarUrl }}
          size={56}
        />
      </div>
      <h2 className="md-title-lg">{who}</h2>
      <p className="md-label mt-0.5 text-on-variant">{roleTitle}</p>
      <p className="md-body mx-auto mt-3 max-w-md text-on-variant">
        {ready
          ? `${who} keeps their own history, scoped to ${department}. Nothing you say here leaks into another department's thread.`
          : "Loading your workspace…"}
      </p>
      <div className="mt-6 flex flex-col items-stretch gap-2 medium:flex-row medium:flex-wrap medium:justify-center">
        {starters.map((prompt) => (
          <Chip key={prompt} wrap onClick={() => onPick(prompt)}>
            {prompt}
          </Chip>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  onSaveDeliverable,
  onRecordDecision,
  onDecideTool,
}: {
  message: Message;
  onSaveDeliverable: () => Promise<void>;
  onRecordDecision: () => void;
  onDecideTool: (callId: string, approve: boolean) => Promise<void>;
}) {
  const entered = useEnter();
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  if (message.role === "user") {
    return (
      <div ref={entered} className="flex flex-col items-end">
        {/* Only on a shared thread, where "who said this" is a real question. */}
        {message.authorEmail ? (
          <span className="md-label-sm mb-1 mr-1 text-on-variant/75">
            {message.authorEmail}
          </span>
        ) : null}
        <div className="max-w-[85%] rounded-3xl rounded-br-lg bg-primary-container px-4 py-3 text-on-primary-container shadow-e1">
          {message.attachments?.length ? (
            <ul
              className={cx(
                "mb-2 grid gap-1.5",
                message.attachments.length > 1 ? "grid-cols-2" : "grid-cols-1",
              )}
            >
              {message.attachments.map((attachment) =>
                attachment.kind === "image" ? (
                  <li key={attachment.id}>
                    <a
                      href={attachmentSrc(attachment)}
                      target="_blank"
                      rel="noreferrer"
                      title={attachment.name}
                    >
                      <img
                        src={attachmentSrc(attachment)}
                        alt={attachment.name}
                        className="max-h-64 w-full rounded-xl object-contain"
                      />
                    </a>
                  </li>
                ) : (
                  <li
                    key={attachment.id}
                    className="md-label flex items-center gap-2 rounded-xl bg-black/15 px-3 py-2"
                  >
                    <span aria-hidden>{FILE_ICON[attachment.kind]}</span>
                    <span className="truncate">{attachment.name}</span>
                  </li>
                ),
              )}
            </ul>
          ) : null}
          {/* Anywhere, not break-word: a pasted URL or key is one word, and one
              word wider than the bubble takes the layout with it. */}
          {message.content ? (
            <p className="md-body whitespace-pre-wrap [overflow-wrap:anywhere]">
              {message.content}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div ref={entered} className="group flex flex-col gap-2">
      {message.thinking ? <ThinkingBlock text={message.thinking} /> : null}
      <div
        className={cx(
          "rounded-3xl rounded-bl-lg px-5 py-4 shadow-e1",
          message.error ? "bg-error-container text-on-error-container" : "bg-container",
        )}
      >
        <Markdown>{message.content}</Markdown>
      </div>

      {message.toolCalls?.length ? (
        <ul className="mt-2 flex flex-col gap-2">
          {message.toolCalls.map((call) => (
            <li key={call.id}>
              <ToolCard call={call} onDecide={onDecideTool} />
            </li>
          ))}
        </ul>
      ) : null}
      {!message.error ? (
        <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <IconAction
            label={copied ? "Copied" : "Copy"}
            onClick={async () => {
              await navigator.clipboard.writeText(message.content);
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            }}
          >
            {copied ? <CheckIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
          </IconAction>
          <IconAction
            label={saved ? "Saved to Deliverables" : "Save as deliverable"}
            onClick={async () => {
              await onSaveDeliverable();
              setSaved(true);
              setTimeout(() => setSaved(false), 2400);
            }}
          >
            {saved ? <CheckIcon className="h-3.5 w-3.5" /> : <BookmarkIcon className="h-3.5 w-3.5" />}
          </IconAction>
          <IconAction label="Record a decision" onClick={onRecordDecision}>
            <SparkIcon className="h-3.5 w-3.5" />
          </IconAction>
        </div>
      ) : null}
    </div>
  );
}

function IconAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void | Promise<void>;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={(event) => {
        createRipple(event);
        void onClick();
      }}
      className="md-state md-label-sm flex items-center gap-1.5 rounded-lg px-2 py-1 text-on-variant"
    >
      {children}
      {label}
    </button>
  );
}

function StreamingBubble({ text, thinking }: { text: string; thinking: string }) {
  const entered = useEnter();
  return (
    <div ref={entered} className="flex flex-col gap-2">
      {thinking && !text ? <ThinkingBlock text={thinking} defaultOpen /> : null}
      {thinking && text ? <ThinkingBlock text={thinking} /> : null}
      <div className="rounded-3xl rounded-bl-lg bg-container px-5 py-4 shadow-e1">
        {text ? (
          <Markdown>{text}</Markdown>
        ) : (
          <div className="flex items-center gap-1.5 py-1">
            <span className="typing-dot" />
            <span className="typing-dot" style={{ animationDelay: "0.15s" }} />
            <span className="typing-dot" style={{ animationDelay: "0.3s" }} />
          </div>
        )}
      </div>
    </div>
  );
}

function ThinkingBlock({ text, defaultOpen = false }: { text: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-outline-variant bg-low">
      <button
        onClick={() => setOpen((value) => !value)}
        className="md-label-sm flex w-full items-center gap-2 px-4 py-2 text-on-variant"
      >
        <ChevronIcon
          className={cx("h-3.5 w-3.5 transition-transform", open && "rotate-90")}
        />
        Reasoning
      </button>
      {open ? (
        <p className="md-body whitespace-pre-wrap px-4 pb-3 text-on-variant/80">{text}</p>
      ) : null}
    </div>
  );
}

function PaperclipIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden className={className}>
      <path d="M720-330q0 104-73 177T470-80q-104 0-177-73t-73-177v-370q0-75 52.5-127.5T400-880q75 0 127.5 52.5T580-700v350q0 46-32 78t-78 32q-46 0-78-32t-32-78v-370h80v370q0 13 8.5 21.5T470-320q13 0 21.5-8.5T500-350v-350q-1-42-29.5-71T400-800q-42 0-71 29t-29 71v370q-1 71 49 120.5T470-160q70 0 119-49.5T640-330v-390h80v390Z" />
    </svg>
  );
}


/**
 * One action a department has proposed.
 *
 * Nothing runs until it is approved here. A model that has misread the room
 * proposing a task is a card to dismiss; the same model creating one silently
 * is a record in the workspace nobody asked for.
 */
function ToolCard({
  call,
  onDecide,
}: {
  call: NonNullable<Message["toolCalls"]>[number];
  onDecide: (callId: string, approve: boolean) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const tool = findTool(call.name);
  const summary = tool ? tool.summarise(call.input) : call.name;

  const settled = call.state !== "pending";

  return (
    <div
      className={cx(
        "rounded-2xl border px-4 py-3",
        call.state === "approved"
          ? "border-success/40 bg-success/10"
          : call.state === "failed"
            ? "border-error/40 bg-error-container/20"
            : call.state === "declined"
              ? "border-outline-variant opacity-60"
              : "border-primary/40 bg-primary-container/20",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="md-label-sm text-on-variant">
          {settled ? "Action" : "Proposed action"}
        </span>
        <span className="md-body flex-1">{summary}</span>
      </div>

      {call.result ? (
        <p
          className={cx(
            "md-label-sm mt-1",
            call.state === "failed" ? "text-error" : "text-on-variant",
          )}
        >
          {call.result}
        </p>
      ) : null}

      {settled ? (
        <p className="md-label-sm mt-1 text-on-variant/75">
          {call.state === "declined" ? "Not run." : null}
        </p>
      ) : (
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onDecide(call.id, true);
              setBusy(false);
            }}
          >
            {busy ? "Running…" : "Approve"}
          </Button>
          <Button
            size="sm"
            variant="outlined"
            disabled={busy}
            onClick={() => void onDecide(call.id, false)}
          >
            Dismiss
          </Button>
        </div>
      )}
    </div>
  );
}
