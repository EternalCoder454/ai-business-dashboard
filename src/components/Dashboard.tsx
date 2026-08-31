"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { DepartmentAvatar } from "./DepartmentAvatar";
import {
  ChevronIcon,
  DocIcon,
  FolderIcon,
  SparkIcon,
  UsersIcon,
  cx,
} from "./ui";
import { createRipple } from "./ui/ripple";
import { figureSeries } from "@/lib/memory";
import { useDepartmentStatus } from "@/lib/presence";
import { hasProfileContent } from "@/lib/prompts";
import { conversationHref, departmentHref, formatRelativeTime } from "@/lib/routes";
import { CEO_ID } from "@/lib/seed";
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
    ceo,
    allDepartments,
    conversations,
    deliverables,
    allHandsRuns,
    projects,
    memory,
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
    const bare = departments.filter((d) => !skills.some((s) => s.departmentId === d.id));
    if (bare.length > 0) {
      items.push({
        label: `${bare.length} ${bare.length === 1 ? "department has" : "departments have"} no skills`,
        href: "/library/skills",
      });
    }
    return items;
  }, [ready, serverKey, settings.apiKey, profile, memory, departments, skills]);

  const openWork = deliverables.filter((item) => item.status !== "done").length;
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

      <div className="grid gap-5 expanded:grid-cols-3">
        <section className="expanded:col-span-2">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="md-label-sm text-on-variant">Who you can ask</h2>
            <span className="md-label-sm text-on-variant/75">
              {threads} thread{threads === 1 ? "" : "s"} · {openWork} open · {activeProjects} project
              {activeProjects === 1 ? "" : "s"}
            </span>
          </div>
          <div className="grid gap-2 medium:grid-cols-2 large:grid-cols-3">
            {ceo ? <HeadCard department={ceo} href="/ceo" lead /> : null}
            {departments
              .filter((d) => d.id !== CEO_ID)
              .map((department) => (
                <HeadCard
                  key={department.id}
                  department={department}
                  href={departmentHref(department)}
                />
              ))}
          </div>
        </section>

        <div className="space-y-4">
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
    </div>
  );
}

function HeadCard({
  department,
  href,
  lead,
}: {
  department: { id: string; name: string; personaName: string; roleTitle: string };
  href: string;
  lead?: boolean;
}) {
  const { settings, serverKey, ownSkillsFor } = useStore();
  const status = useDepartmentStatus(Boolean(serverKey || settings.apiKey))(department.id);
  const count = ownSkillsFor(department.id).length;

  return (
    <Link
      href={href}
      onClick={createRipple}
      className={cx(
        "md-state flex items-center gap-3 rounded-2xl border p-3 transition-shadow hover:shadow-e2",
        lead
          ? "border-primary/40 bg-primary-container/25 medium:col-span-2 large:col-span-3"
          : "border-outline-variant bg-container",
      )}
    >
      <DepartmentAvatar
        department={department as never}
        size={lead ? 44 : 38}
        status={status}
      />
      <div className="min-w-0 flex-1">
        <p className="md-title truncate">{department.personaName || department.name}</p>
        <p className="md-label-sm truncate text-on-variant">{department.roleTitle}</p>
      </div>
      <span className="md-label-sm flex-none text-on-variant/75">
        {count} skill{count === 1 ? "" : "s"}
      </span>
      <ChevronIcon className="h-4 w-4 flex-none text-on-variant/60" />
    </Link>
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
