"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FeedbackDialog } from "./FeedbackDialog";
import {
  BookIcon,
  BuildingIcon,
  GearIcon,
  PuzzleIcon,
  ShieldIcon,
  SparkIcon,
  UsersIcon,
  cx,
} from "./ui";
import { createRipple } from "./ui/ripple";
import { signOutAction } from "@/app/auth-actions";
import { useNotifications } from "@/lib/notifications";
import { useStore } from "@/lib/store";

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
  label: "Your people",
  icon: <UsersIcon className="h-4 w-4" />,
};

export function ProfileMenu() {
  const { account, isOperator, workspaceRole, accountEmail } = useStore();
  const notifications = useNotifications();
  const pathname = usePathname();

  const [open, setOpen] = useState(false);
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
              ...LINKS,
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
                <span className="md-body">{link.label}</span>
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
  href: "/admin",
  label: "Operator",
  icon: <ShieldIcon className="h-4 w-4" />,
};
