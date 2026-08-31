"use client";

import Link from "next/link";
import { useState } from "react";
import { projectAccent } from "@/lib/seed";
import { useStore } from "@/lib/store";
import type { Project } from "@/lib/types";
import { Chip, cx } from "./ui";

/** Used by the empty state and the navigation, so it lives in one place. */
export const PROJECT_DEFAULT_ICON = "🗂";

/**
 * What a project holds, in one line. Zero counts are dropped rather than shown
 * as "0 files", because a row of zeroes reads as failure when it only means
 * nothing of that kind has been filed yet.
 */
export function ProjectMeter({
  conversations,
  deliverables,
  files,
}: {
  conversations: number;
  deliverables: number;
  files: number;
}) {
  const parts = [
    conversations ? `${conversations} conversation${conversations === 1 ? "" : "s"}` : null,
    deliverables ? `${deliverables} deliverable${deliverables === 1 ? "" : "s"}` : null,
    files ? `${files} file${files === 1 ? "" : "s"}` : null,
  ].filter(Boolean);

  if (!parts.length) return null;
  return <span className="md-label-sm text-on-variant">{parts.join(" · ")}</span>;
}

/** The coloured dot and name, linked. Used wherever a project is referenced. */
export function ProjectTag({
  project,
  className,
}: {
  project: Project;
  className?: string;
}) {
  const accent = projectAccent(project.accent);
  return (
    <Link
      href={`/projects/${project.id}`}
      className={cx(
        "md-label inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2 py-0.5",
        "border-outline-variant text-on-variant md-state transition-colors",
        className,
      )}
    >
      <span
        aria-hidden
        className="h-2 w-2 flex-none rounded-full"
        style={{ backgroundColor: accent.dot }}
      />
      <span className="truncate">{project.name}</span>
    </Link>
  );
}

/**
 * Files one conversation under a project from inside the chat.
 *
 * A menu rather than a dialog: choosing a project is a one-tap decision, and
 * making it modal would put a wall between the user and the thread they are
 * halfway through reading.
 */
export function ProjectPicker({
  conversationId,
  currentProjectId,
}: {
  conversationId: string;
  currentProjectId?: string;
}) {
  const { projects, setConversationProject } = useStore();
  const [open, setOpen] = useState(false);

  const current = projects.find((row) => row.id === currentProjectId);
  const selectable = projects.filter((row) => row.status !== "archived" || row.id === currentProjectId);

  const choose = async (projectId?: string) => {
    setOpen(false);
    await setConversationProject(conversationId, projectId);
  };

  return (
    <div className="relative">
      <Chip
        selected={Boolean(current)}
        onClick={() => setOpen((value) => !value)}
        title={current ? `Filed under ${current.name}` : "File under a project"}
      >
        {current ? (
          <>
            <span
              aria-hidden
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: projectAccent(current.accent).dot }}
            />
            <span className="max-w-[9rem] truncate">{current.name}</span>
          </>
        ) : (
          <>{PROJECT_DEFAULT_ICON} Project</>
        )}
      </Chip>

      {open ? (
        <>
          {/* Catches the click that closes the menu, without trapping focus. */}
          <button
            type="button"
            aria-label="Close project menu"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            className={cx(
              "absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border",
              "border-outline-variant bg-container shadow-e2",
            )}
          >
            <div className="max-h-72 overflow-y-auto py-1">
              {selectable.length === 0 ? (
                <p className="md-body px-3 py-3 text-on-variant">
                  No projects yet. Create one on the Projects page and it will appear here.
                </p>
              ) : (
                selectable.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => void choose(project.id)}
                    className={cx(
                      "md-state flex w-full items-center gap-2 px-3 py-2 text-left transition-colors",
                      project.id === currentProjectId && "bg-secondary-container",
                    )}
                  >
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 flex-none rounded-full"
                      style={{ backgroundColor: projectAccent(project.accent).dot }}
                    />
                    <span className="md-body min-w-0 flex-1 truncate">{project.name}</span>
                  </button>
                ))
              )}
            </div>

            {currentProjectId ? (
              <button
                type="button"
                onClick={() => void choose(undefined)}
                className="md-state md-label w-full border-t border-outline-variant px-3 py-2.5 text-left text-on-variant transition-colors"
              >
                Remove from project
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
