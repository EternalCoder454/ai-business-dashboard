"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { CEO_ID } from "@/lib/seed";
import { conversationHref, departmentHref, formatRelativeTime } from "@/lib/routes";
import { useStore } from "@/lib/store";
import {
  BriefcaseIcon,
  BuildingIcon,
  DocIcon,
  GearIcon,
  OrgIcon,
  PlusIcon,
  SparkIcon,
  StatusDot,
  UsersIcon,
  cx,
} from "./ui";
import { createRipple } from "./ui/ripple";

export interface NavLink {
  href: string;
  label: string;
  /** Shortened for the rail and the bottom bar, where width is scarce. */
  short: string;
  icon: ReactNode;
}

export const COMPANY_LINKS: NavLink[] = [
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
  { href: "/skills", label: "Skills", short: "Skills", icon: <SparkIcon className="h-5 w-5" /> },
  {
    href: "/deliverables",
    label: "Deliverables",
    short: "Output",
    icon: <DocIcon className="h-5 w-5" />,
  },
  {
    href: "/profile",
    label: "Company Profile",
    short: "Profile",
    icon: <BuildingIcon className="h-5 w-5" />,
  },
  {
    href: "/settings",
    label: "Settings",
    short: "Settings",
    icon: <GearIcon className="h-5 w-5" />,
  },
];

/** The five destinations that fit a navigation rail or a bottom bar. */
export const PRIMARY_LINKS = COMPANY_LINKS.slice(0, 5);

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** The permanent drawer, shown from the large window size class up. */
export function Sidebar() {
  return (
    <aside className="hidden h-full w-[17.5rem] flex-none flex-col border-r border-outline-variant bg-low large:flex">
      <SidebarContent />
    </aside>
  );
}

/**
 * Drawer contents, shared by the permanent drawer and by the modal drawer that
 * compact, medium, and expanded windows open from the top app bar.
 */
export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const {
    ready,
    departments,
    settings,
    conversations,
    allDepartments,
    skillsFor,
    updateSettings,
    createConversation,
  } = useStore();

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
        <div className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-primary-container text-on-primary-container shadow-e1">
          <span className="text-base font-semibold tracking-tight">HQ</span>
        </div>
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
        <SectionLabel>Company</SectionLabel>
        <ul className="mb-5 space-y-0.5">
          {COMPANY_LINKS.map((link) => (
            <li key={link.href}>
              <NavRow
                href={link.href}
                active={isActive(pathname, link.href)}
                onNavigate={onNavigate}
              >
                <span className="text-on-variant [&>svg]:h-4 [&>svg]:w-4">{link.icon}</span>
                <span className="md-body truncate">{link.label}</span>
              </NavRow>
            </li>
          ))}
        </ul>

        <SectionLabel>
          Departments
          <span className="ml-auto font-normal normal-case tracking-normal opacity-60">
            {departments.length}
          </span>
        </SectionLabel>
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
                <span aria-hidden className="w-5 flex-none text-center text-base leading-none">
                  {department.emoji}
                </span>
                <span className="md-body min-w-0 flex-1 truncate">{department.name}</span>
                <span
                  title={`${skillsFor(department.id).length} skills`}
                  className="md-label-sm rounded-md bg-highest px-1.5 py-0.5 text-on-variant"
                >
                  {skillsFor(department.id).length}
                </span>
                <StatusDot status={department.status} />
              </NavRow>
            </li>
          ))}
        </ul>

        <SectionLabel>Recent Conversations</SectionLabel>
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
                    <span aria-hidden className="w-5 flex-none text-center text-sm leading-none">
                      {department?.emoji ?? "💬"}
                    </span>
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
      </nav>
    </>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="md-label-sm flex items-center px-3 pb-1.5 pt-2 text-on-variant/75">
      {children}
    </p>
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
