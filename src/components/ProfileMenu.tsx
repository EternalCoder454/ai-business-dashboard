"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FeedbackDialog } from "./FeedbackDialog";
import {
  BookIcon,
  BuildingIcon,
  DocIcon,
  GearIcon,
  PuzzleIcon,
  ShieldIcon,
  SparkIcon,
  CheckIcon,
  UsersIcon,
  cx,
} from "./ui";
import { createRipple } from "./ui/ripple";
import { signOutAction } from "@/app/auth-actions";
import { useNotifications } from "@/lib/notifications";
import { baselineChangelog, useUnseenChangelog } from "@/lib/changelogSeen";
import { useStore } from "@/lib/store";
import { setThemeChoice, useThemeChoice } from "@/lib/themeChoice";
import { setLayoutMode, useLayoutMode, type LayoutMode } from "@/lib/layoutMode";
import type { ThemeMode } from "@/lib/types";

/**
 * The account menu, in the top right of every screen.
 *
 * It holds the things you open when something needs changing rather than day
 * to day: the profile, the account, settings, the wiki, and admin. Those used
 * to be a section of the sidebar, where they sat open beside the work and made
 * the menu long.
 *
 * Notifications live here too. They were a banner across the top of the
 * dashboard, which put a standing list of chores on the first thing you see
 * every morning; a count on the avatar is visible from every page instead.
 */
const LINKS = [
  { href: "/profile", label: "Company profile", icon: <BuildingIcon className="h-4 w-4" /> },
  { href: "/settings", label: "Settings", icon: <GearIcon className="h-4 w-4" /> },
  { href: "/integrations", label: "Integrations", icon: <PuzzleIcon className="h-4 w-4" /> },
  { href: "/wiki", label: "Internal wiki", icon: <BookIcon className="h-4 w-4" /> },
  /*
   * Directly under the wiki, because both are reading and somebody looking for
   * one will look where the other is. They are not the same thing: the wiki is
   * what this business writes about itself, and this is the manual for the
   * panel, the same for every customer and shipped with the code.
   */
  { href: "/documentation", label: "Documentation", icon: <DocIcon className="h-4 w-4" /> },
  { href: "/changelog", label: "Changelog", icon: <SparkIcon className="h-4 w-4" /> },
];

/**
 * Running your own business, which is not the same job as running this
 * deployment.
 *
 * The two were briefly one entry, and since only an operator could see it,
 * every customer's administrator lost the way to add a colleague or hand over
 * the keys. They are separate rows now because they lead to separate screens
 * with separate rules about whose data they can touch.
 */
const ADMIN = {
  href: "/manage",
  label: "Management",
  icon: <UsersIcon className="h-4 w-4" />,
};

export function ProfileMenu() {
  const { account, isOperator, workspaceRole, accountEmail, canOpenPath, settings } = useStore();
  const themeChoice = useThemeChoice();
  const layout = useLayoutMode();
  const [open, setOpen] = useState(false);

  /*
   * Read after mount, not during render. localStorage does not exist on the
   * server, and reading it while rendering would make the first paint differ
   * from the markup that was sent.
   */


  /*
   * Loaded when the menu is first opened, not on mount. Almost nobody is in
   * two businesses, and every page would otherwise pay a round trip to find
   * that out.
   */
  const [workspaces, setWorkspaces] = useState<
    { workspaceId: string; name: string; role: "member" | "admin" }[]
  >([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const asked = useRef(false);

  useEffect(() => {
    if (!open || asked.current) return;
    asked.current = true;
    void fetch("/api/workspace/switch")
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { workspaces?: typeof workspaces; current?: string } | null) => {
        if (!body?.workspaces) return;
        setWorkspaces(body.workspaces);
        setWorkspaceId(body.current ?? null);
      })
      .catch(() => {
        // One business, or the request failed. Either way the section stays
        // hidden and nothing else on this menu is affected.
      });
  }, [open]);

  /*
   * A full reload rather than a refetch. Every list on screen belongs to the
   * business being left, and swapping the store underneath a rendered page is
   * how one business's conversation titles end up on another's dashboard.
   */
  const switchTo = async (id: string) => {
    if (id === workspaceId || switching) return;
    setSwitching(true);
    try {
      const response = await fetch("/api/workspace/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: id }),
      });
      if (!response.ok) {
        setSwitching(false);
        return;
      }
      window.location.assign("/");
    } catch {
      setSwitching(false);
    }
  };
  const notifications = useNotifications();
  const pathname = usePathname();
  const unseen = useUnseenChangelog();

  // A browser that has never looked starts caught up, so the badge means
  // "since you were last here" rather than "every change ever made".
  useEffect(baselineChangelog, []);

  const [confirming, setConfirming] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) setConfirming(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    // Pointerdown rather than click, so the menu is gone before whatever was
    // clicked behind it reacts.
    const onOutside = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onOutside);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onOutside);
    };
  }, [open]);

  const name = account.displayName.trim() || accountEmail || "You";
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const urgent = notifications.filter((item) => item.tone === "warning").length;

  return (
    <div ref={wrapper} className="relative flex-none">
      <button
        onClick={(event) => {
          createRipple(event);
          setOpen((value) => !value);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={
          notifications.length
            ? `Account menu, ${notifications.length} notification${notifications.length === 1 ? "" : "s"}`
            : "Account menu"
        }
        className={cx(
          "md-state md-target relative grid h-10 w-10 place-items-center rounded-full",
          "border border-outline-variant transition-colors",
          open && "border-primary",
        )}
      >
        {account.avatarUrl ? (
          // A Google avatar or a stored data URL, so next/image has nothing to do.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={account.avatarUrl}
            alt=""
            className="h-full w-full rounded-full object-cover"
          />
        ) : (
          <span className="md-label text-on-variant">{initial}</span>
        )}

      </button>

      {/* Outside the button on purpose. md-state clips to its own bounds so a
          ripple stays inside the circle, which cut the badge into a wedge. The
          ring is the page behind it, so the badge reads as sitting on top. */}
      {notifications.length > 0 ? (
        <span
          aria-hidden
          className={cx(
            "pointer-events-none absolute -right-1 -top-1 grid h-[1.125rem] min-w-[1.125rem]",
            "place-items-center rounded-full px-1 text-[0.6875rem] font-semibold leading-none",
            // The ring is meant to read as the page showing through, so it has
            // to be whatever is actually behind it. Most headers sit on the
            // surface; the top app bar does not, and sets the variable.
            "ring-2 ring-[color:var(--badge-ring,var(--md-surface))]",
            urgent > 0
              ? "bg-error text-on-error"
              : "bg-primary text-on-primary",
          )}
        >
          {notifications.length}
        </span>
      ) : null}

      {notifications.length === 0 && unseen > 0 ? (
        <span
          aria-hidden
          className={cx(
            "pointer-events-none absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full",
            "bg-primary ring-2 ring-[color:var(--badge-ring,var(--md-surface))]",
          )}
        />
      ) : null}

      {open ? (
        <div
          role="menu"
          className={cx(
            "absolute right-0 top-12 z-50 w-72 overflow-hidden rounded-2xl",
            "border border-outline-variant bg-container shadow-e3",
          )}
        >
          {/* The name is the way into the account page, so the menu does not
              print who you are and then offer a row saying the same thing. */}
          <Link
            href="/account"
            onClick={createRipple}
            role="menuitem"
            className="md-state block border-b border-outline-variant px-4 py-3"
          >
            <p className="md-label truncate">{name}</p>
            {accountEmail ? (
              <p className="md-label-sm truncate text-on-variant/75">{accountEmail}</p>
            ) : null}
          </Link>

          <div className="border-b border-outline-variant px-2 py-2">
            <p className="md-label-sm px-2 pb-1 text-on-variant/75">Notifications</p>
            {notifications.length === 0 ? (
              <p className="md-body px-2 py-1.5 text-on-variant/75">Nothing to report.</p>
            ) : (
              <ul>
                {notifications.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      onClick={createRipple}
                      role="menuitem"
                      className="md-state flex items-center gap-2.5 rounded-lg px-2 py-1.5"
                    >
                      <span
                        aria-hidden
                        className={cx(
                          "h-1.5 w-1.5 flex-none rounded-full",
                          item.tone === "warning" ? "bg-error" : "bg-primary",
                        )}
                      />
                      <span className="md-body truncate">{item.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/*
            * Only when there is somewhere to switch to.
            *
            * A person can belong to more than one business: somebody who owns a
            * company and works at another, or an accountant with two clients.
            * One membership means no choice to make, so the section is not
            * there at all rather than being a list of one.
            */}
          {workspaces.length > 1 ? (
            <div className="border-t border-outline-variant px-2 py-2">
              <p className="md-label-sm px-2 pb-1 text-on-variant/70">Workspace</p>
              {workspaces.map((space) => {
                const here = space.workspaceId === workspaceId;
                return (
                  <button
                    key={space.workspaceId}
                    role="menuitem"
                    disabled={here || switching}
                    onClick={(event) => {
                      createRipple(event);
                      void switchTo(space.workspaceId);
                    }}
                    className={cx(
                      "md-state flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left",
                      here ? "text-primary" : "text-on-variant",
                    )}
                  >
                    <BuildingIcon className="h-4 w-4 flex-none" />
                    <span className="min-w-0 flex-1">
                      <span className="md-body block truncate">{space.name}</span>
                      {space.role === "admin" ? (
                        <span className="md-label-sm block text-on-variant/70">
                          Administrator
                        </span>
                      ) : null}
                    </span>
                    {here ? <CheckIcon className="h-4 w-4 flex-none" /> : null}
                  </button>
                );
              })}
            </div>
          ) : null}

          {/*
            * Light or dark, here rather than buried in Settings.
            *
            * It was one workspace setting anybody could change, so one person
            * preferring light moved the whole business into light. What is in
            * Settings now is what the business opens as, and this is what you
            * read in. It reaches your browser and nothing else.
            *
            * Three choices, not two. Following the company is a real state and
            * not the same as having picked the colour it happens to be on: pick
            * dark today and you stay dark when the business moves to light,
            * leave it alone and you move with it.
            */}
          <div className="border-t border-outline-variant px-4 py-3">
            <p className="md-label mb-2 text-on-variant">Appearance</p>
            <div className="flex gap-1.5" role="radiogroup" aria-label="Appearance">
              {(
                [
                  { value: "light" as ThemeMode | null, label: "Light" },
                  { value: "dark" as ThemeMode | null, label: "Dark" },
                  { value: null as ThemeMode | null, label: "Company" },
                ]
              ).map((option) => (
                <button
                  key={option.label}
                  type="button"
                  role="radio"
                  aria-checked={themeChoice === option.value}
                  onClick={(event) => {
                    createRipple(event);
                    setThemeChoice(option.value);
                  }}
                  title={
                    option.value === null
                      ? `Follow the business, which is set to ${settings.theme}`
                      : undefined
                  }
                  className={cx(
                    "md-state md-label flex-1 rounded-full border px-2 py-1.5 transition-colors",
                    themeChoice === option.value
                      ? "border-primary bg-primary-container text-on-primary-container"
                      : "border-outline-variant text-on-variant hover:text-on-surface",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/*
            * Where things live, as opposed to how they look.
            *
            * Three merges moved things around over a few days, and the people
            * using it every day said the presentation had improved and the
            * arrangement had got worse. There is no reason those have to be one
            * decision, so they are not: both settings here draw the same panel,
            * with the same type and the same columns, and differ only in where
            * the destinations sit.
            *
            * Legacy is Chief of Staff in Work, Briefings as its own row, and
            * Reference back with the Library and Information in it.
            */}
          <div className="border-t border-outline-variant px-4 py-3">
            <p className="md-label mb-2 text-on-variant">Layout</p>
            <div className="flex gap-1.5" role="radiogroup" aria-label="Layout">
              {(
                [
                  { value: "modern" as LayoutMode, label: "Modern" },
                  { value: "legacy" as LayoutMode, label: "Legacy" },
                ]
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={layout === option.value}
                  onClick={(event) => {
                    createRipple(event);
                    setLayoutMode(option.value);
                  }}
                  title={
                    option.value === "legacy"
                      ? "Chief of Staff in Work, Briefings on its own, and a Reference group"
                      : "Chief of Staff leading the heads, Briefings as a tab of Tasks"
                  }
                  className={cx(
                    "md-state md-label flex-1 rounded-full border px-2 py-1.5 transition-colors",
                    layout === option.value
                      ? "border-primary bg-primary-container text-on-primary-container"
                      : "border-outline-variant text-on-variant hover:text-on-surface",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <nav className="px-2 py-2">
            {/* A button rather than a link: the form is small enough that a
                page for it would be a page to navigate back out of. */}
            <button
              onClick={(event) => {
                createRipple(event);
                setOpen(false);
                setFeedbackOpen(true);
              }}
              role="menuitem"
              className="md-state flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-on-variant"
            >
              <SparkIcon className="h-4 w-4" />
              <span className="md-body">Send feedback</span>
            </button>

            {[
              ...LINKS.filter((link) => canOpenPath(link.href)),
              ...(workspaceRole === "admin" ? [ADMIN] : []),
              ...(isOperator ? [OPERATOR] : []),
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={createRipple}
                role="menuitem"
                className="md-state flex items-center gap-2.5 rounded-lg px-2 py-2 text-on-variant"
              >
                {link.icon}
                <span className="md-body flex-1">{link.label}</span>
                {link.href === "/changelog" && unseen > 0 ? (
                  <span className="md-label-sm rounded-full bg-primary px-1.5 text-on-primary">
                    {unseen === 9 ? "9+" : unseen}
                  </span>
                ) : null}
              </Link>
            ))}
          </nav>

          {accountEmail ? (
            <div className="border-t border-outline-variant p-2">
              {confirming ? (
                // Signing out on a shared machine is the point of the button, and
                // signing out by accident on your own is the cost of it, so it
                // asks once rather than doing it on the first click.
                <div className="rounded-lg bg-error-container/40 p-2">
                  <p className="md-body mb-2 text-on-surface">
                    Sign out on this device?
                  </p>
                  <div className="flex gap-2">
                    <form action={signOutAction} className="flex-1">
                      <button
                        type="submit"
                        className="md-state w-full rounded-lg bg-error px-3 py-1.5 text-on-error"
                      >
                        <span className="md-label">Yes</span>
                      </button>
                    </form>
                    <button
                      onClick={() => setConfirming(false)}
                      className="md-state flex-1 rounded-lg border border-outline-variant px-3 py-1.5"
                    >
                      <span className="md-label">No</span>
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={(event) => {
                    createRipple(event);
                    setConfirming(true);
                  }}
                  role="menuitem"
                  className="md-state w-full rounded-lg px-2 py-2 text-left text-error"
                >
                  <span className="md-body">Sign out</span>
                </button>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </div>
  );
}

const OPERATOR = {
  href: "/operator",
  label: "Operator",
  icon: <ShieldIcon className="h-4 w-4" />,
};
