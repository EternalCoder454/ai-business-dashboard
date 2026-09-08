"use client";

import { PageHeader } from "@/components/PageHeader";
import { Fragment, useEffect, useMemo, useRef, useState, useCallback } from "react";
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
  TextInput,
  cx,
} from "@/components/ui";
import { createRipple } from "@/components/ui/ripple";
import { isHidden, setThreadHidden, useHiddenThreads } from "@/lib/hiddenThreads";
import { useMessages, useThread } from "@/lib/messages";
import { formatDay, formatExactTime, sameDay } from "@/lib/routes";
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

import { stagger } from "@/lib/motion";
import { SidePane } from "@/components/ui/SidePane";

/**
 * Staggers a list in, once, when it first appears.
 *
 * A ref callback rather than an effect so it runs the moment the element
 * exists, and guarded per element so re-rendering the list while somebody is
 * reading it does not replay the entrance.
 */
function useStaggeredList() {
  const seen = useRef(new WeakSet<Element>());
  return useCallback((element: HTMLUListElement | null) => {
    if (!element || seen.current.has(element)) return;
    seen.current.add(element);
    stagger(element);
  }, []);
}

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
 * Where somebody is, in words, rather than a verdict on them.
 *
 * "Offline" is true about a colleague who stepped out for a coffee and it
 * reads like a machine that has been switched off. The moment is more use than
 * the state: "active 20m ago" answers the question somebody is actually asking,
 * which is whether it is worth waiting for a reply.
 *
 * Only the away case changes. Online and do not disturb are already about now,
 * and somebody who has been invited and never arrived has no moment to report,
 * so they keep the plain word.
 */
function presenceWords(person: Colleague): string {
  if (person.presence !== "offline") return PRESENCE_LABEL[person.presence];
  if (!person.lastSeenAt) return PRESENCE_LABEL.offline;

  const away = Date.now() - person.lastSeenAt;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (away < 2 * minute) return "Active just now";
  if (away < hour) return `Active ${Math.floor(away / minute)}m ago`;
  if (away < day) return `Active ${Math.floor(away / hour)}h ago`;
  if (away < 7 * day) return `Active ${Math.floor(away / day)}d ago`;
  return PRESENCE_LABEL.offline;
}

/**
 * A two pane list-detail layout, which is the Material pattern for exactly this
 * shape of content. On an expanded window both panes are visible; below that
 * they become one pane at a time, since a 360px phone cannot hold a readable
 * list and a readable conversation side by side.
 */
export default function MessagesPage() {
  const staggered = useStaggeredList();
  const { ready, enabled, self, threads, people, refresh, clearUnreadFor, blocked } =
    useMessages();
  const hiddenAt = useHiddenThreads();
  const [open, setOpen] = useState<string>();
  const [query, setQuery] = useState("");

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
    const all = [...withHistory, ...rest];

    /*
     * Name, address and the last thing said.
     *
     * Searching the preview as well as the name is the difference between a
     * filter and a way of finding a conversation: what somebody remembers about
     * a thread is usually a word in it, not who it was with.
     */
    /*
     * Threads put away, until they say something.
     *
     * Dropped before the search rather than after, so looking for somebody by
     * name finds them: a hidden conversation is out of the way, not gone, and
     * searching is the way back to it.
     */
    const showing = all.filter(
      (row) => !isHidden(hiddenAt, row.email, row.at, row.lastFromSelf),
    );

    const needle = query.trim().toLowerCase();
    if (!needle) return showing;
    return all.filter((row) =>
      [row.person?.displayName, row.email, row.preview]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(needle)),
    );
  }, [threads, people, byEmail, query, hiddenAt]);

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
            title="No inbox here"
            description="Messages need an account. Sign in to use them."
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
        <SidePane
          id="inbox-list"
          breakpoint="expanded"
          defaultWidth={320}
          label="the people list"
          scroll
          className={cx(open && "hidden expanded:flex")}
        >
          {people.length + threads.length > 0 ? (
            <div className="flex-none px-3 pt-3">
              <TextInput
                size="sm"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search messages"
                aria-label="Search messages"
              />
            </div>
          ) : null}

          {rows.length === 0 ? (
            <div className="px-4 py-6">
              {query.trim() ? (
                <EmptyState
                  icon="🔍"
                  title="Nothing matches that"
                  description="Try a name, an address, or a word somebody used."
                />
              ) : (
                <EmptyState
                  icon="👤"
                  title="Nobody else yet"
                  description="Colleagues appear here once an administrator adds them."
                />
              )}
            </div>
          ) : (
            <ul ref={staggered} className="p-2">
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
                          // Somebody with no display name shows as their
                          // address, and an address is exactly long enough to
                          // be cut off in this column with no way to read the
                          // rest of it.
                          title={row.person?.displayName ? undefined : row.email}
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
                            {formatExactTime(row.at)}
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
        </SidePane>

        {/* ------------------------------------------------- detail pane */}
        <div className={cx("min-h-0 min-w-0 flex-1", !open && "hidden expanded:flex")}>
          {open ? (
            <Thread
              key={open}
              other={open}
              person={byEmail.get(open)}
              self={self}
              blocked={blocked.includes(open)}
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

function Avatar({
  person,
  email,
  size = 40,
}: {
  person?: Colleague;
  email: string;
  size?: number;
}) {
  const box = { width: size, height: size };
  if (person?.avatarUrl) {
    // Google's own CDN, already sized for this.
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={person.avatarUrl}
        alt=""
        width={size}
        height={size}
        style={box}
        className="flex-none rounded-full"
      />
    );
  }
  return (
    <span
      aria-hidden
      style={{ ...box, fontSize: Math.round(size * 0.4) }}
      className="grid flex-none place-items-center rounded-full bg-primary-container text-on-primary-container"
    >
      {(person?.displayName || email).charAt(0).toUpperCase()}
    </span>
  );
}

function Thread({
  other,
  person,
  self,
  blocked,
  onBack,
  onSent,
}: {
  other: string;
  person?: Colleague;
  self?: string;
  /** Whether this person has been stopped from writing here. */
  blocked: boolean;
  onBack: () => void;
  onSent: () => void;
}) {
  const { messages, sending, error, send, retry, edit, withdraw, seenThrough } =
    useThread(other, self);
  const { setBlocked } = useMessages();
  const hiddenAt = useHiddenThreads();
  const [find, setFind] = useState("");

  /*
   * Which messages match, over what is loaded rather than over the database.
   *
   * A thread is held in memory in full by the time it is on screen, so this is
   * a filter rather than a query, and it stays a filter: an endpoint for it
   * would be a round trip to search something the browser is already holding.
   */
  const needle = find.trim().toLowerCase();
  const shown = needle
    ? messages.filter((message) => message.body.toLowerCase().includes(needle))
    : messages;
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
    <div className="flex h-full min-h-0 w-full">
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <header className="safe-top safe-pt-3 medium:safe-pt-4 flex flex-none items-center gap-3 border-b border-outline-variant px-2 pb-3 medium:px-6 medium:pb-4 expanded:px-6">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to messages"
          className="md-state grid h-11 w-11 flex-none place-items-center rounded-lg text-on-surface expanded:hidden"
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
              {presenceWords(person)}
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
            {shown.map((message, index) => (
              <Fragment key={message.id}>
                {/*
                  * The day, once, where it turns.
                  *
                  * A thread is a record, and a run of bubbles with only a
                  * clock on each one answers "what time" while never
                  * answering "which day". Today and Yesterday by name,
                  * because those are the two a reader resolves instantly
                  * and the two most messages fall in.
                  */}
                {index === 0 || !sameDay(message.sentAt, shown[index - 1].sentAt) ? (
                  <li className="flex items-center gap-3 px-2 py-3">
                    <span className="h-px flex-1 bg-outline-variant" />
                    <span className="md-label-sm flex-none text-on-variant/75">
                      {formatDay(message.sentAt)}
                    </span>
                    <span className="h-px flex-1 bg-outline-variant" />
                  </li>
                ) : null}
              <MessageRow
                message={message}
                self={self}
                previous={shown[index - 1]}
                next={shown[index + 1]}
                delivery={deliveryOf(message, self, seenThrough)}
                onRetry={retry}
                onEdit={edit}
                onWithdraw={withdraw}
                sender={
                  message.fromEmail === self
                    ? { displayName: account.displayName || "You", avatarUrl: account.avatarUrl }
                    : {
                        displayName: person?.displayName || other,
                        avatarUrl: person?.avatarUrl,
                      }
                }
              />
              </Fragment>
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

      <div className="safe-bottom safe-pb-3 flex-none border-t border-outline-variant px-3 pt-3 medium:px-6">
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

    <PersonPane
      other={other}
      person={person}
      query={find}
      onQuery={setFind}
      hits={shown.length}
      hidden={hiddenAt[other] !== undefined}
      onHide={(hide) => setThreadHidden(other, hide)}
      blocked={blocked}
      onBlock={(next) => setBlocked(other, next)}
    />
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
/**
 * Who you are talking to, beside the conversation.
 *
 * The mock had one of these and the first pass left it out, because it was a
 * second copy of the thread header: name, avatar, presence. What makes it worth
 * a column is the part the header has no room for, which is finding something
 * in a long thread, and the two decisions you can make about a person.
 *
 * Only from large, where there is a third column to spare. Below that the
 * thread header still names them and the search lives in the header's own
 * button, so nothing is unreachable.
 */
function PersonPane({
  other,
  person,
  query,
  onQuery,
  hits,
  hidden,
  onHide,
  blocked,
  onBlock,
}: {
  other: string;
  person?: Colleague;
  query: string;
  onQuery: (value: string) => void;
  hits: number;
  hidden: boolean;
  onHide: (hide: boolean) => void;
  blocked: boolean;
  onBlock: (block: boolean) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <aside className="hidden w-72 flex-none flex-col gap-4 overflow-y-auto border-l border-outline-variant p-4 large:flex">
      <div className="flex flex-col items-center gap-2 text-center">
        <Avatar person={person} email={other} size={72} />
        <p className="md-title-lg mt-1 truncate">{person?.displayName || other}</p>
        {person?.roleTitle ? (
          <p className="md-label truncate text-on-variant">{person.roleTitle}</p>
        ) : null}
        {person ? (
          <span className="flex items-center gap-1.5">
            <StatusDot status={DOT[person.presence]} animate={person.presence === "online"} />
            <span className="md-label-sm text-on-variant">{presenceWords(person)}</span>
          </span>
        ) : null}
      </div>

      <div>
        <p className="md-label mb-1.5 text-on-variant">Search this conversation</p>
        <TextInput
          size="sm"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="A word they used"
          aria-label="Search this conversation"
        />
        {query.trim() ? (
          <p className="md-label-sm mt-1.5 text-on-variant/75">
            {hits === 0 ? "Nothing matches" : `${hits} message${hits === 1 ? "" : "s"}`}
          </p>
        ) : null}
      </div>

      <div className="mt-auto flex flex-col gap-2 border-t border-outline-variant pt-4">
        <Button variant="outlined" size="sm" onClick={() => onHide(!hidden)}>
          {hidden ? "Keep in the list" : "Hide until they reply"}
        </Button>
        <Button
          variant={blocked ? "outlined" : "danger"}
          size="sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await onBlock(!blocked);
            setBusy(false);
          }}
        >
          {blocked ? "Unblock" : "Block"}
        </Button>
      </div>
    </aside>
  );
}

function MessageRow({
  message,
  self,
  previous,
  next,
  sender,
  delivery,
  onRetry,
  onEdit,
  onWithdraw,
}: {
  message: DirectMessage;
  self?: string;
  previous?: DirectMessage;
  next?: DirectMessage;
  sender: { displayName: string; avatarUrl?: string };
  delivery?: Delivery;
  onRetry: (message: DirectMessage) => Promise<void>;
  onEdit: (id: string, body: string) => Promise<string | null>;
  onWithdraw: (id: string) => Promise<string | null>;
}) {
  const mine = message.fromEmail === self;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.body);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    const said = await onEdit(message.id, draft);
    setBusy(false);
    if (said) setProblem(said);
    else {
      setProblem(null);
      setEditing(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    const said = await onWithdraw(message.id);
    setBusy(false);
    // Only a failure needs saying. Success takes the message off the screen.
    if (said) setProblem(said);
  };

  // A new run starts on a different sender, or after five quiet minutes.
  const runOn =
    previous?.fromEmail === message.fromEmail &&
    message.sentAt - previous.sentAt < 5 * 60_000 &&
    // A divider has been drawn between them, so they are not one run however
    // few minutes apart the clock says they were.
    sameDay(message.sentAt, previous.sentAt);
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
    <li className={cx("group flex gap-3 px-1", runOn ? "mt-0.5" : "mt-4", sendingNow && "opacity-60")}>
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
              {formatExactTime(message.sentAt)}
            </span>
          </div>
        )}
        {editing ? (
          /*
           * In place rather than in a dialog. The message stays where it is in
           * the thread, so the text above and below it is still the context you
           * are correcting it against.
           */
          <div className="mt-1 flex flex-col gap-2">
            <TextArea
              value={draft}
              rows={2}
              autoFocus
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setEditing(false);
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void save();
                }
              }}
            />
            <div className="flex items-center gap-2">
              <Button size="sm" disabled={busy} onClick={() => void save()}>
                Save
              </Button>
              <Button size="sm" variant="text" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              {problem ? <span className="md-label-sm text-error">{problem}</span> : null}
            </div>
          </div>
        ) : (
          <p className="md-body whitespace-pre-wrap break-words text-on-surface">
            {message.body}
            {message.editedAt ? (
              <span
                className="md-label-sm ml-1.5 align-baseline text-on-variant/60"
                title={`Edited ${formatExactTime(message.editedAt)}`}
              >
                edited
              </span>
            ) : null}
          </p>
        )}

        {/*
         * Only on your own, and only once it is really sent: there is nothing
         * on the server to change about a message still on its way, and one
         * that failed already has Retry sitting where these would go.
         */}
        {mine && !editing && !message.local ? (
          <div className="mt-1 flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            <button
              type="button"
              onClick={() => {
                setDraft(message.body);
                setProblem(null);
                setEditing(true);
              }}
              className="md-state md-label-sm rounded-lg px-2 py-1 text-on-variant"
            >
              Edit
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void remove()}
              className="md-state md-label-sm rounded-lg px-2 py-1 text-on-variant"
            >
              Delete
            </button>
            {problem ? <span className="md-label-sm text-error">{problem}</span> : null}
          </div>
        ) : null}

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
                  className="md-state md-label -mr-2 rounded-lg px-2 py-1 text-primary"
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
