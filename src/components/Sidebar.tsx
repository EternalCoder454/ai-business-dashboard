"use client";

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
import { CEO_ID } from "@/lib/seed";
import { conversationHref, departmentHref, formatRelativeTime } from "@/lib/routes";
import { useMessages } from "@/lib/messages";
import { useDepartmentStatus } from "@/lib/presence";
import { useStore } from "@/lib/store";
import {
  BriefcaseIcon,
  BuildingIcon,
  CheckIcon,
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
  SparkIcon,
  StatusDot,
  UsersIcon,
  cx,
} from "./ui";
import { SearchIcon } from "./CommandPalette";
import { createRipple } from "./ui/ripple";

export interface NavLink {
  href: string;
  label: string;
  /** Shortened for the rail and the bottom bar, where width is scarce. */
  short: string;
  icon: ReactNode;
}

export const WORK_LINKS: NavLink[] = [
  {
    href: "/ceo",
    label: "Chief of Staff",
    short: "Staff",
    icon: <BriefcaseIcon className="h-5 w-5" />,
  },
  {
    href: "/",
    label: "Dashboard",
    short: "Home",
    icon: <DashboardIcon className="h-5 w-5" />,
  },
  {
    href: "/all-hands",
    label: "Ask Everyone",
    short: "Everyone",
    icon: <UsersIcon className="h-5 w-5" />,
  },
  {
    href: "/messages",
    label: "Inbox",
    short: "Inbox",
    icon: <MailIcon className="h-5 w-5" />,
  },
  {
    href: "/tasks",
    label: "Tasks",
    short: "Tasks",
    icon: <CheckIcon className="h-5 w-5" />,
  },
  {
    href: "/projects",
    label: "Projects",
    short: "Projects",
    icon: <FolderIcon className="h-5 w-5" />,
  },
];

/** Reference: things you read rather than do. */
export const WORKSPACE_LINKS: NavLink[] = [
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
    href: "/onboarding",
    label: "Internal Wiki",
    short: "Wiki",
    icon: <BookIcon className="h-5 w-5" />,
  },
];

/** The five destinations that fit a navigation rail or a bottom bar. */
/** Only shown to an administrator, and never in the bottom bar. */
const ADMIN_LINK: NavLink = {
  href: "/admin",
  label: "Admin",
  short: "Admin",
  icon: <ShieldIcon className="h-5 w-5" />,
};

/** Everything, for search and for anything that needs the full list. */
export const COMPANY_LINKS: NavLink[] = [
  ...WORK_LINKS,
  ...WORKSPACE_LINKS,
  ...SETUP_LINKS,
];

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
  collapsed,
  onCollapse,
}: {
  onOpenSearch?: () => void;
  collapsed?: boolean;
  onCollapse?: () => void;
}) {
  return (
    <aside
      className={cx(
        "hidden h-full w-[17.5rem] flex-none flex-col border-r border-outline-variant bg-low",
        !collapsed && "large:flex",
      )}
    >
      <SidebarContent onOpenSearch={onOpenSearch} onCollapse={onCollapse} />
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
  onCollapse,
}: {
  onNavigate?: () => void;
  onOpenSearch?: () => void;
  /** Only passed by the permanent drawer. The modal one has nothing to collapse to. */
  onCollapse?: () => void;
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
    isAdmin,
    personalDepartments,
    serverKey,
  } = useStore();
  const { unread } = useMessages();

  // A dot that always says Online is worse than no dot. This one reflects
  // whether a request could actually succeed, and whether one is in flight.
  const statusOf = useDepartmentStatus(Boolean(serverKey || settings.apiKey));


  const [subtitle, setSubtitle] = useState(settings.companySubtitle);

  useEffect(() => {
    setSubtitle(settings.companySubtitle);
  }, [settings.companySubtitle]);

  const activeDepartmentId = pathname.startsWith("/dept/")
    ? decodeURIComponent(pathname.slice("/dept/".length).split("/")[0])
    : pathname === "/ceo"
      ? CEO_ID
      : undefined;

  const handleNewConversation = async () => {
    const targetId = activeDepartmentId ?? CEO_ID;
    const conversation = await createConversation(targetId);
    router.push(conversationHref(targetId, conversation.id));
    onNavigate?.();
  };

  const recent = conversations.filter((c) => c.messages.length > 0).slice(0, 24);

  return (
    <>
      <div className="flex items-start gap-3 px-5 pb-4 pt-5">
        {onCollapse ? (
          <button
            onClick={(event) => {
              createRipple(event);
              onCollapse();
            }}
            aria-label="Collapse the sidebar"
            title="Collapse the sidebar"
            className={cx(
              "md-state group relative grid flex-none place-items-center rounded-xl",
              "transition-transform active:scale-95",
            )}
          >
            <CompanyMark size={40} />
            {/* Shown on hover only. The mark is the workspace's identity first
                and a control second, so the affordance should not compete with
                it at rest. */}
            <span
              aria-hidden
              className={cx(
                "pointer-events-none absolute inset-0 grid place-items-center rounded-xl",
                "bg-highest/85 text-on-surface opacity-0 transition-opacity",
                "group-hover:opacity-100 group-focus-visible:opacity-100",
              )}
            >
              <ChevronIcon className="h-4 w-4 rotate-180" />
            </span>
          </button>
        ) : (
          <CompanyMark size={40} />
        )}
        <div className="min-w-0 flex-1">
          <p className="md-title truncate">{settings.companyName}</p>
          <input
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
                {WORK_LINKS.map((link) => (
                  <li key={link.href}>
                    <NavRow
                      href={link.href}
                      active={isActive(pathname, link.href)}
                      onNavigate={onNavigate}
                    >
                      <span className="relative text-on-variant [&>svg]:h-4 [&>svg]:w-4">
                        {link.icon}
                        {link.href === "/messages" ? (
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
    workspace: {
      label: "Reference",
      content: (
        <>
                <ul className="mb-5 space-y-0.5">
                  {WORKSPACE_LINKS.map((link) => (
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
                  ))}
                </ul>
        </>
      ),
    },
    departments: {
      label: "Departments",
      count: departments.length,
      content: (
        <>
              <ul className="mb-5 space-y-0.5">
                {!ready && departments.length === 0 ? (
                  <li className="md-body px-3 py-2 text-on-variant/75">Loading…</li>
                ) : null}
                {departments.map((department) => (
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
    recent: {
      label: "Recent",
      content: (
        <>
              {recent.length === 0 ? (
                <p className="md-body px-3 py-2 text-on-variant/75">
                  Conversations you start will show up here.
                </p>
              ) : (
                <ul className="space-y-0.5">
                  {recent.map((conversation) => {
                    const department = allDepartments.find(
                      (d) => d.id === conversation.departmentId,
                    );
                    return (
                      <li key={conversation.id}>
                        <NavRow
                          href={conversationHref(conversation.departmentId, conversation.id)}
                          active={false}
                          onNavigate={onNavigate}
                        >
                          {department ? (
                            <DepartmentAvatar department={department} size={18} />
                          ) : (
                            <span className="h-4.5 w-4.5 flex-none rounded-full bg-high" />
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="md-body block truncate">{conversation.title}</span>
                            <span className="md-label-sm block truncate text-on-variant/75">
                              {department?.name ?? "Archived"} ·{" "}
                              {formatRelativeTime(conversation.updatedAt)}
                            </span>
                          </span>
                        </NavRow>
                      </li>
                    );
                  })}
                </ul>
              )}
        </>
      ),
    },
        }}
      />
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
