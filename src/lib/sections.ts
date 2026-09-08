/**
 * Which parts of the panel a business shows, and what it calls them.
 *
 * Seven destinations shipped as one hardcoded list, which is an opinion about
 * what a business looks like. A three person shop that never opens Projects or
 * the Library is reading a navigation a third of which is dead weight, and that
 * is what makes software feel like it was built for somebody else. The names
 * are the same argument: "Meetings" is a war room to one business and a standup
 * to another, and the wiki has carried its own title for a while, so the
 * appetite is not in doubt.
 *
 * Keyed by href rather than by label, because the label is the thing being
 * changed. An href that no longer exists is ignored on read, so a release that
 * moves a page cannot leave a workspace with a setting pointing at nothing.
 */
export interface SectionOverride {
  /** Kept out of every navigation. The page itself still answers. */
  hidden?: boolean;
  /** What this business calls it. Empty or absent means the shipped name. */
  label?: string;
}

export type Sections = Record<string, SectionOverride>;

/**
 * Every destination a business may hide or rename.
 *
 * A plain list of paths rather than a read of the navigation itself, because
 * this runs on the server too and the navigation is a React component carrying
 * icons. guard-test keeps the two in step.
 *
 * Work only, and exactly the rows the Sections control offers. Settings,
 * Account, Documentation and the Company Profile are how somebody changes or
 * understands the panel, so a workspace that hid them would have no way back;
 * Operator is not theirs to hide; and the wiki already carries its own title,
 * so renaming it here would be the same setting in two places.
 */
export const SECTION_HREFS = [
  "/",
  "/meetings",
  "/inbox",
  "/tasks",
  "/projects",
  "/library",
] as const;

/**
 * The dashboard cannot be hidden.
 *
 * It is the home route, so hiding it would leave a workspace whose first
 * navigation item is not where "/" goes, and it is the first slot on the phone
 * bottom bar, which is the one a thumb finds without looking.
 */
export const ALWAYS_SHOWN = "/";

/** How long a renamed section may be, so the rail and bottom bar still fit. */
export const SECTION_NAME_LIMIT = 18;

interface Nameable {
  href: string;
  label: string;
  short: string;
}

/**
 * The navigation this business sees.
 *
 * One function for every navigation in the product, so the drawer, the rail,
 * the phone bottom bar and the command palette cannot disagree about what is
 * on. A renamed section takes the new name in both places: the rail truncates,
 * which is what it already does to "Projects".
 */
export function applySections<T extends Nameable>(links: T[], sections?: Sections): T[] {
  if (!sections) return links;
  const out: T[] = [];
  for (const link of links) {
    const override = sections[link.href];
    if (override?.hidden && link.href !== ALWAYS_SHOWN) continue;
    const named = override?.label?.trim();
    out.push(named ? { ...link, label: named, short: named } : link);
  }
  return out;
}

/**
 * Read back from storage, keeping only what is still meaningful.
 *
 * A label longer than the limit, a key for a page that no longer exists and a
 * value that is not an object all come back from a column somebody could have
 * written by hand, and none of them should reach a navigation.
 */
export function readSections(value: unknown, known: readonly string[]): Sections {
  if (!value || typeof value !== "object") return {};
  const out: Sections = {};
  for (const [href, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!known.includes(href) || !raw || typeof raw !== "object") continue;
    const { hidden, label } = raw as SectionOverride;
    const entry: SectionOverride = {};
    if (hidden === true && href !== ALWAYS_SHOWN) entry.hidden = true;
    if (typeof label === "string" && label.trim()) {
      entry.label = label.trim().slice(0, SECTION_NAME_LIMIT);
    }
    if (entry.hidden || entry.label) out[href] = entry;
  }
  return out;
}
