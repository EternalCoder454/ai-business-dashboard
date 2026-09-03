"use client";

import { CalendarCard } from "./CalendarCard";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import {
  CheckIcon,
  ChevronIcon,
  DocIcon,
  FolderIcon,
  SparkIcon,
  UsersIcon,
  cx,
} from "./ui";
import { createRipple } from "./ui/ripple";
import { figureSeries } from "@/lib/memory";
import { hasProfileContent } from "@/lib/prompts";
import { conversationHref, formatRelativeTime } from "@/lib/routes";
import { useStore } from "@/lib/store";

/**
 * The landing page.
 *
 * This replaced an org chart, which drew the reporting structure of a company
 * with two people in it. Nobody needs a diagram to remember that. What is
 * actually worth seeing on opening the app is what the numbers are doing, what
 * is unfinished, and what to pick back up, so that is what this shows.
 *
 * Laid out as a grid rather than a column. A single column on a wide screen is
 * a short line of text next to a lot of nothing, and a scroll to reach what
 * would have fitted.
 */
export function Dashboard() {
  const {
    ready,
    departments,
    allDepartments,
    conversations,
    deliverables,
    allHandsRuns,
    projects,
    memory,
    tasks,
    skills,
    profile,
    settings,
  } = useStore();

  const nameOf = (id: string) =>
    allDepartments.find((d) => d.id === id)?.personaName ??
    allDepartments.find((d) => d.id === id)?.name ??
    "Unassigned";

  /**
   * The headline numbers, taken from the record rather than from counting rows
   * in this app. How many conversations you have had is a fact about the tool;
   * wishlists and revenue are facts about the business.
   */
  const figures = useMemo(() => {
    const series = figureSeries(memory.filter((entry) => !entry.archived));
    return [...series]
      .map(([label, readings]) => ({
        label,
        latest: readings[0],
        previous: readings[1],
      }))
      .slice(0, 4);
  }, [memory]);

  const decisions = useMemo(
    () =>
      memory
        .filter((entry) => entry.kind === "decision" && !entry.archived)
        .sort((a, b) => b.occurredAt - a.occurredAt)
        .slice(0, 4),
    [memory],
  );

  // Read once when the page mounts rather than on every render, which is not a
  // pure thing to do and makes the render output depend on the clock. A tab
  // left open past midnight shows yesterday's reckoning until it is reloaded,
  // which is the right trade for a dashboard.
  const [now] = useState(() => Date.now());

  const openTasks = tasks.filter((task) => task.status !== "done");

  /*
   * Open tasks split by when they are due, because "five open" is a fact you
   * can do nothing with and "two overdue" is something you do today.
   *
   * Rolling windows rather than calendar weeks: on a Friday, "due this week"
   * meaning the next twenty four hours is right and useless.
   *
   * No date is its own column rather than folded into later, since a task
   * nobody dated is the one that quietly never gets done.
   */
  const due = useMemo(() => {
    const day = 86_400_000;
    const midnight = new Date(now).setHours(0, 0, 0, 0);
    const counts = { overdue: 0, week: 0, next: 0, later: 0, undated: 0 };
    for (const task of openTasks) {
      if (task.dueAt === undefined) counts.undated += 1;
      else if (task.dueAt < midnight) counts.overdue += 1;
      else if (task.dueAt < midnight + 7 * day) counts.week += 1;
      else if (task.dueAt < midnight + 14 * day) counts.next += 1;
      else counts.later += 1;
    }
    return counts;
  }, [openTasks, now]);

  const activeProjects = projects.filter((p) => p.status === "active").length;
  const threads = conversations.filter((c) => c.messageCount > 0).length;

  return (
    <div className="page-x space-y-5 py-5">

      {/* The business's own numbers lead, because they are the only thing here
          this app did not make up about itself. */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="md-label-sm text-on-variant">Key figures</h2>
          <Link href="/library/memory" className="md-label-sm text-primary">
            {figures.length ? "Add reading" : "Add figure"}
          </Link>
        </div>
        {figures.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 medium:grid-cols-2 expanded:grid-cols-4">
            {figures.map(({ label, latest, previous }) => (
              <div key={label} className="rounded-2xl bg-container p-4 shadow-e1">
                <p className="md-label-sm truncate text-on-variant">{label}</p>
                <p className="mt-1 text-2xl font-medium leading-tight tabular-nums">
                  {latest?.value}
                </p>
                <p className="md-label-sm mt-1 text-on-variant/75">
                  {previous
                    ? `was ${previous.value} on ${new Date(previous.occurredAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`
                    : formatRelativeTime(latest?.occurredAt ?? 0)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-outline-variant p-5">
            <p className="md-body text-on-variant">No figures recorded.</p>
          </div>
        )}
      </section>

      {/* What is owed, and when. The heads used to sit here as a grid of cards,
          which was the sidebar again in a second typeface. */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="md-label-sm text-on-variant">Tasks</h2>
          <Link href="/tasks" className="md-label-sm text-primary">
            View all tasks
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 medium:grid-cols-4">
          <Count label="Overdue" value={due.overdue} tone={due.overdue > 0 ? "bad" : undefined} />
          <Count label="Due this week" value={due.week} />
          <Count label="Due next week" value={due.next} />
          <Count
            label="No date"
            value={due.undated}
            hint={due.later > 0 ? `${due.later} further out` : undefined}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="md-label-sm text-on-variant/75">
            {threads} thread{threads === 1 ? "" : "s"}
          </span>
          <span className="md-label-sm text-on-variant/75">
            {activeProjects} active project{activeProjects === 1 ? "" : "s"}
          </span>
          <span className="md-label-sm text-on-variant/75">
            {deliverables.length} saved
          </span>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 medium:grid-cols-2 large:grid-cols-3">
        {/* First, and only when there is one. "What should I focus on" is
            usually answered by "you have four hours of meetings". */}
        <CalendarCard />
        <PaneList
          title="Open tasks"
          icon={<CheckIcon className="h-3.5 w-3.5" />}
          href="/tasks"
          empty="No open tasks."
          items={openTasks.slice(0, 5).map((task) => ({
            key: task.id,
            href: "/tasks",
            primary: task.title,
            secondary: `${nameOf(task.departmentId)}${
              task.dueAt
                ? ` · due ${new Date(task.dueAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`
                : ""
            }`,
          }))}
        />

        <PaneList
          title="Decisions"
          icon={<SparkIcon className="h-3.5 w-3.5" />}
          href="/library/memory"
          empty="No decisions recorded."
          items={decisions.map((entry) => ({
            key: entry.id,
            href: "/library/memory",
            primary: entry.label,
            secondary: `${nameOf(entry.departmentId)} · ${formatRelativeTime(entry.occurredAt)}`,
          }))}
        />

        <PaneList
          title="Deliverables"
          icon={<DocIcon className="h-3.5 w-3.5" />}
          href="/library/deliverables"
          empty="No deliverables saved."
          items={deliverables.slice(0, 4).map((item) => ({
            key: item.id,
            href: "/library/deliverables",
            primary: item.title,
            secondary: `${nameOf(item.departmentId)} · ${formatRelativeTime(item.updatedAt)}`,
          }))}
        />

        <PaneList
          title="Recent conversations"
          icon={<ChevronIcon className="h-3.5 w-3.5" />}
          href="/ceo"
          empty="No conversations."
          items={conversations
            .filter((c) => c.messageCount > 0)
            .slice(0, 4)
            .map((conversation) => ({
              key: conversation.id,
              href: conversationHref(conversation.departmentId, conversation.id),
              primary: conversation.title,
              secondary: `${nameOf(conversation.departmentId)} · ${formatRelativeTime(
                conversation.updatedAt,
              )}`,
            }))}
        />

        <PaneList
          title="Meetings"
          icon={<UsersIcon className="h-3.5 w-3.5" />}
          href="/all-hands"
          empty="No threads."
          items={allHandsRuns.slice(0, 3).map((run) => ({
            key: run.id,
            href: "/all-hands",
            primary: run.title,
            secondary: `${run.rounds.length} ${
              run.rounds.length === 1 ? "question" : "questions"
            } · ${formatRelativeTime(run.updatedAt)}`,
          }))}
        />

        <PaneList
          title="Projects"
          icon={<FolderIcon className="h-3.5 w-3.5" />}
          href="/projects"
          empty="No projects."
          items={projects.slice(0, 3).map((project) => ({
            key: project.id,
            href: `/projects/${project.id}`,
            primary: project.name,
            secondary: `${project.status} · ${formatRelativeTime(project.updatedAt)}`,
          }))}
        />
      </div>
    </div>
  );
}

/** One number, big enough to read from the doorway. */
function Count({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: "bad";
}) {
  return (
    <div className="rounded-2xl bg-container p-4 shadow-e1">
      <p className="md-label-sm truncate text-on-variant">{label}</p>
      <p
        className={cx(
          "mt-1 text-2xl font-medium leading-tight tabular-nums",
          tone === "bad" && "text-error",
        )}
      >
        {value}
      </p>
      {hint ? <p className="md-label-sm mt-1 text-on-variant/75">{hint}</p> : null}
    </div>
  );
}

function PaneList({
  title,
  icon,
  href,
  empty,
  items,
}: {
  title: string;
  icon: ReactNode;
  href: string;
  empty: string;
  items: { key: string; href: string; primary: string; secondary: string }[];
}) {
  return (
    <section className="rounded-2xl bg-container p-4 shadow-e1">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="md-label-sm flex items-center gap-1.5 text-on-variant">
          {icon}
          {title}
        </h2>
        {items.length > 0 ? (
          <Link href={href} className="md-label-sm text-primary">
            All
          </Link>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="md-label text-on-variant/75">{empty}</p>
      ) : (
        <ul className="-mx-2 space-y-0.5">
          {items.map((item) => (
            <li key={item.key}>
              <Link
                href={item.href}
                onClick={createRipple}
                className="md-state block rounded-lg px-2 py-1.5"
              >
                <span className="md-body block truncate">{item.primary}</span>
                <span className="md-label-sm block truncate text-on-variant/75">
                  {item.secondary}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
