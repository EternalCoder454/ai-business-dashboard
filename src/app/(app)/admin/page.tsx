"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Card,
  Chip,
  EmptyState,
  PageHeader,
  PersonIcon,
  cx,
} from "@/components/ui";
import { createRipple } from "@/components/ui/ripple";
import { formatRelativeTime } from "@/lib/routes";
import { useStore } from "@/lib/store";
import type { Message } from "@/lib/types";

interface Person {
  email: string;
  displayName?: string;
  roleTitle?: string;
  avatarUrl?: string;
  conversations: number;
  messages: number;
  lastActive?: number;
}

interface ConversationHead {
  id: string;
  departmentId: string;
  title: string;
  messageCount: number;
  updatedAt: number;
}

interface Thread {
  title: string;
  departmentId: string;
  messages: Message[];
}

/**
 * Read-only review of other people's work.
 *
 * Three panes on a wide screen and one at a time below that: who, which
 * conversation, and the conversation itself. Nothing here can write, and the
 * route behind it has no write path at all.
 */
export default function AdminPage() {
  const { isAdmin, storage, accountEmail } = useStore();

  const [people, setPeople] = useState<Person[] | null>(null);
  const [person, setPerson] = useState<string>();
  const [heads, setHeads] = useState<ConversationHead[]>([]);
  const [departments, setDepartments] = useState<Record<string, string>>({});
  const [thread, setThread] = useState<Thread | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/admin")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body: { people: Person[] }) => setPeople(body.people ?? []))
      .catch(() => setError("Could not load the account list."));
  }, [isAdmin]);

  const openPerson = useCallback(async (email: string) => {
    setPerson(email);
    setThread(null);
    setHeads([]);
    const response = await fetch(`/api/admin?person=${encodeURIComponent(email)}`);
    if (!response.ok) return;
    const body = (await response.json()) as {
      conversations: ConversationHead[];
      departments: Record<string, string>;
    };
    setHeads(body.conversations ?? []);
    setDepartments(body.departments ?? {});
  }, []);

  const openThread = useCallback(
    async (conversationId: string) => {
      if (!person) return;
      const response = await fetch(
        `/api/admin?person=${encodeURIComponent(person)}&conversation=${encodeURIComponent(conversationId)}`,
      );
      if (!response.ok) return;
      const body = (await response.json()) as { thread: Thread };
      setThread(body.thread);
    },
    [person],
  );

  if (storage !== "hosted" || !isAdmin) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <PageHeader eyebrow="Oversight" title="Admin" />
        <div className="page-x py-6">
          <EmptyState
            icon={<PersonIcon className="h-8 w-8" />}
            title="Not available on this account"
            description="Reviewing other people's conversations needs the hosted workspace and an administrator address, set as ADMIN_EMAILS on the server."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        eyebrow="Oversight"
        title="Admin"
        description="Conversations with department heads, across every account on this workspace. Read only, and direct messages are not included."
      />

      <div className="flex min-h-0 flex-1 flex-col expanded:flex-row">
        {/* ------------------------------------------------ people */}
        <div
          className={cx(
            "min-h-0 overflow-y-auto page-x py-4",
            "expanded:w-72 expanded:flex-none expanded:border-r expanded:border-outline-variant",
            person && "hidden expanded:block",
          )}
        >
          {error ? <p className="md-label text-error">{error}</p> : null}

          {people === null ? null : people.length === 0 ? (
            <p className="md-body text-on-variant">Nobody has a workspace yet.</p>
          ) : (
            <ul className="stagger -mx-2 flex flex-col gap-0.5">
              {people.map((row) => (
                <li key={row.email}>
                  <button
                    type="button"
                    onClick={(event) => {
                      createRipple(event);
                      void openPerson(row.email);
                    }}
                    className={cx(
                      "md-state flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                      person === row.email && "bg-secondary-container",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="md-body block truncate">
                        {row.displayName || row.email}
                        {row.email === accountEmail ? (
                          <span className="md-label-sm ml-2 text-on-variant/75">you</span>
                        ) : null}
                      </span>
                      <span className="md-label-sm block truncate text-on-variant/75">
                        {row.conversations} conversation{row.conversations === 1 ? "" : "s"}
                        {row.lastActive ? ` · ${formatRelativeTime(row.lastActive)}` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ------------------------------------------------ conversations */}
        <div
          className={cx(
            "min-h-0 overflow-y-auto page-x py-4",
            "expanded:w-80 expanded:flex-none expanded:border-r expanded:border-outline-variant",
            !person && "hidden expanded:block",
            thread && "hidden expanded:block",
          )}
        >
          {!person ? (
            <p className="md-body text-on-variant">Pick an account.</p>
          ) : heads.length === 0 ? (
            <p className="md-body text-on-variant">Nothing here yet.</p>
          ) : (
            <ul className="-mx-2 flex flex-col gap-0.5">
              {heads.map((head) => (
                <li key={head.id}>
                  <button
                    type="button"
                    onClick={(event) => {
                      createRipple(event);
                      void openThread(head.id);
                    }}
                    className={cx(
                      "md-state flex w-full flex-col rounded-xl px-3 py-2.5 text-left transition-colors",
                      thread?.title === head.title && "bg-secondary-container",
                    )}
                  >
                    <span className="md-body truncate">{head.title}</span>
                    <span className="md-label-sm truncate text-on-variant/75">
                      {departments[head.departmentId] ?? head.departmentId} ·{" "}
                      {head.messageCount} message{head.messageCount === 1 ? "" : "s"} ·{" "}
                      {formatRelativeTime(head.updatedAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ------------------------------------------------ transcript */}
        <div className={cx("min-h-0 flex-1 overflow-y-auto page-x py-4", !thread && "hidden expanded:block")}>
          {!thread ? (
            <p className="md-body text-on-variant">Pick a conversation.</p>
          ) : (
            <div className="measure-read flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="md-title-lg">{thread.title}</h2>
                <Chip>{departments[thread.departmentId] ?? thread.departmentId}</Chip>
              </div>

              {thread.messages.map((message) => (
                <Card key={message.id} elevated={false}>
                  <p className="md-label-sm mb-1.5 text-on-variant">
                    {message.role === "user" ? "Them" : "The head"} ·{" "}
                    {formatRelativeTime(message.timestamp)}
                    {message.attachments?.length ? ` · ${message.attachments[0].name}` : ""}
                  </p>
                  <p className="md-body whitespace-pre-wrap break-words">{message.content}</p>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
