"use client";

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
    serverKey,
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

  const openTasks = tasks.filter((task) => task.status !== "done");
  // Read once when the page mounts rather than on every render, which is not a
  // pure thing to do and makes the render output depend on the clock. A tab
  // left open past midnight shows yesterday's reckoning until it is reloaded,
  // which is the right trade for a dashboard.
  const [now] = useState(() => Date.now());

  const gaps = useMemo(() => {
    const items: { label: string; href: string }[] = [];
    // Before the workspace has loaded every one of these reads as missing, so
    // announcing them then means claiming they are empty on every refresh.
    if (!ready) return items;
    if (!serverKey && !settings.apiKey) {
      items.push({ label: "No API key yet, nothing can reply", href: "/settings" });
    }
    if (!hasProfileContent(profile)) {
      items.push({ label: "Company Profile is empty", href: "/profile" });
    }
    if (memory.filter((entry) => !entry.archived).length === 0) {
      items.push({
        label: "Nothing in Memory, so every head is working from generic advice",
        href: "/library/memory",
      });
    }
    // Counted here rather than outside, so the memo's inputs are values it can
    // actually track. A dependency on something derived above it is a
    // memoization the compiler has to throw away.
    const overdue = tasks.filter(
      (task) => task.status !== "done" && task.dueAt && task.dueAt < now,
    ).length;
    if (overdue > 0) {
      items.push({
        label: `${overdue} task${overdue === 1 ? "" : "s"} past ${overdue === 1 ? "its" : "their"} date`,
        href: "/tasks",
      });
    }
    const bare = departments.filter((d) => !skills.some((s) => s.departmentId === d.id));
    if (bare.length > 0) {
      items.push({
        label: `${bare.length} ${bare.length === 1 ? "department has" : "departments have"} no skills`,
        href: "/library/skills",
      });
    }
    return items;
  }, [ready, serverKey, settings.apiKey, profile, memory, tasks, now, departments, skills]);

  const activeProjects = projects.filter((p) => p.status === "active").length;
  const threads = conversations.filter((c) => c.messages.length > 0).length;

  return (
    <div className="page-x space-y-5 py-5">
      {gaps.length > 0 ? (
        <section className="rounded-2xl border border-warning/25 bg-warning/10 p-4">
          <h2 className="md-label-sm mb-2 text-warning">Needs attention</h2>
          <ul className="grid gap-1.5 medium:grid-cols-2">
            {gaps.map((gap) => (
              <li key={gap.href}>
                <Link
                  href={gap.href}
                  className="md-label flex items-center gap-1.5 text-warning underline decoration-warning/40 underline-offset-2"
                >
                  {gap.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* The business's own numbers lead, because they are the only thing here
          this app did not make up about itself. */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="md-label-sm text-on-variant">The numbers</h2>
          <Link href="/library/memory" className="md-label-sm text-primary">
            {figures.length ? "Record a reading" : "Record the first one"}
          </Link>
        </div>
        {figures.length > 0 ? (
          <div className="grid gap-3 medium:grid-cols-2 expanded:grid-cols-4">
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
            <p className="md-body text-on-variant">
              No figures recorded. Wishlists, downloads, invoices, hours: whatever you would
              otherwise retype into a conversation. Every head reads them, so Desmond stops
              asking you for the same numbers every time.
            </p>
          </div>
        )}
      </section>

      {/* One line of counts, then the panels. The heads used to sit here as a
          grid of cards, which was the sidebar again in a second typeface. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="md-label-sm text-on-variant/75">
          {threads} thread{threads === 1 ? "" : "s"}
        </span>
        <span className="md-label-sm text-on-variant/75">
          {openTasks.length} task{openTasks.length === 1 ? "" : "s"} open
        </span>
        <span className="md-label-sm text-on-variant/75">
          {activeProjects} active project{activeProjects === 1 ? "" : "s"}
        </span>
        <span className="md-label-sm text-on-variant/75">
          {deliverables.length} saved
        </span>
      </div>

      <div className="grid gap-4 medium:grid-cols-2 large:grid-cols-3">
        <PaneList
          title="Open tasks"
          icon={<CheckIcon className="h-3.5 w-3.5" />}
          href="/tasks"
          empty="Nothing outstanding."
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
          title="Standing decisions"
          icon={<SparkIcon className="h-3.5 w-3.5" />}
          href="/library/memory"
          empty="Nothing settled yet. Record one so it stops being reopened."
          items={decisions.map((entry) => ({
            key: entry.id,
            href: "/library/memory",
            primary: entry.label,
            secondary: `${nameOf(entry.departmentId)} · ${formatRelativeTime(entry.occurredAt)}`,
          }))}
        />

        <PaneList
          title="Recent output"
          icon={<DocIcon className="h-3.5 w-3.5" />}
          href="/library/deliverables"
          empty="Nothing saved yet. Hit Save on any reply."
          items={deliverables.slice(0, 4).map((item) => ({
            key: item.id,
            href: "/library/deliverables",
            primary: item.title,
            secondary: `${nameOf(item.departmentId)} · ${formatRelativeTime(item.updatedAt)}`,
          }))}
        />

        <PaneList
          title="Pick up where you left off"
          icon={<ChevronIcon className="h-3.5 w-3.5" />}
          href="/ceo"
          empty="No conversations yet."
          items={conversations
            .filter((c) => c.messages.length > 0)
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
          title="Recent rooms"
          icon={<UsersIcon className="h-3.5 w-3.5" />}
          href="/all-hands"
          empty="You have not put anything to everyone yet."
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
          empty="No projects yet."
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
