/**
 * Sends one real invitation email, and changes nothing.
 *
 * Deliberately not the invite button. That grants access as well as sending,
 * and re-inviting somebody who is already in a business used to write their
 * role back to member, which is how an administrator could lose their own
 * rights to a test. This calls the sender directly: no access row is created,
 * updated or revoked, so it is safe to point at your own address.
 *
 * Needs RESEND_API_KEY, which lives in the deployment rather than in the repo.
 * Add it to .env.local to run this from here.
 *
 *   npm run send-test-invite you@example.com [workspaceId]
 *
 * With no workspace id it picks one that has a logo set, since the logo is the
 * only part of the message that depends on a remote image loading.
 */
import { eq } from "drizzle-orm";
import { db } from "../src/db/client";
import * as t from "../src/db/schema";
import { emailEnabled, sendInvite } from "../src/lib/email";
import { siteUrl } from "../src/lib/site";

async function main() {
  const to = process.argv[2];
  if (!to || !to.includes("@")) {
    console.error("Usage: npm run send-test-invite you@example.com [workspaceId]");
    process.exit(1);
  }

  if (!emailEnabled) {
    console.error("RESEND_API_KEY is not set, so nothing can be sent from here.");
    console.error("It lives in the deployment. Add it to .env.local to send locally.");
    process.exit(1);
  }

  const rows = await db!
    .select({
      id: t.settings.workspaceId,
      name: t.settings.companyName,
      logo: t.settings.companyLogoUrl,
    })
    .from(t.settings);

  const asked = process.argv[3];
  const chosen = asked
    ? rows.find((r) => r.id === asked)
    : (rows.find((r) => r.logo?.trim()) ?? rows[0]);

  if (!chosen) {
    console.error(asked ? `No workspace ${asked}.` : "No workspaces to send for.");
    process.exit(1);
  }

  const [named] = await db!
    .select({ name: t.workspaces.name })
    .from(t.workspaces)
    .where(eq(t.workspaces.id, chosen.id));

  const workspaceName = named?.name ?? chosen.name ?? "your workspace";
  const site = siteUrl();

  console.log(`  to         ${to}`);
  console.log(`  business   ${workspaceName} (${chosen.id})`);
  console.log(`  logo       ${chosen.logo ? "set, so the badge is the logo" : "none, so the badge is the letters"}`);
  console.log(`  image from ${site}/mark/${chosen.id}`);
  console.log("");

  // The mark has to be reachable from outside, because the thing loading it is
  // a mail client rather than this machine. A local URL would arrive broken.
  if (site.includes("localhost")) {
    console.log("  NEXT_PUBLIC_SITE_URL points at localhost, so the logo will not load");
    console.log("  in the delivered mail. Point it at the deployment to test that part.");
    console.log("");
  }

  const error = await sendInvite({
    to,
    workspaceName,
    workspaceId: chosen.id,
    invitedBy: "test@eterneon.net",
  });

  if (error) {
    console.error(`  refused: ${error}`);
    process.exit(1);
  }
  console.log("  sent. Nothing was granted, revoked or changed.");
}

void main().then(() => process.exit(0));
