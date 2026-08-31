"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/store";
import { cx } from "./ui";
import { createRipple } from "./ui/ripple";

/**
 * Files, deliverables, and skills are all "things the studio keeps", so they
 * share one destination and one tab bar rather than three sidebar entries.
 */
export function LibraryTabs() {
  const pathname = usePathname();
  const { files, deliverables, skills } = useStore();

  const tabs = [
    { href: "/library", label: "Files", count: files.length },
    { href: "/library/deliverables", label: "Deliverables", count: deliverables.length },
    { href: "/library/skills", label: "Skills", count: skills.length },
  ];

  return (
    <nav className="flex flex-none gap-1 overflow-x-auto border-b border-outline-variant px-4 medium:px-6 expanded:px-8">
      {tabs.map((tab) => {
        // /library must not light up for its own children.
        const active = tab.href === "/library" ? pathname === "/library" : pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            onClick={createRipple}
            aria-current={active ? "page" : undefined}
            className={cx(
              "md-state relative flex flex-none items-center gap-2 px-3 py-3 transition-colors",
              active ? "text-primary" : "text-on-variant",
            )}
          >
            <span className="md-label">{tab.label}</span>
            <span
              className={cx(
                "md-label-sm rounded-md px-1.5 py-0.5",
                active ? "bg-primary-container text-on-primary-container" : "bg-highest",
              )}
            >
              {tab.count}
            </span>
            {active ? (
              <span
                aria-hidden
                className="absolute inset-x-2 bottom-0 h-0.5 rounded-t-full bg-primary"
              />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
