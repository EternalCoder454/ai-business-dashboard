"use client";

import { hasKeyFor } from "@/lib/hasKey";
import Link from "next/link";
import { DepartmentAvatar } from "./DepartmentAvatar";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CompanyMark } from "./CompanyMark";
import { ORCHESTRATOR_ID } from "@/lib/seed";
import { conversationHref, departmentHref, formatExactTime } from "@/lib/routes";
import { useMessages } from "@/lib/messages";
import { useDepartmentStatus } from "@/lib/presence";
import { useStore } from "@/lib/store";
import {
  BriefcaseIcon,
  BuildingIcon,
  ChecklistIcon,
  ChevronIcon,
  BookIcon,
  DashboardIcon,
  DocIcon,
  FolderIcon,
  GearIcon,
  MailIcon,
  NavBadge,
  ShieldIcon,
  PersonIcon,
  PlusIcon,
  ScheduleIcon,
  SparkIcon,
  StatusDot,
  UsersIcon,
  cx,
} from "./ui";
import { SearchIcon } from "./CommandPalette";
import { createRipple } from "./ui/ripple";
import { PaneFoldButton, PaneResizeHandle, usePaneResize } from "./ui/SidePane";
import { setPaneHidden } from "@/lib/paneLayout";
import { useLayoutMode } from "@/lib/layoutMode";


export interface NavLink {
  href: string;
  label: string;
  /** Shortened for the rail and the bottom bar, where width is scarce. */
  short: string;
  icon: ReactNode;
}

/*
 * Home first. This list is every navigation in the product, including the
 * bottom bar on a phone, where the first slot is the one a thumb finds without
 * looking.
 */
export const WORK_LINKS: NavLink[] = [
  {
    href: "/",
    label: "Dashboard",
    short: "Home",
    icon: <DashboardIcon className="h-5 w-5" />,
  },
  {
    href: "/meetings",
    label: "Meetings",
    short: "Meetings",
    icon: <UsersIcon className="h-5 w-5" />,
  },
  {
    href: "/inbox",
    label: "Inbox",
    short: "Inbox",
    icon: <MailIcon className="h-5 w-5" />,
  },
  {
    href: "/tasks",
    label: "Tasks",
    short: "Tasks",
    // A list of things to do rather than one done thing, which is what a lone
    // tick reads as.
    icon: <ChecklistIcon className="h-5 w-5" />,
  },
  {
    href: "/projects",
    label: "Projects",
    short: "Projects",
    icon: <FolderIcon className="h-5 w-5" />,
  },
  /*
   * The Library was a section of its own called Reference, holding one page.
   *
   * A heading over a single row is a heading that only costs space: it took a
   * label, a rule and a gap to say one word that the row underneath already
   * said. And the split it was drawing was not a real one. Reference meant
   * things you read rather than do, but the Library is where the documents a
   * head answers from are put and where the work it produces is kept, which is
   * doing rather than reading.
   */
  {
    href: "/library",
    label: "Library",
    short: "Library",
    icon: <DocIcon className="h-5 w-5" />,
  },
];

/**
 * Work, arranged the way it was before three merges moved things around.
 *
 * Chief of Staff is a destination in this list rather than the head of the
 * Departments section, Briefings is its own row rather than a tab of Tasks,
 * and the Library is not here at all: it belongs to Reference, with
 * Information.
 *
 * Only the arrangement is old. Every part of how any of it is drawn is the
 * current build, which is the whole point of the setting: two people said the
 * presentation had got better and the arrangement had got worse, and there is
 * no reason those have to be the same decision.
 */
export const LEGACY_WORK_LINKS: NavLink[] = [
  {
    href: "/",
    label: "Dashboard",
    short: "Home",
    icon: <DashboardIcon className="h-5 w-5" />,
  },
  {
    href: "/orchestrator",
    label: "Chief of Staff",
    short: "Chief",
    icon: <BriefcaseIcon className="h-5 w-5" />,
  },
  {
    href: "/meetings",
    label: "Meetings",
    short: "Meetings",
    icon: <UsersIcon className="h-5 w-5" />,
  },
  {
    href: "/inbox",
    label: "Inbox",
    short: "Inbox",
    icon: <MailIcon className="h-5 w-5" />,
  },
  {
    /*
     * The tab, named the way the tab is named.
     *
     * This row was Briefings on the old layout, and the screen it opens has
     * been called Schedules since the merge. Keeping the old word here would
     * mean clicking Briefings and arriving somewhere headed Schedules, which is
     * the layout being nostalgic at the cost of being wrong.
     */
    href: "/tasks?tab=schedules",
    label: "Schedules",
    short: "Schedules",
    icon: <ScheduleIcon className="h-5 w-5" />,
  },
  {
    href: "/tasks",
    label: "Tasks",
    short: "Tasks",
    icon: <ChecklistIcon className="h-5 w-5" />,
  },
  {
    href: "/projects",
    label: "Projects",
    short: "Projects",
    icon: <FolderIcon className="h-5 w-5" />,
  },
];

/** Reference, which the current layout does not have. */
export const LEGACY_REFERENCE_LINKS: NavLink[] = [
  {
    href: "/library",
    label: "Library",
    short: "Library",
    icon: <DocIcon className="h-5 w-5" />,
  },
  {
    href: "/information",
    label: "Information",
    short: "Info",
    icon: <SparkIcon className="h-5 w-5" />,
  },
];

/** Setup: opened when something needs changing, not day to day. */
export const SETUP_LINKS: NavLink[] = [
  {
    href: "/profile",
    label: "Company Profile",
    short: "Company",
    icon: <BuildingIcon className="h-5 w-5" />,
  },
  {
    href: "/account",
    label: "Account",
    short: "You",
    icon: <PersonIcon className="h-5 w-5" />,
  },
  {
    href: "/settings",
    label: "Settings",
    short: "Settings",
    icon: <GearIcon className="h-5 w-5" />,
  },
  {
    href: "/wiki",
    label: "Internal Wiki",
    short: "Wiki",
    icon: <BookIcon className="h-5 w-5" />,
  },
  {
    // Kept here as well as in the profile menu, because this list is what the
    // command palette searches. A page reachable only by a menu nobody opens
    // is a page nobody finds.
    href: "/documentation",
    label: "Documentation",
    short: "Docs",
    icon: <DocIcon className="h-5 w-5" />,
  },
];

/** The five destinations that fit a navigation rail or a bottom bar. */
/**
 * Only shown to the operator, and never in the bottom bar.
 *
 * Named Operator rather than Admin because a customer running their own
 * business is an admin, of that business, and this is the other thing: the
 * screen that reads across every workspace on the deployment.
 */
const OPERATOR_LINK: NavLink = {
  href: "/operator",
  label: "Operator",
  short: "Operator",
  icon: <ShieldIcon className="h-5 w-5" />,
};

/** Everything, for search and for anything that needs the full list. */
export const COMPANY_LINKS: NavLink[] = [...WORK_LINKS, ...SETUP_LINKS];

/** The five that fit a rail or a bottom bar, which is exactly the work group. */
export const PRIMARY_LINKS = WORK_LINKS;

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/**
 * The permanent drawer, shown from the large window size class up.
 *
 * Collapsing hides it and lets the rail, which medium and expanded windows
 * already use, take over at large too. So the collapsed state is the rail
 * rather than a narrower drawer, and there is only one narrow navigation to
 * maintain.
 */
export function Sidebar({
  onOpenSearch,
  folded,
}: {
  onOpenSearch?: () => void;
  /** Folded to the rail, which is one flag in paneLayout now. */
  folded?: boolean;
}) {
  const { stored, wide, width, ceiling, dragging, setDragging, paneRef, resizeTo } = usePaneResize({
    id: "nav",
    breakpoint: "large",
    // Unused while nothing is stored: the default below is fit-content, which
    // no number can express. It is the width a drag starts from if the pointer
    // somehow arrives before a measurement.
    defaultWidth: 260,
    minWidth: 208,
    maxWidth: 400,
  });

  /*
   * A pixel width, taken at the moment of folding and only then.
   *
   * A column sized to its contents cannot be animated shut, because no browser
   * will transition from an intrinsic size to a number. The obvious answer is
   * to measure it and keep the number, and that answer was wrong in a way that
   * took a screenshot from somebody else's machine to see: measured on mount,
   * before the workspace had loaded, it pinned the column to the width of a
   * menu that was still four rows and a "Loading…". The departments arrived
   * afterwards into a column already too narrow for them, and "Social Media"
   * came out as "Social Me...". It never looked wrong here, because the data
   * was always already cached.
   *
   * So nothing is pinned while the menu is simply sitting there. It stays
   * fit-content, re-fitting whatever it holds, and a width is taken only when
   * somebody folds it: measure, let that paint, then fold. Two frames rather
   * than one, because React batches a measurement and a fold set together and
   * the element would never render at the width it is supposed to leave from.
   */
  const [foldFrom, setFoldFrom] = useState<number | null>(null);

  const fold = () => {
    const measured = paneRef.current?.getBoundingClientRect().width;
    if (!measured) {
      setPaneHidden("nav", true);
      return;
    }
    setFoldFrom(Math.round(measured));
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setPaneHidden("nav", true));
    });
  };

  /** What it is when open: dragged if it has been, else the last fold's width. */
  const openWidth = stored.width ?? foldFrom;

  return (
    <aside
      ref={paneRef}
      className={cx(
        /*
         * As wide as its contents, between a floor and a ceiling.
         *
         * It was a flat 280px whatever was in it, which is a lot of column to
         * give a list reading "Legal" and "Design". fit-content asks the widest
         * row how much it needs; the floor keeps the search field and the new
         * conversation button from being squeezed, and the ceiling stops one
         * long department name taking a fifth of the screen, since every row
         * truncates once it reaches the limit.
         *
         * Stable in practice rather than by luck: what sets the width here is
         * the company name, the section headings and the department names, none
         * of which change as you move around. Recent conversations are
         * deliberately not in this list, which is what would have made it
         * twitch.
         *
         * All of which is still the default, and now only the default. Dragging
         * the edge replaces it with a number, because sizing to content is a
         * good guess about what the column needs and says nothing about what
         * the person wants to spend on it.
         */
        "hidden h-full flex-none flex-col large:flex",
        "relative overflow-hidden bg-low",
        /*
         * Folded is width zero rather than display none, so there is something
         * for a transition to run on. The rail beside it grows from zero at the
         * same time and by the same amount, which is what keeps the page from
         * jumping outwards by 80px on the way closed.
         */
        /*
         * The floor lives on the contents, not on the column.
         *
         * min-width on the thing being animated clamps the animation too: on
         * the way open it jumped straight to 208px and eased the last 44,
         * because the minimum applied the instant it stopped being folded.
         * The drag already refuses to go below 208 in clampWidth, so this is
         * only here to keep the first content-sized paint from squeezing the
         * search field, which is a job for the contents.
         */
        folded ? "w-0 border-r-0" : "max-w-[25rem] border-r border-outline-variant",
        // Only until the measurement lands, one frame in.
        !folded && openWidth === null && "w-fit",
        !dragging && "motion-safe:transition-[width] motion-safe:duration-200 ease-out",
      )}
      style={
        folded ? { width: 0 } : openWidth !== null ? { width: openWidth } : undefined
      }
    >
      {/*
        * The contents keep the width they had, inside something that clips
        * them. Left to reflow, the whole menu re-wraps through every width
        * between here and nothing on the way closed.
        */}
      <div
        className="flex min-h-0 min-w-[13rem] flex-1 flex-col"
        style={openWidth ? { width: openWidth } : undefined}
      >
        <SidebarContent onOpenSearch={onOpenSearch} />
      </div>

      {wide && !folded ? (
        <>
          <PaneResizeHandle
            id="nav"
            label="the navigation"
            width={width}
            minWidth={208}
            maxWidth={ceiling}
            dragging={dragging}
            onStart={() => setDragging(true)}
            onResize={resizeTo}
            onFold={() => setPaneHidden("nav", true)}
          />
          {/* Folds to the icon rail rather than to a bare strip, which is what
              makes this pane different from the lists: every destination stays
              one click away instead of none. The control is the same one. */}
          <PaneFoldButton id="nav" label="the navigation" onFold={fold} />
        </>
      ) : null}
    </aside>
  );
}

/**
 * Drawer contents, shared by the permanent drawer and by the modal drawer that
 * compact, medium, and expanded windows open from the top app bar.
 */
/**
 * Height to content, which a textarea will not do on its own.
 *
 * The borders have to be added back. scrollHeight is the content box, the
 * element is border-box, and this one carries a 1px border on each side that
 * turns visible on hover. Setting height to scrollHeight alone leaves it two
 * pixels short of its own text, which is not enough to see and is enough to
 * scroll: the last line drifts under the edge as you type.
 */
function growSubtitle(el: HTMLTextAreaElement): void {
  /*
   * An empty field is one row, whatever the placeholder would need.
   *
   * scrollHeight measures the placeholder when there is nothing else to
   * measure, and "Add a subtitle…" wraps to two lines in a narrow sidebar. So
   * a subtitle typed and then cleared left a box twice the height of the one
   * the page had loaded with, for a field with nothing in it.
   */
  if (!el.value) {
    el.style.height = "";
    return;
  }

  el.style.height = "auto";
  el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
}

export function SidebarContent({
  onNavigate,
  onOpenSearch,
}: {
  onNavigate?: () => void;
  onOpenSearch?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const {
    ready,
    departments,
    settings,
    conversations,
    allDepartments,
    ownSkillsFor,
    updateSettings,
    createConversation,
    isOperator,
    personalDepartments,
    serverKeys,
    workspaceKeys,
    canOpenPath,
    canOpenHead,
    orchestrator,
  } = useStore();
  const { unread } = useMessages();

  /*
   * Only the heads this person was given. A name in a list you cannot open is
   * worse than the name not being there.
   */
  const visibleHeads = departments.filter((department) => canOpenHead(department.id));

  // A dot that always says Online is worse than no dot. This one reflects
  // whether a request could actually succeed, and whether one is in flight.
  // Whether anything can reply at all, which is the same question the chat
  // banner asks and used to answer differently: this skipped the business's own
  // key, so every invited colleague saw every head as unavailable.
  const statusOf = useDepartmentStatus(
    hasKeyFor(settings.model, { serverKeys, workspaceKeys, browserKey: settings.apiKey }),
  );


  /*
   * Which arrangement this browser has asked for. See layoutMode: the visuals
   * are the same either way and only the placement differs.
   */
  const legacy = useLayoutMode() === "legacy";
  const workLinks = legacy ? LEGACY_WORK_LINKS : WORK_LINKS;

  const [subtitle, setSubtitle] = useState(settings.companySubtitle);

  useEffect(() => {
    setSubtitle(settings.companySubtitle);
  }, [settings.companySubtitle]);

  const activeDepartmentId = pathname.startsWith("/dept/")
    ? decodeURIComponent(pathname.slice("/dept/".length).split("/")[0])
    : pathname === "/orchestrator"
      ? ORCHESTRATOR_ID
      : undefined;

  const handleNewConversation = async () => {
    const targetId = activeDepartmentId ?? ORCHESTRATOR_ID;
    const conversation = await createConversation(targetId);
    router.push(conversationHref(targetId, conversation.id));
    onNavigate?.();
  };

  const recent = conversations.filter((c) => c.messageCount > 0).slice(0, 24);

  /*
   * The subtitle grows to fit what it holds.
   *
   * Run on every change and once the stored value arrives, because the value
   * lands a moment after the first render and a box measured before it does is
   * a box sized for nothing.
   */
  const subtitleRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    if (subtitleRef.current) growSubtitle(subtitleRef.current);
  }, [subtitle]);

  return (
    <>
      {/* Just the mark. It used to be the fold button, with a chevron that
          appeared over it on hover and a logo the rest of the time, so the only
          people who knew the sidebar folded were the ones who had been told.
          Folding is the same control every other pane has now. */}
      <div className="flex items-start gap-3 px-5 pb-4 pt-5">
        <CompanyMark size={40} />
        <div className="min-w-0 flex-1">
          {/*
            * Wraps rather than truncates. The column is draggable now, so its
            * width is whatever somebody chose, and a business called Northbound
            * Analytics read "Northbound A..." at any width they happened to
            * like. A name is not a row in a list: there are two of them on the
            * screen and a second line costs nothing next to not being able to
            * read your own company's name.
            *
            * [overflow-wrap:anywhere] as well as normal wrapping, so a single
            * unbroken word longer than the column breaks instead of pushing the
            * whole sidebar wider than it was dragged to.
            */}
          <p className="md-title [overflow-wrap:anywhere]">{settings.companyName}</p>
          {/*
            A textarea rather than an input, for the same reason, since an input
            is one line by definition and cannot be told otherwise. rows={1} and
            it grows to whatever it holds.

            size={1} on the input this replaces was there because the sidebar is
            as wide as its widest row and an input's default size is about 172px
            of intrinsic width whatever is typed in it. A textarea has the same
            habit, which is what cols={1} answers.
          */}
          <textarea
            ref={subtitleRef}
            rows={1}
            cols={1}
            value={subtitle}
            onChange={(event) => {
              setSubtitle(event.target.value);
              growSubtitle(event.target);
            }}
            onBlur={() => {
              if (subtitle !== settings.companySubtitle) {
                void updateSettings({ companySubtitle: subtitle });
              }
            }}
            onKeyDown={(event) => {
              // A subtitle is one thing, not a paragraph, so Enter finishes it
              // rather than adding a line nobody asked for.
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
            aria-label="Company subtitle"
            placeholder="Add a subtitle…"
            className={cx(
              "md-label-sm w-full resize-none overflow-hidden rounded border border-transparent",
              "bg-transparent px-1 py-0.5 -ml-1 text-on-variant transition-colors",
              "hover:border-outline-variant focus:border-primary focus:outline-none",
            )}
          />
        </div>
      </div>

      {onOpenSearch ? (
        <div className="px-4 pb-3">
          <button
            onClick={(event) => {
              createRipple(event);
              onOpenSearch();
            }}
            className="md-state flex h-10 w-full items-center gap-2.5 rounded-xl border border-outline-variant px-3 text-on-variant"
          >
            <SearchIcon className="h-4 w-4 flex-none" />
            <span className="md-body flex-1 text-left">Search</span>
            {/* Hidden on compact: the drawer is the only place this shows on a
                phone, and a phone has no key to press. It also has to say what
                the shortcut actually is, which is a setting. */}
            {settings.searchShortcut === "none" ? null : (
              <kbd className="md-label-sm hidden rounded border border-outline-variant px-1.5 py-0.5 medium:inline">
                {settings.searchShortcut === "k" ? "K" : "/"}
              </kbd>
            )}
          </button>
        </div>
      ) : null}

      <div className="px-4 pb-4">
        <button
          onClick={(event) => {
            createRipple(event);
            void handleNewConversation();
          }}
          className="md-state flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-primary-container text-on-primary-container shadow-e1 transition-shadow hover:shadow-e2"
        >
          <PlusIcon className="h-4 w-4" />
          <span className="md-label">New Conversation</span>
        </button>
      </div>

      {/* Sections are data rather than markup in a fixed order, so the drawer
          can be rearranged and pruned per browser. Hiding one only removes it
          from here: search, the bottom bar, and the URL still reach every
          destination, so this can never strand a page. */}
      <SidebarSections
        sections={{
    work: {
      label: "Work",
      content: (
        <>
              <ul className="mb-5 space-y-0.5">
                {workLinks.filter((link) => canOpenPath(link.href)).map((link) => (
                  <li key={link.href}>
                    <NavRow
                      href={link.href}
                      active={isActive(pathname, link.href)}
                      onNavigate={onNavigate}
                    >
                      <span className="relative text-on-variant [&>svg]:h-4 [&>svg]:w-4">
                        {link.icon}
                        {link.href === "/inbox" ? (
                          <NavBadge count={unread} label={`${unread} unread messages`} />
                        ) : null}
                      </span>
                      <span className="md-body truncate">{link.label}</span>
                    </NavRow>
                  </li>
                ))}
              </ul>
        </>
      ),
    },
    departments: {
      label: "Departments",
      count: visibleHeads.length,
      content: (
        <>
              <ul className="mb-5 space-y-0.5">
                {/*
                  * The orchestrator leads the heads rather than sitting in Work
                  * with the screens.
                  *
                  * It was in that list because it is a destination, and it read
                  * as one: a row identical to Dashboard and Meetings. It is a
                  * person, it is the first one anybody should talk to, and once
                  * it had a face it stopped belonging beside a set of pages.
                  */}
                {legacy ? null : orchestrator && canOpenHead(orchestrator.id) ? (
                  <li>
                    <NavRow
                      href="/orchestrator"
                      active={pathname === "/orchestrator"}
                      onNavigate={onNavigate}
                    >
                      {/*
                        * The name of the job, like every row under it.
                        *
                        * This used to carry the persona and the role title
                        * together, "Ruth" beside "CHIEF OF STAFF", and the role
                        * was the half that could not shrink. So the name took
                        * the whole squeeze and the row read "R  CHIEF OF STAFF":
                        * the least useful text at full width, the most useful
                        * cut to one letter.
                        *
                        * Its siblings all say what a head is for rather than
                        * what it is called, and the face already says who. The
                        * persona is on the hover and on the page itself.
                        */}
                      <DepartmentAvatar department={orchestrator} size={20} />
                      <span
                        title={
                          orchestrator.personaName
                            ? `${orchestrator.personaName}, ${orchestrator.roleTitle}`
                            : orchestrator.roleTitle
                        }
                        className="md-body min-w-0 flex-1 truncate font-medium"
                      >
                        {orchestrator.name}
                      </span>
                      <StatusDot status={statusOf(orchestrator.id)} />
                    </NavRow>
                  </li>
                ) : null}
                {!ready && visibleHeads.length === 0 ? (
                  <li className="md-body px-3 py-2 text-on-variant/75">Loading…</li>
                ) : null}
                {visibleHeads.map((department) => (
                  <li key={department.id}>
                    <NavRow
                      href={departmentHref(department)}
                      active={activeDepartmentId === department.id}
                      onNavigate={onNavigate}
                    >
                      <DepartmentAvatar department={department} size={20} />
                      <span className="md-body min-w-0 flex-1 truncate">{department.name}</span>
                      <span
                        title={`${ownSkillsFor(department.id).length} skills`}
                        className="md-label-sm rounded-md bg-highest px-1.5 py-0.5 text-on-variant"
                      >
                        {ownSkillsFor(department.id).length}
                      </span>
                      <StatusDot status={statusOf(department.id)} />
                    </NavRow>
                  </li>
                ))}
              </ul>
        </>
      ),
    },
    personal: personalDepartments.length ? {
      label: "Yours",
      content: (
        <>
                  <ul className="mb-5 space-y-0.5">
                    {personalDepartments.map((department) => (
                      <li key={department.id}>
                        <NavRow
                          href={departmentHref(department)}
                          active={activeDepartmentId === department.id}
                          onNavigate={onNavigate}
                        >
                          <DepartmentAvatar department={department} size={20} />
                          <span className="md-body min-w-0 flex-1 truncate">
                            {department.personaName || department.name}
                          </span>
                          <StatusDot status={statusOf(department.id)} />
                        </NavRow>
                      </li>
                    ))}
                  </ul>
        </>
      ),
    } : undefined,
    /*
     * No recent conversations here: a department opens to its own list, so
     * this would be the same threads in a narrower column.
     */
    /*
     * Reference, on the legacy layout only.
     *
     * It held Library and Information, and it dissolved when Information
     * became a band on the dashboard and left it with one row. Both are back
     * here together, which is the arrangement that made the group worth having.
     */
    ...(legacy
      ? {
          reference: {
            label: "Reference",
            content: (
              <ul className="mb-5 space-y-0.5">
                {LEGACY_REFERENCE_LINKS.filter((link) => canOpenPath(link.href)).map(
                  (link) => (
                    <li key={link.href}>
                      <NavRow
                        href={link.href}
                        active={isActive(pathname, link.href)}
                        onNavigate={onNavigate}
                      >
                        <span className="relative text-on-variant [&>svg]:h-4 [&>svg]:w-4">
                          {link.icon}
                        </span>
                        <span className="md-body truncate">{link.label}</span>
                      </NavRow>
                    </li>
                  ),
                )}
              </ul>
            ),
          },
        }
      : {}),
        }}
      />

      {/*
        A maker's mark, not a banner. It sits outside the scrolling nav so it is
        always at the foot of the drawer, and at 40% it reads as a signature
        rather than as another row somebody has to look past. The rail does not
        get one: it is icons wide, and there is nowhere for this to go that is
        not in the way.

        The year is computed rather than written down so it does not quietly go
        stale. suppressHydrationWarning covers the one second a year where a
        server rendered in the old year could meet a browser loading in the new.
      */}
      <p
        suppressHydrationWarning
        className="md-label-sm flex-none px-5 pb-4 pt-1 text-on-variant/40"
      >
        &copy; {new Date().getFullYear()} Eterneon
      </p>
    </>
  );
}

const COLLAPSE_KEY = "eterneon.nav.collapsed";

const CLOSED_BY_DEFAULT = new Set(["workspace", "setup"]);

function readCollapsed(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(COLLAPSE_KEY) ?? "{}") as Record<string, boolean>;
  } catch {
    return {};
  }
}

/**
 * A section that remembers whether it is open.
 *
 * Per browser rather than per account: which parts of the navigation someone
 * keeps shut is a property of how they work on that screen, not something worth
 * syncing to another device.
 */
interface SectionSpec {
  label: string;
  count?: number;
  content: ReactNode;
}

/**
 * The drawer's sections, in the order they are declared.
 *
 * They used to be reorderable and hideable, behind an "Edit menu" toggle that
 * turned every header into a drag handle. Four sections, none of which anybody
 * had a reason to put in a different order, and the control sat at the bottom
 * of the navigation on every screen advertising itself. It cost a store, a drag
 * implementation, a second mode for the headers, and a Reset button, to arrange
 * a list that reads Work, Departments, Personal, Recent in the only order those
 * four make sense in.
 *
 * What is left is what people actually used: each section still folds, and
 * still remembers whether it is folded. Anybody who had hidden a section will
 * see it again, which is the honest consequence of taking the feature out.
 */
function SidebarSections({
  sections,
}: {
  sections: Partial<Record<string, SectionSpec | undefined>>;
}) {
  return (
    <nav className="flex-1 overflow-y-auto px-3 pb-6">
      {Object.entries(sections).map(([id, spec]) =>
        spec ? (
          <Section key={id} id={id} label={spec.label} count={spec.count}>
            {spec.content}
          </Section>
        ) : null,
      )}
    </nav>
  );
}

function Section({
  id,
  label,
  count,
  children,
}: {
  id: string;
  label: string;
  count?: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const stored = readCollapsed()[id];
    // Reference and Setup start shut. They are opened when something needs
    // changing, and leaving them open is most of what made the menu long.
    setOpen(stored === undefined ? !CLOSED_BY_DEFAULT.has(id) : stored !== true);
  }, [id]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      window.localStorage.setItem(
        COLLAPSE_KEY,
        JSON.stringify({ ...readCollapsed(), [id]: !next }),
      );
    } catch {
      // Private browsing. The section still toggles for this session.
    }
  };

  return (
    <>
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="md-state md-label-sm flex flex-1 items-center gap-1.5 rounded-lg px-3 pb-1.5 pt-2 text-left text-on-variant/75 transition-colors"
        >
          <ChevronIcon
            className={cx(
              "h-3 w-3 flex-none transition-transform duration-150",
              open ? "rotate-90" : "rotate-0",
            )}
          />
          <span className="flex-1">{label}</span>
          {count === undefined ? null : (
            <span className="font-normal normal-case tracking-normal opacity-60">{count}</span>
          )}
        </button>
      </div>
      {open ? children : null}
    </>
  );
}

function NavRow({
  href,
  active,
  onNavigate,
  children,
}: {
  href: string;
  active: boolean;
  onNavigate?: () => void;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={(event) => {
        createRipple(event);
        onNavigate?.();
      }}
      className={cx(
        "md-state flex items-center gap-2.5 rounded-xl px-3 py-2 transition-colors",
        active ? "bg-secondary-container text-on-secondary-container" : "text-on-surface",
      )}
    >
      {children}
    </Link>
  );
}
