"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import {
  Button,
  Card,
  Chip,
  CopyIcon,
  Dialog,
  Field,
  PlusIcon,
  PuzzleIcon,
  TextInput,
  TrashIcon,
  cx,
} from "@/components/ui";
import { useStore } from "@/lib/store";
import { formatRelativeTime } from "@/lib/routes";

interface KeyRow {
  id: string;
  name: string;
  prefix: string;
  last4: string;
  scopes: string[];
  createdBy: string;
  createdAt: number;
  lastUsedAt: number | null;
}

/** What each scope actually lets a key do, in the owner's terms rather than ours. */
const SCOPE_LABEL: Record<string, string> = {
  "tasks:read": "Read the task list",
  "tasks:write": "Add and change tasks",
  "departments:read": "See the org chart",
  "memory:read": "Read what the business has recorded",
  "chat:write": "Ask a head a question",
};

/**
 * Addons, and the key an addon signs in with.
 *
 * The catalogue is not built yet and says so rather than showing an empty grid
 * that looks broken. What is real today is the key: anything that can make an
 * HTTP request can already read the task list and write to it, which is the
 * part every addon would have been built on anyway.
 */
export default function IntegrationsPage() {
  const { workspaceRole, settings } = useStore();
  const admin = workspaceRole === "admin";

  const [keys, setKeys] = useState<KeyRow[] | null>(null);
  const [scopes, setScopes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftScopes, setDraftScopes] = useState<string[]>(["tasks:read", "tasks:write"]);
  const [minted, setMinted] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<KeyRow | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/workspace/api-keys");
    const body = (await response.json().catch(() => null)) as {
      keys?: KeyRow[];
      scopes?: string[];
      error?: string;
    } | null;
    if (!response.ok) {
      setError(body?.error ?? "Could not read your keys.");
      return;
    }
    setKeys(body?.keys ?? []);
    setScopes(body?.scopes ?? []);
    setError(null);
  }, []);

  useEffect(() => {
    if (admin) void load();
  }, [admin, load]);

  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/workspace/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json().catch(() => null)) as {
        keys?: KeyRow[];
        token?: string;
        error?: string;
      } | null;
      if (!response.ok) {
        setError(result?.error ?? "Could not make that change.");
        return null;
      }
      if (result?.keys) setKeys(result.keys);
      return result;
    } catch {
      setError("Could not reach the server.");
      return null;
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow={settings.companyName}
        title="Integrations"
        actions={
          admin ? (
            <Button onClick={() => setCreating(true)}>
              <PlusIcon className="h-4 w-4" />
              New key
            </Button>
          ) : undefined
        }
      />

      <div className="measure flex flex-col gap-5 p-4 sm:p-6">
        {error ? <p className="md-label text-error">{error}</p> : null}

        <Card>
          <div className="flex items-start gap-3">
            <PuzzleIcon className="mt-0.5 h-5 w-5 flex-none text-on-variant" />
            <div className="min-w-0">
              <p className="md-title">Addons are being built</p>
              <p className="md-body mt-1 text-on-variant">
                An addon is one job the panel can do outside itself — posting a video,
                filing an invoice, updating a listing. They are not here yet. What is
                here is the API they will all run on, so anything you write today keeps
                working when the catalogue arrives.
              </p>
            </div>
          </div>
        </Card>

        <section className="flex flex-col gap-3">
          <div>
            <h2 className="md-title-lg">Developer API</h2>
            <p className="md-body mt-1 text-on-variant">
              A key acts as this business, not as you, so an addon keeps working after
              whoever set it up has moved on. Start at{" "}
              <code className="rounded bg-container px-1.5 py-0.5">GET /api/v1</code>,
              which describes everything else.
            </p>
          </div>

          {!admin ? (
            <Card>
              <p className="md-body text-on-variant">
                An administrator of this business looks after its keys.
              </p>
            </Card>
          ) : keys === null ? null : keys.length === 0 ? (
            <Card>
              <p className="md-body text-on-variant">
                No keys yet. Make one and the examples below will work as written.
              </p>
            </Card>
          ) : (
            <ul className="flex flex-col gap-3">
              {keys.map((key) => (
                <li key={key.id}>
                  <Card>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <div className="min-w-0 flex-1">
                        <p className="md-title truncate">{key.name}</p>
                        <p className="md-label-sm truncate text-on-variant/75">
                          <code>
                            {key.prefix}…{key.last4}
                          </code>{" "}
                          · made {formatRelativeTime(key.createdAt)} by {key.createdBy}
                        </p>
                      </div>
                      <span className="md-label-sm text-on-variant/75">
                        {key.lastUsedAt
                          ? `Used ${formatRelativeTime(key.lastUsedAt)}`
                          : "Never used"}
                      </span>
                      <Button
                        size="sm"
                        variant="text"
                        disabled={busy}
                        onClick={() => setRevoking(key)}
                      >
                        <TrashIcon className="h-4 w-4" />
                        Revoke
                      </Button>
                    </div>
                    <div className="filter-row mt-2">
                      {key.scopes.map((scope) => (
                        <Chip key={scope}>{SCOPE_LABEL[scope] ?? scope}</Chip>
                      ))}
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="md-title-lg">Reading the task list</h2>
          <p className="md-body text-on-variant">
            This is the loop most addons run: ask what needs doing, do one of them, mark
            it off.
          </p>
          <pre className="overflow-x-auto rounded-xl border border-outline-variant bg-container p-3 text-[0.8125rem] leading-relaxed">
            <code>{`curl https://business.eterneon.net/api/v1/tasks?status=todo \\
  -H "Authorization: Bearer ek_your_key"

# → { "data": { "items": [ ... ], "next_cursor": null, "has_more": false },
#     "request_id": "..." }

curl -X PATCH https://business.eterneon.net/api/v1/tasks/TASK_ID \\
  -H "Authorization: Bearer ek_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{"status":"done"}'`}</code>
          </pre>
          <p className="md-label-sm text-on-variant/75">
            Every response carries a <code>request_id</code>, also on the{" "}
            <code>X-Request-Id</code> header. Quote it if something looks wrong and it
            can be found.
          </p>
        </section>
      </div>

      <Dialog
        open={creating}
        title="New API key"
        onClose={() => setCreating(false)}
        width="max-w-lg"
        footer={
          <>
            <Button variant="text" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button
              disabled={busy || !draftName.trim() || draftScopes.length === 0}
              onClick={async () => {
                const result = await post({
                  action: "create",
                  name: draftName,
                  scopes: draftScopes,
                });
                if (result?.token) {
                  setCreating(false);
                  setDraftName("");
                  setCopied(false);
                  setMinted(result.token);
                }
              }}
            >
              {busy ? "Making…" : "Make key"}
            </Button>
          </>
        }
      >
        <Field label="What is it for?" hint="So you can tell two keys apart later.">
          <TextInput
            autoFocus
            value={draftName}
            placeholder="Social posting addon"
            onChange={(event) => setDraftName(event.target.value)}
          />
        </Field>
        <Field label="What it can do" hint="Give it the least that does the job.">
          <div className="filter-row">
            {scopes.map((scope) => {
              const on = draftScopes.includes(scope);
              return (
                <Chip
                  key={scope}
                  selected={on}
                  onClick={() =>
                    setDraftScopes((current) =>
                      on ? current.filter((s) => s !== scope) : [...current, scope],
                    )
                  }
                >
                  {SCOPE_LABEL[scope] ?? scope}
                </Chip>
              );
            })}
          </div>
        </Field>
      </Dialog>

      <Dialog
        open={Boolean(minted)}
        title="Copy this now"
        onClose={() => setMinted(null)}
        width="max-w-lg"
        footer={<Button onClick={() => setMinted(null)}>Done</Button>}
      >
        <p className="md-body mb-3 text-on-variant">
          This is the only time the key is shown. It is stored as a hash, so nobody —
          including us — can read it back. If it is lost, revoke it and make another.
        </p>
        <div className="flex items-center gap-2">
          <code
            className={cx(
              "min-w-0 flex-1 overflow-x-auto rounded-lg border border-outline-variant",
              "bg-container px-3 py-2 text-[0.8125rem]",
            )}
          >
            {minted}
          </code>
          <Button
            size="sm"
            onClick={async () => {
              if (!minted) return;
              try {
                await navigator.clipboard.writeText(minted);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            <CopyIcon className="h-4 w-4" />
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(revoking)}
        title="Revoke this key?"
        onClose={() => setRevoking(null)}
        width="max-w-md"
        footer={
          <>
            <Button variant="text" onClick={() => setRevoking(null)}>
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                if (!revoking) return;
                const done = await post({ action: "revoke", id: revoking.id });
                if (done) setRevoking(null);
              }}
            >
              Revoke
            </Button>
          </>
        }
      >
        <p className="md-body text-on-variant">
          Anything using <code>{revoking?.name}</code> stops working immediately. This
          cannot be undone.
        </p>
      </Dialog>
    </>
  );
}
