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
  ShieldIcon,
  Select,
  TextArea,
  TextInput,
  TrashIcon,
  MailIcon,
  UsersIcon,
  cx,
} from "@/components/ui";
import { ReportsTab } from "@/components/ReportsTab";
import { MessageReview } from "@/components/MessageReview";
import { useStore } from "@/lib/store";
import { AREAS, unrestricted, type Area, type Permissions } from "@/lib/permissions";
import { formatExactTime } from "@/lib/routes";

interface Member {
  email: string;
  role: "member" | "admin";
  /** What to show: this business's override, or what they call themselves. */
  displayName: string;
  roleTitle: string;
  /** What they call themselves, so an admin can see what an override replaced. */
  ownDisplayName: string;
  ownRoleTitle: string;
  /** What this business set. Empty means it has set nothing. */
  setDisplayName: string;
  setRoleTitle: string;
  note: string;
  presence: "auto" | "online" | "away" | "busy";
  lastSeenAt: number | null;
  lastSignedInAt: number | null;
  invitedBy: string | null;
  createdAt: number;
  permissions: Permissions | null;
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
  const { workspaceRole, statusReady, settings, allDepartments } = useStore();
  const [tab, setTab] = useState<"people" | "reports" | "messages">("people");
  /*
   * Which person the right hand pane is showing, by address rather than by
   * object, so a refresh that rebuilds the list does not drop the selection or
   * leave the pane rendering a copy of a row that has since changed.
   */
  const [selected, setSelected] = useState<string | null>(null);

  const [members, setMembers] = useState<Member[] | null>(null);
  const [you, setYou] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [inviting, setInviting] = useState(false);
  const [draftEmail, setDraftEmail] = useState("");
  const [draftRole, setDraftRole] = useState<"member" | "admin">("member");
  const [removing, setRemoving] = useState<Member | null>(null);
  const [editing, setEditing] = useState<Member | null>(null);

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

  // Same reason as the operator screen: the role is null until the server says
  // otherwise, and null is not the same as "no".
  if (!statusReady) return null;

  if (workspaceRole !== "admin") {
    return (
      <>
        <PageHeader eyebrow={settings.companyName} title="Management" />
        <div className="measure min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
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
  const current = members?.find((member) => member.email === selected) ?? null;

  return (
    <>
      <PageHeader
        eyebrow={settings.companyName}
        title={
          tab === "people" ? "Management" : tab === "reports" ? "Reports" : "Messages"
        }
        actions={
          tab === "people" ? (
            <Button onClick={() => setInviting(true)}>
              <PlusIcon className="h-4 w-4" />
              Invite
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
        {(["people", "reports", "messages"] as const).map((key) => (
          <Chip
            key={key}
            selected={tab === key}
            onClick={() => setTab(key)}
          >
            <span className="flex items-center gap-1.5">
              {key === "people" ? (
                <UsersIcon className="h-4 w-4" />
              ) : key === "reports" ? (
                <PolicyIcon className="h-4 w-4" />
              ) : (
                <MailIcon className="h-4 w-4" />
              )}
              {key === "people" ? "People" : key === "reports" ? "Reports" : "Messages"}
            </span>
          </Chip>
        ))}
      </div>

      {tab === "messages" ? (
        <MessageReview />
      ) : tab === "reports" ? (
        <div className="measure min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <ReportsTab scope="workspace" />
        </div>
      ) : (
      <div className="flex min-h-0 flex-1">
        {/*
         * A list beside a detail pane, the same shape as the Inbox.
         *
         * Every person used to be a card carrying every control they had: a
         * role select, a permissions button, a remove button and two lines of
         * status, repeated down the page. Ten colleagues meant forty controls
         * on one screen and no way to look at one person without reading past
         * everybody else. The list answers who is here; the pane answers what
         * you can do about one of them.
         */}
        <div
          className={cx(
            "min-h-0 min-w-0 flex-1 overflow-y-auto p-3",
            // An explicit width rather than a cap, for the reason the Inbox
            // gives: flex-none with only a max shrinks to the longest name.
            "expanded:w-80 expanded:flex-none expanded:border-r expanded:border-outline-variant",
            selected && "hidden expanded:block",
          )}
        >
          {error ? <p className="md-label mb-3 px-2 text-error">{error}</p> : null}
          {notice ? <p className="md-label mb-3 px-2 text-primary">{notice}</p> : null}

          {members === null ? null : members.length === 0 ? (
            <div className="px-1 py-4">
              <EmptyState
                icon={<UsersIcon className="h-8 w-8" />}
                title="Only you so far"
                description="Add a colleague to message them."
              />
            </div>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {members.map((member) => {
                const presence = presenceOf(member);
                return (
                  <li key={member.email}>
                    <button
                      type="button"
                      onClick={() => setSelected(member.email)}
                      aria-current={selected === member.email}
                      className={cx(
                        "md-state flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left",
                        selected === member.email && "bg-primary-container text-on-primary-container",
                      )}
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
                      <span className="min-w-0 flex-1">
                        <span className="md-body block truncate">
                          {member.displayName || member.email}
                          {member.email === you ? (
                            <span className="md-label-sm text-on-variant/75"> · you</span>
                          ) : null}
                        </span>
                        <span className="md-label-sm block truncate text-on-variant/75">
                          {member.email}
                        </span>
                      </span>
                      {member.role === "admin" ? (
                        <ShieldIcon
                          aria-label="Administrator"
                          className="h-4 w-4 flex-none text-on-variant/75"
                        />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className={cx("min-h-0 min-w-0 flex-1 overflow-y-auto", !selected && "hidden expanded:flex")}>
          {current ? (
            <PersonPane
              key={current.email}
              member={current}
              isYou={current.email === you}
              lastAdmin={current.role === "admin" && admins <= 1}
              busy={busy}
              onBack={() => setSelected(null)}
              onRole={(role) =>
                void act({ action: "role", email: current.email, role }, "Saved.")
              }
              onPermissions={() => setEditing(current)}
              onDetails={(details) =>
                void act({ action: "details", email: current.email, ...details }, "Saved.")
              }
              onRemove={() => setRemoving(current)}
            />
          ) : (
            <div className="hidden w-full items-center justify-center p-8 expanded:flex">
              <p className="md-body text-on-variant">Pick somebody to manage.</p>
            </div>
          )}
        </div>
      </div>
      )}

      <Dialog
        open={inviting}
        title="Invite somebody"
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

      <PermissionsDialog
        key={editing?.email ?? "closed"}
        member={editing}
        heads={allDepartments.filter((department) => !department.personal)}
        busy={busy}
        onClose={() => setEditing(null)}
        onSave={async (permissions) => {
          if (!editing) return;
          const ok = await act(
            { action: "permissions", email: editing.email, permissions },
            "Saved.",
          );
          if (ok) setEditing(null);
        }}
      />
    </>
  );
}

/**
 * What one colleague may open.
 *
 * Two questions, and they are different shapes on purpose. Heads are named,
 * because "only these two" is what a business means; areas are switched off,
 * because everything is open by default and stays that way as the panel grows.
 *
 * The whole thing is chips rather than a form of switches. There are twenty of
 * them and every one is the same yes or no, so a grid of them can be read at a
 * glance and set in a few clicks, which is not true of twenty labelled rows.
 */
/**
 * Everything you can do about one person, on its own.
 *
 * The controls are the same ones the list used to carry on every row. What
 * changes is that they are attached to a name you have chosen rather than
 * repeated forty times down a page, so a destructive one is never a button you
 * meet by accident while reading about somebody else.
 */
function PersonPane({
  member,
  isYou,
  lastAdmin,
  busy,
  onBack,
  onRole,
  onPermissions,
  onDetails,
  onRemove,
}: {
  member: Member;
  isYou: boolean;
  /** Demoting or removing the last administrator locks the business out. */
  lastAdmin: boolean;
  busy: boolean;
  onBack: () => void;
  onRole: (role: string) => void;
  onPermissions: () => void;
  onDetails: (details: {
    displayName: string;
    roleTitle: string;
    note: string;
  }) => void;
  onRemove: () => void;
}) {
  const presence = presenceOf(member);

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <header className="flex flex-none items-center gap-3 border-b border-outline-variant px-4 py-4 medium:px-6">
        {/* Only on narrow, where the list is the screen you came from. */}
        <Button variant="text" size="sm" className="expanded:hidden" onClick={onBack}>
          Back
        </Button>
        <div className="min-w-0 flex-1">
          <p className="md-title-lg truncate">
            {member.displayName || member.email}
            {isYou ? <span className="md-label text-on-variant/75"> · you</span> : null}
          </p>
          <p className="md-label-sm truncate text-on-variant/75">
            {member.email}
            {member.roleTitle ? ` · ${member.roleTitle}` : ""}
          </p>
        </div>
        <Chip tone={member.role === "admin" ? "primary" : undefined}>
          {member.role === "admin" ? "Administrator" : "Member"}
        </Chip>
      </header>

      <div className="measure flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 medium:p-6">
        <DetailsCard member={member} busy={busy} onSave={onDetails} />

        <Card>
          <h3 className="md-title mb-3">Role</h3>
          <Select
            aria-label={`Role for ${member.email}`}
            value={member.role}
            disabled={busy || lastAdmin}
            onChange={(event) => onRole(event.target.value)}
          >
            <option value="member">Member</option>
            <option value="admin">Administrator</option>
          </Select>
          {lastAdmin ? (
            <p className="md-label-sm mt-2 text-on-variant/75">
              The only administrator. Promote somebody else before changing this.
            </p>
          ) : null}
        </Card>

        {member.role === "member" ? (
          <Card>
            <h3 className="md-title mb-3">Access</h3>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outlined" disabled={busy} onClick={onPermissions}>
                <ShieldIcon className="h-4 w-4" />
                Permissions
              </Button>
              <span className="md-label-sm text-on-variant/75">
                {unrestricted(member.permissions) ? "Everything" : "Restricted"}
              </span>
            </div>
          </Card>
        ) : null}

        <Card>
          <h3 className="md-title mb-3">Activity</h3>
          <dl className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4">
              <dt className="md-label text-on-variant">Status</dt>
              <dd className="md-body">{presence.label}</dd>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4">
              <dt className="md-label text-on-variant">Last signed in</dt>
              <dd className="md-body">
                {member.lastSignedInAt
                  ? formatExactTime(member.lastSignedInAt)
                  : "Never"}
              </dd>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4">
              <dt className="md-label text-on-variant">Added</dt>
              <dd className="md-body">{formatExactTime(member.createdAt)}</dd>
            </div>
            {member.invitedBy ? (
              <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                <dt className="md-label text-on-variant">Invited by</dt>
                <dd className="md-body truncate">{member.invitedBy}</dd>
              </div>
            ) : null}
          </dl>
        </Card>

        {/*
         * Last, and only when it is actually allowed. Hidden rather than
         * disabled for the last administrator and for yourself, because a
         * greyed out Remove still reads as something you could talk the app
         * into doing.
         */}
        {!isYou && !lastAdmin ? (
          <Card>
            <h3 className="md-title mb-1">Remove from this business</h3>
            <p className="md-body mb-3 text-on-variant">
              They lose access immediately. Their messages and anything they filed stay.
            </p>
            <Button variant="outlined" disabled={busy} onClick={onRemove}>
              <TrashIcon className="h-4 w-4" />
              Remove {member.displayName || member.email}
            </Button>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function PermissionsDialog({
  member,
  heads,
  busy,
  onClose,
  onSave,
}: {
  member: Member | null;
  heads: { id: string; name: string; personaName?: string }[];
  busy: boolean;
  onClose: () => void;
  onSave: (permissions: Permissions) => void | Promise<void>;
}) {
  /*
   * Read once at mount, because the caller gives this a key per person.
   * Without that, editing one colleague and then another opens on the first
   * one's answers, which hands somebody else's restrictions to the wrong
   * account.
   */
  const held = member?.permissions;
  const [everyHead, setEveryHead] = useState(!held?.heads);
  const [chosen, setChosen] = useState<string[]>(held?.heads ?? []);
  const [open, setOpen] = useState<Area[]>(
    AREAS.map((area) => area.key).filter((key) => !held?.denied?.includes(key)),
  );

  const toggle = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];

  const save = () => {
    const permissions: Permissions = {};
    if (!everyHead && chosen.length > 0) permissions.heads = chosen;
    const denied = AREAS.map((area) => area.key).filter((key) => !open.includes(key));
    if (denied.length > 0) permissions.denied = denied;
    void onSave(permissions);
  };

  return (
    <Dialog
      open={Boolean(member)}
      title="Permissions"
      onClose={onClose}
      width="max-w-lg"
      footer={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy || (!everyHead && chosen.length === 0)}
            onClick={save}
          >
            Save
          </Button>
        </>
      }
    >
      <p className="md-body text-on-variant">{member?.displayName || member?.email}</p>

      <p className="md-label-sm mb-2 mt-5 text-on-variant/70">Heads</p>
      <div className="flex flex-wrap gap-2">
        <Chip selected={everyHead} onClick={() => setEveryHead(true)}>
          All heads
        </Chip>
        <Chip selected={!everyHead} onClick={() => setEveryHead(false)}>
          Only these
        </Chip>
      </div>

      {!everyHead ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {heads.map((head) => (
            <Chip
              key={head.id}
              wrap
              selected={chosen.includes(head.id)}
              onClick={() => setChosen((current) => toggle(current, head.id))}
            >
              {head.personaName || head.name}
            </Chip>
          ))}
        </div>
      ) : null}

      <p className="md-label-sm mb-2 mt-6 text-on-variant/70">Areas</p>
      <div className="flex flex-wrap gap-2">
        {AREAS.map((area) => (
          <Chip
            key={area.key}
            wrap
            selected={open.includes(area.key)}
            onClick={() => setOpen((current) => toggle(current, area.key))}
          >
            {area.label}
          </Chip>
        ))}
      </div>
    </Dialog>
  );
}

/**
 * What this business calls somebody, and what they do here.
 *
 * Saved onto the membership rather than onto the account, which is the whole
 * reason this exists as its own card. An account is keyed by email and follows
 * the person to every business they belong to, so an administrator here must
 * not be able to rewrite the name another company sees, or overwrite what
 * somebody chose for themselves in their own settings.
 *
 * So an empty field is not a blank name. It means this business has set
 * nothing and their own value shows through, which is also how an override is
 * undone: clear it. The placeholder shows what will be used when it is empty,
 * so that is visible before the field is touched rather than after.
 */
function DetailsCard({
  member,
  busy,
  onSave,
}: {
  member: Member;
  busy: boolean;
  onSave: (details: { displayName: string; roleTitle: string; note: string }) => void;
}) {
  const [displayName, setDisplayName] = useState(member.setDisplayName);
  const [roleTitle, setRoleTitle] = useState(member.setRoleTitle);
  const [note, setNote] = useState(member.note);

  const changed =
    displayName !== member.setDisplayName ||
    roleTitle !== member.setRoleTitle ||
    note !== member.note;

  return (
    <Card>
      <h3 className="md-title mb-3">Details</h3>

      <div className="flex flex-col gap-4">
        <Field label="Name">
          <TextInput
            value={displayName}
            maxLength={80}
            placeholder={member.ownDisplayName || member.email}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </Field>

        <Field label="Job title">
          <TextInput
            value={roleTitle}
            maxLength={80}
            placeholder={member.ownRoleTitle || "Not set"}
            onChange={(event) => setRoleTitle(event.target.value)}
          />
        </Field>

        {/* Never shown to the person it is about, which is why it is here and
            not on their own account. */}
        <Field label="Private note">
          <TextArea
            value={note}
            rows={2}
            maxLength={500}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Button size="sm" disabled={busy || !changed} onClick={() => onSave({ displayName, roleTitle, note })}>
          Save
        </Button>
        {changed ? (
          <Button
            size="sm"
            variant="text"
            disabled={busy}
            onClick={() => {
              setDisplayName(member.setDisplayName);
              setRoleTitle(member.setRoleTitle);
              setNote(member.note);
            }}
          >
            Cancel
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
