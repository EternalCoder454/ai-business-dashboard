"use client";

import { useState } from "react";
import {
  BuildingIcon,
  Button,
  Card,
  Chip,
  Dialog,
  EmptyState,
  Field,
  TextInput,
} from "./ui";
import { formatRelativeTime } from "@/lib/routes";

export interface WorkspaceRow {
  id: string;
  name: string;
  note: string | null;
  createdBy: string | null;
  createdAt: number;
  members: { email: string; role: "member" | "admin"; lastSignedInAt: number | null }[];
}

/**
 * The businesses on this deployment, and the people in each.
 *
 * This is the screen that replaced editing an environment variable and
 * redeploying in order to add one person. Creating a business and inviting its
 * first member are one action, because a workspace nobody can open is not a
 * thing anyone means to make.
 */
export function BusinessesTab({
  workspaces,
  emailReady,
  onChanged,
}: {
  workspaces: WorkspaceRow[] | null;
  emailReady: boolean;
  onChanged: (next: WorkspaceRow[]) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [invitingTo, setInvitingTo] = useState<WorkspaceRow | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [renaming, setRenaming] = useState<WorkspaceRow | null>(null);
  const [newName, setNewName] = useState("");
  const [removing, setRemoving] = useState<WorkspaceRow | null>(null);
  const [confirmName, setConfirmName] = useState("");

  const post = async (body: Record<string, unknown>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json().catch(() => null)) as
        | { error?: string; emailError?: string | null; workspaces?: WorkspaceRow[] }
        | null;
      if (!response.ok) {
        setError(result?.error ?? "That did not work.");
        return false;
      }
      if (result?.workspaces) onChanged(result.workspaces);
      // The access row is written either way. A refused send is worth saying
      // out loud, and is not a failure of the thing that was asked for.
      setNotice(
        result?.emailError ? `Done, but the email did not send: ${result.emailError}` : "Done.",
      );
      return true;
    } catch {
      setError("Could not reach the server.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="measure flex flex-col gap-5">
      <Card>
        <h2 className="md-title-lg mb-1">New business</h2>
        <p className="md-body mb-4 text-on-variant">
          Creates a workspace and, given an address, puts that person in it as its
          administrator{emailReady ? " and emails them" : ""}. They sign in with
          Google, and there is nothing for them to set up.
        </p>

        <div className="grid grid-cols-1 gap-4 medium:grid-cols-2">
          <Field label="Business name">
            <TextInput
              value={name}
              placeholder="What the company is called"
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field label="First person" hint="Optional. They become its administrator.">
            <TextInput
              type="email"
              value={email}
              autoComplete="off"
              placeholder="them@theircompany.com"
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
        </div>

        <Field label="Note" hint="Only you see this." className="mt-4">
          <TextInput
            value={note}
            placeholder="How you know them, or what they bought"
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>

        {emailReady ? null : (
          <p className="md-label-sm mt-3 text-warning">
            No RESEND_API_KEY, so nothing is emailed. Access still works and they
            can sign in; you have to tell them yourself.
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            disabled={busy || !name.trim()}
            onClick={async () => {
              const ok = await post({
                action: "createWorkspace",
                name,
                email: email.trim() || undefined,
                note: note.trim() || undefined,
              });
              if (ok) {
                setName("");
                setEmail("");
                setNote("");
              }
            }}
          >
            {busy ? "Creating…" : "Create"}
          </Button>
          {error ? <span className="md-label-sm text-error">{error}</span> : null}
          {notice ? <span className="md-label-sm text-on-variant">{notice}</span> : null}
        </div>
      </Card>

      {workspaces === null ? null : workspaces.length === 0 ? (
        <EmptyState
          icon={<BuildingIcon className="h-6 w-6" />}
          title="No businesses yet"
          description="Create one above. Each gets its own departments, skills, and memory."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {workspaces.map((workspace) => (
            <li key={workspace.id}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="md-title">{workspace.name}</h3>
                    <p className="md-label-sm text-on-variant/75">
                      {workspace.members.length}{" "}
                      {workspace.members.length === 1 ? "person" : "people"} · created{" "}
                      {formatRelativeTime(workspace.createdAt)}
                      {workspace.note ? ` · ${workspace.note}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outlined"
                      onClick={() => {
                        setInvitingTo(workspace);
                        setInviteEmail("");
                      }}
                    >
                      Add person
                    </Button>
                    <Button
                      size="sm"
                      variant="text"
                      onClick={() => {
                        setRenaming(workspace);
                        setNewName(workspace.name);
                      }}
                    >
                      Rename
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => {
                        setRemoving(workspace);
                        setConfirmName("");
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>

                {workspace.members.length > 0 ? (
                  <ul className="mt-3 flex flex-col gap-1.5 border-t border-outline-variant pt-3">
                    {workspace.members.map((member) => (
                      <li key={member.email} className="flex flex-wrap items-center gap-2">
                        <span className="md-body truncate">{member.email}</span>
                        {member.role === "admin" ? <Chip tone="primary">Admin</Chip> : null}
                        {member.lastSignedInAt ? (
                          <span className="md-label-sm text-on-variant/75">
                            last in {formatRelativeTime(member.lastSignedInAt)}
                          </span>
                        ) : (
                          <Chip tone="warning">Never signed in</Chip>
                        )}
                        <button
                          onClick={() => void post({ action: "revoke", email: member.email })}
                          className="md-label-sm ml-auto text-error underline"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={Boolean(invitingTo)}
        title={`Add someone to ${invitingTo?.name ?? ""}`}
        onClose={() => setInvitingTo(null)}
        footer={
          <>
            <Button variant="text" onClick={() => setInvitingTo(null)}>
              Cancel
            </Button>
            <Button
              disabled={busy || !inviteEmail.trim()}
              onClick={async () => {
                const ok = await post({
                  action: "grant",
                  email: inviteEmail,
                  workspaceId: invitingTo?.id,
                  role: "member",
                });
                if (ok) setInvitingTo(null);
              }}
            >
              Add
            </Button>
          </>
        }
      >
        <Field
          label="Address"
          hint={
            emailReady
              ? "They are emailed, and can sign in straight away."
              : "They can sign in straight away. Nothing is emailed."
          }
        >
          <TextInput
            type="email"
            autoFocus
            value={inviteEmail}
            autoComplete="off"
            placeholder="them@theircompany.com"
            onChange={(event) => setInviteEmail(event.target.value)}
          />
        </Field>
      </Dialog>

      <Dialog
        open={Boolean(renaming)}
        title={`Rename ${renaming?.name ?? ""}`}
        onClose={() => setRenaming(null)}
        footer={
          <>
            <Button variant="text" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button
              disabled={busy || !newName.trim()}
              onClick={async () => {
                const ok = await post({
                  action: "renameWorkspace",
                  workspaceId: renaming?.id,
                  name: newName,
                });
                if (ok) setRenaming(null);
              }}
            >
              Rename
            </Button>
          </>
        }
      >
        <Field
          label="Business name"
          hint="This is what their panel is called, so it changes there too."
        >
          <TextInput
            autoFocus
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
          />
        </Field>
      </Dialog>

      <Dialog
        open={Boolean(removing)}
        title={`Delete ${removing?.name ?? ""}`}
        onClose={() => setRemoving(null)}
        footer={
          <>
            <Button variant="text" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={busy || confirmName !== removing?.name}
              onClick={async () => {
                const ok = await post({ action: "deleteWorkspace", workspaceId: removing?.id });
                if (ok) setRemoving(null);
              }}
            >
              Delete everything
            </Button>
          </>
        }
      >
        <p className="md-body mb-4">
          Every conversation, skill, file, task, and decision in{" "}
          <strong>{removing?.name}</strong> goes, and everyone in it loses access.
          This cannot be undone.
        </p>
        <Field label="Type the name to confirm">
          <TextInput
            value={confirmName}
            autoComplete="off"
            placeholder={removing?.name ?? ""}
            onChange={(event) => setConfirmName(event.target.value)}
          />
        </Field>
      </Dialog>
    </div>
  );
}
