"use client";

import { CalendarCard } from "./CalendarCard";
import type { DashboardPreview } from "@/lib/dashboardPreview";
import { SpendCard } from "./SpendCard";
import { ContextCard } from "./ContextCard";
import { StorageCard } from "./StorageCard";
import Link from "next/link";
import { useMemo, useState, type ReactNode, useEffect, useRef} from "react";
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
import { conversationHref, formatExactTime } from "@/lib/routes";
import { useStore } from "@/lib/store";
import { useLayoutMode } from "@/lib/layoutMode";

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
export function Dashboard({ preview }: { preview?: DashboardPreview | null }) {
  const {
    ready,
    departments,
    allDepartments,
    conversations,
    deliverables,
    meetings,
    projects,
    memory,
    tasks,
    skills,
    profile,
    settings,
    can,
  } = useStore();

  /*
   * The legacy layout keeps Information as a screen of its own, so the band
   * that replaced it does not also appear here. The same three cards in two
   * places on one arrangement is worse than either arrangement alone.
   */
  const legacy = useLayoutMode() === "legacy";

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

  /*
   * The two panes the server already drew, until the snapshot arrives.
   *
   * These were the last things on the dashboard to fill in, about a second and
   * a half after the rest, because they wait on /api/workspace and that waits
   * on the browser having run the JavaScript first. The server reads the same
   * ten lines on the request that renders the page, so they are in the markup,
   * and this swaps to the live copy the moment there is one.
   *
   * `ready` rather than a length check. A workspace with no conversations yet
   * would otherwise never stop preferring the preview, and the preview is empty
   * too, so it would work by accident rather than on purpose.
   */
  const recent = ready
    ? conversations.filter((c) => c.messageCount > 0).slice(0, 4)
    : (preview?.conversations ?? []);

  const recentMeetings = ready
    ? meetings.slice(0, 3).map((run) => ({
        id: run.id,
        title: run.title,
        rounds: run.rounds.length,
        updatedAt: run.updatedAt,
      }))
    : (preview?.meetings ?? []);

  const activeProjects = projects.filter((p) => p.status === "active").length;
  const threads = conversations.filter((c) => c.messageCount > 0).length;

  return (
    <div className="page-x space-y-8 py-6">

      {/* The business's own numbers lead, because they are the only thing here
          this app did not make up about itself. */}
      <Band
        id="figures"
        title="Key figures"
        what="Numbers you record yourself, like revenue or headcount. Use the same label each month and the readings stack into a trend."
        action={
          <Link href="/library/memory" className="md-label-sm text-primary">
            {figures.length ? "Add reading" : "Add figure"}
          </Link>
        }
      >
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
                    : formatExactTime(latest?.occurredAt ?? 0)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-outline-variant p-5">
            <p className="md-body text-on-variant">No figures recorded.</p>
          </div>
        )}
      </Band>

      {/* What is owed, and when. The heads used to sit here as a grid of cards,
          which was the sidebar again in a second typeface. */}
      <Band
        id="tasks"
        title="Tasks"
        what="Everything outstanding, counted by when it is due. A head can propose one and you approve it."
        action={
          <Link href="/tasks" className="md-label-sm text-primary">
            View all tasks
          </Link>
        }
      >
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
      </Band>

      <Band
        id="activity"
        title="Activity"
        what="The most recent thing in each part of the panel, with a link to the rest of it."
      >
        {/*
          * Columns rather than a grid, so a card is as tall as what is in it.
          *
          * A grid gives every cell in a row the height of the tallest one, and
          * these seven cards are nothing like the same height: Decisions says
          * "No decisions recorded." and was drawn as tall as five open tasks
          * beside it, Deliverables the same next to four conversations, and
          * Projects sat alone on a third row that was otherwise empty. Most of
          * this band was blank, and System was pushed off the bottom of the
          * screen by space that held nothing.
          *
          * The trade is reading order: columns fill downwards, so the cards run
          * top-to-bottom then left-to-right rather than across. These are seven
          * independent panels rather than a sequence, so there is no order to
          * lose, and it is what every masonry dashboard does for the same
          * reason.
          */}
        <div
          className={cx(
            "columns-1 gap-4 medium:columns-2 large:columns-3",
            "[&>*]:mb-4 [&>*]:break-inside-avoid",
          )}
        >
          {/* First, and only when there is one. "What should I focus on" is
              usually answered by "you have four hours of meetings". */}
          <CalendarCard />
        <PaneList
          title="Open tasks"
          what="Jobs that are not done yet, oldest due date first."
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
          what="Things the business has settled, which every head reads before answering so you are not asked to explain them again."
          icon={<SparkIcon className="h-3.5 w-3.5" />}
          href="/library/memory"
          empty="No decisions recorded."
          items={decisions.map((entry) => ({
            key: entry.id,
            href: "/library/memory",
            primary: entry.label,
            secondary: `${nameOf(entry.departmentId)} · ${formatExactTime(entry.occurredAt)}`,
          }))}
        />

        <PaneList
          title="Deliverables"
          what="Finished work a head produced and you chose to keep: reports, drafts, plans. Exports as Word, Markdown or text."
          icon={<DocIcon className="h-3.5 w-3.5" />}
          href="/library/deliverables"
          empty="No deliverables saved."
          items={deliverables.slice(0, 4).map((item) => ({
            key: item.id,
            href: "/library/deliverables",
            primary: item.title,
            secondary: `${nameOf(item.departmentId)} · ${formatExactTime(item.updatedAt)}`,
          }))}
        />

        <PaneList
          title="Recent conversations"
          what="The last few threads you had with a head. Each keeps its own history."
          icon={<ChevronIcon className="h-3.5 w-3.5" />}
          href="/orchestrator"
          empty="No conversations."
          items={recent.map((conversation) => ({
            key: conversation.id,
            href: conversationHref(conversation.departmentId, conversation.id),
            primary: conversation.title,
            secondary: `${nameOf(conversation.departmentId)} · ${formatExactTime(
              conversation.updatedAt,
            )}`,
          }))}
        />

        <PaneList
          title="Meetings"
          what="One question put to every head at once, for decisions that cross departments."
          icon={<UsersIcon className="h-3.5 w-3.5" />}
          href="/meetings"
          empty="No threads."
          items={recentMeetings.map((run) => ({
            key: run.id,
            // The meeting, not the page of meetings. Clicking one landed on the
            // list and left you to find the thing you had just clicked.
            href: `/meetings?meeting=${encodeURIComponent(run.id)}`,
            primary: run.title,
            secondary: `${run.rounds} ${
              run.rounds === 1 ? "question" : "questions"
            } · ${formatExactTime(run.updatedAt)}`,
          }))}
        />

        <PaneList
          title="Projects"
          what="A name to group related tasks and conversations under, when several things are running at once."
          icon={<FolderIcon className="h-3.5 w-3.5" />}
          href="/projects"
          empty="No projects."
          items={projects.slice(0, 3).map((project) => ({
            key: project.id,
            href: `/projects/${project.id}`,
            primary: project.name,
            secondary: `${project.status} · ${formatExactTime(project.updatedAt)}`,
          }))}
          />
        </div>
      </Band>

      {/*
        * What the panel costs and what it is holding, which used to be a screen
        * of its own called Information.
        *
        * Folded in here because it was three cards nobody navigated to. Last on
        * the page and behind the same permission that screen was, so an
        * administrator who had already decided somebody should not see the
        * spend has not had that decision quietly undone by the merge.
        */}
      {can("information") && !legacy ? (
        <Band
          id="system"
          title="System"
          what="What the heads cost to run this month, what each of them is sent before you type anything, and how much room the workspace is using."
        >
          <div className="grid grid-cols-1 gap-4 medium:grid-cols-2 large:grid-cols-3">
            <SpendCard />
            <ContextCard />
            <StorageCard />
          </div>
        </Band>
      ) : null}
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

/**
 * One band of the dashboard, with a heading you can fold away.
 *
 * The panes used to sit under no heading at all, in one run with the rest, so
 * seven cards of different things read as a single wall. A name over each band
 * and more air between them is most of the fix; being able to collapse the
 * bands you do not use is the rest, because a dashboard is looked at every day
 * and everybody uses a different half of it.
 *
 * The choice is kept per person in this browser, which is the right scope: it
 * is a preference about a screen, not a fact about the business, and it should
 * not follow somebody onto a colleague's machine.
 */
function Band({
  id,
  title,
  what,
  action,
  children,
}: {
  id: string;
  title: string;
  what?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const key = `eterneon:dash:${id}`;
  const [open, setOpen] = useState(true);

  // Read after mount rather than during render, so the server and the first
  // paint agree and nothing flashes open before folding shut.
  useEffect(() => {
    try {
      if (window.localStorage.getItem(key) === "closed") setOpen(false);
    } catch {
      // Blocked storage means it simply stays open, which is the default.
    }
  }, [key]);

  const toggle = () => {
    setOpen((was) => {
      const next = !was;
      try {
        window.localStorage.setItem(key, next ? "open" : "closed");
      } catch {
        // The section still folds for this visit.
      }
      return next;
    });
  };

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="md-state -ml-1 flex min-w-0 items-center gap-1.5 rounded-lg px-1 py-0.5"
        >
          <ChevronIcon
            className={cx(
              "h-3.5 w-3.5 flex-none text-on-variant transition-transform",
              open ? "rotate-90" : "",
            )}
          />
          <h2 className="md-label-sm truncate text-on-variant">{title}</h2>
        </button>
        {what ? <Hint what={what} side="left" /> : null}
        <div className="ml-auto flex flex-none items-center gap-2">{action}</div>
      </div>
      {open ? children : null}
    </section>
  );
}

/**
 * A question mark that says what a section is, when asked.
 *
 * On demand rather than printed underneath. A line of explanation beside every
 * heading is clutter on the ninety nine visits where you already know, and this
 * panel deliberately does not do that. But a section called Deliverables tells
 * you nothing at all until one exists in it, and by then you did not need
 * telling, so the explanation has to be reachable and out of the way at once.
 *
 * Three things the first version got wrong, all visible the moment it opened.
 *
 * It used md-label-sm, which is uppercase, so a full sentence came out shouting
 * and unreadable. That class is for "3D AGO" and the note beside its definition
 * in globals.css says exactly that. Body text, in sentence case, and normal-case
 * to defeat the heading it is nested inside.
 *
 * It anchored its right edge to the button. Beside a heading on the left of the
 * screen that puts a 224px panel at a negative offset, half of it off the side
 * of the window, which is what it did. Which edge to anchor is now the caller's
 * to say, because only the caller knows where on the row the button sits.
 *
 * And it only closed by pressing the same small target again. Escape and a
 * click anywhere else both close it now, which is what a person will try.
 */
function Hint({ what, side = "right" }: { what: string; side?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const holder = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onDown = (event: MouseEvent) => {
      if (!holder.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  return (
    <span ref={holder} className="relative flex-none">
      <button
        type="button"
        aria-label={open ? "Hide what this is" : "What is this"}
        aria-expanded={open}
        title={open ? undefined : what}
        onClick={() => setOpen((value) => !value)}
        className={cx(
          "md-state grid h-5 w-5 place-items-center rounded-full text-[0.6875rem] font-semibold leading-none transition-colors",
          open
            ? "bg-primary text-on-primary"
            : "bg-highest text-on-variant hover:text-on-surface",
        )}
      >
        ?
      </button>

      {open ? (
        <span
          role="note"
          className={cx(
            // Never wider than the window it has to fit inside.
            "absolute top-7 z-30 w-[min(20rem,calc(100vw-2rem))]",
            side === "right" ? "right-0" : "left-0",
            "rounded-xl border border-outline-variant bg-container p-3 shadow-e3",
            // The heading this sits inside is uppercase and tracked out.
            "md-body-sm block normal-case tracking-normal text-on-surface",
          )}
        >
          {what}
        </span>
      ) : null}
    </span>
  );
}

function PaneList({
  title,
  icon,
  href,
  empty,
  items,
  what,
}: {
  title: string;
  icon: ReactNode;
  href: string;
  empty: string;
  items: { key: string; href: string; primary: string; secondary: string }[];
  /** What this section is, behind a question mark. See Hint. */
  what?: string;
}) {
  return (
    <section className="rounded-2xl bg-container p-4 shadow-e1">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="md-label-sm flex min-w-0 items-center gap-1.5 text-on-variant">
          {icon}
          <span className="truncate">{title}</span>
        </h2>
        <div className="flex flex-none items-center gap-2">
          {items.length > 0 ? (
            <Link href={href} className="md-label-sm text-primary">
              All
            </Link>
          ) : null}
          {what ? <Hint what={what} /> : null}
        </div>
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
