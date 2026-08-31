"use client";

import Link from "next/link";
import { DepartmentAvatar } from "./DepartmentAvatar";
import { useMemo, type ReactNode } from "react";
import { hasProfileContent } from "@/lib/prompts";
import { conversationHref, departmentHref, formatRelativeTime } from "@/lib/routes";
import { useStore } from "@/lib/store";
import type { Department } from "@/lib/types";
import {
  ChevronIcon,
  DocIcon,
  SparkIcon,
  STATUS_LABEL,
  StatusDot,
  UsersIcon,
  cx,
} from "./ui";
import { createRipple } from "./ui/ripple";

/**
 * A hierarchy list rather than a fanned-out chart.
 *
 * The card row it replaced had to scroll sideways past about four departments,
 * which is unusable on a phone and awkward on a laptop. A list reads at any
 * width and takes any number of departments.
 *
 * From the expanded window class up the list sits beside a supporting pane,
 * because a 760px column alone left most of a desktop screen empty.
 */
export function OrgChart() {
  const { departments } = useStore();

  return (
    <div className="px-4 pb-10 pt-4 medium:px-6 medium:pt-6 expanded:px-8">
      <div className="mx-auto flex w-full max-w-[73.75rem] flex-col gap-6 expanded:flex-row expanded:items-start expanded:gap-8">
        <div className="min-w-0 flex-1">
          <Hierarchy />
        </div>

        {departments.length > 0 ? (
          <aside className="w-full flex-none expanded:w-[20rem]">
            <SupportingPane />
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function Hierarchy() {
  const { ready, departments, ceo, conversations, ownSkillsFor } = useStore();

  const threadsFor = (id: string) =>
    conversations.filter((c) => c.departmentId === id && c.messages.length > 0).length;

  return (
    <>
      {ceo ? (
        <CeoRow
          ceo={ceo}
          skillCount={ownSkillsFor(ceo.id).length}
          threadCount={threadsFor(ceo.id)}
        />
      ) : (
        <div className="h-[104px] animate-pulse rounded-3xl bg-container" />
      )}

      <ul className="mt-1">
        {departments.map((department) => (
          <DepartmentRow
            key={department.id}
            department={department}
            skillCount={ownSkillsFor(department.id).length}
            threadCount={threadsFor(department.id)}
            lastActive={
              conversations.find(
                (c) => c.departmentId === department.id && c.messages.length > 0,
              )?.updatedAt
            }
          />
        ))}
      </ul>

      {ready && departments.length === 0 ? (
        <p className="md-body mt-6 rounded-2xl border border-dashed border-outline-variant px-6 py-8 text-center text-on-variant">
          No departments yet. Add one in{" "}
          <Link href="/settings" className="text-primary underline">
            Settings
          </Link>
          .
        </p>
      ) : null}
    </>
  );
}

function CeoRow({
  ceo,
  skillCount,
  threadCount,
}: {
  ceo: Department;
  skillCount: number;
  threadCount: number;
}) {
  return (
    <Link
      href="/ceo"
      onClick={createRipple}
      className={cx(
        "md-state flex items-center gap-3 rounded-3xl px-4 py-4 medium:gap-4 medium:px-5",
        "bg-primary-container text-on-primary-container shadow-e2",
        "transition-shadow duration-200 hover:shadow-e3",
      )}
    >
      <DepartmentAvatar department={ceo} size={48} />

      <span className="min-w-0 flex-1">
        <span className="md-title-lg block truncate">{ceo.personaName || ceo.name}</span>
        <span className="md-label block truncate opacity-90">{ceo.roleTitle}</span>
        <span className="md-label-sm mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 opacity-80">
          <span className="flex items-center gap-1.5">
            <StatusDot status={ceo.status} />
            On Duty
          </span>
          <span aria-hidden>·</span>
          <span>
            {skillCount} {skillCount === 1 ? "skill" : "skills"}
          </span>
          <span aria-hidden>·</span>
          <span>
            {threadCount} {threadCount === 1 ? "thread" : "threads"}
          </span>
        </span>
      </span>

      <ChevronIcon className="h-5 w-5 flex-none opacity-70" />
    </Link>
  );
}

function DepartmentRow({
  department,
  skillCount,
  threadCount,
  lastActive,
}: {
  department: Department;
  skillCount: number;
  threadCount: number;
  lastActive?: number;
}) {
  return (
    <li
      className={cx(
        // The spine and the elbow are pseudo-elements, so the reporting line
        // survives any number of rows and any text length.
        "relative pl-8 medium:pl-10",
        "before:absolute before:left-4 before:top-0 before:bottom-0 before:w-px",
        "before:bg-[var(--md-outline-variant)] last:before:bottom-1/2",
        "after:absolute after:left-4 after:top-1/2 after:h-px after:w-4",
        "after:bg-[var(--md-outline-variant)] medium:after:w-5",
      )}
    >
      <Link
        href={departmentHref(department)}
        onClick={createRipple}
        className={cx(
          "md-state my-1 flex items-center gap-3 rounded-2xl bg-container px-3 py-3 shadow-e1",
          "transition-shadow duration-200 hover:shadow-e2 medium:gap-4 medium:px-4",
        )}
      >
        <DepartmentAvatar department={department} size={44} />

        <span className="min-w-0 flex-1">
          <span className="md-title block truncate">{department.name}</span>
          <span className="md-label block truncate text-on-variant">
            {department.personaName
              ? `${department.personaName}, ${department.roleTitle}`
              : department.roleTitle}
          </span>
          <span className="md-label-sm mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-on-variant/75">
            <span className="flex items-center gap-1.5">
              <StatusDot status={department.status} />
              {STATUS_LABEL[department.status]}
            </span>
            <span aria-hidden>·</span>
            <span className="flex items-center gap-1">
              <SparkIcon className="h-3 w-3" />
              {skillCount}
            </span>
            {threadCount > 0 ? (
              <>
                <span aria-hidden>·</span>
                <span>
                  {threadCount} {threadCount === 1 ? "thread" : "threads"}
                </span>
              </>
            ) : null}
            {lastActive ? (
              <>
                <span aria-hidden>·</span>
                <span>{formatRelativeTime(lastActive)}</span>
              </>
            ) : null}
          </span>
        </span>

        <ChevronIcon className="h-5 w-5 flex-none text-on-variant" />
      </Link>
    </li>
  );
}

/**
 * The supporting pane. Deliberately shows things the drawer does not already
 * list, so it adds information rather than repeating the navigation.
 */
function SupportingPane() {
  const {
    departments,
    conversations,
    deliverables,
    allHandsRuns,
    skills,
    profile,
    settings,
    allDepartments,
  } = useStore();

  const threads = conversations.filter((c) => c.messages.length > 0).length;

  const gaps = useMemo(() => {
    const items: { label: string; href: string }[] = [];
    if (!settings.apiKey) {
      items.push({ label: "No API key yet, nothing can reply", href: "/settings" });
    }
    if (!hasProfileContent(profile)) {
      items.push({ label: "Company Profile is empty", href: "/profile" });
    }
    const bare = departments.filter((d) => !skills.some((s) => s.departmentId === d.id));
    if (bare.length > 0) {
      items.push({
        label: `${bare.length} ${bare.length === 1 ? "head has" : "heads have"} no skills`,
        href: "/library/skills",
      });
    }
    return items;
  }, [settings.apiKey, profile, departments, skills]);

  const nameOf = (id: string) =>
    allDepartments.find((d) => d.id === id)?.personaName ??
    allDepartments.find((d) => d.id === id)?.name ??
    "Unassigned";

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl bg-container p-4 shadow-e1">
        <h2 className="md-label-sm mb-3 text-on-variant">At a glance</h2>
        <div className="grid grid-cols-4 gap-2 expanded:grid-cols-2">
          <Stat value={departments.length} label="Heads" />
          <Stat value={skills.length} label="Skills" />
          <Stat value={threads} label="Threads" />
          <Stat value={deliverables.length} label="Output" />
        </div>
      </section>

      {gaps.length > 0 ? (
        <section className="rounded-2xl border border-warning/25 bg-warning/10 p-4">
          <h2 className="md-label-sm mb-2 text-warning">Needs attention</h2>
          <ul className="space-y-1.5">
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
        title="Recent rooms"
        icon={<UsersIcon className="h-3.5 w-3.5" />}
        href="/all-hands"
        empty="No company wide questions yet."
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
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl bg-high px-3 py-2.5">
      <p className="text-xl font-medium leading-tight">{value}</p>
      <p className="md-label-sm text-on-variant">{label}</p>
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
