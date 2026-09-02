"use client";

import Link from "next/link";
import { Card, PlusIcon, TrashIcon, cx } from "./ui";
import { createRipple } from "./ui/ripple";
import { DepartmentAvatar } from "./DepartmentAvatar";
import { conversationHref, departmentHrefById, formatRelativeTime } from "@/lib/routes";
import type { Conversation, Department } from "@/lib/types";

/**
 * Everything this head has been asked, newest first.
 *
 * Opening a department used to drop you into whichever conversation was most
 * recent, and there was no way back out of it: every visit for the rest of the
 * month reopened the same thread, so a second subject went into the middle of
 * the first one or nowhere at all. The list is what a department opens to once
 * it has anything in it.
 *
 * A department with nothing yet skips this entirely and opens a chat, because
 * an empty list with a button on it is a click in front of the thing somebody
 * came to do.
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
  const started = conversations.filter((c) => c.messageCount > 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header
        className={cx(
          "safe-top safe-pt-3 medium:safe-pt-4 safe-x safe-px-3 medium:safe-px-6",
          "flex flex-none items-center gap-3 border-b border-outline-variant pb-3 medium:gap-4 medium:pb-4",
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
            {started.length} conversation{started.length === 1 ? "" : "s"}
          </p>
        </div>

        <Link
          href={`${departmentHrefById(department.id)}?c=new`}
          onClick={createRipple}
          className={cx(
            "md-state md-label inline-flex flex-none items-center gap-1.5 rounded-full",
            "bg-primary px-4 py-2 text-on-primary",
          )}
        >
          <PlusIcon className="h-4 w-4" />
          New
        </Link>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 medium:px-6 expanded:px-8 py-5">
        <ul className="measure flex flex-col gap-2">
          {started.map((conversation) => (
            <li key={conversation.id} className="group relative">
              <Link
                href={conversationHref(department.id, conversation.id)}
                onClick={createRipple}
                className="block"
              >
                <Card className="transition-shadow hover:shadow-e2">
                  <p className="md-title truncate pr-8">{conversation.title}</p>
                  <p className="md-label-sm mt-1 text-on-variant/75">
                    {conversation.messageCount} message
                    {conversation.messageCount === 1 ? "" : "s"} ·{" "}
                    {formatRelativeTime(conversation.updatedAt)}
                  </p>
                </Card>
              </Link>

              {/* Only on hover or focus. A row of delete buttons down a list of
                  somebody's own work reads as an invitation to lose it. */}
              <button
                aria-label={`Delete ${conversation.title}`}
                onClick={() => onDelete(conversation.id)}
                className={cx(
                  "md-state md-target absolute right-2 top-2 grid place-items-center rounded-full",
                  "text-on-variant opacity-0 transition-opacity",
                  "group-hover:opacity-100 focus-visible:opacity-100",
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
