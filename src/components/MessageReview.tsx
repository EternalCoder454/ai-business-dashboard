"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Dialog, EmptyState, MailIcon, cx } from "./ui";
import { createRipple } from "./ui/ripple";
import { formatExactTime } from "@/lib/routes";
import { SidePane } from "@/components/ui/SidePane";

interface ThreadSummary {
  threadKey: string;
  participants: [string, string];
  messages: number;
  lastAt: number;
  lastFrom: string;
  preview: string;
}

/** A message, or a whole conversation, waiting to be confirmed. */
type Withdrawing = { kind: "message"; id: string } | { kind: "thread"; key: string };

interface Line {
  id: string;
  fromEmail: string;
  toEmail: string;
  body: string;
  sentAt: number;
  readAt?: number;
  /** Set when the sender changed the text, with what it said first. */
  editedAt?: number;
  originalBody?: string;
  /** Set when the sender withdrew it from the thread. It stays here. */
  deletedAt?: number;
  deletedBy?: string;
}

/**
 * Every internal thread in the business, for its administrator to read.
 *
 * The Account page has told everybody for a long time that conversations and
 * internal messaging are recorded and can be reviewed by an administrator. It
 * was half true: retained, yes, but the only way one ever became readable was
 * for the conduct reporter to flag it, and what nobody flagged was kept and
 * unreadable. That is the wrong half to be missing. People had been told they
 * had no privacy here, and the person answerable for the business still could
 * not find out what was said.
 *
 * A list and a pane, the same shape as the Inbox and the People tab, because it
 * is the same job: one column answering which conversation, one answering what
 * is in it.
 *
 * Threads arrive with a preview and nothing more. Opening one is a second
 * request, which keeps a workspace's entire message history off a page load and
 * makes reading a particular thread a deliberate act rather than a side effect
 * of arriving on the tab.
 */
export function MessageReview() {
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/messages/review")
      .then((response) => (response.ok ? response.json() : Promise.reject(response.status)))
      .then((body: { threads?: ThreadSummary[] }) => {
        if (!cancelled) setThreads(body.threads ?? []);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const read = useCallback(async (key: string) => {
    setOpen(key);
    setLines(null);
    const response = await fetch(`/api/messages/review?thread=${encodeURIComponent(key)}`);
    if (!response.ok) {
      setLines([]);
      return;
    }
    const body = (await response.json()) as { messages?: Line[] };
    setLines(body.messages ?? []);
  }, []);

  /*
   * What an administrator is about to take out of circulation.
   *
   * Asked before it happens because it changes what other people can see, and
   * nothing on their side will say why a message they were reading is gone.
   */
  const [confirming, setConfirming] = useState<Withdrawing | null>(null);
  const [busy, setBusy] = useState(false);

  const withdraw = useCallback(
    async (target: Withdrawing) => {
      const query =
        target.kind === "thread"
          ? `thread=${encodeURIComponent(target.key)}`
          : `message=${encodeURIComponent(target.id)}`;
      try {
        const response = await fetch(`/api/messages/review?${query}`, { method: "DELETE" });
        if (!response.ok) return;
      } catch {
        // The thread is reloaded either way, so a failure shows as nothing
        // having changed rather than as a screen that disagrees with the server.
      }
      // Re-read the thread so the withdrawal shows, and the list so its
      // preview stops quoting a message nobody can see any more.
      if (open) await read(open);
      const refreshed = await fetch("/api/messages/review");
      if (refreshed.ok) {
        const body = (await refreshed.json()) as { threads?: ThreadSummary[] };
        setThreads(body.threads ?? []);
      }
    },
    [read, open],
  );

  if (failed) {
    return (
      <EmptyState
        icon={<MailIcon className="h-8 w-8" />}
        title="Could not load messages"
        description="Only an administrator of this business can read these."
      />
    );
  }

  if (threads === null) {
    return <p className="md-body p-4 text-on-variant">Loading…</p>;
  }

  if (threads.length === 0) {
    return (
      <EmptyState
        icon={<MailIcon className="h-8 w-8" />}
        title="No internal messages"
        description="Nobody here has written to anybody yet."
      />
    );
  }

  const current = threads.find((thread) => thread.threadKey === open) ?? null;

  return (
    <div className="flex min-h-0 flex-1">
      {/* Below large this is one screen at a time, the way the Inbox and the
          People tab already behave: the list, then the thread. */}
      <SidePane
        id="review-list"
        breakpoint="large"
        defaultWidth={384}
        label="the thread list"
        scroll
        contentClassName="p-3"
        className={cx(open ? "hidden large:flex" : "flex")}
      >
        <ul className="flex flex-col gap-1.5">
          {threads.map((thread) => (
            <li key={thread.threadKey}>
              <button
                type="button"
                onClick={(event) => {
                  createRipple(event);
                  void read(thread.threadKey);
                }}
                className={cx(
                  "md-state w-full rounded-xl px-3 py-2.5 text-left transition-colors",
                  thread.threadKey === open
                    ? "bg-primary-container text-on-primary-container"
                    : "bg-container hover:bg-high",
                )}
              >
                <span className="md-body block truncate font-medium">
                  {thread.participants.join(" and ")}
                </span>
                <span className="md-label-sm mt-0.5 block truncate text-on-variant/75">
                  {thread.messages} message{thread.messages === 1 ? "" : "s"} ·{" "}
                  {formatExactTime(thread.lastAt)}
                </span>
                <span className="md-body-sm mt-1 block truncate text-on-variant/75">
                  {thread.preview}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </SidePane>

      <Dialog
        open={Boolean(confirming)}
        onClose={() => setConfirming(null)}
        title={confirming?.kind === "thread" ? "Withdraw this conversation?" : "Withdraw this message?"}
        footer={
          <>
            <Button variant="text" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                if (!confirming) return;
                setBusy(true);
                await withdraw(confirming);
                setBusy(false);
                setConfirming(null);
              }}
            >
              {busy ? "Withdrawing…" : "Withdraw"}
            </Button>
          </>
        }
      >
        <p className="md-body text-on-variant">
          {confirming?.kind === "thread"
            ? "Every message in it leaves both inboxes."
            : "It leaves both inboxes."}{" "}
          The transcript stays here, marked, with your address against it.
        </p>
      </Dialog>

      <div
        className={cx(
          "min-h-0 min-w-0 flex-1 overflow-y-auto p-4",
          open ? "block" : "hidden large:block",
        )}
      >
        {!current ? (
          <p className="md-body text-on-variant">Pick a conversation to read it.</p>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="md-title min-w-0 truncate">
                {current.participants.join(" and ")}
              </h2>
              <div className="flex flex-none items-center gap-2">
                {/* Only where there is still something in circulation to take
                    out of it. A thread everybody has already withdrawn from
                    offers a button that would do nothing. */}
                {lines?.some((line) => !line.deletedAt) ? (
                  <Button
                    size="sm"
                    variant="outlined"
                    onClick={() => setConfirming({ kind: "thread", key: current.threadKey })}
                  >
                    Withdraw all
                  </Button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    setOpen(null);
                    setLines(null);
                  }}
                  className="md-state md-label rounded-lg px-2 py-1 text-primary large:hidden"
                >
                  Back
                </button>
              </div>
            </div>

            {lines === null ? (
              <p className="md-body text-on-variant">Loading…</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {lines.map((line) => (
                  <li key={line.id}>
                    <Card elevated={false}>
                      <p className="md-label-sm text-on-variant/75">
                        {line.fromEmail} to {line.toEmail} ·{" "}
                        {formatExactTime(line.sentAt)}
                        {line.readAt ? "" : " · unread"}
                      </p>

                      {/*
                        * The two things the people in the thread cannot see.
                        *
                        * A withdrawn message is gone from their inbox and still
                        * here, because a business that may have to answer for
                        * what was said inside it should not lose the record
                        * because the sender would rather it were gone. An
                        * edited one shows what it said first, since a
                        * correction that quietly replaces the original is the
                        * same as no record at all.
                        */}
                      {line.deletedAt ? (
                        <p className="md-label-sm mt-1 text-error">
                          Withdrawn {formatExactTime(line.deletedAt)}
                          {line.deletedBy ? ` by ${line.deletedBy}` : ""}
                        </p>
                      ) : null}

                      {/* Anywhere, not break-word: a pasted link is one word,
                          and one word wider than the card takes the layout. */}
                      <p
                        className={cx(
                          "md-body mt-1 whitespace-pre-wrap [overflow-wrap:anywhere]",
                          Boolean(line.deletedAt) &&
                            "text-on-variant line-through decoration-on-variant/40",
                        )}
                      >
                        {line.body}
                      </p>

                      {/* Under the text rather than beside the header, so
                          the thing being withdrawn is read before the control
                          that withdraws it. */}
                      {line.deletedAt ? null : (
                        <button
                          type="button"
                          onClick={() => setConfirming({ kind: "message", id: line.id })}
                          className="md-state md-label-sm mt-2 rounded-lg px-1.5 py-0.5 text-on-variant/75 transition-colors hover:text-error"
                        >
                          Withdraw
                        </button>
                      )}

                      {line.originalBody ? (
                        <div className="mt-2 border-l-2 border-outline-variant pl-3">
                          <p className="md-label-sm text-on-variant/75">
                            Edited {line.editedAt ? formatExactTime(line.editedAt) : ""}. Sent as:
                          </p>
                          <p className="md-body-sm mt-0.5 whitespace-pre-wrap text-on-variant [overflow-wrap:anywhere]">
                            {line.originalBody}
                          </p>
                        </div>
                      ) : null}
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
