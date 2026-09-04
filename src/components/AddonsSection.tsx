"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DURATION, EASE, play, useEnter } from "@/lib/motion";
import { Button, Card, Chip, Dialog, EmptyState, PuzzleIcon, TrashIcon } from "@/components/ui";
// From describe rather than recipe: recipe.ts imports zod, and a value taken
// from it would ship the validator to the browser. The types are erased.
import { TRIGGER_LABEL, describeStep } from "@/lib/addons/describe";
import type { Recipe, TriggerName } from "@/lib/addons/recipe";
import { formatRelativeTime } from "@/lib/routes";

/** Matches what /api/workspace/addons returns, which is db/addons' Addon. */
interface AddonRow {
  id: string;
  name: string;
  description: string;
  recipe: Recipe;
  hosts: string[];
  state: "pending" | "live" | "paused";
  createdBy: string;
  approvedBy: string | null;
  lastRunAt: number | null;
  runs: number;
  failures: number;
  createdAt: number;
  needsApproval: boolean;
}

interface RunRow {
  id: string;
  addonId: string;
  ok: boolean;
  ran: boolean;
  steps: { did: string; ok: boolean; detail?: string }[];
  createdAt: number;
}

/**
 * The addons a business has, and the approval that lets one run.
 *
 * The screen exists to make one decision readable: this is what it will do, and
 * this is everywhere it can send. Both are printed from the stored recipe
 * rather than from anything the addon said about itself, so a description that
 * flatters the recipe cannot hide a step.
 */
export function AddonsSection({ admin }: { admin: boolean }) {
  const [addons, setAddons] = useState<AddonRow[] | null>(null);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState<AddonRow | null>(null);
  const [removing, setRemoving] = useState<AddonRow | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/workspace/addons");
    const body = (await response.json().catch(() => null)) as {
      addons?: AddonRow[];
      runs?: RunRow[];
      error?: string;
    } | null;
    if (!response.ok) {
      setError(body?.error ?? "Could not read your addons.");
      return;
    }
    setAddons(body?.addons ?? []);
    setRuns(body?.runs ?? []);
    setError(null);
  }, []);

  useEffect(() => {
    if (admin) void load();
  }, [admin, load]);

  const enter = useEnter();
  const list = useRef<HTMLUListElement | null>(null);

  /**
   * Plays the card out before the list without it arrives.
   *
   * Deleting used to make every row below jump up on the same frame the card
   * disappeared, which reads as a mis-click rather than as a deletion. The row
   * is still in the tree here, so there is something to animate; by the time
   * the state updates it has already gone.
   */
  const leave = async (id: string) => {
    const row = list.current?.querySelector<HTMLElement>(`[data-addon="${id}"]`);
    if (!row) return;
    row.style.overflow = "hidden";
    await play(
      row,
      { opacity: [1, 0], transform: ["none", "translateX(-8px)"] },
      { duration: DURATION.short, ease: EASE.accelerate },
    );
  };

  const act = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/workspace/addons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json().catch(() => null)) as {
        addons?: AddonRow[];
        error?: string;
      } | null;
      if (!response.ok) {
        setError(result?.error ?? "Could not make that change.");
        return false;
      }
      if (result?.addons) setAddons(result.addons);
      void load();
      return true;
    } catch {
      setError("Could not reach the server.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (!admin) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="md-title-lg">Addons</h2>

      {error ? <p className="md-label text-error">{error}</p> : null}

      {addons === null ? null : addons.length === 0 ? (
        <EmptyState
          icon={<PuzzleIcon className="h-6 w-6" />}
          title="No addons yet"
          description="Ask the Head of Engineering to build one."
        />
      ) : (
        <ul ref={list} className="flex flex-col gap-3">
          {addons.map((addon) => {
            const failing = addon.failures > 0 && addon.runs > 0;
            return (
              <li key={addon.id} ref={enter} data-addon={addon.id}>
                <Card>
                  <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                    <div className="min-w-0 flex-1">
                      <p className="md-title truncate">{addon.name}</p>
                      {addon.description ? (
                        <p className="md-body mt-0.5 text-on-variant">{addon.description}</p>
                      ) : null}
                      <p className="md-label-sm mt-1 text-on-variant/75">
                        {TRIGGER_LABEL[addon.recipe.trigger as TriggerName]} · built by{" "}
                        {addon.createdBy} {formatRelativeTime(addon.createdAt)}
                      </p>
                    </div>
                    <StateChip addon={addon} />
                  </div>

                  <ul className="mt-3 flex flex-col gap-1">
                    {addon.recipe.steps.map((step, index) => (
                      <li key={index} className="md-body-sm text-on-variant">
                        {describeStep(step)}
                      </li>
                    ))}
                  </ul>

                  {addon.hosts.length ? (
                    <p className="md-label-sm mt-2 text-on-variant/75">
                      Approved to send to {addon.hosts.join(", ")}
                    </p>
                  ) : null}

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {addon.state === "pending" || addon.needsApproval ? (
                      <Button size="sm" disabled={busy} onClick={() => setReviewing(addon)}>
                        Review and approve
                      </Button>
                    ) : addon.state === "live" ? (
                      <Button
                        size="sm"
                        variant="text"
                        disabled={busy}
                        onClick={() => void act({ action: "pause", id: addon.id })}
                      >
                        Pause
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="text"
                        disabled={busy}
                        onClick={() => void act({ action: "resume", id: addon.id })}
                      >
                        Resume
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="text"
                      disabled={busy}
                      onClick={() => setRemoving(addon)}
                    >
                      <TrashIcon className="h-4 w-4" />
                      Delete
                    </Button>

                    <span className="md-label-sm ml-auto text-on-variant/75">
                      {addon.runs === 0
                        ? "Never run"
                        : `${addon.runs} runs${failing ? `, ${addon.failures} failed` : ""}` +
                          (addon.lastRunAt ? `, last ${formatRelativeTime(addon.lastRunAt)}` : "")}
                    </span>
                  </div>

                  <RunLog runs={runs.filter((run) => run.addonId === addon.id)} />
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog
        open={Boolean(reviewing)}
        title="Approve this addon?"
        onClose={() => setReviewing(null)}
        width="max-w-lg"
        footer={
          <>
            <Button variant="text" onClick={() => setReviewing(null)}>
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                if (!reviewing) return;
                const done = await act({ action: "approve", id: reviewing.id });
                if (done) setReviewing(null);
              }}
            >
              Approve and turn on
            </Button>
          </>
        }
      >
        {reviewing ? (
          <div className="flex flex-col gap-3">
            <div>
              <p className="md-label text-on-variant/75">When</p>
              <p className="md-body">{TRIGGER_LABEL[reviewing.recipe.trigger as TriggerName]}</p>
            </div>

            {reviewing.recipe.conditions.length ? (
              <div>
                <p className="md-label text-on-variant/75">Only if</p>
                <ul>
                  {reviewing.recipe.conditions.map((condition, index) => (
                    <li key={index} className="md-body">
                      {condition.field} {condition.op} {condition.value}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div>
              <p className="md-label text-on-variant/75">It will</p>
              <ul>
                {reviewing.recipe.steps.map((step, index) => (
                  <li key={index} className="md-body">
                    {describeStep(step)}
                  </li>
                ))}
              </ul>
            </div>

            {/*
             * The list that matters. Printed from the recipe rather than from
             * the addon's own description, and each host named in full: this is
             * the only thing approval actually grants, and it is granted by
             * name rather than by pattern.
             */}
            <div>
              <p className="md-label text-on-variant/75">It may send to</p>
              {hostsOf(reviewing.recipe).length === 0 ? (
                <p className="md-body">Nothing outside the panel.</p>
              ) : (
                <div className="filter-row mt-1">
                  {hostsOf(reviewing.recipe).map((host) => (
                    <Chip key={host}>{host}</Chip>
                  ))}
                </div>
              )}
            </div>

            <p className="md-body-sm text-on-variant">
              An addon can send but never read anything back, and it is never told a
              key, a file, or anyone&rsquo;s messages. Pause or delete it at any time.
            </p>
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={Boolean(removing)}
        title="Delete this addon?"
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
                setRemoving(null);
                await leave(removing.id);
                await act({ action: "delete", id: removing.id });
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="md-body text-on-variant">
          <code>{removing?.name}</code> stops immediately and its history is removed.
          This cannot be undone.
        </p>
      </Dialog>
    </section>
  );
}

function StateChip({ addon }: { addon: AddonRow }) {
  // Needing approval outranks the stored state: an addon whose recipe now wants
  // a host nobody agreed to is not running, whatever its row says.
  if (addon.needsApproval) return <Chip>Waiting for approval</Chip>;
  if (addon.state === "pending") return <Chip>Not approved</Chip>;
  if (addon.state === "paused") return <Chip>Paused</Chip>;
  return <Chip selected>Running</Chip>;
}

/** Every host the stored recipe would reach, read from the steps themselves. */
function hostsOf(recipe: Recipe): string[] {
  const hosts = new Set<string>();
  for (const step of recipe.steps) {
    if (step.action === "http_post") {
      try {
        hosts.add(new URL(step.url).hostname.toLowerCase());
      } catch {
        // A recipe that got this far has a parseable URL, so this is only
        // reachable if the row was edited underneath us. Showing nothing is
        // right: approval then grants nothing.
      }
    }
  }
  return [...hosts].sort();
}

/**
 * The last few runs.
 *
 * Present because an addon acts when nobody is watching, and the only way that
 * is acceptable is if what it did can be read afterwards. A blocked send is a
 * line here rather than silence, so a webhook that never arrives has an answer.
 */
function RunLog({ runs }: { runs: RunRow[] }) {
  const [open, setOpen] = useState(false);
  if (runs.length === 0) return null;

  return (
    <div className="mt-3 border-t border-outline-variant pt-2">
      <button
        type="button"
        className="md-label-sm text-on-variant/75"
        onClick={() => setOpen((was) => !was)}
      >
        {open ? "Hide history" : `History (${runs.length})`}
      </button>

      {open ? (
        <ul className="mt-2 flex flex-col gap-2">
          {runs.map((run) => (
            <li key={run.id}>
              <p className="md-label-sm text-on-variant/75">
                {formatRelativeTime(run.createdAt)}
                {run.ran ? "" : " · conditions did not match"}
              </p>
              {run.steps.map((step, index) => (
                <p
                  key={index}
                  className={step.ok ? "md-body-sm text-on-variant" : "md-body-sm text-error"}
                >
                  {step.did}
                  {step.detail ? ` · ${step.detail}` : ""}
                </p>
              ))}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
