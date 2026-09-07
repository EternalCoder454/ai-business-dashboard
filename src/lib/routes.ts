import { ORCHESTRATOR_ID } from "./seed";
import type { Department } from "./types";

/** Chat route for a department. The CEO has its own top-level page. */
export function departmentHref(department: Pick<Department, "id" | "isOrchestrator">): string {
  return department.isOrchestrator || department.id === ORCHESTRATOR_ID ? "/orchestrator" : `/dept/${department.id}`;
}

export function departmentHrefById(id: string): string {
  return id === ORCHESTRATOR_ID ? "/orchestrator" : `/dept/${id}`;
}

/** Chat route pointing at one specific conversation. */
export function conversationHref(departmentId: string, conversationId: string): string {
  return `${departmentHrefById(departmentId)}?c=${encodeURIComponent(conversationId)}`;
}

/**
 * A timestamp as a date and a time, for anything that is a record.
 *
 * "22d ago" is the right answer to "is this fresh", and the wrong one to
 * "when did this happen". A piece of feedback, a report, a message in a thread
 * and a line in an audit are all things somebody reads to find out when, and
 * they arrive weeks after the fact, so counting backwards from now made the
 * reader do arithmetic to reach a date that was already known.
 *
 * MM/DD/YYYY and a 24 hour clock, written out rather than left to the browser's
 * locale, because two people looking at the same feedback should be reading the
 * same string. Padded, so a column of them lines up.
 */
export function formatExactTime(timestamp: number): string {
  const at = new Date(timestamp);
  if (Number.isNaN(at.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${pad(at.getMonth() + 1)}/${pad(at.getDate())}/${at.getFullYear()}` +
    ` - ${pad(at.getHours())}:${pad(at.getMinutes())}`
  );
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
