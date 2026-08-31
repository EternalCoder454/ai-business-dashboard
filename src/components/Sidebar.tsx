"use client";

import Link from "next/link";
import { DepartmentAvatar } from "./DepartmentAvatar";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { CompanyMark } from "./CompanyMark";
import { CEO_ID } from "@/lib/seed";
import { conversationHref, departmentHref, formatRelativeTime } from "@/lib/routes";
import { useMessages } from "@/lib/messages";
import { useStore } from "@/lib/store";
import {
  BriefcaseIcon,
  BuildingIcon,
  ChevronIcon,
  BookIcon,
  DocIcon,
  FolderIcon,
  GearIcon,
  MailIcon,
  NavBadge,
  OrgIcon,
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
    label: "CEO Office",
    short: "CEO",
    icon: <BriefcaseIcon className="h-5 w-5" />,
  },
  { href: "/", label: "Org Chart", short: "Org", icon: <OrgIcon className="h-5 w-5" /> },
  {
    href: "/all-hands",
    label: "All Hands",
    short: "Room",
    icon: <UsersIcon className="h-5 w-5" />,
  },
  {
    href: "/messages",
    label: "Inbox",
    short: "Inbox",
    icon: <MailIcon className="h-5 w-5" />,
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
    label: "Start here",
    short: "Start",
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

/** The permanent drawer, shown from the large window size class up. */
export function Sidebar({ onOpenSearch }: { onOpenSearch?: () => void }) {
  return (
    <aside className="hidden h-full w-[17.5rem] flex-none flex-col border-r border-outline-variant bg-low large:flex">
      <SidebarContent onOpenSearch={onOpenSearch} />
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
    isAdmin,
    personalDepartments,
  } = useStore();
  const { unread } = useMessages();

  const setupLinks = isAdmin ? [...SETUP_LINKS, ADMIN_LINK] : SETUP_LINKS;

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
        <CompanyMark size={40} />
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
            <kbd className="md-label-sm rounded border border-outline-variant px-1.5 py-0.5">
              /
            </kbd>
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

      <nav className="flex-1 overflow-y-auto px-3 pb-6">
        <Section id="work" label="Work">
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
        </Section>

        <Section id="workspace" label="Reference">
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
        </Section>

        <Section id="setup" label="Setup">
          <ul className="mb-5 space-y-0.5">
            {setupLinks.map((link) => (
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
        </Section>

        <Section id="departments" label="Departments" count={departments.length}>
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
                <StatusDot status={department.status} />
              </NavRow>
            </li>
          ))}
        </ul>
        </Section>

        {personalDepartments.length ? (
          <>
            <Section id="personal" label="Yours">
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
                    <StatusDot status={department.status} />
                  </NavRow>
                </li>
              ))}
            </ul>
            </Section>
          </>
        ) : null}

        <Section id="recent" label="Recent">
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
        </Section>
      </nav>
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
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="md-state md-label-sm flex w-full items-center gap-1.5 rounded-lg px-3 pb-1.5 pt-2 text-left text-on-variant/75 transition-colors"
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
