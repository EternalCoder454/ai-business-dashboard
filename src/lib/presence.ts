"use client";

import { useSyncExternalStore } from "react";
import type { DepartmentStatus } from "./types";

/**
 * What a department is actually doing, rather than what someone typed.
 *
 * The dots used to render a stored field that nothing ever changed, so every
 * department read "Online" whether or not asking one would work at all. This
 * tracks the real thing: whether a reply is in flight, and whether the last one
 * failed.
 *
 * Kept outside React state deliberately. It is written from a send handler and
 * read by the sidebar, the org chart, and the chat header at once, and routing
 * it through the workspace store would put a value that changes twice a second
 * into the same object that holds every conversation.
 */
type Activity = "idle" | "busy" | "error";

const activity = new Map<string, Activity>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function setDepartmentActivity(departmentId: string, next: Activity): void {
  if (activity.get(departmentId) === next) return;
  if (next === "idle") activity.delete(departmentId);
  else activity.set(departmentId, next);
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** A stable snapshot, so useSyncExternalStore does not loop. */
let snapshot = "";
function getSnapshot(): string {
  const next = [...activity.entries()].map(([id, state]) => `${id}:${state}`).sort().join(",");
  if (next !== snapshot) snapshot = next;
  return snapshot;
}

function getServerSnapshot(): string {
  return "";
}

/**
 * The status to show for a department.
 *
 * `reachable` is whether a request could succeed at all: no API key means every
 * department is offline, which is the honest answer and the one that explains
 * why nothing works.
 */
export function useDepartmentStatus(reachable: boolean): (id: string) => DepartmentStatus {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (id: string): DepartmentStatus => {
    if (!reachable) return "offline";
    const entry = state.split(",").find((pair) => pair.startsWith(`${id}:`));
    if (entry?.endsWith(":busy")) return "busy";
    if (entry?.endsWith(":error")) return "offline";
    return "online";
  };
}

/** Human wording for the dot, used in titles and beside it. */
export const STATUS_MEANING: Record<DepartmentStatus, string> = {
  online: "Ready",
  busy: "Replying now",
  offline: "Cannot reach the model",
};
