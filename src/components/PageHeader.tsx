"use client";

import type { ReactNode } from "react";
import { ProfileMenu } from "./ProfileMenu";
import { cx } from "./ui";

/**
 * The heading every page opens with, and the account menu beside it.
 *
 * Kept out of the ui module because it renders ProfileMenu, which imports its
 * icons back from there. Two modules importing each other means whichever
 * evaluates first sees the other half-built, and the icons come back
 * undefined.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-outline-variant px-4 py-4 medium:px-6 medium:py-6 expanded:px-8">
      <div className="min-w-0">
        {/* The top app bar already names the section on compact, so repeating
            it here is a line of screen spent saying nothing. */}
        {eyebrow ? (
          <p className="md-label-sm mb-1 hidden text-primary medium:block">{eyebrow}</p>
        ) : null}
        <h1 className="md-headline">{title}</h1>
        {description ? (
          <p className="md-body mt-1.5 text-on-variant">{description}</p>
        ) : null}
      </div>
      <div className="flex flex-none items-center gap-2">
        {actions}
        <ProfileMenu />
      </div>
    </header>
  );
}
