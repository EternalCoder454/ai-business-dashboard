/**
 * Writes the invitation to a file so it can be looked at.
 *
 * An email template is the one thing in the app nobody sees until it has
 * already gone to a customer, so it is worth being able to open it.
 *
 * Run with: npm run email-preview
 */
import { writeFileSync } from "node:fs";
import { inviteHtml, inviteText, type InviteView } from "../src/lib/email-invite.html";

const view: InviteView = {
  workspace: "Skorheim & Associates",
  invitedBy: "Zachary Smith",
  panel: "Eterneon",
  url: "https://business.eterneon.net",
  to: "james@skorheim.com",
};

/*
 * Both badges, because they are the two things that can arrive.
 *
 * A business that has set a logo in Appearance gets it; one that has not gets
 * its letters. The logo version is the one worth looking at, since it is the
 * only part of the message that depends on a remote image loading.
 */
writeFileSync("invite-preview.html", inviteHtml(view), "utf8");
writeFileSync(
  "invite-preview-logo.html",
  inviteHtml({
    ...view,
    workspace: "Northbound Analytics",
    markUrl: process.env.MARK_URL || "http://localhost:3000/mark/ws_mtmap5031w0o9a",
  }),
  "utf8",
);
console.log(inviteText(view));
console.log("\n---\nwrote invite-preview.html");
