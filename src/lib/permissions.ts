/**
 * What one person in a business is allowed to open.
 *
 * `role` answers whether somebody runs the business. This answers the other
 * question, which is what a receptionist, a bookkeeper and a site foreman are
 * each meant to be doing in a panel that holds all three. A role of member is
 * one word for very different jobs, and every one of those jobs comes with
 * things it has no reason to touch.
 *
 * Two decisions worth stating.
 *
 * It is a deny list, not an allow list. Nothing is switched off until somebody
 * switches it off, so a business that never opens this screen behaves exactly
 * as it does today and a feature shipped next month is available to everybody
 * rather than invisible until every member is edited. An allow list is the
 * safer shape for a security boundary and the wrong shape for this: getting it
 * wrong here means a colleague cannot find Tasks, not that a stranger reads
 * the accounts.
 *
 * And heads are named rather than denied, because "only use this one" is the
 * thing people actually want. A business with nine heads and a bookkeeper who
 * should talk to one of them is one entry here rather than eight.
 *
 * What this is not: an isolation boundary. The panel loads a business's
 * workspace as one document and this decides which parts of it a person is
 * shown and may write to, so it fences the screens, the heads, the calendar
 * and every write. It does not make the rows unreadable to somebody who goes
 * looking with the network tab open. Anyone who must not see a thing at all
 * belongs in a different workspace, and that is what workspaces are for.
 */

/** Everything that can be switched off, in the order the screen lists them. */
export const AREAS = [
  { key: "meetings", label: "Meetings" },
  { key: "messages", label: "Inbox" },
  { key: "briefings", label: "Briefings" },
  { key: "tasks", label: "Tasks" },
  { key: "projects", label: "Projects" },
  { key: "library", label: "Library" },
  { key: "information", label: "Information" },
  { key: "profile", label: "Company profile" },
  { key: "wiki", label: "Internal wiki" },
  { key: "calendar", label: "Calendar" },
  { key: "files", label: "File uploads" },
] as const;

export type Area = (typeof AREAS)[number]["key"];

const AREA_KEYS = new Set<string>(AREAS.map((area) => area.key));

/** Which screen belongs to which area, for filtering the navigation. */
export const AREA_HREF: Partial<Record<Area, string>> = {
  meetings: "/all-hands",
  messages: "/messages",
  briefings: "/briefings",
  tasks: "/tasks",
  projects: "/projects",
  library: "/library",
  information: "/information",
  profile: "/profile",
  wiki: "/wiki",
};

/**
 * Which table a write belongs to, so a denied area cannot be written to by
 * something other than the screen that was hidden.
 *
 * Only the tables that map cleanly onto one area. Conversations and messages
 * are deliberately absent: they belong to a head rather than to an area, and
 * which heads somebody may open is a separate question asked separately.
 */
export const AREA_TABLES: Partial<Record<Area, string[]>> = {
  meetings: ["allHands"],
  tasks: ["tasks"],
  projects: ["projects"],
  library: ["deliverables", "files"],
  profile: ["profile"],
  wiki: ["wikiPages"],
  information: ["memory"],
};

export interface Permissions {
  /**
   * The heads this person may open, by department id. Absent means every head,
   * which is what everybody had before this existed and what a new member gets.
   */
  heads?: string[];
  /** Areas switched off. Absent or empty means nothing is. */
  denied?: Area[];
}

/** True when nothing has been restricted, which is the ordinary case. */
export function unrestricted(permissions: Permissions | null | undefined): boolean {
  if (!permissions) return true;
  return !permissions.heads && !permissions.denied?.length;
}

/**
 * Whatever came out of the database, made into something safe to ask questions
 * of. A column written by an older version, by hand, or by a bug is treated as
 * no restrictions rather than as a lockout.
 */
export function parsePermissions(raw: unknown): Permissions | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const source = raw as { heads?: unknown; denied?: unknown };

  const heads = Array.isArray(source.heads)
    ? source.heads.filter((id): id is string => typeof id === "string" && id.length > 0)
    : undefined;

  const denied = Array.isArray(source.denied)
    ? source.denied.filter((key): key is Area => typeof key === "string" && AREA_KEYS.has(key))
    : undefined;

  const cleaned: Permissions = {};
  // An empty list of heads would mean a person who may open nothing, which is
  // never what anybody meant to save and is indistinguishable from a mistake.
  if (heads && heads.length > 0) cleaned.heads = heads;
  if (denied && denied.length > 0) cleaned.denied = denied;
  return unrestricted(cleaned) ? null : cleaned;
}

/**
 * Whether this person may open an area.
 *
 * An administrator runs the business and is never restricted by this: the
 * screen that sets these is theirs, so a restriction they could lift in one
 * click is not a restriction, only a way to lock themselves out.
 */
export function allowsArea(
  role: "member" | "admin" | null | undefined,
  permissions: Permissions | null | undefined,
  area: Area,
): boolean {
  if (role === "admin") return true;
  return !permissions?.denied?.includes(area);
}

/** Whether this person may open one head. */
export function allowsHead(
  role: "member" | "admin" | null | undefined,
  permissions: Permissions | null | undefined,
  departmentId: string,
): boolean {
  if (role === "admin") return true;
  const heads = permissions?.heads;
  if (!heads) return true;
  return heads.includes(departmentId);
}

const HREF_AREA = new Map<string, Area>(
  Object.entries(AREA_HREF).map(([area, href]) => [href, area as Area]),
);

/**
 * Whether a screen is open to this person, by its path.
 *
 * Taken from the href rather than passed alongside it, so the navigation stays
 * one list of links and adding a screen to it does not mean remembering to
 * label it. A path with no area behind it is open to everybody, which is what
 * the dashboard, the account page and anything new should be.
 */
export function allowsHref(
  role: "member" | "admin" | null | undefined,
  permissions: Permissions | null | undefined,
  href: string,
): boolean {
  const area = HREF_AREA.get(href);
  return !area || allowsArea(role, permissions, area);
}

/** Which area a write to this table belongs to, if any. */
export function areaOfTable(table: string): Area | null {
  for (const [area, tables] of Object.entries(AREA_TABLES)) {
    if (tables?.includes(table)) return area as Area;
  }
  return null;
}
