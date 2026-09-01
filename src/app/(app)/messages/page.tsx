"use client";

import { PageHeader } from "@/components/PageHeader";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Chip,
  EmptyState,
  SendIcon,
  TextArea,
  cx,
} from "@/components/ui";
import { createRipple } from "@/components/ui/ripple";
import { useMessages, useThread } from "@/lib/messages";
import { formatRelativeTime } from "@/lib/routes";
import type { Colleague, DirectMessage } from "@/lib/types";

/**
 * A two pane list-detail layout, which is the Material pattern for exactly this
 * shape of content. On an expanded window both panes are visible; below that
 * they become one pane at a time, since a 360px phone cannot hold a readable
 * list and a readable conversation side by side.
 */
export default function MessagesPage() {
  const { ready, enabled, self, threads, people, refresh, clearUnreadFor } = useMessages();
  const [open, setOpen] = useState<string>();

  const byEmail = useMemo(() => new Map(people.map((p) => [p.email, p])), [people]);

  /** Threads first, then anyone with no history yet, so the directory is never a dead end. */
  const rows = useMemo(() => {
    const withHistory = threads.map((thread) => ({
      email: thread.email,
      person: byEmail.get(thread.email),
      preview: thread.lastFromSelf ? `You: ${thread.lastBody}` : thread.lastBody,
      at: thread.lastSentAt,
      unread: thread.unread,
    }));
    const known = new Set(threads.map((t) => t.email));
    const rest = people
      .filter((person) => !known.has(person.email))
      .map((person) => ({
        email: person.email,
        person,
        preview: person.hasSignedIn ? "No messages yet" : "Has not signed in yet",
        at: 0,
        unread: 0,
      }));
    return [...withHistory, ...rest];
  }, [threads, people, byEmail]);

  // Opening a thread is what marks it read, so the badge should drop at once
  // rather than at the next poll.
  useEffect(() => {
    if (!open) return;
    clearUnreadFor(open);
    void fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markRead: open }),
    }).catch(() => {});
  }, [open, clearUnreadFor]);

  if (!ready) return <div className="flex-1" />;

  if (!enabled) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <PageHeader eyebrow="People" title="Inbox" />
        <div className="px-4 py-6 medium:px-6 expanded:px-8">
          <EmptyState
            icon="✉️"
            title="The inbox needs the hosted workspace"
            description="A message belongs to two people, so it cannot live in one browser."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={cx(open && "hidden expanded:block")}>
        <PageHeader
          eyebrow="People"
          title="Inbox"
        />
      </div>

      <div className="flex min-h-0 flex-1">
        {/* ------------------------------------------------- list pane */}
        <div
          className={cx(
            "min-h-0 min-w-0 flex-1 overflow-y-auto",
            // An explicit width, not just a max: flex-none with only a cap lets
            // the pane shrink to whatever the longest name happens to be.
            "expanded:w-80 expanded:flex-none expanded:border-r expanded:border-outline-variant",
            open && "hidden expanded:block",
          )}
        >
          {rows.length === 0 ? (
            <div className="px-4 py-6">
              <EmptyState
                icon="👤"
                title="Nobody else yet"
                description="Add an address to ALLOWED_EMAILS and they appear here."
              />
            </div>
          ) : (
            <ul className="stagger p-2">
              {rows.map((row) => (
                <li key={row.email}>
                  <button
                    type="button"
                    onClick={(event) => {
                      createRipple(event);
                      setOpen(row.email);
                    }}
                    className={cx(
                      "md-state flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left",
                      "transition-colors",
                      open === row.email && "bg-secondary-container",
                    )}
                  >
                    <Avatar person={row.person} email={row.email} />

                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span
                          className={cx(
                            "md-body truncate",
                            row.unread > 0 &&
                              "font-semibold text-on-surface",
                          )}
                        >
                          {row.person?.displayName || row.email}
                        </span>
                        {row.at > 0 ? (
                          <span className="md-label-sm ml-auto flex-none text-on-variant/75">
                            {formatRelativeTime(row.at)}
                          </span>
                        ) : null}
                      </span>
                      <span
                        className={cx(
                          "md-label-sm mt-0.5 block truncate",
                          row.unread > 0 ? "text-on-surface" : "text-on-variant/75",
                        )}
                      >
                        {row.preview}
                      </span>
                    </span>

                    {row.unread > 0 ? (
                      <span
                        aria-label={`${row.unread} unread`}
                        className={cx(
                          "md-label-sm grid h-5 min-w-5 flex-none place-items-center rounded-full px-1.5",
                          "bg-primary text-on-primary",
                        )}
                      >
                        {row.unread > 99 ? "99+" : row.unread}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ------------------------------------------------- detail pane */}
        <div className={cx("min-h-0 min-w-0 flex-1", !open && "hidden expanded:flex")}>
          {open ? (
            <Thread
              key={open}
              other={open}
              person={byEmail.get(open)}
              self={self}
              onBack={() => setOpen(undefined)}
              onSent={refresh}
            />
          ) : (
            <div className="hidden w-full items-center justify-center p-8 expanded:flex">
              <p className="md-body text-on-variant">Pick someone to write to.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Avatar({ person, email }: { person?: Colleague; email: string }) {
  if (person?.avatarUrl) {
    // Google's own CDN, already sized for this.
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={person.avatarUrl}
        alt=""
        width={40}
        height={40}
        className="h-10 w-10 flex-none rounded-full"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="grid h-10 w-10 flex-none place-items-center rounded-full bg-primary-container text-on-primary-container"
    >
      {(person?.displayName || email).charAt(0).toUpperCase()}
    </span>
  );
}

function Thread({
  other,
  person,
  self,
  onBack,
  onSent,
}: {
  other: string;
  person?: Colleague;
  self?: string;
  onBack: () => void;
  onSent: () => void;
}) {
  const { messages, sending, error, send } = useThread(other, self);
  const [draft, setDraft] = useState("");
  const bottom = useRef<HTMLDivElement | null>(null);
  const box = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const submit = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    if (box.current) box.current.style.height = "auto";
    await send(text);
    onSent();
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <header className="safe-top safe-pt-3 medium:safe-pt-4 flex flex-none items-center gap-3 border-b border-outline-variant px-2 pb-3 medium:px-6 medium:pb-4 expanded:px-6">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to messages"
          className="md-state grid h-11 w-11 flex-none place-items-center rounded-full text-on-surface expanded:hidden"
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

        <Avatar person={person} email={other} />

        <div className="min-w-0 flex-1">
          <p className="md-title-lg truncate">{person?.displayName || other}</p>
          <p className="md-label truncate text-on-variant">
            {person?.roleTitle ? `${person.roleTitle} · ${other}` : other}
          </p>
        </div>

        {person && !person.hasSignedIn ? (
          <Chip tone="warning" title="They are on the allowlist but have never signed in">
            Not signed in yet
          </Chip>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 medium:px-6">
        {messages.length === 0 ? (
          <p className="md-body py-10 text-center text-on-variant">
            Nothing here yet. Say something.
          </p>
        ) : (
          <ul className="measure-read flex flex-col gap-1.5">
            {messages.map((message, index) => (
              <Bubble
                key={message.id}
                message={message}
                self={self}
                previous={messages[index - 1]}
              />
            ))}
          </ul>
        )}
        <div ref={bottom} />
      </div>

      {error ? (
        <p className="md-label mx-3 mb-2 rounded-xl border border-error/30 bg-error-container/20 px-3 py-2 text-error medium:mx-6">
          {error}
        </p>
      ) : null}

      <div className="safe-bottom flex-none border-t border-outline-variant px-3 py-3 medium:px-6">
        <div className="measure-read flex items-end gap-2">
          <TextArea
            ref={box}
            value={draft}
            rows={1}
            placeholder={`Message ${person?.displayName || other}`}
            className="min-h-10 resize-none py-2"
            onChange={(event) => {
              setDraft(event.target.value);
              const el = event.target;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
            }}
            onKeyDown={(event) => {
              // Enter sends, shift and enter makes a new line, which is what
              // every chat does and therefore what fingers already expect.
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
          />
          <Button
            aria-label="Send"
            disabled={!draft.trim() || sending}
            onClick={() => void submit()}
            className="h-10 flex-none"
            icon={<SendIcon className="h-4 w-4" />}
          >
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * One message.
 *
 * Yours sit right in the primary container, theirs left in the surface
 * container, which is the ordinary chat convention and also the M3 guidance for
 * distinguishing an emphasised element from a neutral one. Consecutive messages
 * from the same person lose the gap and square the adjoining corner, so a run
 * of three reads as one block rather than three separate statements.
 */
function Bubble({
  message,
  self,
  previous,
}: {
  message: DirectMessage;
  self?: string;
  previous?: DirectMessage;
}) {
  const mine = message.fromEmail === self;
  const runOn =
    previous?.fromEmail === message.fromEmail &&
    message.sentAt - previous.sentAt < 5 * 60_000;
  const pending = message.id.startsWith("pending:");

  return (
    <li className={cx("flex", mine ? "justify-end" : "justify-start", !runOn && "mt-2.5")}>
      <div
        className={cx(
          "max-w-[85%] rounded-2xl px-3.5 py-2 medium:max-w-[70%]",
          mine
            ? "bg-primary-container text-on-primary-container"
            : "bg-container text-on-surface",
          // Squaring the inner corner is what visually joins a run together.
          runOn && (mine ? "rounded-tr-md" : "rounded-tl-md"),
          pending && "opacity-60",
        )}
      >
        <p className="md-body whitespace-pre-wrap break-words">{message.body}</p>
        <p
          className={cx(
            "md-label-sm mt-1 text-right",
            mine ? "text-on-primary-container/75" : "text-on-variant/75",
          )}
        >
          {pending ? "Sending…" : formatRelativeTime(message.sentAt)}
        </p>
      </div>
    </li>
  );
}
