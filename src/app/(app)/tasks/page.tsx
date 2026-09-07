"use client";

import { PageHeader } from "@/components/PageHeader";
import { SchedulesTab } from "@/components/SchedulesTab";
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
  ScheduleIcon,
  Select,
  TextArea,
  TextInput,
  TrashIcon,
  cx,
} from "@/components/ui";
import { createRipple } from "@/components/ui/ripple";
import { formatExactTime } from "@/lib/routes";
import { COMPANY_ID, departmentAccent, projectAccent, PROJECT_ACCENTS} from "@/lib/seed";
import { useStore } from "@/lib/store";
import { TASK_STATUSES, type Task, type TaskStatus } from "@/lib/types";

const COLUMN_LABEL: Record<TaskStatus, string> = {
  todo: "To do",
  doing: "Ongoing",
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
  /** One of PROJECT_ACCENTS, or empty for the ordinary card. */
  accent: string;
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

/**
 * A name out of an email address, for a line that says who is on something.
 *
 * The whole address is too long for a card and says nothing the first part does
 * not. Dots and underscores become spaces so "jane.doe" reads as a name.
 */
function shortName(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local.replace(/[._-]+/g, " ").trim() || email;
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
    taskComments,
    commentOnTask,
    deleteTaskComment,
    accountEmail,
    can,
  } = useStore();

  /*
   * The schedules tab only appears for somebody allowed to open it. The area
   * still exists with no screen at the end of it for exactly this reason: an
   * administrator who denied briefings should not find them on Tasks instead.
   */
  const canSchedules = can("briefings");

  const [filter, setFilter] = useState<string>("all");
  const [tab, setTab] = useState<"tasks" | "schedules">("tasks");
  /*
   * Reported up from the tab itself rather than fetched twice. The schedules
   * tab already reads them to draw its own list, and asking a second time on
   * every visit to Tasks would double the cost of a screen most people open
   * for the board.
   */
  const [unreadBriefings, setUnreadBriefings] = useState(0);
  /** The task being read, which is not the same as the one being edited. */
  const [reading, setReading] = useState<Task | null>(null);
  const [comment, setComment] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  /*
   * The task being removed, held whole rather than by id.
   *
   * The dialog names it, and reading it back out of the list would leave the
   * title blank for the length of the closing animation once the row is gone.
   */
  const [removing, setRemoving] = useState<Task | null>(null);
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
      accent: "",
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
      accent: task.accent ?? "",
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
      accent: draft.accent,
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
        title={tab === "tasks" ? "Tasks" : "Schedules"}
        /* Nothing rather than a space. The blank held the line so the header
           did not change height when the counts arrived, which cost nothing
           while the title was above it. With the title gone on a phone it was
           the only thing in the header, so an empty band sat under the top bar
           with a lone button in the corner. */
        description={
          tab === "tasks" && ready && open > 0
            ? `${open} open${overdue ? `, ${overdue} overdue` : ""}`
            : undefined
        }
        actions={
          /* A plus on a phone. The page is called Tasks and the button is the
             only one on it, so the word was answering a question nobody could
             have. Same shape as the one on Meetings. */
          tab === "tasks" ? (
            <Button
              icon={<PlusIcon className="h-4 w-4" />}
              aria-label="New task"
              className="px-2 medium:px-3"
              onClick={() => openNew()}
            >
              <span className="hidden medium:inline">New task</span>
            </Button>
          ) : undefined
        }
      />

      {/*
        * Two tabs rather than two screens.
        *
        * Both answer the same question, what is owed and when, and the only
        * difference is whether it comes round again. Briefings was its own
        * entry in the navigation directly under Tasks, which read as two
        * places to look for the same thing.
        */}
      {canSchedules ? (
        <div className="flex flex-none items-center gap-2 border-b border-outline-variant px-4 py-3 sm:px-6">
          {(["tasks", "schedules"] as const).map((key) => (
            <Chip key={key} selected={tab === key} onClick={() => setTab(key)}>
              <span className="flex items-center gap-1.5">
                {key === "tasks" ? (
                  <CheckIcon className="h-4 w-4" />
                ) : (
                  <ScheduleIcon className="h-4 w-4" />
                )}
                {key === "tasks" ? "Tasks" : "Schedules"}
                {key === "schedules" && unreadBriefings > 0 ? (
                  <span className="md-label-sm rounded-full bg-primary px-1.5 text-on-primary">
                    {unreadBriefings}
                  </span>
                ) : null}
              </span>
            </Chip>
          ))}
        </div>
      ) : null}

      {tab === "schedules" ? (
        <SchedulesTab onUnread={setUnreadBriefings} />
      ) : (
            <div className="min-h-0 flex-1 overflow-y-auto page-x py-5">
        {/*
          * Three kinds of filter, told apart by colour rather than by reading.
          *
          * Everything, a department and a project were the same grey pill in
          * one long row, so the only way to know what you were filtering by was
          * to recognise the word. Each department already has an accent and so
          * does each project, and both are used elsewhere, so the row now says
          * which kind of thing each pill is before you read it.
          */}
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
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="h-2 w-2 flex-none rounded-full"
                  style={{ background: departmentAccent(department.id).dot }}
                />
                {department.personaName || department.name}
              </span>
            </Chip>
          ))}
          {projects.map((project) => (
            <Chip
              key={project.id}
              selected={filter === `proj:${project.id}`}
              onClick={() => setFilter(`proj:${project.id}`)}
            >
              <span className="flex items-center gap-1.5">
                {/* A square for a project, a circle for a head. Colour alone
                    would not survive being colour blind, and the shape does. */}
                <span
                  aria-hidden
                  className="h-2 w-2 flex-none rounded-[2px]"
                  style={{ background: projectAccent(project.accent).dot }}
                />
                {project.name}
              </span>
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
                      className="md-state md-target grid h-7 w-7 place-items-center rounded-full text-on-variant"
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
                      const project = task.projectId
                        ? projects.find((row) => row.id === task.projectId)
                        : undefined;
                      const comments = taskComments.filter((c) => c.taskId === task.id).length;
                      const tint = task.accent ? projectAccent(task.accent).soft : undefined;
                      const due = task.dueAt ? dueLabel(task.dueAt, now) : null;
                      return (
                        <li key={task.id}>
                          <div
                            draggable
                            onDragStart={() => setDragging(task.id)}
                            onDragEnd={() => setDragging(null)}
                            style={tint ? { background: tint } : undefined}
                            className={cx(
                              "rounded-xl border border-outline-variant p-3",
                              // The tint is a style, so the class is only the
                              // fallback for a card with no colour set.
                              tint ? "" : "bg-container",
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
                                // The box stays 16px; the button around it is a
                                // real target on a touch screen. The border and
                                // fill moved inward so growing the target does
                                // not grow the tick.
                                className="md-target -m-2 grid flex-none place-items-center p-2"
                              >
                                <span
                                  className={cx(
                                    "grid h-4 w-4 place-items-center rounded border transition-colors",
                                    task.status === "done"
                                      ? "border-primary bg-primary text-on-primary"
                                      : "border-outline",
                                  )}
                                >
                                  {task.status === "done" ? (
                                    <CheckIcon className="h-3 w-3" />
                                  ) : null}
                                </span>
                              </button>
                              <button
                                // Opens it to read, not to edit. Editing is a
                                // button inside that view: the common reason to
                                // click a card is to look at it properly, and
                                // landing in a form makes that the rare case.
                                onClick={() => setReading(task)}
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
                                  /* md-body-sm, not md-label-sm: the small
                                     label class uppercases, which is right for
                                     "3D AGO" and wrong for a sentence somebody
                                     typed. Two lines of their own note came
                                     back shouted, with the word shapes that
                                     make prose quick to read flattened out. */
                                  <span className="md-body-sm mt-1 block line-clamp-2 text-on-variant/75">
                                    {task.notes}
                                  </span>
                                ) : null}
                              </button>
                              <button
                                onClick={() => setRemoving(task)}
                                aria-label={`Delete the task ${task.title}`}
                                className="md-state md-target grid h-7 w-7 flex-none place-items-center rounded-full text-on-variant/70"
                              >
                                <TrashIcon className="h-3.5 w-3.5" />
                              </button>
                            </div>

                            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 pl-6">
                              {/*
                                * Where this task lives, which the board could
                                * not say. On Everything every card looked the
                                * same, so a task you wanted to get back to gave
                                * you no way to find it again. The head was
                                * already here; the project was not.
                                */}
                              {department ? (
                                <span className="md-label-sm flex items-center gap-1.5 text-on-variant/75">
                                  <DepartmentAvatar department={department} size={16} />
                                  {department.personaName || department.name}
                                </span>
                              ) : (
                                <span className="md-label-sm text-on-variant/60">Unassigned</span>
                              )}
                              {project ? (
                                <span className="md-label-sm flex items-center gap-1.5 text-on-variant/75">
                                  <span
                                    aria-hidden
                                    className="h-2 w-2 flex-none rounded-[2px]"
                                    style={{ background: projectAccent(project.accent).dot }}
                                  />
                                  {project.name}
                                </span>
                              ) : null}
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
                              {comments > 0 ? (
                                <span className="md-label-sm text-on-variant/60">
                                  {comments} {comments === 1 ? "comment" : "comments"}
                                </span>
                              ) : null}
                              {/* Who picked it up, so two people do not both
                                  start the same job. */}
                              {task.assignedTo ? (
                                <span className="md-label-sm ml-auto truncate text-primary">
                                  {shortName(task.assignedTo)}
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
      )}

      {/*
        * Reading a task, which is what clicking one now does.
        *
        * It used to open the edit form, so the ordinary act of looking at
        * something properly put you in a set of inputs. Most of the time
        * somebody clicks a card to read the note, see who is on it and catch up
        * on what has been said, and only sometimes to change it, so editing is
        * a button in here rather than the thing that happens first.
        */}
      <Dialog
        open={Boolean(reading)}
        title={reading?.title ?? ""}
        onClose={() => {
          setReading(null);
          setComment("");
        }}
        footer={
          reading ? (
            <>
              <Button
                variant="text"
                onClick={() => {
                  setReading(null);
                  setComment("");
                }}
              >
                Close
              </Button>
              <Button
                onClick={() => {
                  const task = reading;
                  setReading(null);
                  setComment("");
                  openExisting(task);
                }}
              >
                Edit
              </Button>
            </>
          ) : undefined
        }
      >
        {reading ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Chip
                selected
                onClick={() =>
                  void updateTask(reading.id, {
                    status: reading.status === "done" ? "todo" : "done",
                  })
                }
              >
                {COLUMN_LABEL[reading.status]}
              </Chip>
              {(() => {
                const department = departmentOf(reading.departmentId);
                return department ? (
                  <span className="md-label-sm flex items-center gap-1.5 text-on-variant">
                    <DepartmentAvatar department={department} size={18} />
                    {department.personaName || department.name}
                  </span>
                ) : null;
              })()}
              {reading.projectId
                ? (() => {
                    const project = projects.find((row) => row.id === reading.projectId);
                    return project ? (
                      <span className="md-label-sm flex items-center gap-1.5 text-on-variant">
                        <span
                          aria-hidden
                          className="h-2 w-2 rounded-[2px]"
                          style={{ background: projectAccent(project.accent).dot }}
                        />
                        {project.name}
                      </span>
                    ) : null;
                  })()
                : null}
            </div>

            {reading.notes ? (
              <p className="md-body whitespace-pre-wrap text-on-surface">{reading.notes}</p>
            ) : (
              <p className="md-body text-on-variant">No notes.</p>
            )}

            <dl className="flex flex-col gap-1.5">
              {reading.createdBy ? (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="md-label-sm text-on-variant">Added by</dt>
                  <dd className="md-body-sm">{shortName(reading.createdBy)}</dd>
                </div>
              ) : null}
              <div className="flex items-baseline justify-between gap-3">
                <dt className="md-label-sm text-on-variant">Working on it</dt>
                <dd className="md-body-sm flex items-center gap-2">
                  {reading.assignedTo ? shortName(reading.assignedTo) : "Nobody yet"}
                  {/*
                    * Claiming, which is the whole point of the line. A board
                    * that says which department a job belongs to still lets two
                    * people start it at once, because nothing on it says who
                    * already has.
                    */}
                  <Button
                    size="sm"
                    variant="text"
                    onClick={() =>
                      void updateTask(reading.id, {
                        assignedTo:
                          reading.assignedTo === accountEmail ? undefined : (accountEmail ?? undefined),
                      })
                    }
                  >
                    {reading.assignedTo === accountEmail ? "Hand it back" : "I am on it"}
                  </Button>
                </dd>
              </div>
              {reading.dueAt ? (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="md-label-sm text-on-variant">Due</dt>
                  <dd className="md-body-sm">{formatExactTime(reading.dueAt)}</dd>
                </div>
              ) : null}
            </dl>

            <div>
              <h3 className="md-label mb-2 text-on-variant">Comments</h3>
              <ul className="mb-3 flex flex-col gap-2">
                {taskComments
                  .filter((row) => row.taskId === reading.id)
                  .map((row) => (
                    <li key={row.id} className="rounded-xl bg-high px-3 py-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="md-label-sm truncate text-on-variant">
                          {shortName(row.authorEmail)}
                        </span>
                        <span className="md-label-sm flex-none text-on-variant/60">
                          {formatExactTime(row.createdAt)}
                        </span>
                      </div>
                      <p className="md-body-sm mt-0.5 whitespace-pre-wrap">{row.body}</p>
                      {row.authorEmail === accountEmail ? (
                        <button
                          type="button"
                          onClick={() => void deleteTaskComment(row.id)}
                          className="md-label-sm mt-1 text-on-variant/70 underline"
                        >
                          Delete
                        </button>
                      ) : null}
                    </li>
                  ))}
              </ul>

              <div className="flex items-end gap-2">
                <TextArea
                  value={comment}
                  rows={2}
                  placeholder="Add a comment"
                  className="flex-1"
                  onChange={(event) => setComment(event.target.value)}
                />
                <Button
                  disabled={!comment.trim()}
                  onClick={async () => {
                    await commentOnTask(reading.id, comment);
                    setComment("");
                  }}
                >
                  Post
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </Dialog>

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
            <Field label="Colour">
              {/*
                * The same six the projects use, so a board does not gain a
                * second palette nobody can match to anything. None is the
                * default and stays the ordinary card, because a board where
                * every card is coloured tells you nothing.
                */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  aria-label="No colour"
                  aria-pressed={!draft.accent}
                  onClick={() => setDraft({ ...draft, accent: "" })}
                  className={cx(
                    "md-state h-7 w-7 rounded-full border-2 bg-container",
                    draft.accent ? "border-outline-variant" : "border-primary",
                  )}
                />
                {PROJECT_ACCENTS.map((accent) => (
                  <button
                    key={accent.key}
                    type="button"
                    aria-label={accent.label}
                    aria-pressed={draft.accent === accent.key}
                    onClick={() => setDraft({ ...draft, accent: accent.key })}
                    style={{ background: accent.dot }}
                    className={cx(
                      "md-state h-7 w-7 rounded-full border-2",
                      draft.accent === accent.key ? "border-primary" : "border-transparent",
                    )}
                  />
                ))}
              </div>
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

      {/*
        Deleting a task used to happen on the first click, with no undo. Every
        other delete in the panel asks first, and a task is the one people click
        past fastest, on the smallest control in the row.
      */}
      <Dialog
        open={Boolean(removing)}
        title="Delete this task?"
        onClose={() => setRemoving(null)}
        width="max-w-md"
        footer={
          <>
            <Button variant="text" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                const task = removing;
                setRemoving(null);
                if (task) await deleteTask(task.id);
              }}
            >
              Delete task
            </Button>
          </>
        }
      >
        <p className="md-body text-on-variant">
          <strong>{removing?.title}</strong> is removed for everybody, and this cannot be
          undone.
        </p>
      </Dialog>
    </div>
  );
}
