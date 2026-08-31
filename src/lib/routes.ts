import { CEO_ID } from "./seed";
import type { Department } from "./types";

/** Chat route for a department. The CEO has its own top-level page. */
export function departmentHref(department: Pick<Department, "id" | "isCeo">): string {
  return department.isCeo || department.id === CEO_ID ? "/ceo" : `/dept/${department.id}`;
}

export function departmentHrefById(id: string): string {
  return id === CEO_ID ? "/ceo" : `/dept/${id}`;
}

/** Chat route pointing at one specific conversation. */
export function conversationHref(departmentId: string, conversationId: string): string {
  return `${departmentHrefById(departmentId)}?c=${encodeURIComponent(conversationId)}`;
}

export function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return "just now";
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
