import { and, eq, isNull } from "drizzle-orm";
import { databaseEnabled, requireDb } from "@/db/client";
import * as t from "@/db/schema";
import { ACTIVE_WORKSPACE_FIRST } from "@/db/tenancy";

export interface Branding {
  name: string;
  /** Up to two letters, shown when there is no logo. */
  mark: string;
  /** A data URL, or null. */
  logo: string | null;
}

/**
 * What the product is called, wherever it is speaking as itself.
 *
 * The link card, the favicon, the sign-in page and the invitation emails are
 * the deployment's own voice, not any one business's, and every one of them is
 * seen by people who are not signed in and may not be a customer at all.
 */
export const FALLBACK_BRANDING: Branding = {
  name: "Eterneon Panel",
  mark: "EP",
  logo: null,
};

/**
 * The branding for the icons, the link preview card and the invitation emails.
 *
 * This used to read the operator's own workspace, on the reasoning that the
 * person running the deployment owned it and their branding therefore stood for
 * it. That was true of a deployment holding one business and stopped being true
 * the moment it held several, in a way nobody would notice from the inside:
 * pasting the address into Discord produced a card titled with whatever the
 * operator's first workspace happened to be called, so a link to the product
 * announced one customer's company name to whoever it was shared with, and the
 * invitation emails every other business sent were signed with it too. Renaming
 * that workspace renamed the product.
 *
 * It is the product's own name now, overridable by environment for anybody
 * self-hosting who wants their own. A deployment level setting belongs to
 * whoever runs the deployment, which is what an environment variable is, and
 * not to whichever workspace row happens to be read first.
 *
 * The signed-in panel is unaffected: a person looking at their own workspace
 * sees their own company through loadViewerBranding and WorkspaceFavicon, which
 * is where a business's own branding belongs.
 */
export async function loadBranding(): Promise<Branding> {
  const name = process.env.PANEL_NAME?.trim();
  const mark = process.env.PANEL_MARK?.trim();
  const logo = process.env.PANEL_LOGO_URL?.trim();

  return {
    name: name || FALLBACK_BRANDING.name,
    mark: (mark || FALLBACK_BRANDING.mark).slice(0, 2).toUpperCase(),
    logo: logo || null,
  };
}

/**
 * The branding of the business the visitor themselves belongs to.
 *
 * Distinct from `loadBranding` above, which is deliberately the operator's and
 * stands for the deployment on icons and link cards. This one is for the shell
 * the signed-in person is about to look at.
 *
 * It exists to stop a flash of the wrong company. The store starts from
 * DEFAULT_SETTINGS, whose name is "Your Company", and only learns the real one
 * when /api/workspace answers, so every refresh showed somebody else's
 * business name for a beat before their own appeared. The theme already has
 * this exact treatment for the same reason.
 *
 * Returns null rather than the fallback when there is nothing to say, so the
 * shell can render a placeholder instead of a name that is wrong.
 *
 * It has to pick the same membership membershipFor does, and for a while it did
 * not pick at all: no ordering, LIMIT 1, so for anybody in more than one
 * business Postgres returned whichever row came to hand. Checked against
 * production while fixing it, this reliably chose the wrong one of two, which
 * is why a reload showed another company's name and then corrected itself. It
 * had traded a flash of "Your Company" for a flash of somebody else's.
 */
export async function loadViewerBranding(): Promise<Branding | null> {
  if (!databaseEnabled) return null;

  try {
    const { auth, authEnabled } = await import("@/auth");
    if (!authEnabled) return null;

    const session = await auth();
    const email = session?.user?.email?.toLowerCase();
    if (!email) return null;

    // One join rather than membershipFor followed by a settings read. This sits
    // on the critical path of the HTML for every page in the app, so the second
    // round trip is worth not making, and both halves are single indexed rows.
    const [row] = await requireDb()
      .select({
        name: t.settings.companyName,
        mark: t.settings.companyMark,
        logo: t.settings.companyLogoUrl,
      })
      .from(t.access)
      .innerJoin(t.settings, eq(t.settings.workspaceId, t.access.workspaceId))
      // The account row only for its choice of workspace, which is what the
      // ordering below reads. Left, so somebody who has never chosen still
      // matches and falls through to their oldest membership.
      .leftJoin(t.accounts, eq(t.accounts.userEmail, t.access.email))
      .where(and(eq(t.access.email, email), isNull(t.access.revokedAt)))
      .orderBy(...ACTIVE_WORKSPACE_FIRST)
      .limit(1);

    if (!row?.name?.trim()) return null;
    return {
      name: row.name.trim(),
      mark: row.mark?.trim().slice(0, 2).toUpperCase() || FALLBACK_BRANDING.mark,
      logo: row.logo ?? null,
    };
  } catch {
    // A name is not worth failing a page over. The store fills it in a moment
    // later either way.
    return null;
  }
}
