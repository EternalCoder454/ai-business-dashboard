"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Colleague, DirectMessage, MessageThread } from "./types";

/**
 * Messages are polled rather than pushed.
 *
 * A websocket would be the obvious answer anywhere else, but this deploys to
 * serverless functions with a duration limit, so a long-lived connection is
 * either impossible or expensive depending on the plan. Polling on a visible
 * tab, and not at all on a hidden one, costs a few small queries a minute and
 * has no infrastructure behind it at all.
 */

/** Overview refresh, which drives the unread badge everywhere in the app. */
const OVERVIEW_MS = 25_000;

/** An open thread, where a reply should land while you are still looking. */
const THREAD_MS = 4_000;

interface MessagesValue {
  ready: boolean;
  /** False when the instance has no auth or no database, so nothing can work. */
  enabled: boolean;
  self?: string;
  threads: MessageThread[];
  people: Colleague[];
  unread: number;
  refresh: () => Promise<void>;
  /** Adjusts the count without waiting for the next poll, on opening a thread. */
  clearUnreadFor: (email: string) => void;
}

const MessagesContext = createContext<MessagesValue | null>(null);

const NO_THREADS: MessageThread[] = [];
const NO_PEOPLE: Colleague[] = [];

export function MessagesProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [self, setSelf] = useState<string>();
  const [threads, setThreads] = useState<MessageThread[]>(NO_THREADS);
  const [people, setPeople] = useState<Colleague[]>(NO_PEOPLE);
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/messages");
      if (response.status === 503 || response.status === 401) {
        setEnabled(false);
        setReady(true);
        return;
      }
      if (!response.ok) return;

      const body = (await response.json()) as {
        threads: MessageThread[];
        people: Colleague[];
        unread: number;
        self: string;
      };
      setEnabled(true);
      setThreads(body.threads ?? NO_THREADS);
      setPeople(body.people ?? NO_PEOPLE);
      setUnread(body.unread ?? 0);
      setSelf(body.self);
    } catch {
      // A failed poll is not worth surfacing; the next one is 25 seconds away.
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();

    const tick = () => {
      // Nothing is watching a hidden tab, so nothing needs fetching for it.
      if (document.visibilityState === "visible") void refresh();
    };
    const timer = window.setInterval(tick, OVERVIEW_MS);
    // Coming back to the tab should feel current immediately.
    document.addEventListener("visibilitychange", tick);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refresh]);

  const clearUnreadFor = useCallback((email: string) => {
    setThreads((current) => {
      let cleared = 0;
      const next = current.map((thread) => {
        if (thread.email !== email || thread.unread === 0) return thread;
        cleared = thread.unread;
        return { ...thread, unread: 0 };
      });
      if (cleared) setUnread((total) => Math.max(0, total - cleared));
      return cleared ? next : current;
    });
  }, []);

  const value = useMemo<MessagesValue>(
    () => ({ ready, enabled, self, threads, people, unread, refresh, clearUnreadFor }),
    [ready, enabled, self, threads, people, unread, refresh, clearUnreadFor],
  );

  return <MessagesContext.Provider value={value}>{children}</MessagesContext.Provider>;
}

export function useMessages(): MessagesValue {
  const value = useContext(MessagesContext);
  if (!value) throw new Error("useMessages must be used inside <MessagesProvider>.");
  return value;
}

interface ThreadState {
  messages: DirectMessage[];
  sending: boolean;
  error?: string;
  send: (body: string) => Promise<void>;
}

/**
 * One open conversation.
 *
 * Polls with a `since` cursor, so a reply arriving mid-conversation costs one
 * row rather than the whole history. A sent message is shown at once with a
 * temporary id and reconciled when the server answers, because waiting on a
 * round trip to see your own text is the thing that makes a chat feel slow.
 */
export function useThread(other: string | undefined, self: string | undefined): ThreadState {
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();

  // Held in a ref rather than state: the poll reads it, and putting it in the
  // effect's dependencies would restart the timer on every new message.
  const newest = useRef(0);

  useEffect(() => {
    setMessages([]);
    setError(undefined);
    newest.current = 0;
  }, [other]);

  useEffect(() => {
    if (!other) return;
    let cancelled = false;

    const pull = async () => {
      try {
        const since = newest.current;
        // The address travels in a header rather than the query string. A
        // query string is written down in the server's request log and in the
        // browser's own history; a colleague's work address does not need to
        // be in either to fetch a thread.
        const response = await fetch(
          since ? `/api/messages?since=${since}` : "/api/messages?thread=1",
          { headers: { "x-thread-with": other } },
        );
        if (!response.ok || cancelled) return;

        const body = (await response.json()) as { messages: DirectMessage[] };
        const incoming = body.messages ?? [];
        if (!incoming.length || cancelled) return;

        newest.current = Math.max(newest.current, ...incoming.map((m) => m.sentAt));
        setMessages((current) => {
          const byId = new Map(current.map((m) => [m.id, m]));
          for (const message of incoming) byId.set(message.id, message);
          // Optimistic copies are dropped once the real row for the same text
          // and sender arrives, so a sent message never appears twice.
          const settled = new Set(
            [...byId.values()].filter((m) => !m.id.startsWith("pending:")).map((m) => m.body + m.fromEmail),
          );
          return [...byId.values()]
            .filter((m) => !(m.id.startsWith("pending:") && settled.has(m.body + m.fromEmail)))
            .sort((a, b) => a.sentAt - b.sentAt);
        });
      } catch {
        // Ignored on purpose; the next tick is four seconds away.
      }
    };

    void pull();
    const tick = () => {
      if (document.visibilityState === "visible") void pull();
    };
    const timer = window.setInterval(tick, THREAD_MS);
    document.addEventListener("visibilitychange", tick);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [other]);

  const send = useCallback(
    async (body: string) => {
      const text = body.trim();
      if (!other || !self || !text || sending) return;

      setSending(true);
      setError(undefined);

      const optimistic: DirectMessage = {
        id: `pending:${Date.now()}`,
        fromEmail: self,
        toEmail: other,
        body: text,
        sentAt: Date.now(),
      };
      setMessages((current) => [...current, optimistic]);

      try {
        const response = await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: other, body: text }),
        });
        const payload = (await response.json()) as {
          message?: DirectMessage;
          error?: string;
        };

        if (!response.ok || !payload.message) {
          setMessages((current) => current.filter((m) => m.id !== optimistic.id));
          setError(payload.error ?? "That did not send.");
          return;
        }

        const saved = payload.message;
        newest.current = Math.max(newest.current, saved.sentAt);
        setMessages((current) =>
          [...current.filter((m) => m.id !== optimistic.id), saved].sort(
            (a, b) => a.sentAt - b.sentAt,
          ),
        );
      } catch {
        setMessages((current) => current.filter((m) => m.id !== optimistic.id));
        setError("That did not send.");
      } finally {
        setSending(false);
      }
    },
    [other, self, sending],
  );

  return { messages, sending, error, send };
}
