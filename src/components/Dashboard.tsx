"use client";

import { CalendarCard } from "./CalendarCard";
import { DepartmentAvatar } from "./DepartmentAvatar";
import type { DashboardPreview } from "@/lib/dashboardPreview";
import { dueCounts } from "@/lib/taskCounts";
import { SpendCard } from "./SpendCard";
import { ContextCard } from "./ContextCard";
import { StorageCard } from "./StorageCard";
import Link from "next/link";
import { createPortal } from "react-dom";
import { useLayoutEffect, useMemo, useState, type ReactNode, useEffect, useRef } from "react";
import {
  CheckIcon,
  ChevronIcon,
  DocIcon,
  FolderIcon,
  FeedbackIcon,
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
    taskComments,
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
  const due = useMemo(() => dueCounts(tasks, now), [tasks, now]);

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
          <div className="rounded-2xl border border-dashed border-outline-variant px-4 py-2.5">
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
        meta={
          <>
            <span className="md-label-sm">
              {threads} thread{threads === 1 ? "" : "s"}
            </span>
            <span className="md-label-sm">
              {activeProjects} active project{activeProjects === 1 ? "" : "s"}
            </span>
            <span className="md-label-sm">{deliverables.length} saved</span>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3 medium:grid-cols-4">
          <Count
            label="Overdue"
            value={due.overdue}
            was={due.was.overdue}
            tone={due.overdue > 0 ? "bad" : undefined}
          />
          <Count label="Due this week" value={due.week} was={due.was.week} />
          <Count label="Due next week" value={due.next} was={due.was.next} />
          <Count
            label="No date"
            value={due.undated}
            was={due.was.undated}
            hint={due.later > 0 ? `${due.later} further out` : undefined}
          />
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
          items={openTasks.slice(0, 5).map((task) => {
            const said = taskComments.filter((comment) => comment.taskId === task.id).length;
            return {
              key: task.id,
              href: "/tasks",
              departmentId: task.departmentId,
              primary: task.title,
              secondary: `${nameOf(task.departmentId)}${
                task.dueAt
                  ? ` · due ${new Date(task.dueAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`
                  : ""
              }`,
              trailing: said ? (
                <span
                  title={`${said} comment${said === 1 ? "" : "s"}`}
                  className="md-label-sm flex flex-none items-center gap-1 text-on-variant/75"
                >
                  <FeedbackIcon className="h-3.5 w-3.5" />
                  {said}
                </span>
              ) : undefined,
            };
          })}
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
            departmentId: entry.departmentId,
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
            departmentId: item.departmentId,
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
            departmentId: conversation.departmentId,
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

/**
 * How a count has moved, in whole tasks.
 *
 * Not the percentage the mock drew. These are single digits: going from one
 * overdue task to two is a hundred percent rise, which is true, useless, and
 * reads as an emergency. Two of anything is two of anything.
 */
function moved(value: number, was: number): string {
  const delta = value - was;
  if (delta === 0) return "Same as last week";
  if (delta > 0) return `${delta} more than last week`;
  return `${-delta} fewer than last week`;
}

/** One number, big enough to read from the doorway. */
function Count({
  label,
  value,
  was,
  hint,
  tone,
}: {
  label: string;
  value: number;
  /** The same count a week ago, when it can be worked out. */
  was?: number;
  hint?: string;
  tone?: "bad";
}) {
  return (
    <div className="rounded-2xl bg-container px-4 py-3 shadow-e1">
      <p className="md-label-sm truncate text-on-variant">{label}</p>
      <p
        className={cx(
          "mt-1 text-2xl font-medium leading-tight tabular-nums",
          tone === "bad" && "text-error",
        )}
      >
        {value}
      </p>
      {was === undefined ? null : (
        <p className="md-label-sm mt-1 text-on-variant/75">{moved(value, was)}</p>
      )}
      {hint ? <p className="md-label-sm mt-0.5 text-on-variant/75">{hint}</p> : null}
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
  meta,
  action,
  children,
}: {
  id: string;
  title: string;
  what?: string;
  /**
   * Counts that belong to the band rather than to any one card in it.
   *
   * On the heading line, which is the row a band already owns, so a handful of
   * numbers no longer needs a row of its own underneath the cards. Each child
   * brings its own type class, because some of these are metadata and belong
   * in capitals and some are sentences and do not.
   */
  meta?: ReactNode;
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
      {/* The gap under the heading is for what is under it, so a band whose
          content is all in this row does not leave one. */}
      <div
        className={cx(
          "flex flex-wrap items-center gap-x-2 gap-y-1",
          open && children ? "mb-3" : "",
        )}
      >
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
        <div className="ml-auto flex flex-none items-center gap-2 medium:order-2">
          {action}
        </div>
        {meta && open ? (
          <div className="flex basis-full flex-wrap items-center gap-x-4 gap-y-1 text-on-variant/75 medium:order-1 medium:basis-auto">
            {meta}
          </div>
        ) : null}
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
/**
 * The question mark beside a heading, and what it says when pressed.
 *
 * The note is drawn into the document rather than beside the button, which
 * looks like over-engineering and is not. The Activity band is a CSS multi
 * column masonry, and the spec fragments an absolutely positioned descendant of
 * a multi column container across its columns: measured, the Decisions note
 * came out as two boxes, the first half at the bottom of one column and the
 * second half four hundred pixels up the next. There is no way to opt out of
 * that from inside. Leaving the container is the fix.
 *
 * Fixed rather than absolute, for the same reason: the note is a child of the
 * body now, so page coordinates would be wrong the moment the feed scrolled.
 */
function Hint({ what, side = "right" }: { what: string; side?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const button = useRef<HTMLButtonElement | null>(null);
  const note = useRef<HTMLSpanElement | null>(null);

  /*
   * Measured after the note exists, so its real height is known and it can be
   * flipped above the button when there is no room below. Width is capped at
   * 20rem by the class, and the clamp keeps both edges on screen.
   */
  useLayoutEffect(() => {
    if (!open) return;

    const place = () => {
      const anchor = button.current?.getBoundingClientRect();
      if (!anchor) return;
      const width = note.current?.offsetWidth ?? 320;
      const height = note.current?.offsetHeight ?? 0;
      const margin = 8;

      const below = anchor.bottom + margin;
      const flip = height > 0 && below + height > window.innerHeight - margin;
      const top = flip ? Math.max(margin, anchor.top - margin - height) : below;

      const wanted = side === "right" ? anchor.right - width : anchor.left;
      const left = Math.min(
        Math.max(margin, wanted),
        Math.max(margin, window.innerWidth - width - margin),
      );

      setAt({ top, left });
    };

    place();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (button.current?.contains(target) || note.current?.contains(target)) return;
      setOpen(false);
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    // Capture, so a scroll in the feed moves it and not only a scroll of the
    // window, which is the one thing that never happens on this page.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, side]);

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={open ? "Hide what this is" : "What is this"}
        aria-expanded={open}
        title={open ? undefined : what}
        onClick={() => setOpen((value) => !value)}
        className={cx(
          "md-state grid h-5 w-5 flex-none place-items-center rounded-lg text-[0.6875rem] font-semibold leading-none transition-colors",
          open
            ? "bg-primary text-on-primary"
            : "bg-highest text-on-variant hover:text-on-surface",
        )}
      >
        ?
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
            <span
              ref={note}
              role="note"
              style={{ top: at?.top ?? -9999, left: at?.left ?? -9999 }}
              className={cx(
                "fixed z-50 w-[min(20rem,calc(100vw-2rem))]",
                "rounded-xl border border-outline-variant bg-container p-3 shadow-e3",
                // The heading this belongs to is uppercase and tracked out.
                "md-body-sm block normal-case tracking-normal text-on-surface",
              )}
            >
              {what}
            </span>,
            document.body,
          )
        : null}
    </>
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
  items: {
    key: string;
    href: string;
    primary: string;
    secondary: string;
    /** The head this belongs to, drawn as a disc at the head of the row. */
    departmentId?: string;
    /** Something small at the end of the row, when there is anything to say. */
    trailing?: ReactNode;
  }[];
  /** What this section is, behind a question mark. See Hint. */
  what?: string;
}) {
  const { allDepartments } = useStore();
  return (
    <section className="rounded-2xl bg-container p-4 shadow-e1">
      <div
        className={cx(
          "flex items-center justify-between gap-2",
          items.length > 0 && "mb-2",
        )}
      >
        <h2 className="md-label-sm flex min-w-0 items-center gap-1.5 text-on-variant">
          {icon}
          <span className="truncate">{title}</span>
        </h2>
        <div className="flex flex-none items-center gap-2">
          {items.length === 0 ? (
            // Beside the name rather than under it. There is no list to head,
            // so the header is the whole card and the sentence belongs on it.
            <span className="md-body-sm text-on-variant/75">{empty}</span>
          ) : (
            <Link href={href} className="md-label-sm text-primary">
              All
            </Link>
          )}
          {what ? <Hint what={what} /> : null}
        </div>
      </div>

      {items.length === 0 ? null : (
        <ul className="-mx-2 space-y-0.5">
          {items.map((item) => {
            /*
             * A disc at the head of the row.
             *
             * The one idea in the mock that generalises past the pane it was
             * drawn for: every one of these lists is things a head did, the
             * head is already named on the second line, and a name is something
             * you read where a colour is something you see.
             */
            const department = item.departmentId
              ? allDepartments.find((d) => d.id === item.departmentId)
              : undefined;
            return (
              <li key={item.key}>
                <Link
                  href={item.href}
                  onClick={createRipple}
                  className="md-state flex items-center gap-2.5 rounded-lg px-2 py-1.5"
                >
                  {department ? (
                    <DepartmentAvatar
                      department={department}
                      size={26}
                      title={department.roleTitle}
                    />
                  ) : null}
                  <span className="min-w-0 flex-1">
                    <span className="md-body block truncate">{item.primary}</span>
                    <span className="md-label-sm block truncate text-on-variant/75">
                      {item.secondary}
                    </span>
                  </span>
                  {item.trailing}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
