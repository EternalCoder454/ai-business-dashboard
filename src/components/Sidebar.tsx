"use client";

import { hasKeyFor } from "@/lib/hasKey";
import Link from "next/link";
import { DepartmentAvatar } from "./DepartmentAvatar";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  moveNavSection,
  resetNavLayout,
  toggleNavSection,
  useNavLayout,
  type NavSectionId,
} from "@/lib/navLayout";
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
        "hidden h-full min-w-[13rem] max-w-[25rem] flex-none flex-col",
        stored.width === undefined && "w-fit",
        "relative border-r border-outline-variant bg-low",
        !folded && "large:flex",
      )}
      style={wide && stored.width !== undefined ? { width } : undefined}
    >
      <SidebarContent onOpenSearch={onOpenSearch} />

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
          <PaneFoldButton id="nav" label="the navigation" />
        </>
      ) : null}
    </aside>
  );
}

/**
 * Drawer contents, shared by the permanent drawer and by the modal drawer that
 * compact, medium, and expanded windows open from the top app bar.
 */
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

  return (
    <>
      {/* Just the mark. It used to be the fold button, with a chevron that
          appeared over it on hover and a logo the rest of the time, so the only
          people who knew the sidebar folded were the ones who had been told.
          Folding is the same control every other pane has now. */}
      <div className="flex items-start gap-3 px-5 pb-4 pt-5">
        <CompanyMark size={40} />
        <div className="min-w-0 flex-1">
          <p className="md-title truncate">{settings.companyName}</p>
          {/*
            size={1} because the sidebar is now as wide as its widest row, and
            an input's default is size={20}: about 172px of intrinsic width
            whatever is typed in it, which with the mark and the gutters came to
            264 and was single handedly setting the width of the whole column.
            It is w-full, so it still fills whatever row it ends up in.
          */}
          <input
            size={1}
            value={subtitle}
            onChange={(event) => setSubtitle(event.target.value)}
            onBlur={() => {
              if (subtitle !== settings.companySubtitle) {
                void updateSettings({ companySubtitle: subtitle });
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            aria-label="Company subtitle"
            placeholder="Add a subtitle…"
            className={cx(
              "md-label-sm w-full truncate rounded border border-transparent bg-transparent",
              "px-1 py-0.5 -ml-1 text-on-variant transition-colors",
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
                {WORK_LINKS.filter((link) => canOpenPath(link.href)).map((link) => (
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
                {orchestrator && canOpenHead(orchestrator.id) ? (
                  <li>
                    <NavRow
                      href="/orchestrator"
                      active={pathname === "/orchestrator"}
                      onNavigate={onNavigate}
                    >
                      <DepartmentAvatar department={orchestrator} size={20} />
                      <span className="md-body min-w-0 flex-1 truncate font-medium">
                        {orchestrator.personaName || orchestrator.name}
                      </span>
                      <span className="md-label-sm flex-none text-on-variant/60">
                        {orchestrator.roleTitle}
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
 * The drawer's sections, in whatever order this browser has put them.
 *
 * Reordering is HTML5 drag and drop rather than a library: there are six
 * items, they only move vertically, and a pointer-events implementation would
 * be more code than the feature. Editing is behind a toggle so a stray drag
 * while navigating cannot rearrange the menu.
 */
function SidebarSections({
  sections,
}: {
  sections: Partial<Record<NavSectionId, SectionSpec | undefined>>;
}) {
  const layout = useNavLayout();
  const [editing, setEditing] = useState(false);
  const [dragging, setDragging] = useState<NavSectionId | null>(null);

  const present = layout.order.filter((id) => sections[id]);
  const visible = editing ? present : present.filter((id) => !layout.hidden.includes(id));
  const hiddenCount = present.filter((id) => layout.hidden.includes(id)).length;

  return (
    <nav className="flex-1 overflow-y-auto px-3 pb-6">
      {visible.map((id, index) => {
        const spec = sections[id];
        if (!spec) return null;
        const isHidden = layout.hidden.includes(id);
        return (
          <div
            key={id}
            draggable={editing}
            onDragStart={() => setDragging(id)}
            onDragEnd={() => setDragging(null)}
            onDragOver={(event) => {
              if (!editing || !dragging || dragging === id) return;
              event.preventDefault();
            }}
            onDrop={(event) => {
              if (!editing || !dragging || dragging === id) return;
              event.preventDefault();
              moveNavSection(dragging, layout.order.indexOf(id));
              setDragging(null);
            }}
            className={cx(
              editing && "rounded-xl border border-dashed border-outline-variant/70 mb-1",
              dragging === id && "opacity-40",
              isHidden && "opacity-50",
            )}
          >
            <Section
              id={id}
              label={spec.label}
              count={spec.count}
              editing={editing}
              hidden={isHidden}
              onToggleHidden={() => toggleNavSection(id)}
            >
              {spec.content}
            </Section>
          </div>
        );
      })}

      <div className="mt-2 flex items-center gap-2 px-3">
        <button
          type="button"
          onClick={() => setEditing((value) => !value)}
          className="md-state md-label-sm rounded-lg px-2 py-1 text-on-variant/75"
        >
          {editing ? "Done" : "Edit menu"}
        </button>
        {editing ? (
          <button
            type="button"
            onClick={resetNavLayout}
            className="md-state md-label-sm rounded-lg px-2 py-1 text-on-variant/75"
          >
            Reset
          </button>
        ) : hiddenCount > 0 ? (
          <span className="md-label-sm text-on-variant/60">{hiddenCount} hidden</span>
        ) : null}
      </div>
    </nav>
  );
}

function Section({
  id,
  label,
  count,
  editing,
  hidden,
  onToggleHidden,
  children,
}: {
  id: string;
  label: string;
  count?: number;
  /** While the menu is being rearranged, the header is a handle, not a toggle. */
  editing?: boolean;
  hidden?: boolean;
  onToggleHidden?: () => void;
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
          onClick={editing ? onToggleHidden : toggle}
          aria-expanded={editing ? undefined : open}
          aria-pressed={editing ? !hidden : undefined}
          title={editing ? (hidden ? `Show ${label}` : `Hide ${label}`) : undefined}
          className="md-state md-label-sm flex flex-1 items-center gap-1.5 rounded-lg px-3 pb-1.5 pt-2 text-left text-on-variant/75 transition-colors"
        >
          {editing ? (
            // Six dots, the ordinary sign that a thing can be dragged.
            <span aria-hidden className="flex-none text-on-variant/60">
              ⠿
            </span>
          ) : (
            <ChevronIcon
              className={cx(
                "h-3 w-3 flex-none transition-transform duration-150",
                open ? "rotate-90" : "rotate-0",
              )}
            />
          )}
          <span className={cx("flex-1", hidden && "line-through")}>{label}</span>
          {editing ? (
            <span className="font-normal normal-case tracking-normal opacity-70">
              {hidden ? "Hidden" : "Shown"}
            </span>
          ) : count === undefined ? null : (
            <span className="font-normal normal-case tracking-normal opacity-60">{count}</span>
          )}
        </button>
      </div>
      {/* Headers only while rearranging. Six rows fit on one screen and can
          be dragged without scrolling; the expanded menu cannot. */}
      {editing ? null : open ? children : null}
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
