"use client";

import { useCallback, useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { Button, Card, Chip, Dialog, TextInput } from "./ui";

interface Backup {
  id: string;
  label: string;
  kind: string;
  takenBy: string;
  bytes: number;
  counts: Record<string, number>;
  createdAt: number;
}

/** How a backup came to exist, in the words somebody would use for it. */
const KIND_LABEL: Record<string, string> = {
  manual: "Taken by hand",
  automatic: "Automatic",
  "before-restore": "Before a restore",
};

function size(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function when(at: number): string {
  return new Date(at).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * What is in a backup, as a sentence rather than a table of counts.
 *
 * Only what is actually there: a workspace with no meetings should not be told
 * it has none of them. The point is to recognise the right backup at a glance,
 * and eighteen rows of mostly zeroes is not a glance.
 */
function contents(counts: Record<string, number>): string {
  const NAMES: [string, string, string][] = [
    ["conversations", "conversation", "conversations"],
    ["messages", "message", "messages"],
    ["tasks", "task", "tasks"],
    ["deliverables", "deliverable", "deliverables"],
    ["skills", "skill", "skills"],
    ["wikiPages", "wiki page", "wiki pages"],
    ["memory", "memory", "memories"],
    ["projects", "project", "projects"],
  ];

  const parts = NAMES.filter(([key]) => (counts[key] ?? 0) > 0).map(
    ([key, one, many]) => `${counts[key]} ${counts[key] === 1 ? one : many}`,
  );
  return parts.length ? parts.join(", ") : "Nothing yet";
}

/**
 * Taking a workspace back to how it was.
 *
 * Administrator only, and hidden rather than disabled for everybody else: a
 * restore rewrites every table at once, including screens a restricted member
 * is not allowed to open, so there is no version of this they should see.
 */
export function BackupsCard() {
  const { workspaceRole, retryLoad } = useStore();
  const [backups, setBackups] = useState<Backup[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [confirming, setConfirming] = useState<Backup | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const isAdmin = workspaceRole === "admin";

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/backups");
      const body = (await response.json()) as { backups?: Backup[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not read the backups.");
      setBackups(body.backups ?? []);
      setError(null);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Could not read the backups.");
      setBackups([]);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  if (!isAdmin) return null;

  const take = async () => {
    setBusy("create");
    setDone(null);
    try {
      const response = await fetch("/api/backups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", label: label.trim() }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not take a backup.");
      setLabel("");
      setDone("Backup taken.");
      await load();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Could not take a backup.");
    }
    setBusy(null);
  };

  const restore = async (backup: Backup) => {
    setBusy(backup.id);
    setConfirming(null);
    setDone(null);
    try {
      const response = await fetch("/api/backups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore", id: backup.id }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not restore that backup.");
      setDone("Restored. A backup of what was here first was taken before anything changed.");
      await load();
      /*
       * Every table just changed underneath the screen, so what is held in
       * memory is now describing a workspace that no longer exists. Reloading
       * the snapshot is the only honest thing to show.
       */
      retryLoad();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Could not restore that backup.");
    }
    setBusy(null);
  };

  const remove = async (backup: Backup) => {
    setBusy(backup.id);
    try {
      const response = await fetch(`/api/backups?id=${encodeURIComponent(backup.id)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "Could not remove that backup.");
      }
      await load();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Could not remove that backup.");
    }
    setBusy(null);
  };

  return (
    <Card className="expanded:col-span-2">
      <h2 className="md-title-lg mb-5">Backups</h2>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <TextInput
          value={label}
          placeholder="What is this backup for"
          className="min-w-0 flex-1"
          onChange={(event) => setLabel(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !busy) void take();
          }}
        />
        <Button onClick={() => void take()} disabled={busy !== null}>
          {busy === "create" ? "Taking…" : "Take a backup"}
        </Button>
      </div>

      {error ? (
        <p className="md-body mb-4 rounded-xl bg-error-container px-3 py-2 text-on-error-container">
          {error}
        </p>
      ) : null}
      {done ? <p className="md-body mb-4 text-on-variant">{done}</p> : null}

      {backups === null ? (
        <p className="md-body text-on-variant">Reading…</p>
      ) : backups.length === 0 ? (
        <p className="md-body text-on-variant">No backups yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {backups.map((backup) => (
            <li
              key={backup.id}
              className="rounded-xl border border-outline-variant px-3 py-2.5"
            >
              {/* Stacked until there is room for a row. Laid out as one wrapping
                  line first, which on a phone squeezed the label to nothing and
                  broke it to a word per line while the chip sat on top of the
                  buttons. Nothing here shrinks below its content now. */}
              <div className="flex flex-col gap-2 medium:flex-row medium:items-center medium:gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="md-body min-w-0 truncate font-medium">
                      {backup.label || "Backup"}
                    </p>
                    <Chip>{KIND_LABEL[backup.kind] ?? backup.kind}</Chip>
                  </div>
                  <p className="md-body-sm mt-0.5 text-on-variant">
                    {when(backup.createdAt)} · {size(backup.bytes)} uncompressed
                  </p>
                  <p className="md-body-sm text-on-variant">{contents(backup.counts)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="sm"
                    variant="outlined"
                    disabled={busy !== null}
                    onClick={() => setConfirming(backup)}
                  >
                    {busy === backup.id ? "Working…" : "Restore"}
                  </Button>
                  <Button
                    size="sm"
                    variant="text"
                    disabled={busy !== null}
                    onClick={() => void remove(backup)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={confirming !== null}
        title={`Restore ${confirming?.label || "this backup"}?`}
        onClose={() => setConfirming(null)}
        width="max-w-lg"
        footer={
          <>
            <Button variant="text" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => confirming && void restore(confirming)}>
              Restore
            </Button>
          </>
        }
      >
        <p className="md-body">
          This replaces everything in the workspace with {contents(confirming?.counts ?? {})} from{" "}
          {confirming ? when(confirming.createdAt) : ""}. Anything written since is removed.
        </p>
        <p className="md-body mt-3 text-on-variant">
          A backup of the workspace as it is now is taken first, so this can be undone by restoring
          that one. Sign in keys, who can open the workspace, and uploaded files are left alone.
        </p>
      </Dialog>
    </Card>
  );
}
