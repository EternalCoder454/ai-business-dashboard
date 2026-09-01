"use client";

import { PageHeader } from "@/components/PageHeader";
import { DepartmentAvatar } from "@/components/DepartmentAvatar";
import { useMemo, useState } from "react";
import {
  Button,
  CheckIcon,
  Chip,
  Dialog,
  EmptyState,
  Field,
  FolderIcon,
  PlusIcon,
  Select,
  TextArea,
  TextInput,
  TrashIcon,
  cx,
} from "@/components/ui";
import { createRipple } from "@/components/ui/ripple";
import { COMPANY_ID } from "@/lib/seed";
import { useStore } from "@/lib/store";
import { TASK_STATUSES, type Task, type TaskStatus } from "@/lib/types";

const COLUMN_LABEL: Record<TaskStatus, string> = {
  todo: "To do",
  doing: "Doing",
  done: "Done",
};

interface Draft {
  id?: string;
  title: string;
  notes: string;
  status: TaskStatus;
  departmentId: string;
  projectId: string;
  /** yyyy-mm-dd, which is what a date input speaks. Empty means no date. */
  dueOn: string;
}

function toInputDate(ms: number | undefined): string {
  if (!ms) return "";
  const date = new Date(ms);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

/** Midday local, so a zone shift either way never moves a due date a day. */
function fromInputDate(value: string): number | undefined {
  if (!value) return undefined;
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.getTime();
}

function dueLabel(
  dueAt: number,
  now: number,
): { text: string; tone: "overdue" | "soon" | "later" } {
  const days = Math.round((dueAt - now) / 86_400_000);
  if (days < 0) return { text: days === -1 ? "Yesterday" : `${-days} days ago`, tone: "overdue" };
  if (days === 0) return { text: "Today", tone: "soon" };
  if (days === 1) return { text: "Tomorrow", tone: "soon" };
  if (days <= 7) return { text: `In ${days} days`, tone: "soon" };
  return {
    text: new Date(dueAt).toLocaleDateString(undefined, { day: "numeric", month: "short" }),
    tone: "later",
  };
}

export default function TasksPage() {
  const {
    ready,
    tasks,
    allDepartments,
    projects,
    createTask,
    updateTask,
    deleteTask,
  } = useStore();

  const [filter, setFilter] = useState<string>("all");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  // Taken once on mount. Reading the clock during render makes the output
  // depend on when React happened to run, which is not a pure render.
  const [now] = useState(() => Date.now());

  const departmentOf = (id: string) => allDepartments.find((d) => d.id === id);

  const visible = useMemo(
    () =>
      filter === "all"
        ? tasks
        : filter.startsWith("proj:")
          ? tasks.filter((t) => t.projectId === filter.slice(5))
          : tasks.filter((t) => t.departmentId === filter),
    [tasks, filter],
  );

  const columns = TASK_STATUSES.map((status) => ({
    status,
    items: visible
      .filter((task) => task.status === status)
      .sort((a, b) =>
        status === "done"
          ? (b.completedAt ?? b.updatedAt) - (a.completedAt ?? a.updatedAt)
          : a.order - b.order,
      ),
  }));

  const openNew = (status: TaskStatus = "todo") =>
    setDraft({
      title: "",
      notes: "",
      status,
      departmentId: filter.startsWith("proj:") || filter === "all" ? COMPANY_ID : filter,
      projectId: filter.startsWith("proj:") ? filter.slice(5) : "",
      dueOn: "",
    });

  const openExisting = (task: Task) =>
    setDraft({
      id: task.id,
      title: task.title,
      notes: task.notes,
      status: task.status,
      departmentId: task.departmentId,
      projectId: task.projectId ?? "",
      dueOn: toInputDate(task.dueAt),
    });

  const save = async () => {
    if (!draft?.title.trim()) return;
    const fields = {
      title: draft.title,
      notes: draft.notes,
      status: draft.status,
      departmentId: draft.departmentId,
      projectId: draft.projectId || undefined,
      dueAt: fromInputDate(draft.dueOn),
    };
    if (draft.id) await updateTask(draft.id, fields);
    else await createTask(fields);
    setDraft(null);
  };

  const open = tasks.filter((task) => task.status !== "done").length;
  const overdue = tasks.filter(
    (task) => task.status !== "done" && task.dueAt && task.dueAt < now,
  ).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        eyebrow="Work"
        title="Tasks"
        description={
          ready && open > 0
            ? `${open} open${overdue ? `, ${overdue} overdue` : ""}`
            : " "
        }
        actions={
          <Button icon={<PlusIcon className="h-4 w-4" />} onClick={() => openNew()}>
            New task
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto page-x py-5">
        <div className="filter-row mb-5">
          <Chip selected={filter === "all"} onClick={() => setFilter("all")}>
            Everything
          </Chip>
          {allDepartments.map((department) => (
            <Chip
              key={department.id}
              selected={filter === department.id}
              onClick={() => setFilter(department.id)}
            >
              {department.personaName || department.name}
            </Chip>
          ))}
          {projects.map((project) => (
            <Chip
              key={project.id}
              selected={filter === `proj:${project.id}`}
              onClick={() => setFilter(`proj:${project.id}`)}
            >
              {project.name}
            </Chip>
          ))}
        </div>

        {ready && tasks.length === 0 ? (
          <EmptyState
            icon={<FolderIcon className="h-6 w-6" />}
            title="No tasks"
            description="Open tasks are shared with the department they belong to."
            action={<Button onClick={() => openNew()}>Add the first one</Button>}
          />
        ) : (
          // Three columns from expanded up. A board is the one place a column
          // per state genuinely beats a list, because the shape of the work is
          // the information.
          <div className="grid grid-cols-1 gap-4 expanded:grid-cols-3">
            {columns.map(({ status, items }) => (
              <section
                key={status}
                onDragOver={(event) => {
                  if (dragging) event.preventDefault();
                }}
                onDrop={(event) => {
                  if (!dragging) return;
                  event.preventDefault();
                  void updateTask(dragging, { status });
                  setDragging(null);
                }}
                className="rounded-2xl border border-outline-variant bg-low/60 p-3"
              >
                <div className="mb-3 flex items-center justify-between gap-2 px-1">
                  <h2 className="md-label-sm text-on-variant">
                    {COLUMN_LABEL[status]} · {items.length}
                  </h2>
                  {status !== "done" ? (
                    <button
                      onClick={(event) => {
                        createRipple(event);
                        openNew(status);
                      }}
                      aria-label={`Add a task to ${COLUMN_LABEL[status]}`}
                      className="md-state grid h-7 w-7 place-items-center rounded-full text-on-variant"
                    >
                      <PlusIcon className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>

                {items.length === 0 ? (
                  <p className="md-label-sm px-1 py-3 text-on-variant/60">
                    {status === "done" ? "Nothing finished yet." : "Empty."}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {items.map((task) => {
                      const department = departmentOf(task.departmentId);
                      const due = task.dueAt ? dueLabel(task.dueAt, now) : null;
                      return (
                        <li key={task.id}>
                          <div
                            draggable
                            onDragStart={() => setDragging(task.id)}
                            onDragEnd={() => setDragging(null)}
                            className={cx(
                              "rounded-xl border border-outline-variant bg-container p-3",
                              dragging === task.id && "opacity-40",
                              task.status === "done" && "opacity-70",
                            )}
                          >
                            <div className="flex items-start gap-2">
                              <button
                                onClick={() =>
                                  void updateTask(task.id, {
                                    status: task.status === "done" ? "todo" : "done",
                                  })
                                }
                                aria-label={
                                  task.status === "done" ? "Reopen this task" : "Mark this done"
                                }
                                className={cx(
                                  "mt-0.5 grid h-4 w-4 flex-none place-items-center rounded border transition-colors",
                                  task.status === "done"
                                    ? "border-primary bg-primary text-on-primary"
                                    : "border-outline",
                                )}
                              >
                                {task.status === "done" ? (
                                  <CheckIcon className="h-3 w-3" />
                                ) : null}
                              </button>
                              <button
                                onClick={() => openExisting(task)}
                                className="min-w-0 flex-1 text-left"
                              >
                                <span
                                  className={cx(
                                    "md-body block",
                                    task.status === "done" && "line-through",
                                  )}
                                >
                                  {task.title}
                                </span>
                                {task.notes ? (
                                  <span className="md-label-sm mt-1 block line-clamp-2 text-on-variant/75">
                                    {task.notes}
                                  </span>
                                ) : null}
                              </button>
                              <button
                                onClick={() => void deleteTask(task.id)}
                                aria-label="Delete this task"
                                className="md-state grid h-7 w-7 flex-none place-items-center rounded-full text-on-variant/70"
                              >
                                <TrashIcon className="h-3.5 w-3.5" />
                              </button>
                            </div>

                            <div className="mt-2 flex flex-wrap items-center gap-2 pl-6">
                              {department ? (
                                <span className="md-label-sm flex items-center gap-1.5 text-on-variant/75">
                                  <DepartmentAvatar department={department} size={16} />
                                  {department.personaName || department.name}
                                </span>
                              ) : (
                                <span className="md-label-sm text-on-variant/60">Unassigned</span>
                              )}
                              {due && task.status !== "done" ? (
                                <span
                                  className={cx(
                                    "md-label-sm",
                                    due.tone === "overdue"
                                      ? "text-error"
                                      : due.tone === "soon"
                                        ? "text-warning"
                                        : "text-on-variant/75",
                                  )}
                                >
                                  {due.text}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            ))}
          </div>
        )}
      </div>

      <Dialog
        open={Boolean(draft)}
        title={draft?.id ? "Edit task" : "New task"}
        onClose={() => setDraft(null)}
        footer={
          <>
            <Button variant="text" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={!draft?.title.trim()}>
              Save
            </Button>
          </>
        }
      >
        {draft ? (
          <div className="space-y-4">
            <Field label="Task">
              <TextInput
                autoFocus
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="What needs doing"
              />
            </Field>
            <Field label="Notes">
              <TextArea
                rows={3}
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 medium:grid-cols-2">
              <Field label="Department">
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
              <Field label="Status">
                <Select
                  value={draft.status}
                  onChange={(e) =>
                    setDraft({ ...draft, status: e.target.value as TaskStatus })
                  }
                >
                  {TASK_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {COLUMN_LABEL[status]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Project">
                <Select
                  value={draft.projectId}
                  onChange={(e) => setDraft({ ...draft, projectId: e.target.value })}
                >
                  <option value="">None</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Due date">
                <TextInput
                  type="date"
                  value={draft.dueOn}
                  onChange={(e) => setDraft({ ...draft, dueOn: e.target.value })}
                />
              </Field>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
