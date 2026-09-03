"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import {
  Button,
  Card,
  Chip,
  Dialog,
  EmptyState,
  Field,
  PlusIcon,
  PolicyIcon,
  Select,
  TextInput,
  TrashIcon,
  UsersIcon,
  cx,
} from "@/components/ui";
import { ReportsTab } from "@/components/ReportsTab";
import { useStore } from "@/lib/store";
import { formatRelativeTime } from "@/lib/routes";

interface Member {
  email: string;
  role: "member" | "admin";
  displayName: string;
  roleTitle: string;
  presence: "auto" | "online" | "away" | "busy";
  lastSeenAt: number | null;
  lastSignedInAt: number | null;
  invitedBy: string | null;
  createdAt: number;
}

/**
 * Somebody signed in inside the last five minutes is here now.
 *
 * The overview poll touches the row, so this is a real heartbeat rather than a
 * guess, and it is the same window the inbox uses. `auto` means nobody has set
 * a status by hand, so their presence is whatever the heartbeat says.
 */
const ACTIVE_WINDOW = 5 * 60_000;

function presenceOf(member: Member): { label: string; tone: "on" | "busy" | "off" } {
  if (member.presence === "busy") return { label: "Do not disturb", tone: "busy" };
  if (member.presence === "away") return { label: "Away", tone: "off" };
  if (member.presence === "online") return { label: "Online", tone: "on" };
  // Either timestamp is proof they have been here. lastSignedInAt is written
  // by the OAuth callback, which does not fire while a session holds, so on its
  // own it told people who were plainly using the panel that they had never
  // arrived.
  if (!member.lastSignedInAt && !member.lastSeenAt) {
    return { label: "Not signed in yet", tone: "off" };
  }
  const seen = member.lastSeenAt ?? 0;
  return Date.now() - seen < ACTIVE_WINDOW
    ? { label: "Online", tone: "on" }
    : { label: "Offline", tone: "off" };
}

/**
 * The business managing itself: who is in it, and what each of them can do.
 *
 * This is not the operator screen. It shows one business, the caller's own,
 * and the server never takes a workspace from the page, so there is nothing
 * here that could be pointed at somebody else's company. The two screens were
 * briefly merged, which left every customer's administrator with no way to add
 * a colleague or hand over the keys.
 */
export default function ManagePage() {
  const { workspaceRole, settings } = useStore();
  const [tab, setTab] = useState<"people" | "reports">("people");

  const [members, setMembers] = useState<Member[] | null>(null);
  const [you, setYou] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [inviting, setInviting] = useState(false);
  const [draftEmail, setDraftEmail] = useState("");
  const [draftRole, setDraftRole] = useState<"member" | "admin">("member");
  const [removing, setRemoving] = useState<Member | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/workspace/members");
    const body = (await response.json().catch(() => null)) as {
      members?: Member[];
      you?: string;
      error?: string;
    } | null;
    if (!response.ok) {
      setError(body?.error ?? "Could not read your people.");
      return;
    }
    setMembers(body?.members ?? []);
    setYou(body?.you ?? "");
    setError(null);
  }, []);

  useEffect(() => {
    if (workspaceRole === "admin") void load();
  }, [load, workspaceRole]);

  const act = async (body: Record<string, unknown>, success?: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/workspace/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json().catch(() => null)) as {
        members?: Member[];
        error?: string;
        emailError?: string | null;
      } | null;
      if (!response.ok) {
        setError(result?.error ?? "Could not make that change.");
        return false;
      }
      if (result?.members) setMembers(result.members);
      // The access row is what grants entry, so a bounced invitation is worth
      // saying out loud rather than treating as a failure.
      setNotice(
        result?.emailError
          ? `Added, but the invitation email did not send: ${result.emailError}`
          : (success ?? null),
      );
      return true;
    } catch {
      setError("Could not reach the server.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (workspaceRole !== "admin") {
    return (
      <>
        <PageHeader eyebrow={settings.companyName} title="Your people" />
        <div className="measure p-4 sm:p-6">
          <EmptyState
            icon={<UsersIcon className="h-8 w-8" />}
            title="An administrator looks after this"
            description="Ask whoever set up this business to change who has access."
          />
        </div>
      </>
    );
  }

  const admins = members?.filter((m) => m.role === "admin").length ?? 0;

  return (
    <>
      <PageHeader
        eyebrow={settings.companyName}
        title={tab === "people" ? "Your people" : "Reports"}
        actions={
          tab === "people" ? (
            <Button onClick={() => setInviting(true)}>
              <PlusIcon className="h-4 w-4" />
              Add somebody
            </Button>
          ) : undefined
        }
      />

      {/*
        * Two tabs rather than a second screen in the navigation.
        *
        * Both of these are the same job: looking after the people in this
        * business. Reports are about the same names that are on the other tab,
        * and a separate entry in the sidebar would put conduct next to Tasks
        * for everyone who is not an administrator and cannot open it anyway.
        */}
      <div className="flex flex-none items-center gap-2 border-b border-outline-variant px-4 py-3 sm:px-6">
        {(["people", "reports"] as const).map((key) => (
          <Chip
            key={key}
            selected={tab === key}
            onClick={() => setTab(key)}
          >
            <span className="flex items-center gap-1.5">
              {key === "people" ? (
                <UsersIcon className="h-4 w-4" />
              ) : (
                <PolicyIcon className="h-4 w-4" />
              )}
              {key === "people" ? "People" : "Reports"}
            </span>
          </Chip>
        ))}
      </div>

      {tab === "reports" ? (
        <div className="measure p-4 sm:p-6">
          <ReportsTab />
        </div>
      ) : (
      <div className="measure flex flex-col gap-4 p-4 sm:p-6">
        {error ? <p className="md-label text-error">{error}</p> : null}
        {notice ? <p className="md-label text-primary">{notice}</p> : null}

        {members === null ? null : members.length === 0 ? (
          <EmptyState
            icon={<UsersIcon className="h-8 w-8" />}
            title="Only you so far"
            description="Add a colleague and they can sign in with the email you use here."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {members.map((member) => {
              const presence = presenceOf(member);
              const isYou = member.email === you;
              // Demoting or removing the only administrator would lock the
              // business out of its own settings, so the controls go away
              // rather than failing when pressed.
              const lastAdmin = member.role === "admin" && admins <= 1;

              return (
                <li key={member.email}>
                  <Card>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <span
                        aria-hidden
                        className={cx(
                          "h-2 w-2 flex-none rounded-full",
                          presence.tone === "on" && "bg-primary",
                          presence.tone === "busy" && "bg-error",
                          presence.tone === "off" && "bg-outline-variant",
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="md-title truncate">
                          {member.displayName || member.email}
                          {isYou ? (
                            <span className="md-label-sm text-on-variant/75"> · you</span>
                          ) : null}
                        </p>
                        <p className="md-label-sm truncate text-on-variant/75">
                          {member.email}
                          {member.roleTitle ? ` · ${member.roleTitle}` : ""}
                        </p>
                      </div>

                      <Chip tone={member.role === "admin" ? "primary" : undefined}>
                        {member.role === "admin" ? "Administrator" : "Member"}
                      </Chip>
                      <span className="md-label-sm text-on-variant/75">{presence.label}</span>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Select
                        size="sm"
                        aria-label={`Role for ${member.email}`}
                        value={member.role}
                        disabled={busy || lastAdmin}
                        onChange={(event) =>
                          void act(
                            {
                              action: "role",
                              email: member.email,
                              role: event.target.value,
                            },
                            "Saved.",
                          )
                        }
                      >
                        <option value="member">Member</option>
                        <option value="admin">Administrator</option>
                      </Select>

                      {!isYou && !lastAdmin ? (
                        <Button
                          size="sm"
                          variant="text"
                          disabled={busy}
                          onClick={() => setRemoving(member)}
                        >
                          <TrashIcon className="h-4 w-4" />
                          Remove
                        </Button>
                      ) : null}

                      <span className="md-label-sm ml-auto text-on-variant/75">
                        {member.lastSignedInAt
                          ? `Last signed in ${formatRelativeTime(member.lastSignedInAt)}`
                          : "Has not signed in yet"}
                      </span>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}

      </div>
      )}

      <Dialog
        open={inviting}
        title="Add somebody"
        onClose={() => setInviting(false)}
        width="max-w-md"
        footer={
          <>
            <Button variant="text" onClick={() => setInviting(false)}>
              Cancel
            </Button>
            <Button
              disabled={busy || !draftEmail.trim()}
              onClick={async () => {
                const ok = await act(
                  { action: "invite", email: draftEmail, role: draftRole },
                  `${draftEmail.trim().toLowerCase()} can sign in now.`,
                );
                if (ok) {
                  setInviting(false);
                  setDraftEmail("");
                  setDraftRole("member");
                }
              }}
            >
              {busy ? "Adding…" : "Add"}
            </Button>
          </>
        }
      >
        <Field label="Their work email">
          <TextInput
            autoFocus
            type="email"
            value={draftEmail}
            placeholder="name@business.com"
            onChange={(event) => setDraftEmail(event.target.value)}
          />
        </Field>
        <Field label="What they can do">
          <Select
            value={draftRole}
            onChange={(event) =>
              setDraftRole(event.target.value === "admin" ? "admin" : "member")
            }
          >
            <option value="member">Member: use the panel</option>
            <option value="admin">Administrator: also manage people and keys</option>
          </Select>
        </Field>
      </Dialog>

      <Dialog
        open={Boolean(removing)}
        title="Remove access?"
        onClose={() => setRemoving(null)}
        width="max-w-md"
        footer={
          <>
            <Button variant="text" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                if (!removing) return;
                const ok = await act(
                  { action: "remove", email: removing.email },
                  `${removing.email} can no longer sign in.`,
                );
                if (ok) setRemoving(null);
              }}
            >
              Remove
            </Button>
          </>
        }
      >
        <p className="md-body text-on-variant">
          {removing?.displayName || removing?.email} loses access the moment you do
          this. Their messages and work stay where they are.
        </p>
      </Dialog>
    </>
  );
}
