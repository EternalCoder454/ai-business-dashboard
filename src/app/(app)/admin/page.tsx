"use client";

import { PageHeader } from "@/components/PageHeader";
import { BusinessesTab, type WorkspaceRow } from "@/components/BusinessesTab";
import { FeedbackTab } from "@/components/FeedbackTab";
import { ReportsTab } from "@/components/ReportsTab";
import { TelemetryTab } from "@/components/TelemetryTab";
import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Card,
  Chip,
  Dialog,
  EmptyState,
  Field,
  BuildingIcon,
  PersonIcon,
  TextInput,
  TrashIcon,
  cx,
} from "@/components/ui";
import { createRipple } from "@/components/ui/ripple";
import { formatRelativeTime } from "@/lib/routes";
import { useStore } from "@/lib/store";
import type { Message } from "@/lib/types";
import type {
  AdminConversation,
  AdminOverview,
  AdminPerson,
  AdminUsage,
} from "@/db/admin";

/*
 * The server's own shapes, imported rather than restated.
 *
 * These were four hand-copied interfaces sitting a directory away from the ones
 * the API actually sends. They drifted, silently: the Clients tab spent a while
 * rendering nothing at all because this copy still said `email` where the
 * server had moved to `workspaceId`. It compiled, every row read `undefined`,
 * and nothing anywhere said so. `import type` is erased at build time, so this
 * costs the client bundle nothing and makes the drift a compile error.
 */
type Usage = AdminUsage;
type Person = AdminPerson;
type Overview = AdminOverview;
type ConversationHead = AdminConversation;

interface Detail {
  deliverables: number;
  projects: number;
  files: number;
  skills: number;
  departments: number;
  storageBytes: number;
}

interface Thread {
  title: string;
  departmentId: string;
  messages: Message[];
}

/*
 * The order they appear in, and the only list of them.
 *
 * These used to be a union and a separate array literal cast to it, and the
 * cast is the problem: a subset of a union is a valid array of that union, so
 * adding a tab to the type and forgetting the array compiled clean and drew
 * no chip. The panel rendered perfectly and nothing could ever select it.
 * Deriving the union from the row means a tab that exists is a tab you can
 * reach.
 */
const TABS = [
  "businesses",
  "clients",
  "reports",
  "feedback",
  "overview",
  "health",
  "access",
] as const;

type Tab = (typeof TABS)[number];

const TAB_LABEL: Record<Tab, string> = {
  businesses: "Businesses",
  overview: "Overview",
  clients: "Clients",
  reports: "Reports",
  feedback: "Feedback",
  health: "Health",
  access: "Access",
};

const compact = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}k` : String(n);

const bytes = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : n >= 1_000 ? `${Math.round(n / 1_000)} KB` : `${n} B`;

export default function AdminPage() {
  const { isOperator, storage, accountEmail } = useStore();

  const [tab, setTab] = useState<Tab>("businesses");
  const [people, setPeople] = useState<Person[] | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [access, setAccess] = useState<{ allowed: string[]; admins: string[] }>();
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[] | null>(null);
  const [emailReady, setEmailReady] = useState(false);
  const [error, setError] = useState<string>();

  const [person, setPerson] = useState<Person>();
  const [detail, setDetail] = useState<Detail>();
  const [heads, setHeads] = useState<ConversationHead[]>([]);
  const [departments, setDepartments] = useState<Record<string, string>>({});
  const [thread, setThread] = useState<Thread | null>(null);

  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin");
      if (!response.ok) throw new Error(String(response.status));
      const body = await response.json();
      setPeople(body.people ?? []);
      setOverview(body.overview ?? null);
      setAccess(body.access);
      setWorkspaces(body.workspaces ?? []);
      setEmailReady(Boolean(body.email));
    } catch {
      setError("Could not load the workspace.");
    }
  }, []);

  useEffect(() => {
    if (isOperator) void load();
  }, [isOperator, load]);

  const openPerson = useCallback(async (row: Person) => {
    setPerson(row);
    setThread(null);
    setHeads([]);
    setDetail(undefined);
    const response = await fetch(`/api/admin?person=${encodeURIComponent(row.workspaceId)}`);
    if (!response.ok) return;
    const body = await response.json();
    setHeads(body.conversations ?? []);
    setDepartments(body.departments ?? {});
    setDetail(body.detail);
  }, []);

  const openThread = useCallback(
    async (conversationId: string) => {
      if (!person) return;
      const response = await fetch(
        `/api/admin?person=${encodeURIComponent(person.workspaceId)}&conversation=${encodeURIComponent(conversationId)}`,
      );
      if (!response.ok) return;
      const body = await response.json();
      setThread(body.thread);
    },
    [person],
  );

  if (storage !== "hosted" || !isOperator) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <PageHeader eyebrow="Oversight" title="Operator" />
        <div className="page-x py-6">
          <EmptyState
            icon={<PersonIcon className="h-8 w-8" />}
            title="Not an operator"
            description="Requires an email address listed in OPERATOR_EMAILS."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        eyebrow="Oversight"
        title="Operator"
      />

      <div className="flex flex-none items-center gap-2 border-b border-outline-variant page-x py-3">
        {TABS.map((key) => (
          <Chip
            key={key}
            selected={tab === key}
            onClick={() => {
              setTab(key);
              setPerson(undefined);
              setThread(null);
            }}
          >
            {TAB_LABEL[key]}
          </Chip>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto page-x py-6">
        {error ? <p className="md-label mb-4 text-error">{error}</p> : null}

        {tab === "businesses" ? (
          <BusinessesTab
            workspaces={workspaces}
            emailReady={emailReady}
            onChanged={(next) => setWorkspaces(next)}
          />
        ) : null}

        {tab === "reports" ? <ReportsTab /> : null}

        {tab === "health" ? <TelemetryTab /> : null}

        {tab === "feedback" ? <FeedbackTab /> : null}

        {tab === "overview" ? <OverviewTab overview={overview} /> : null}

        {tab === "access" ? (
          <AccessTab access={access} people={people ?? []} />
        ) : null}

        {tab === "clients" ? (
          person ? (
            <PersonDetail
              person={person}
              detail={detail}
              heads={heads}
              departments={departments}
              thread={thread}
              isSelf={false}
              onBack={() => {
                setPerson(undefined);
                setThread(null);
              }}
              onOpenThread={openThread}
              onCloseThread={() => setThread(null)}
            />
          ) : (
            <PeopleTable
              people={people}
              accountEmail={accountEmail}
              onOpen={openPerson}
            />
          )
        ) : null}
      </div>

    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card elevated={false}>
      <p className="md-label-sm text-on-variant">{label}</p>
      <p className="md-headline mt-1">{value}</p>
      {hint ? <p className="md-label-sm mt-0.5 text-on-variant/75">{hint}</p> : null}
    </Card>
  );
}

function OverviewTab({ overview }: { overview: Overview | null }) {
  if (!overview) return null;
  const u = overview.usage;
  const totalIn = u.input + u.cacheRead + u.cacheWrite;

  return (
    <div className="measure flex flex-col gap-5">
      <div className="stagger grid grid-cols-1 gap-3 medium:grid-cols-3">
        <Stat label="Accounts" value={String(overview.signedIn)} hint={`${overview.people} with a workspace`} />
        <Stat label="Conversations" value={compact(overview.conversations)} hint={`${compact(overview.messages)} messages`} />
        <Stat label="Attachments" value={compact(overview.files)} hint={bytes(overview.storageBytes)} />
        <Stat label="Deliverables" value={compact(overview.deliverables)} />
        <Stat label="Projects" value={compact(overview.projects)} />
        <Stat label="Output tokens" value={compact(u.output)} />
      </div>

      <Card>
        <h2 className="md-title-lg mb-1">Tokens</h2>
        <p className="md-body mb-4 text-on-variant">
          Recorded since usage tracking began. Billing is in the Anthropic console.
        </p>
        <dl className="grid grid-cols-1 gap-3 medium:grid-cols-4">
          {[
            ["Input, new", u.input],
            ["Input, cached", u.cacheRead],
            ["Cache writes", u.cacheWrite],
            ["Output", u.output],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <dt className="md-label-sm text-on-variant">{label}</dt>
              <dd className="md-title mt-0.5">{compact(Number(value))}</dd>
            </div>
          ))}
        </dl>
        {totalIn > 0 ? (
          <p className="md-label-sm mt-4 text-on-variant/75">
            {Math.round((u.cacheRead / totalIn) * 100)} per cent of input tokens were
            served from cache, at roughly a tenth of the price of new ones.
          </p>
        ) : null}
      </Card>
    </div>
  );
}

function PeopleTable({
  people,
  accountEmail,
  onOpen,
}: {
  people: Person[] | null;
  accountEmail?: string;
  onOpen: (person: Person) => void;
}) {
  if (people === null) return null;
  if (people.length === 0) {
    return (
      <EmptyState
        icon={<BuildingIcon className="h-8 w-8" />}
        title="No clients yet"
        description="Create one on the Businesses tab and it appears here."
      />
    );
  }

  return (
    <ul className="measure stagger flex flex-col gap-2">
      {people.map((row) => (
        <li key={row.workspaceId}>
          <button
            type="button"
            onClick={(event) => {
              createRipple(event);
              onOpen(row);
            }}
            className="md-state md-press flex w-full items-center gap-4 rounded-2xl bg-container px-4 py-3 text-left shadow-e1 transition-shadow hover:shadow-e2"
          >
            <span className="min-w-0 flex-1">
              <span className="md-title block truncate">
                {row.name || row.workspaceId}
              </span>
              <span className="md-label-sm block truncate text-on-variant">
                {row.people ?? 0} {row.people === 1 ? "person" : "people"}
                {row.createdAt ? ` · since ${formatRelativeTime(row.createdAt)}` : ""}
              </span>
            </span>

            <span className="hidden flex-none text-right medium:block">
              <span className="md-label block">{row.conversations} conversations</span>
              <span className="md-label-sm block text-on-variant/75">
                {compact(row.usage.output)} output tokens
              </span>
            </span>

            <span className="md-label-sm w-20 flex-none text-right text-on-variant/75">
              {row.lastActive ? formatRelativeTime(row.lastActive) : "never"}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Whether somebody is in the panel right now.
 *
 * The inbox overview poll touches the account row, so this is a real heartbeat
 * and not a guess from when they last signed in. A status somebody set by hand
 * wins over it, because they meant it.
 */
const ACTIVE_WINDOW = 5 * 60_000;

function presenceOf(member: {
  presence: string;
  lastSeenAt: number | null;
  lastSignedInAt: number | null;
}): { label: string; tone: "on" | "busy" | "off" } {
  if (member.presence === "busy") return { label: "Do not disturb", tone: "busy" };
  if (member.presence === "away") return { label: "Away", tone: "off" };
  if (member.presence === "online") return { label: "Online", tone: "on" };
  // Either timestamp is proof they have been here. See the note in Your people.
  if (!member.lastSignedInAt && !member.lastSeenAt) {
    return { label: "Never signed in", tone: "off" };
  }
  return Date.now() - (member.lastSeenAt ?? 0) < ACTIVE_WINDOW
    ? { label: "Online", tone: "on" }
    : { label: "Offline", tone: "off" };
}

function PersonDetail({
  person,
  detail,
  heads,
  departments,
  thread,
  isSelf,
  onBack,
  onOpenThread,
  onCloseThread,
}: {
  person: Person;
  detail?: Detail;
  heads: ConversationHead[];
  departments: Record<string, string>;
  thread: Thread | null;
  isSelf: boolean;
  onBack: () => void;
  onOpenThread: (id: string) => void;
  onCloseThread: () => void;
}) {
  return (
    <div className="measure flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="text" onClick={thread ? onCloseThread : onBack}>
          {thread ? "Back to conversations" : "Back to clients"}
        </Button>
        <span className="md-label truncate text-on-variant">{person.name ?? person.workspaceId}</span>
        {/* Deleting a business lives on the Businesses tab, where it asks for
            the name typed out. Two ways to destroy one is one too many. */}
      </div>

      {thread ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="md-title-lg">{thread.title}</h2>
            <Chip>{departments[thread.departmentId] ?? thread.departmentId}</Chip>
          </div>
          {thread.messages.map((message) => (
            <Card key={message.id} elevated={false}>
              <p className="md-label-sm mb-1.5 text-on-variant">
                {message.role === "user"
                  ? person.displayName || "Them"
                  : departments[thread.departmentId] ?? "Reply"}{" "}
                ·{" "}
                {formatRelativeTime(message.timestamp)}
                {message.usage ? ` · ${compact(message.usage.output)} out` : ""}
                {message.attachments?.length ? ` · ${message.attachments[0].name}` : ""}
              </p>
              <p className="md-body whitespace-pre-wrap break-words">{message.content}</p>
            </Card>
          ))}
        </div>
      ) : (
        <>
          {detail ? (
            <div className="grid grid-cols-1 gap-3 medium:grid-cols-3">
              <Stat label="Departments" value={String(detail.departments)} hint={`${detail.skills} skills`} />
              <Stat label="Deliverables" value={String(detail.deliverables)} hint={`${detail.projects} projects`} />
              <Stat label="Attachments" value={String(detail.files)} hint={bytes(detail.storageBytes)} />
            </div>
          ) : null}

          <Card>
            <h2 className="md-title-lg mb-1">People</h2>
            <p className="md-body mb-3 text-on-variant">
              Who can open this business, and whether they are in it now.
            </p>
            {(person.members ?? []).length === 0 ? (
              <p className="md-body text-on-variant">Nobody has access.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {(person.members ?? []).map((member) => {
                  const presence = presenceOf(member);
                  return (
                    <li
                      key={member.email}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1"
                    >
                      <span
                        aria-hidden
                        className={cx(
                          "h-2 w-2 flex-none rounded-full",
                          presence.tone === "on" && "bg-primary",
                          presence.tone === "busy" && "bg-error",
                          presence.tone === "off" && "bg-outline-variant",
                        )}
                      />
                      <span className="md-body min-w-0 flex-1 truncate">
                        {member.displayName ? `${member.displayName} · ` : ""}
                        {member.email}
                      </span>
                      {member.role === "admin" ? <Chip tone="primary">Admin</Chip> : null}
                      <span className="md-label-sm text-on-variant/75">{presence.label}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className="md-title-lg mb-3">Conversations</h2>
            {heads.length === 0 ? (
              <p className="md-body text-on-variant">No conversations.</p>
            ) : (
              <ul className="-mx-2 flex flex-col gap-0.5">
                {heads.map((head) => (
                  <li key={head.id}>
                    <button
                      type="button"
                      onClick={(event) => {
                        createRipple(event);
                        onOpenThread(head.id);
                      }}
                      className="md-state flex w-full flex-col rounded-xl px-3 py-2.5 text-left transition-colors"
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
          </Card>
        </>
      )}
    </div>
  );
}

function AccessTab({
  access,
  people,
}: {
  access?: { allowed: string[]; admins: string[] };
  people: Person[];
}) {
  if (!access) return null;

  return (
    <div className="measure flex flex-col gap-5">
      <Card>
        <h2 className="md-title-lg mb-1">Who can sign in</h2>
        <p className="md-body mb-4 text-on-variant">
          Set as OPERATOR_EMAILS. An operator runs this deployment and can read
          any workspace. Changing it needs a redeploy, which is deliberate:
          nothing the app does should be able to grant it.
        </p>
        <ul className="flex flex-col gap-1.5">
          {access.allowed.map((email) => (
            <li key={email} className="flex flex-wrap items-center gap-2">
              <span className="md-body truncate">{email}</span>
              {access.admins.includes(email) ? <Chip tone="primary">Operator</Chip> : null}
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="md-title-lg mb-1">Operators</h2>
        <p className="md-body text-on-variant">
          Set as OPERATOR_EMAILS, defaulting to the first address on the
          allowlist. An operator runs this deployment: they can read any
          workspace and delete one. Being an administrator of your own business
          is a different thing, granted per workspace, and gives none of this.
        </p>
      </Card>
    </div>
  );
}
