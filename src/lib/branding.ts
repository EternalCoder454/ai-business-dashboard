import { eq } from "drizzle-orm";
import { databaseEnabled, requireDb } from "@/db/client";
import * as t from "@/db/schema";
import { ADMIN_EMAILS } from "./admin";
import { membershipFor } from "@/db/tenancy";

export interface Branding {
  name: string;
  /** Up to two letters, shown when there is no logo. */
  mark: string;
  /** A data URL, or null. */
  logo: string | null;
}

/** What a fresh deployment shows, before anyone has edited Settings. */
export const FALLBACK_BRANDING: Branding = {
  name: "Your Company",
  mark: "HQ",
  logo: null,
};

/**
 * The branding for the icons and the link preview card.
 *
 * Those are rendered for crawlers and browsers with no session, so there is no
 * account to read settings from, and no single "the workspace" either: settings
 * are stored per account. The deployment's owner is the first address in
 * ADMIN_EMAILS, so their branding stands for the deployment.
 *
 * Never throws. A missing database, an owner who has not signed in, or a
 * database that is briefly down all fall back to the shipped defaults, because
 * an icon is not worth failing a request over.
 */
export async function loadBranding(): Promise<Branding> {
  const owner = ADMIN_EMAILS[0];
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
