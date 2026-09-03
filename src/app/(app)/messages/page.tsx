"use client";

import { PageHeader } from "@/components/PageHeader";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  ChevronIcon,
  Chip,
  EmptyState,
  EyeIcon,
  EyeOffIcon,
  SendIcon,
  StatusDot,
  TextArea,
  cx,
} from "@/components/ui";
import { createRipple } from "@/components/ui/ripple";
import { useMessages, useThread } from "@/lib/messages";
import { formatRelativeTime } from "@/lib/routes";
import { useStore } from "@/lib/store";
import {
  DELIVERY_LABEL,
  PRESENCE_LABEL,
  deliveryOf,
  type Colleague,
  type Delivery,
  type DirectMessage,
  type PresenceStatus,
} from "@/lib/types";

/**
 * Presence borrows the department dot rather than inventing a second set of
 * colours for the same idea. Do-not-disturb reads as busy, which is what it is.
 */
const DOT: Record<PresenceStatus, "online" | "busy" | "offline"> = {
  online: "online",
  dnd: "busy",
  offline: "offline",
};

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
      lastFromSelf: thread.lastFromSelf,
      lastSeen: thread.lastSeen,
      unread: thread.unread,
    }));
    const known = new Set(threads.map((t) => t.email));
    const rest = people
      .filter((person) => !known.has(person.email))
      .map((person) => ({
        email: person.email,
        person,
        preview: "No messages yet",
        at: 0,
        lastFromSelf: false,
        lastSeen: false,
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
            title="Inbox requires a hosted workspace"
            description="Messages require a hosted workspace."
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
                description="Colleagues appear here once an administrator adds them."
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
                          "md-label-sm mt-0.5 flex items-center gap-1.5",
                          row.unread > 0 ? "text-on-surface" : "text-on-variant/75",
                        )}
                      >
                        {/* Only on a row I sent last. On theirs the question
                            is whether I have read it, and I am the one
                            looking. */}
                        {row.lastFromSelf ? (
                          <span
                            role="img"
                            aria-label={row.lastSeen ? "Seen" : "Not seen"}
                            className="flex-none"
                          >
                            {row.lastSeen ? (
                              <EyeIcon className="h-3.5 w-3.5" />
                            ) : (
                              <EyeOffIcon className="h-3.5 w-3.5" />
                            )}
                          </span>
                        ) : null}
                        <span className="truncate">{row.preview}</span>
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
  const { messages, sending, error, send, retry, seenThrough } = useThread(other, self);
  // Own picture and name, so a run of your own messages is headed like theirs.
  const { account } = useStore();
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
          <ChevronIcon className="h-5 w-5 rotate-180" />
        </button>

        <Avatar person={person} email={other} />

        <div className="min-w-0 flex-1">
          <p className="md-title-lg truncate">{person?.displayName || other}</p>
          <p className="md-label truncate text-on-variant">
            {person?.roleTitle ? `${person.roleTitle} · ${other}` : other}
          </p>
        </div>

        {person ? (
          <span className="flex flex-none items-center gap-1.5">
            <StatusDot status={DOT[person.presence]} animate={person.presence === "online"} />
            <span className="md-label-sm hidden text-on-variant medium:inline">
              {PRESENCE_LABEL[person.presence]}
            </span>
          </span>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 medium:px-6">
        {messages.length === 0 ? (
          <p className="md-body py-10 text-center text-on-variant">
            No messages yet.
          </p>
        ) : (
          <ul className="measure-read flex flex-col pb-2">
            {messages.map((message, index) => (
              <MessageRow
                key={message.id}
                message={message}
                self={self}
                previous={messages[index - 1]}
                next={messages[index + 1]}
                delivery={deliveryOf(message, self, seenThrough)}
                onRetry={retry}
                sender={
                  message.fromEmail === self
                    ? { displayName: account.displayName || "You", avatarUrl: account.avatarUrl }
                    : {
                        displayName: person?.displayName || other,
                        avatarUrl: person?.avatarUrl,
                      }
                }
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
            className="md-composer-field [--composer-border:1px] resize-none"
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
            className="md-target flex-none"
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
 * One message, laid out the way a chat app lays them out.
 *
 * Not left and right bubbles. A run of messages from one person shows their
 * picture and name once and then indents the rest under it, so a back and
 * forth reads as a conversation rather than as alternating blocks.
 */
function MessageRow({
  message,
  self,
  previous,
  next,
  sender,
  delivery,
  onRetry,
}: {
  message: DirectMessage;
  self?: string;
  previous?: DirectMessage;
  next?: DirectMessage;
  sender: { displayName: string; avatarUrl?: string };
  delivery?: Delivery;
  onRetry: (message: DirectMessage) => Promise<void>;
}) {
  const mine = message.fromEmail === self;
  // A new run starts on a different sender, or after five quiet minutes.
  const runOn =
    previous?.fromEmail === message.fromEmail &&
    message.sentAt - previous.sentAt < 5 * 60_000;
  const sendingNow = message.local === "sending";

  /*
   * Once per run of mine, not once per message: the watermark settles
   * everything before it, so a mark on all six lines says the same thing six
   * times. A failure always shows, since burying one is how a message goes
   * missing unnoticed.
   */
  const endsRun = !next || next.fromEmail !== message.fromEmail;
  const showDelivery = delivery && (delivery === "failed" || endsRun);

  return (
    <li className={cx("flex gap-3 px-1", runOn ? "mt-0.5" : "mt-4", sendingNow && "opacity-60")}>
      <div className="w-10 flex-none">
        {runOn ? null : (
          <Avatar
            person={{ displayName: sender.displayName, avatarUrl: sender.avatarUrl } as Colleague}
            email={message.fromEmail}
          />
        )}
      </div>

      <div className="min-w-0 flex-1">
        {runOn ? null : (
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className={cx("md-label", mine ? "text-primary" : "text-on-surface")}>
              {sender.displayName || message.fromEmail}
            </span>
            <span className="md-label-sm text-on-variant/70">
              {formatRelativeTime(message.sentAt)}
            </span>
          </div>
        )}
        <p className="md-body whitespace-pre-wrap break-words text-on-surface">
          {message.body}
        </p>

        {showDelivery && delivery ? (
          <div className="mt-1 flex items-center justify-end gap-2">
            {delivery === "failed" ? (
              <>
                <span className="md-label-sm text-error">{DELIVERY_LABEL.failed}</span>
                {/* Bigger than the label beside it, and padded out past the
                    text, because it is the one thing here somebody has to be
                    able to hit with a thumb. */}
                <button
                  type="button"
                  onClick={() => void onRetry(message)}
                  className="md-state md-label -mr-2 rounded-full px-2 py-1 text-primary"
                >
                  Retry
                </button>
              </>
            ) : delivery === "sending" ? (
              <span className="md-label-sm text-on-variant/60">
                {DELIVERY_LABEL.sending}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-on-variant/60">
                {delivery === "seen" ? (
                  <EyeIcon className="h-3.5 w-3.5" />
                ) : (
                  <EyeOffIcon className="h-3.5 w-3.5" />
                )}
                <span className="md-label-sm">{DELIVERY_LABEL[delivery]}</span>
              </span>
            )}
          </div>
        ) : null}
      </div>
    </li>
  );
}
