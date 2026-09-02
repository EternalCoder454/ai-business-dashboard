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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
 * to their address, and they prove the address by signing in with Google. A
 * link carrying a secret would be a second way in to keep safe, and a worse
 * one, since it arrives in an inbox and never expires unless something makes
 * it.
 */
export async function sendInvite(input: {
  to: string;
  workspaceName: string;
  invitedBy: string;
  companyName?: string;
}): Promise<string | null> {
  const url = siteUrl();
  const panel = oneLine(input.companyName) || "the panel";
  // A business name reaches the subject line, and a subject line with a
  // newline in it is how header injection starts. Resend takes JSON rather
  // than raw headers, so this is belt and braces, but the name is operator
  // input reaching an outbound message and it costs nothing to flatten.
  const workspace = oneLine(input.workspaceName) || "your workspace";

  const text = [
    `${input.invitedBy} has given you access to ${workspace} on ${panel}.`,
    "",
    url ? `Sign in here: ${url}` : "Ask them for the address to sign in at.",
    "",
    "Sign in with the Google account this was sent to. There is no password",
    "to set and no code to enter: the address is what grants you access.",
  ].join("\n");

  const html = `
    <div style="font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#1c1f22">
      <p><strong>${escapeHtml(input.invitedBy)}</strong> has given you access to
      <strong>${escapeHtml(workspace)}</strong> on ${escapeHtml(panel)}.</p>
      ${
        url
          ? `<p><a href="${escapeHtml(url)}" style="display:inline-block;background:#156d7f;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none">Open the panel</a></p>`
          : "<p>Ask them for the address to sign in at.</p>"
      }
      <p style="color:#464d53;font-size:14px">Sign in with the Google account this was
      sent to. There is no password to set and no code to enter: the address is
      what grants you access.</p>
    </div>`;

  return send({
    to: input.to,
    subject: `You have been added to ${workspace}`,
    text,
    html,
  });
}
