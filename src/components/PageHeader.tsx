"use client";

import { useEffect, type ReactNode } from "react";
import { setPageHeading } from "@/lib/pageHeading";
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
  compactActions = true,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  /**
   * Whether the buttons are worth a row on a phone.
   *
   * It lives here rather than as a `hidden medium:flex` on the caller's own
   * wrapper because this header has to know the answer: buttons nobody can see
   * were still keeping a bordered, padded row on screen holding nothing.
   */
  compactActions?: boolean;
}) {
  /*
   * Handed to the top app bar, which draws it on a phone.
   *
   * Cleared on unmount so a page that does not set one cannot inherit the last
   * page's heading between routes.
   */
  useEffect(() => {
    setPageHeading(title);
    return () => setPageHeading(null);
  }, [title]);

  /*
   * Whether this header draws anything on a phone.
   *
   * Nothing of it survives there any more except a description and buttons: the
   * eyebrow was always hidden, and the heading is now in the bar above. So a
   * header with neither would be four pixels of padding and a rule across the
   * screen, which is a line that looks like a mistake.
   */
  const shown = actions && compactActions ? actions : null;
  const quiet = !description && !shown;

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
          * Announced on a phone, not drawn.
          *
          * The bar above is the heading there, and it is the one that stays,
          * because it belongs to the shell and is on every screen. A page still
          * needs an h1 to navigate by, so it goes on being one and only stops
          * taking up room.
          */}
        <h1 className="md-title-lg min-w-0 truncate leading-tight sr-only medium:not-sr-only">
          {title}
        </h1>
        {description ? (
          <p className="md-body mt-1 text-on-variant">{description}</p>
        ) : null}
      </div>
      {/* Wraps rather than overflows. A phone is not wide enough to hold two
          buttons and the avatar on one line, and a group that cannot wrap
          puts the avatar off the side of the screen instead. */}
      <div
        className={cx(
          "min-w-0 flex-wrap items-center justify-end gap-2",
          compactActions ? "flex" : "hidden medium:flex",
        )}
      >
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
