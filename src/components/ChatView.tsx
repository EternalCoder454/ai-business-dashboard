"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { newId } from "@/lib/db";
import {
  ACCEPTED_FILE_TYPES,
  FILE_ICON,
  estimateAttachmentTokens,
  fileToAttachmentAny,
  formatBytes,
} from "@/lib/files";
import { AttachmentError, MAX_ATTACHMENTS_PER_MESSAGE, attachmentSrc } from "@/lib/images";
import { buildSystemPrompt, deriveConversationTitle, hasProfileContent } from "@/lib/prompts";
import { conversationHref, departmentHrefById } from "@/lib/routes";
import { useStore } from "@/lib/store";
import { ProjectPicker } from "./ProjectBits";
import type { Attachment, Conversation, Message, TokenUsage, WireContent } from "@/lib/types";
import { streamChat } from "@/lib/chatClient";
import {
  BookmarkIcon,
  Button,
  CheckIcon,
  ChevronIcon,
  CloseIcon,
  CopyIcon,
  Chip,
  SendIcon,
  SparkIcon,
  StatusDot,
  STATUS_LABEL,
  TrashIcon,
  cx,
} from "./ui";
import { createRipple } from "./ui/ripple";

interface StreamState {
  text: string;
  thinking: string;
}

const EMPTY_STREAM: StreamState = { text: "", thinking: "" };

/**
 * A turn with attachments becomes content blocks. Files lead, because the API
 * answers a question about a document better when the document comes first.
 */
function toWire(message: Message): string | WireContent[] {
  if (!message.attachments?.length) return message.content;

  const blocks: WireContent[] = [];
  for (const attachment of message.attachments) {
    if (attachment.kind === "image") {
      blocks.push({
        type: "image",
        mediaType: attachment.mediaType,
        data: attachment.data,
      });
    } else if (attachment.kind === "pdf") {
      blocks.push({
        type: "document",
        mediaType: attachment.mediaType,
        data: attachment.data,
        name: attachment.name,
      });
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
    skillsFor,
    profile,
    settings,
    account,
  } = useStore();

  const department = getDepartment(departmentId);
  const conversations = conversationsFor(departmentId);
  const requestedId = searchParams.get("c");

  const active: Conversation | undefined = useMemo(() => {
    if (requestedId) {
      const match = conversations.find((c) => c.id === requestedId);
      if (match) return match;
    }
    return conversations[0];
  }, [conversations, requestedId]);

  const [draft, setDraft] = useState("");
  const [stream, setStream] = useState<StreamState>(EMPTY_STREAM);
  const [isStreaming, setIsStreaming] = useState(false);
  const [lastUsage, setLastUsage] = useState<TokenUsage | null>(null);
  const [pending, setPending] = useState<Attachment[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
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

    const userMessage: Message = {
      id: newId("msg"),
      role: "user",
      content: text,
      timestamp: Date.now(),
      attachments: pending.length ? pending : undefined,
    };

    const history = [...conversation.messages, userMessage];

    setDraft("");
    setPending([]);
    setAttachError(null);
    if (inputRef.current) inputRef.current.style.height = "auto";
    stickToBottom.current = true;
    setStream(EMPTY_STREAM);
    setIsStreaming(true);

    await setMessages(conversation.id, history);
    if (conversation.messages.length === 0) {
      await updateConversation(conversation.id, { title: deriveConversationTitle(text) });
    }

    const controller = new AbortController();
    abortRef.current = controller;

    const result = await streamChat(
      {
        system: buildSystemPrompt(
          department,
          profile,
          settings.companyName,
          skillsFor(departmentId),
          settings.writingRules,
          account,
        ),
        messages: history.map((m) => ({
          role: m.role,
          content: toWire(m),
        })),
        model: settings.model,
        effort: settings.effort,
      },
      settings.apiKey,
      settings.workspaceId,
      {
        onText: (_delta, full) => setStream((current) => ({ ...current, text: full })),
        onThinking: (_delta, full) =>
          setStream((current) => ({ ...current, thinking: full })),
        onUsage: setLastUsage,
      },
      controller.signal,
    );

    const collectedText = result.text;
    const collectedThinking = result.thinking;
    const failure = result.error ?? "";

    const assistantMessage: Message = {
      id: newId("msg"),
      role: "assistant",
      content: collectedText || failure || "No response was returned.",
      thinking: collectedThinking || undefined,
      timestamp: Date.now(),
      error: !collectedText && Boolean(failure),
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
    setStream(EMPTY_STREAM);
    inputRef.current?.focus();
  }, [
    draft,
    pending,
    isStreaming,
    department,
    active,
    createConversation,
    departmentId,
    router,
    setMessages,
    updateConversation,
    settings,
    profile,
    skillsFor,
    account,
  ]);

  if (!department) {
    return (
      <div className="flex flex-1 items-center justify-center p-10 text-center">
        <div>
          <p className="md-title-lg">Department not found</p>
          <p className="md-body mt-2 text-on-variant">
            It may have been removed in Settings.
          </p>
          <Link href="/" className="md-label mt-5 inline-block text-primary underline">
            Back to the org chart
          </Link>
        </div>
      </div>
    );
  }

  const needsKey = !settings.apiKey;
  const profileMissing = !hasProfileContent(profile);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="safe-top safe-x flex flex-none items-center gap-3 border-b border-outline-variant px-2 py-2 medium:gap-4 medium:px-6 medium:py-4 expanded:px-8">
        <button
          onClick={() => {
            if (window.history.length > 1) router.back();
            else router.push("/");
          }}
          aria-label="Go back"
          className="md-state grid h-11 w-11 flex-none place-items-center rounded-full text-on-surface medium:hidden"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className="h-5 w-5"
          >
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <div className="hidden h-11 w-11 flex-none place-items-center rounded-2xl bg-container text-xl shadow-e1 medium:grid">
          <span aria-hidden>{department.emoji}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="md-title-lg truncate">{department.name}</h1>
            <StatusDot status={department.status} />
            <span className="md-label-sm text-on-variant">
              {STATUS_LABEL[department.status]}
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
            <Chip tone="primary" title="SKILL.md playbooks this head follows">
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
      ) : profileMissing ? (
        <Banner tone="info">
          Your{" "}
          <Link href="/profile" className="underline">
            Company Profile
          </Link>{" "}
          is empty. Filling it in gives every department the same business context.
        </Banner>
      ) : null}

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
              emoji={department.emoji}
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
          <div className="flex items-end gap-2 rounded-3xl border border-outline-variant bg-lowest py-2 pl-4 pr-2 transition-colors focus-within:border-primary">
            <button
              onClick={() => fileRef.current?.click()}
              aria-label="Attach a file"
              title="Attach an image, PDF, Word document, or text file. Images can be pasted straight in."
              className="md-state md-target grid h-9 w-9 flex-none place-items-center self-end rounded-full text-on-variant"
            >
              <PaperclipIcon className="h-5 w-5" />
            </button>
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
              /* py-2 centres a single line against the 40px send button; the
                 field grows from there as lines are added. */
              className="md-body max-h-[220px] min-h-10 w-full resize-none bg-transparent py-2 text-on-surface placeholder:text-on-variant/70 focus:outline-none"
            />
            {isStreaming ? (
              <Button
                variant="outlined"
                onClick={() => abortRef.current?.abort()}
                className="flex-none"
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
                  "md-state grid h-10 w-10 flex-none place-items-center rounded-full transition-colors",
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
                  title="Prompt caching: tokens read from cache cost about a tenth of full price."
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

          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED_FILE_TYPES.join(",")}
            multiple
            className="hidden"
            onChange={(event) => {
              const files = event.target.files;
              event.target.value = "";
              if (files?.length) void attach(files);
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
  emoji,
  ready,
  onPick,
}: {
  department: string;
  personaName: string;
  roleTitle: string;
  emoji: string;
  ready: boolean;
  onPick: (prompt: string) => void;
}) {
  const who = personaName || department;
  const starters = [
    `What should ${department} be focused on this month?`,
    `Give me your read on where we're weakest right now.`,
    `Draft something I can use today.`,
  ];

  return (
    <div className="animate-rise rounded-3xl border border-outline-variant bg-container/60 px-7 py-9 text-center">
      <div className="mb-3 text-4xl" aria-hidden>
        {emoji}
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
}: {
  message: Message;
  onSaveDeliverable: () => Promise<void>;
}) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  if (message.role === "user") {
    return (
      <div className="animate-rise flex justify-end">
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
          {message.content ? (
            <p className="md-body whitespace-pre-wrap">{message.content}</p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-rise group flex flex-col gap-2">
      {message.thinking ? <ThinkingBlock text={message.thinking} /> : null}
      <div
        className={cx(
          "rounded-3xl rounded-bl-lg px-5 py-4 shadow-e1",
          message.error ? "bg-error-container text-on-error-container" : "bg-container",
        )}
      >
        <Markdown>{message.content}</Markdown>
      </div>
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
  return (
    <div className="animate-rise flex flex-col gap-2">
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
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M21 11.5 12.5 20a5 5 0 0 1-7-7l8-8a3.5 3.5 0 0 1 5 5l-8 8a2 2 0 0 1-3-3l7.5-7.5" />
    </svg>
  );
}

export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-md3">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
