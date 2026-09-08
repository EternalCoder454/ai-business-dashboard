"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Chip, GearIcon, PersonIcon, cx } from "@/components/ui";

/**
 * The two halves of the account page.
 *
 * Real routes rather than a query parameter, unlike the Settings tabs, because
 * these are two different pages: one is who you are and how the heads should
 * write to you, and the other is how this browser is arranged. A link is also
 * the thing somebody can bookmark or be sent.
 *
 * Which side the navigation sits on and which key opens search used to live on
 * the Settings page as workspace columns anybody could write, so a left-hander
 * moving the navigation moved it for the whole company. They are held in the
 * browser now, beside the theme and the density, which is where a fact about
 * one person's machine belongs.
 */
const TABS = [
  { href: "/account", label: "Account", icon: <PersonIcon className="h-4 w-4" /> },
  { href: "/account/settings", label: "Settings", icon: <GearIcon className="h-4 w-4" /> },
];

export function AccountTabs() {
  const pathname = usePathname();

  return (
    <div
      className={cx(
        "flex flex-none items-center gap-2 border-b border-outline-variant page-x py-3",
        "overflow-x-auto [scrollbar-width:none] [&>*]:flex-none [&::-webkit-scrollbar]:hidden",
      )}
    >
      {TABS.map((tab) => {
        const selected = pathname === tab.href;
        return (
          <Link key={tab.href} href={tab.href}>
            <Chip selected={selected} title={tab.label} ariaLabel={tab.label}>
              <span className="flex items-center gap-1.5">
                {tab.icon}
                {tab.label}
              </span>
            </Chip>
          </Link>
        );
      })}
    </div>
  );
}
