"use client";

import { PageHeader } from "@/components/PageHeader";
import Link from "next/link";
import { DepartmentAvatar } from "@/components/DepartmentAvatar";
import { useMemo, useState } from "react";
import {
  Button,
  ChevronIcon,
  Chip,
  Dialog,
  DocIcon,
  EditIcon,
  EmptyState,
  Field,
  PlusIcon,
  Select,
  TextArea,
  TextInput,
  TrashIcon,
  cx,
} from "@/components/ui";
import { Markdown } from "@/components/ChatView";
import { LibraryTabs } from "@/components/LibraryTabs";
import { conversationHref, formatRelativeTime } from "@/lib/routes";
import { DELIVERABLE_COLUMNS, useStore } from "@/lib/store";
import type { Deliverable, DeliverableStatus } from "@/lib/types";

interface DraftDeliverable {
  id?: string;
  title: string;
  body: string;
  departmentId: string;
  status: DeliverableStatus;
}

export default function DeliverablesPage() {
  const {
    deliverables,
    allDepartments,
    createDeliverable,
    updateDeliverable,
    deleteDeliverable,
  } = useStore();

  const [filter, setFilter] = useState<string>("all");
  const [draft, setDraft] = useState<DraftDeliverable | null>(null);
  const [reading, setReading] = useState<Deliverable | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const visible = useMemo(
    () => (filter === "all" ? deliverables : deliverables.filter((d) => d.departmentId === filter)),
    [deliverables, filter],
  );

  const departmentOf = (id: string) => allDepartments.find((d) => d.id === id);

  const openNew = () =>
    setDraft({
      title: "",
      body: "",
      departmentId: allDepartments[0]?.id ?? "ceo",
      status: "backlog",
    });

  const save = async () => {
    if (!draft) return;
    if (draft.id) {
      await updateDeliverable(draft.id, {
        title: draft.title.trim() || "Untitled deliverable",
        body: draft.body,
        departmentId: draft.departmentId,
        status: draft.status,
      });
    } else {
      await createDeliverable(draft);
    }
    setDraft(null);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        eyebrow="Library"
        title="Deliverables"
        actions={
          <Button icon={<PlusIcon className="h-4 w-4" />} onClick={openNew}>
            New deliverable
          </Button>
        }
      />

      <LibraryTabs />

      <div className="filter-row flex-none border-b border-outline-variant px-4 medium:px-6 expanded:px-8 py-3">
        <Chip selected={filter === "all"} onClick={() => setFilter("all")}>
          All · {deliverables.length}
        </Chip>
        {allDepartments.map((department) => {
          const count = deliverables.filter((d) => d.departmentId === department.id).length;
          if (count === 0 && filter !== department.id) return null;
          return (
            <Chip
              key={department.id}
              selected={filter === department.id}
              onClick={() => setFilter(department.id)}
            >
              <DepartmentAvatar department={department} size={18} />
              {department.name} · {count}
            </Chip>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto page-x py-6">
        <div className="measure">
        {deliverables.length === 0 ? (
          <EmptyState
            icon={<DocIcon className="h-8 w-8" />}
            title="Nothing captured yet"
            description="Save any reply worth keeping straight from a chat with the bookmark button."
            action={<Button onClick={openNew}>Add one manually</Button>}
          />
        ) : (
          <div className="grid grid-cols-1 gap-5 expanded:grid-cols-3">
            {DELIVERABLE_COLUMNS.map((column, columnIndex) => {
              const items = visible.filter((d) => d.status === column.id);
              return (
                <section
                  key={column.id}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={async (event) => {
                    event.preventDefault();
                    if (dragId) await updateDeliverable(dragId, { status: column.id });
                    setDragId(null);
                  }}
                  className="flex min-h-[220px] flex-col gap-3 rounded-2xl bg-low p-3"
                >
                  <div className="flex items-center justify-between px-1.5 pt-1">
                    <h2 className="md-label-sm text-on-variant">{column.label}</h2>
                    <span className="md-label-sm text-on-variant/75">{items.length}</span>
                  </div>

                  {items.length === 0 ? (
                    <p className="md-label rounded-xl border border-dashed border-outline-variant px-3 py-6 text-center text-on-variant/70">
                      <span className="hidden medium:inline">Drop here</span>
                      <span className="medium:hidden">Nothing here</span>
                    </p>
                  ) : null}

                  {items.map((item) => {
                    const department = departmentOf(item.departmentId);
                    return (
                      <article
                        key={item.id}
                        draggable
                        onDragStart={() => setDragId(item.id)}
                        onDragEnd={() => setDragId(null)}
                        className={cx(
                          "group cursor-grab rounded-2xl bg-container p-4 shadow-e1 transition-shadow hover:shadow-e2 active:cursor-grabbing",
                          dragId === item.id && "opacity-50",
                        )}
                      >
                        <button
                          onClick={() => setReading(item)}
                          className="block w-full text-left"
                        >
                          <p className="md-title line-clamp-2">{item.title}</p>
                          <p className="md-body mt-1.5 line-clamp-3 text-on-variant">
                            {item.body.replace(/[#*`>_-]/g, " ").slice(0, 180)}
                          </p>
                        </button>

                        <div className="mt-3 flex items-center justify-between gap-2">
                          <Chip>
                            {department ? (
                              <DepartmentAvatar department={department} size={16} />
                            ) : null}
                            {department?.name ?? "Unassigned"}
                          </Chip>
                          <span className="md-label-sm text-on-variant/75">
                            {formatRelativeTime(item.updatedAt)}
                          </span>
                        </div>

                        <div className="mt-2 flex items-center gap-1">
                          <IconButton
                            label="Move left"
                            disabled={columnIndex === 0}
                            onClick={() =>
                              void updateDeliverable(item.id, {
                                status: DELIVERABLE_COLUMNS[columnIndex - 1].id,
                              })
                            }
                          >
                            <ChevronIcon className="h-3.5 w-3.5 rotate-180" />
                          </IconButton>
                          <IconButton
                            label="Move right"
                            disabled={columnIndex === DELIVERABLE_COLUMNS.length - 1}
                            onClick={() =>
                              void updateDeliverable(item.id, {
                                status: DELIVERABLE_COLUMNS[columnIndex + 1].id,
                              })
                            }
                          >
                            <ChevronIcon className="h-3.5 w-3.5" />
                          </IconButton>
                          <span className="flex-1" />
                          <IconButton
                            label="Edit"
                            onClick={() =>
                              setDraft({
                                id: item.id,
                                title: item.title,
                                body: item.body,
                                departmentId: item.departmentId,
                                status: item.status,
                              })
                            }
                          >
                            <EditIcon className="h-3.5 w-3.5" />
                          </IconButton>
                          <IconButton
                            label="Delete"
                            onClick={() => void deleteDeliverable(item.id)}
                          >
                            <TrashIcon className="h-3.5 w-3.5" />
                          </IconButton>
                        </div>
                      </article>
                    );
                  })}
                </section>
              );
            })}
          </div>
        )}
        </div>
      </div>

      <Dialog
        open={Boolean(draft)}
        title={draft?.id ? "Edit deliverable" : "New deliverable"}
        onClose={() => setDraft(null)}
        footer={
          <>
            <Button variant="text" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button onClick={save}>Save</Button>
          </>
        }
      >
        {draft ? (
          <div className="space-y-4">
            <Field label="Title">
              <TextInput
                value={draft.title}
                autoFocus
                placeholder="Q3 launch campaign brief"
                onChange={(event) =>
                  setDraft({ ...draft, title: event.target.value })
                }
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Department">
                <Select
                  value={draft.departmentId}
                  onChange={(event) =>
                    setDraft({ ...draft, departmentId: event.target.value })
                  }
                >
                  {allDepartments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Status">
                <Select
                  value={draft.status}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      status: event.target.value as DeliverableStatus,
                    })
                  }
                >
                  {DELIVERABLE_COLUMNS.map((column) => (
                    <option key={column.id} value={column.id}>
                      {column.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Content" hint="Markdown is rendered when you open it.">
              <TextArea
                rows={12}
                value={draft.body}
                placeholder="Paste or write the deliverable here…"
                onChange={(event) => setDraft({ ...draft, body: event.target.value })}
              />
            </Field>
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={Boolean(reading)}
        title={reading?.title ?? ""}
        onClose={() => setReading(null)}
        width="max-w-3xl"
        footer={
          reading?.sourceConversationId ? (
            <Link
              href={conversationHref(reading.departmentId, reading.sourceConversationId)}
              className="md-label text-primary underline"
            >
              Open the conversation this came from
            </Link>
          ) : null
        }
      >
        {reading ? <Markdown>{reading.body}</Markdown> : null}
      </Dialog>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="md-state md-target grid h-8 w-8 place-items-center rounded-lg text-on-variant disabled:pointer-events-none disabled:opacity-[0.38]"
    >
      {children}
    </button>
  );
}
