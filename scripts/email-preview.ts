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

writeFileSync("invite-preview.html", inviteHtml(view), "utf8");
console.log(inviteText(view));
console.log("\n---\nwrote invite-preview.html");
