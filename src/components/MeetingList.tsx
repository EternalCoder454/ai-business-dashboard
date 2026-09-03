"use client";

import { PlusIcon, TrashIcon, UsersIcon, cx } from "./ui";
import { createRipple } from "./ui/ripple";
import { ProfileMenu } from "./ProfileMenu";
import { formatRelativeTime } from "@/lib/routes";
import type { AllHandsRun } from "@/lib/types";

/**
 * Every meeting the room has held, newest first.
 *
 * The same problem the department screens had, and the same answer. Opening Ask
 * Everyone dropped you into whichever meeting was most recent, with the only
 * way to a different one being a switcher folded into the header. So a second
 * subject went into the middle of the first one, and the way to a clean room
 * was to delete what was there.
 *
 * Kept deliberately close to the conversation list: this is the same idea about
 * a different kind of thread, and two screens that do one thing should not
 * disagree about where the button is.
 *
 * A room that has never met skips this and opens straight into a fresh one,
 * because an empty list with a button on it is a click in front of the thing
 * somebody came to do.
 */
export function MeetingList({
  runs,
  onOpen,
  onNew,
  onDelete,
}: {
  runs: AllHandsRun[];
  onOpen: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header
        className={cx(
          "flex flex-none items-center gap-3 border-b border-outline-variant",
          "px-4 py-4 medium:px-6",
        )}
      >
        <div className="grid h-10 w-10 flex-none place-items-center rounded-2xl bg-primary-container text-on-primary-container">
          <UsersIcon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="md-title truncate">Meetings</p>
          <p className="md-label-sm truncate text-on-variant/75">
            {runs.length} meeting{runs.length === 1 ? "" : "s"}
          </p>
        </div>

        {/* As on every other screen. Built with the same gap as the department
            list, and for the same reason. */}
        <div className="hidden flex-none medium:block">
          <ProfileMenu />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 medium:px-6 py-5">
        <ul className="measure-read flex flex-col gap-1.5">
          {/* First row, not a button in the corner: it is the most common thing
              anybody does here and belongs where the eye already is. */}
          <li>
            <button
              type="button"
              onClick={(event) => {
                createRipple(event);
                onNew();
              }}
              className={cx(
                "md-state flex w-full items-center gap-2.5 rounded-xl border border-dashed",
                "border-outline-variant px-4 py-3 text-left text-primary",
                "transition-colors hover:border-primary hover:bg-primary/5",
              )}
            >
              <PlusIcon className="h-4 w-4 flex-none" />
              <span className="md-label">New meeting</span>
            </button>
          </li>

          {runs.map((run) => (
            /*
             * A plain row with the title stretched over it rather than a button
             * wrapping everything, because a button inside a button is invalid
             * and behaves badly with a keyboard. The whole row stays clickable
             * and the delete stays its own control.
             */
            <li
              key={run.id}
              className={cx(
                "group relative flex items-center gap-3 rounded-xl bg-container",
                "px-4 py-3 transition-colors hover:bg-high",
              )}
            >
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={(event) => {
                    createRipple(event);
                    onOpen(run.id);
                  }}
                  className="md-body block w-full truncate text-left font-medium before:absolute before:inset-0 before:rounded-xl"
                >
                  {run.title}
                </button>
                <p className="md-label-sm mt-0.5 truncate text-on-variant/75">
                  {run.rounds.length} question{run.rounds.length === 1 ? "" : "s"} ·{" "}
                  {formatRelativeTime(run.updatedAt)}
                </p>
              </div>

              <button
                type="button"
                aria-label={`Delete ${run.title}`}
                onClick={() => onDelete(run.id)}
                className={cx(
                  "md-state md-target relative z-10 grid flex-none place-items-center",
                  "rounded-full text-on-variant/60 opacity-0 transition-opacity",
                  "hover:text-error group-hover:opacity-100 focus-visible:opacity-100",
                  // A touch screen has no hover, so there it is simply always
                  // there rather than unreachable.
                  "[@media(hover:none)]:opacity-100",
                )}
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
