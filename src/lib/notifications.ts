"use client";

import { useMemo, useState } from "react";
import { hasProfileContent } from "./prompts";
import { useStore } from "./store";

/**
 * Things that need attention, gathered once and read in two places.
 *
 * These used to be a banner across the top of the dashboard, which put a
 * standing list of chores on the first thing you see every morning. They live
 * in the profile menu instead, where a count is visible from every page and
 * the detail is one click away.
 */
export interface Notification {
  id: string;
  label: string;
  href: string;
  tone: "warning" | "info";
}

export function useNotifications(): Notification[] {
  const { ready, departments, skills, memory, tasks, profile, settings, serverKey } =
    useStore();

  // Taken once on mount. Reading the clock during render is not pure, and the
  // output would then depend on when React happened to run.
  const [now] = useState(() => Date.now());

  return useMemo(() => {
    const items: Notification[] = [];
    // Everything below reads as missing before the workspace has loaded, so
    // announcing it then means claiming it is empty on every refresh.
    if (!ready) return items;

    if (!serverKey && !settings.apiKey) {
      items.push({
        id: "no-key",
        label: "No API key set",
        href: "/settings",
        tone: "warning",
      });
    }

    const overdue = tasks.filter(
      (task) => task.status !== "done" && task.dueAt && task.dueAt < now,
    ).length;
    if (overdue > 0) {
      items.push({
        id: "overdue",
        label: `${overdue} task${overdue === 1 ? "" : "s"} overdue`,
        href: "/tasks",
        tone: "warning",
      });
    }

    if (!hasProfileContent(profile)) {
      items.push({
        id: "no-profile",
        label: "Company profile is empty",
        href: "/profile",
        tone: "info",
      });
    }

    if (memory.filter((entry) => !entry.archived).length === 0) {
      items.push({
        id: "no-memory",
        label: "No decisions or figures recorded",
        href: "/library/memory",
        tone: "info",
      });
    }

    const bare = departments.filter((d) => !skills.some((s) => s.departmentId === d.id));
    if (bare.length > 0) {
      items.push({
        id: "bare-departments",
        label: `${bare.length} department${bare.length === 1 ? "" : "s"} without skills`,
        href: "/library/skills",
        tone: "info",
      });
    }

    return items;
  }, [ready, serverKey, settings.apiKey, tasks, now, profile, memory, departments, skills]);
}
