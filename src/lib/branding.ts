import { and, eq, isNull } from "drizzle-orm";
import { databaseEnabled, requireDb } from "@/db/client";
import * as t from "@/db/schema";
import { OPERATOR_EMAILS } from "./admin";
import { membershipFor } from "@/db/tenancy";

export interface Branding {
  name: string;
  /** Up to two letters, shown when there is no logo. */
  mark: string;
  /** A data URL, or null. */
  logo: string | null;
}

/**
 * What a deployment shows before anybody has branded it.
 *
 * The product's own name rather than a placeholder, because this is what the
 * link card and the icon fall back to, and those are the deployment's rather
 * than any one business's. A new workspace still starts at "Your Company",
 * which is a different thing in a different place.
 */
export const FALLBACK_BRANDING: Branding = {
  name: "Eterneon Panel",
  mark: "EP",
  logo: null,
};

/**
 * The branding for the icons and the link preview card.
 *
 * Those are rendered for crawlers and browsers with no session, so there is no
 * account to read settings from, and no single "the workspace" either: settings
 * are stored per account. The deployment's owner is the first address in
 * OPERATOR_EMAILS, so their branding stands for the deployment.
 *
 * Never throws. A missing database, an owner who has not signed in, or a
 * database that is briefly down all fall back to the shipped defaults, because
 * an icon is not worth failing a request over.
 */
export async function loadBranding(): Promise<Branding> {
  const owner = OPERATOR_EMAILS[0];
  if (!databaseEnabled || !owner) return FALLBACK_BRANDING;

  try {
    // The icon and the link card are the deployment's own, and a deployment
    // now holds many businesses, so this is deliberately the operator's
    // workspace rather than whichever one the visitor might belong to.
    const operator = await membershipFor(owner);
    if (!operator) return FALLBACK_BRANDING;
    const [row] = await requireDb()
      .select({
        name: t.settings.companyName,
        mark: t.settings.companyMark,
        logo: t.settings.companyLogoUrl,
      })
      .from(t.settings)
      .where(eq(t.settings.workspaceId, operator.workspaceId))
      .limit(1);

    if (!row) return FALLBACK_BRANDING;
    return {
      name: row.name?.trim() || FALLBACK_BRANDING.name,
      mark: row.mark?.trim().slice(0, 2).toUpperCase() || FALLBACK_BRANDING.mark,
      logo: row.logo ?? null,
    };
  } catch {
    return FALLBACK_BRANDING;
  }
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
      .where(and(eq(t.access.email, email), isNull(t.access.revokedAt)))
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
