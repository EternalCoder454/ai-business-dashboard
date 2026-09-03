"use client";

import Link from "next/link";
import { PlusIcon, TrashIcon, cx } from "./ui";
import { createRipple } from "./ui/ripple";
import { DepartmentAvatar } from "./DepartmentAvatar";
import { conversationHref, departmentHrefById, formatRelativeTime } from "@/lib/routes";
import type { Conversation, Department } from "@/lib/types";

/**
 * Everything this head has been asked, newest first.
 *
 * Opening a department used to drop you into whichever conversation was most
 * recent, with no way back out: every visit for the rest of the month reopened
 * the same thread, so a second subject went into the middle of the first one or
 * nowhere at all.
 *
 * A department with nothing yet skips this and opens a chat, because an empty
 * list with a button on it is a click in front of the thing somebody came to do.
 */
export function ConversationList({
  department,
  conversations,
  onDelete,
}: {
  department: Department;
  conversations: Conversation[];
  onDelete: (id: string) => void;
}) {
  const who = department.personaName || department.name;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/*
       * No safe area padding of its own any more.
       *
       * This header was written when it was the top-most thing on the screen.
       * It is not: on a phone the app bar sits above it, and adding the notch
       * inset a second time pushed the whole list down by the height of a
       * notch for no reason. The padding matches PageHeader, which is what
       * every other screen under that bar uses.
       */}
      <header
        className={cx(
          "flex flex-none items-center gap-3 border-b border-outline-variant",
          "px-4 py-4 medium:px-6",
        )}
      >
        <DepartmentAvatar department={department} size={40} />
        <div className="min-w-0 flex-1">
          <p className="md-title truncate">
            {department.personaName
              ? `${department.personaName}, ${department.roleTitle}`
              : department.name}
          </p>
          <p className="md-label-sm truncate text-on-variant/75">
            {conversations.length} conversation{conversations.length === 1 ? "" : "s"}
          </p>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 medium:px-6 py-5">
        {/*
         * A reading column rather than the full width. These are one-line
         * titles, and stretched across a wide screen the date ended up a hand's
         * width from the thing it belonged to.
         */}
        <ul className="measure-read flex flex-col gap-1.5">
          {/*
           * Starting a new one is the first row, not a button in the corner.
           * It is the most common thing anybody does here and it wants to be
           * where the eye already is, which is the top of the column in the
           * middle of the screen rather than the far edge of the header.
           */}
          <li>
            <Link
              href={`${departmentHrefById(department.id)}?c=new`}
              onClick={createRipple}
              className={cx(
                "md-state flex items-center gap-2.5 rounded-xl border border-dashed",
                "border-outline-variant px-4 py-3 text-primary",
                "transition-colors hover:border-primary hover:bg-primary/5",
              )}
            >
              <PlusIcon className="h-4 w-4 flex-none" />
              <span className="md-label">New conversation with {who}</span>
            </Link>
          </li>

          {conversations.map((conversation) => (
            /*
             * The card is a plain element with the title stretched over it,
             * rather than a link wrapping everything. A button inside an anchor
             * is invalid and behaves badly with a keyboard, and this keeps the
             * whole row clickable while the delete stays its own control.
             */
            <li
              key={conversation.id}
              className={cx(
                "group relative flex items-center gap-3 rounded-xl bg-container",
                "px-4 py-3 transition-colors hover:bg-high",
              )}
            >
              <div className="min-w-0 flex-1">
                <Link
                  href={conversationHref(department.id, conversation.id)}
                  onClick={createRipple}
                  className="md-body block truncate font-medium before:absolute before:inset-0 before:rounded-xl"
                >
                  {conversation.title}
                </Link>
                <p className="md-label-sm mt-0.5 truncate text-on-variant/75">
                  {conversation.messageCount} message
                  {conversation.messageCount === 1 ? "" : "s"} ·{" "}
                  {formatRelativeTime(conversation.updatedAt)}
                </p>
              </div>

              {/*
               * Inside the row and after the text, on the same line as the
               * date. It sat over the corner of the card before, on top of the
               * title it was next to. Relative, so it lands above the title's
               * overlay rather than under it.
               */}
              <button
                aria-label={`Delete ${conversation.title}`}
                onClick={() => onDelete(conversation.id)}
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
