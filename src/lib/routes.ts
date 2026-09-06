import { CEO_ID } from "./seed";
import type { Department } from "./types";

/** Chat route for a department. The CEO has its own top-level page. */
export function departmentHref(department: Pick<Department, "id" | "isCeo">): string {
  return department.isCeo || department.id === CEO_ID ? "/orchestrator" : `/dept/${department.id}`;
}

export function departmentHrefById(id: string): string {
  return id === CEO_ID ? "/orchestrator" : `/dept/${id}`;
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

/**
 * What the top app bar calls each screen, and the one place that decides it.
 *
 * It lives here rather than in the shell because two things need to agree about
 * it. The bar shows this string on a phone, and the page's own header shows a
 * heading right underneath: where the two are the same word, the screen said
 * "Tasks" and then said "Tasks", and the page header has to be able to tell.
 */
export const ROUTE_TITLES: [string, string][] = [
  ["/orchestrator", "Chief of Staff"],
  ["/meetings", "Meetings"],
  ["/inbox", "Inbox"],
  ["/wiki", "Internal Wiki"],
  ["/documentation", "Documentation"],
  ["/tasks", "Tasks"],
  ["/projects", "Projects"],
  ["/operator", "Operator"],
  ["/library/skills", "Skills"],
  ["/library/deliverables", "Deliverables"],
  ["/library", "Library"],
  ["/information", "Information"],
  ["/profile", "Company Profile"],
  ["/account", "Account"],
  ["/settings", "Settings"],
  ["/", "Dashboard"],
];

/** Whether a path is inside a destination. Exact for the root, prefix otherwise. */
export function isRoute(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** The bar's title for a path, or undefined where the shell falls back. */
export function routeTitle(pathname: string): string | undefined {
  return ROUTE_TITLES.find(([href]) => isRoute(pathname, href))?.[1];
}
