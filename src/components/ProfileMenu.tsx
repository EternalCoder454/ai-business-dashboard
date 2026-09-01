"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  BookIcon,
  BuildingIcon,
  GearIcon,
  PersonIcon,
  ShieldIcon,
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
  { href: "/account", label: "Account", icon: <PersonIcon className="h-4 w-4" /> },
  { href: "/settings", label: "Settings", icon: <GearIcon className="h-4 w-4" /> },
  { href: "/onboarding", label: "Internal wiki", icon: <BookIcon className="h-4 w-4" /> },
];

export function ProfileMenu() {
  const { account, isAdmin, accountEmail } = useStore();
  const notifications = useNotifications();
  const pathname = usePathname();

  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

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

        {notifications.length > 0 ? (
          <span
            aria-hidden
            className={cx(
              "absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full px-1",
              "text-[0.625rem] font-semibold leading-none",
              urgent > 0
                ? "bg-error text-on-error"
                : "bg-primary-container text-on-primary-container",
            )}
          >
            {notifications.length}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="menu"
          className={cx(
            "absolute right-0 top-12 z-50 w-72 overflow-hidden rounded-2xl",
            "border border-outline-variant bg-container shadow-e3",
          )}
        >
          <div className="border-b border-outline-variant px-4 py-3">
            <p className="md-label truncate">{name}</p>
            {accountEmail ? (
              <p className="md-label-sm truncate text-on-variant/75">{accountEmail}</p>
            ) : null}
          </div>

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
            {[...LINKS, ...(isAdmin ? [ADMIN] : [])].map((link) => (
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
            <form action={signOutAction} className="border-t border-outline-variant p-2">
              <button
                type="submit"
                role="menuitem"
                className="md-state w-full rounded-lg px-2 py-2 text-left text-on-variant"
              >
                <span className="md-body">Sign out</span>
              </button>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const ADMIN = {
  href: "/admin",
  label: "Admin",
  icon: <ShieldIcon className="h-4 w-4" />,
};
