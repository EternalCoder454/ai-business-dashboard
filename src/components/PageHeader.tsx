"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ProfileMenu } from "./ProfileMenu";
import { routeTitle } from "@/lib/routes";
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
  /*
   * Whether the top app bar is already showing this exact word.
   *
   * It usually is: the bar names the destination and most pages then head
   * themselves with the same name, so a phone said "Tasks" and then said
   * "Tasks" underneath it. But not always, and the first version of this hid
   * the heading unconditionally, which took "Eterneon" off the dashboard where
   * the bar says "Dashboard" and the two were never the same thing. So it asks
   * rather than assumes.
   */
  const pathname = usePathname();
  const repeated = routeTitle(pathname) === title;

  /*
   * Whether this header draws anything on a phone.
   *
   * The eyebrow is hidden there, and where the heading is a repeat it is about
   * to be, so a header with neither a description nor buttons would be four
   * pixels of padding and a rule across the screen: a line that looks like a
   * mistake. Settings is exactly that.
   */
  const quiet = repeated && !description && !actions;

  return (
    <header
      className={cx(
        "flex flex-none flex-wrap items-center justify-between gap-x-3 gap-y-2",
        /*
          * Three rows of chrome became one.
          *
          * This was 105px on a 860px screen, an eighth of it, before a page had
          * said anything: 48 of padding, a line naming the section that the
          * navigation is already highlighting, and a 28px heading. On the
          * dashboard the heading was the company name, which is also the first
          * thing in the sidebar, so the top of the screen said where you were
          * twice and who you were twice.
          *
          * The section label sits on the heading's line now instead of above
          * it, and the padding is a third of what it was. It comes to about 60.
          */
        "medium:border-b medium:border-outline-variant medium:px-6 medium:py-3 expanded:px-8",
        quiet ? "p-0" : "border-b border-outline-variant px-4 py-3",
      )}
    >
      {/* A basis rather than a fixed width: the heading and the actions share
          a line while both fit, and the actions drop to their own line once
          they do not. 10rem is about where a title starts looking cramped. */}
      <div className="min-w-0 flex-1 basis-40">
        {/*
          * The label above the heading, not beside it.
          *
          * Putting them on one line saved a row and read as one broken
          * sentence: "DASHBOARD Northbound Analytics", two different things in
          * two different sizes running together with nothing between them. A
          * label belongs over the thing it labels. The room came from the
          * padding and the type size instead, which is where it should have
          * come from, and the header is still a third shorter than it was.
          */}
        {eyebrow ? (
          <span className="md-label-sm hidden leading-tight text-primary medium:block">
            {eyebrow}
          </span>
        ) : null}
        {/*
          * Announced on a phone, not drawn, when the bar has already said it.
          *
          * The bar is the one that stays, because it belongs to the shell and
          * is on every screen; but a page still needs a heading to navigate by,
          * so the h1 goes on being an h1 and only stops taking up room.
          */}
        <h1
          className={cx(
            "md-title-lg min-w-0 truncate leading-tight",
            repeated && "sr-only medium:not-sr-only",
          )}
        >
          {title}
        </h1>
        {description ? (
          <p className="md-body mt-1 text-on-variant">{description}</p>
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
