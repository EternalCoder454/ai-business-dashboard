/**
 * Outgoing email, through Resend's REST API.
 *
 * Deliberately not the SDK. One POST with a bearer token is the whole surface,
 * and a dependency that wraps `fetch` is a dependency to keep patched for no
 * gain.
 *
 * Every function here reports failure by returning it rather than throwing.
 * An invitation is a convenience: the access row is what actually grants
 * entry, so a bounced email should say so and leave the invitation standing,
 * not roll back the thing that worked.
 */

import { inviteHtml, inviteText, type InviteView } from "./email-invite.html";

const ENDPOINT = "https://api.resend.com/emails";

export const emailEnabled = Boolean(process.env.RESEND_API_KEY?.trim());

/**
 * Who invitations come from.
 *
 * Has to be an address on a domain verified in Resend, or the send is refused.
 * Falls back to Resend's shared sender, which only delivers to the address
 * that owns the API key, so a misconfigured deployment fails visibly in
 * testing rather than silently in front of a customer.
 */
const FROM = process.env.INVITE_FROM?.trim() || "onboarding@resend.dev";

function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return vercel ? `https://${vercel}` : "";
}

/** Collapses anything that could break out of a header into a single line. */
function oneLine(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

async function send(input: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<string | null> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return "Email is not configured on this deployment.";

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [input.to],
        subject: input.subject,
        text: input.text,
        html: input.html,
      }),
    });

    if (response.ok) return null;

    // Resend says what was wrong, and it is usually actionable: an unverified
    // domain, or the shared sender refusing an address that is not yours.
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    return body?.message ?? `Resend refused the send (${response.status}).`;
  } catch (error) {
    console.error("[email] send failed", error);
    return "Could not reach the email service.";
  }
}


/**
 * Tells someone they have been given access to a workspace.
 *
 * There is no token in the link. Access is the row in the access table, keyed
 * to their email address, and they prove the address by signing in with
 * Google. A link carrying a secret would be a second way in to keep safe, and
 * a worse one, since it arrives in an inbox and never expires unless something
 * makes it.
 *
 * The panel's name is looked up rather than passed in when a caller does not
 * know it, so an invitation always arrives wearing the name of the deployment
 * it came from instead of the words "the panel".
 */
export async function sendInvite(input: {
  to: string;
  workspaceName: string;
  invitedBy: string;
  companyName?: string;
  /**
   * Which business, so the message can carry its logo.
   *
   * Optional: without it the invitation falls back to the business's initials,
   * which is what every invitation looked like before and is still correct.
   */
  workspaceId?: string;
}): Promise<string | null> {
  // A business name reaches the subject line, and a subject line with a
  // newline in it is how header injection starts. Resend takes JSON rather
  // than raw headers, so this is belt and braces, but the name is operator
  // input reaching an outbound message and it costs nothing to flatten.
  const workspace = oneLine(input.workspaceName) || "your workspace";

  let panel = oneLine(input.companyName);
  if (!panel) {
    try {
      const { loadBranding } = await import("./branding");
      panel = oneLine((await loadBranding()).name);
    } catch {
      panel = "";
    }
  }

  /*
   * An absolute URL, because a mail client has no page to resolve a relative
   * one against. Left empty when the deployment does not know its own address,
   * which falls back to the letters rather than sending a broken image.
   */
  const site = siteUrl();
  const markUrl =
    input.workspaceId && site
      ? `${site.replace(/\/$/, "")}/mark/${encodeURIComponent(input.workspaceId)}`
      : "";

  const view: InviteView = {
    workspace,
    invitedBy: oneLine(input.invitedBy) || "Somebody",
    panel: panel || "the panel",
    url: site,
    to: oneLine(input.to),
    markUrl,
  };

  return send({
    to: input.to,
    subject: `${view.invitedBy} added you to ${workspace}`,
    text: inviteText(view),
    html: inviteHtml(view),
  });
}
