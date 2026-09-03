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
    <header className="flex flex-none flex-wrap items-start justify-between gap-x-3 gap-y-3 border-b border-outline-variant px-4 py-4 medium:px-6 medium:py-6 expanded:px-8">
      {/* A basis rather than a fixed width: the heading and the actions share
          a line while both fit, and the actions drop to their own line once
          they do not. 10rem is about where a title starts looking cramped. */}
      <div className="min-w-0 flex-1 basis-40">
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
      {/* Wraps rather than overflows. A phone is not wide enough to hold two
          buttons and the avatar on one line, and a group that cannot wrap
          puts the avatar off the side of the screen instead. */}
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
        {actions}
        {/* On compact the top app bar carries it, so showing it here as well
            costs a row of screen to say the same thing twice. */}
        <div className="hidden medium:block">
          <ProfileMenu />
        </div>
      </div>
    </header>
  );
}
