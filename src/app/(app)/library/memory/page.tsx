"use client";

import { PageHeader } from "@/components/PageHeader";
import Link from "next/link";
import { DepartmentAvatar } from "@/components/DepartmentAvatar";
import { useMemo, useState } from "react";
import {
  Button,
  Chip,
  Dialog,
  EmptyState,
  Field,
  PlusIcon,
  Select,
  SparkIcon,
  TextArea,
  TextInput,
  TrashIcon,
  cx,
} from "@/components/ui";
import { LibraryTabs } from "@/components/LibraryTabs";
import { figureSeries } from "@/lib/memory";
import { conversationHref } from "@/lib/routes";
import { COMPANY_ID } from "@/lib/seed";
import { useStore } from "@/lib/store";
import type { Department, MemoryEntry, MemoryKind } from "@/lib/types";

interface Draft {
  id?: string;
  kind: MemoryKind;
  label: string;
  value: string;
  detail: string;
  revisitWhen: string;
  departmentId: string;
  /** Held as yyyy-mm-dd, which is what a date input speaks. */
  occurredOn: string;
}

/** A timestamp as the date input wants it, in the reader's own zone. */
function toInputDate(ms: number): string {
  const date = new Date(ms);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/** Midday local, so a zone shift either way never moves the entry a day. */
function fromInputDate(value: string): number {
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? Date.now() : parsed.getTime();
}

function formatDay(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function MemoryPage() {
  const { ready, memory, allDepartments, saveMemory, updateMemory, deleteMemory } = useStore();

  const [kindFilter, setKindFilter] = useState<MemoryKind | "all">("all");
  const [showArchived, setShowArchived] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);

  const departmentOf = (id: string) => allDepartments.find((d) => d.id === id);

  const visible = useMemo(
    () =>
      memory
        .filter((entry) => showArchived || !entry.archived)
        .filter((entry) => kindFilter === "all" || entry.kind === kindFilter)
        .sort((a, b) => b.occurredAt - a.occurredAt),
    [memory, kindFilter, showArchived],
  );

  const decisions = visible.filter((entry) => entry.kind === "decision");
  const figures = visible.filter((entry) => entry.kind === "figure");
  const series = figureSeries(figures);

  const openNew = (kind: MemoryKind) =>
    setDraft({
      kind,
      label: "",
      value: "",
      detail: "",
      revisitWhen: "",
      departmentId: COMPANY_ID,
      occurredOn: toInputDate(Date.now()),
    });

  const openExisting = (entry: MemoryEntry) =>
    setDraft({
      id: entry.id,
      kind: entry.kind,
      label: entry.label,
      value: entry.value,
      detail: entry.detail,
      revisitWhen: entry.revisitWhen,
      departmentId: entry.departmentId,
      occurredOn: toInputDate(entry.occurredAt),
    });

  const save = async () => {
    if (!draft || !draft.label.trim()) return;
    const fields = {
      kind: draft.kind,
      label: draft.label,
      value: draft.value,
      detail: draft.detail,
      revisitWhen: draft.revisitWhen,
      departmentId: draft.departmentId,
      occurredAt: fromInputDate(draft.occurredOn),
    };
    if (draft.id) await updateMemory(draft.id, fields);
    else await saveMemory(fields);
    setDraft(null);
  };

  const canSave = Boolean(
    draft?.label.trim() && (draft.kind === "decision" || draft.value.trim()),
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        eyebrow="Library"
        title="Memory"
        description="Decisions and figures every department reads before answering."
        actions={
          <>
            <Button variant="outlined" icon={<PlusIcon className="h-4 w-4" />} onClick={() => openNew("figure")}>
              Figure
            </Button>
            <Button icon={<PlusIcon className="h-4 w-4" />} onClick={() => openNew("decision")}>
              Decision
            </Button>
          </>
        }
      />
      <LibraryTabs />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 medium:px-6 expanded:px-8">
        <div className="measure-wide">
          <div className="mb-5 flex flex-wrap items-center gap-2">
            {(["all", "decision", "figure"] as const).map((kind) => (
              <Chip
                key={kind}
                selected={kindFilter === kind}
                onClick={() => setKindFilter(kind)}
              >
                {kind === "all" ? "Everything" : kind === "decision" ? "Decisions" : "Figures"}
              </Chip>
            ))}
            <span className="flex-1" />
            <Chip selected={showArchived} onClick={() => setShowArchived((v) => !v)}>
              Show archived
            </Chip>
          </div>

          {ready && memory.length === 0 ? (
            <EmptyState
              icon={<SparkIcon className="h-6 w-6" />}
              title="No entries"
              description="Record a decision or a figure. Every department reads these before answering."
              action={<Button onClick={() => openNew("decision")}>Record a decision</Button>}
            />
          ) : null}

          {decisions.length > 0 ? (
            <section className="mb-8">
              <h2 className="md-label-sm mb-3 text-on-variant">
                Decisions · {decisions.length}
              </h2>
              {/* Two columns from expanded up. One column on a wide screen is
                  a short line of text and a long scroll, which is the worst of
                  both. Cards vary in height, so this is a grid rather than
                  columns, which would break a card across the fold. */}
              <ul className="grid gap-2 expanded:grid-cols-2">
                {decisions.map((entry) => (
                  <li key={entry.id}>
                    <EntryCard
                      entry={entry}
                      department={departmentOf(entry.departmentId)}
                      onEdit={() => openExisting(entry)}
                      onArchive={() => updateMemory(entry.id, { archived: !entry.archived })}
                      onDelete={() => deleteMemory(entry.id)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {series.size > 0 ? (
            <section className="mb-8">
              <h2 className="md-label-sm mb-3 text-on-variant">Figures · {series.size}</h2>
              <ul className="grid gap-2 medium:grid-cols-2 large:grid-cols-3">
                {[...series].map(([label, readings]) => (
                  <li
                    key={label}
                    className="rounded-2xl border border-outline-variant bg-container p-4"
                  >
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <p className="md-title">{label}</p>
                      <p className="md-label-sm text-on-variant">
                        {readings.length} reading{readings.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    <ul className="mt-3 space-y-1.5">
                      {readings.map((entry) => (
                        <li
                          key={entry.id}
                          className="flex flex-wrap items-center gap-x-3 gap-y-1"
                        >
                          <span
                            className={cx(
                              "md-body font-medium tabular-nums",
                              entry.archived && "line-through opacity-60",
                            )}
                          >
                            {entry.value}
                          </span>
                          <span className="md-label-sm text-on-variant">
                            {formatDay(entry.occurredAt)}
                          </span>
                          <span className="flex-1" />
                          <button
                            onClick={() => openExisting(entry)}
                            className="md-state md-label-sm rounded-lg px-2 py-0.5 text-on-variant"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => void deleteMemory(entry.id)}
                            aria-label={`Delete the ${label} reading from ${formatDay(entry.occurredAt)}`}
                            className="md-state grid h-7 w-7 place-items-center rounded-full text-on-variant"
                          >
                            <TrashIcon className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

        </div>
      </div>

      <Dialog
        open={Boolean(draft)}
        title={
          draft?.id
            ? `Edit ${draft.kind}`
            : draft?.kind === "figure"
              ? "Record a figure"
              : "Record a decision"
        }
        onClose={() => setDraft(null)}
        footer={
          <>
            <Button variant="text" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={!canSave}>
              Save
            </Button>
          </>
        }
      >
        {draft ? (
          <div className="space-y-4">
            <Field label={draft.kind === "figure" ? "Measure" : "Decision"}>
              <TextInput
                autoFocus
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                placeholder={
                  draft.kind === "figure"
                    ? "Frontier Assembly wishlists"
                    : "Not taking new client sites until Frontier Assembly ships"
                }
              />
            </Field>

            {draft.kind === "figure" ? (
              <Field label="Value">
                <TextInput
                  value={draft.value}
                  onChange={(e) => setDraft({ ...draft, value: e.target.value })}
                  placeholder="1,240"
                />
              </Field>
            ) : (
              <>
                <Field label="Reasoning">
                  <TextArea
                    rows={3}
                    value={draft.detail}
                    onChange={(e) => setDraft({ ...draft, detail: e.target.value })}
                    placeholder="Client work pays now but the game is the thing with upside, and splitting attention was costing both."
                  />
                </Field>
                <Field label="Review trigger">
                  <TextInput
                    value={draft.revisitWhen}
                    onChange={(e) => setDraft({ ...draft, revisitWhen: e.target.value })}
                    placeholder="Frontier Assembly ships, or runway drops under three months"
                  />
                </Field>
              </>
            )}

            <div className="grid gap-4 medium:grid-cols-2">
              <Field label="Applies to">
                <Select
                  value={draft.departmentId}
                  onChange={(e) => setDraft({ ...draft, departmentId: e.target.value })}
                >
                  <option value={COMPANY_ID}>All departments</option>
                  {allDepartments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={draft.kind === "figure" ? "Measured on" : "Decided on"}>
                <TextInput
                  type="date"
                  value={draft.occurredOn}
                  onChange={(e) => setDraft({ ...draft, occurredOn: e.target.value })}
                />
              </Field>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}

function EntryCard({
  entry,
  department,
  onEdit,
  onArchive,
  onDelete,
}: {
  entry: MemoryEntry;
  /** Undefined for a company-wide entry, which belongs to no one head. */
  department?: Department;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cx(
        "rounded-2xl border border-outline-variant bg-container p-4",
        entry.archived && "opacity-60",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className={cx("md-title", entry.archived && "line-through")}>{entry.label}</p>
          {entry.detail ? (
            <p className="md-body mt-1.5 text-on-variant">{entry.detail}</p>
          ) : null}
          {entry.revisitWhen ? (
            <p className="md-label-sm mt-2 text-warning">Revisit when: {entry.revisitWhen}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="md-label-sm text-on-variant">{formatDay(entry.occurredAt)}</span>
            <span className="md-label-sm text-on-variant">·</span>
            {department ? (
              <span className="md-label-sm flex items-center gap-1.5 text-on-variant">
                <DepartmentAvatar department={department} size={18} />
                {department.name}
              </span>
            ) : (
              <span className="md-label-sm text-on-variant">All departments</span>
            )}
            {entry.sourceConversationId ? (
              <Link
                href={conversationHref(entry.departmentId, entry.sourceConversationId)}
                className="md-label-sm text-primary underline underline-offset-2"
              >
                From a conversation
              </Link>
            ) : null}
          </div>
        </div>
        <div className="flex flex-none items-center gap-1">
          <button
            onClick={onEdit}
            className="md-state md-label-sm rounded-lg px-2 py-1 text-on-variant"
          >
            Edit
          </button>
          <button
            onClick={onArchive}
            className="md-state md-label-sm rounded-lg px-2 py-1 text-on-variant"
          >
            {entry.archived ? "Restore" : "Archive"}
          </button>
          <button
            onClick={onDelete}
            aria-label="Delete this entry"
            className="md-state grid h-8 w-8 place-items-center rounded-full text-on-variant"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
