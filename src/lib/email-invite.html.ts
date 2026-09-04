/**
 * The invitation, as HTML that survives an email client.
 *
 * Kept apart from the sending code because the two change for different
 * reasons and neither is short. What is here is shaped by what mail clients
 * actually do rather than by how a page would be written:
 *
 * - Tables, not flexbox or grid. Outlook renders through Word, which has
 *   supported neither for over a decade and still does not.
 * - Every style inlined. Gmail strips <style> blocks on forwarded mail, and a
 *   layout that collapses when somebody forwards it is a layout that breaks in
 *   front of the person you most wanted to reach.
 * - System fonts only. A webfont is a request an email client will refuse, and
 *   the fallback then decides your typography for you.
 * - A hidden preheader, because the inbox shows the first text it finds. Left
 *   out, the preview line is whatever the first visible words happen to be.
 * - The button is a padded table cell with a link in it, not a styled <a>.
 *   Outlook drops padding on inline elements, which turns the button into
 *   underlined text.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Two letters for the badge, matching how the panel draws its own mark. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "HQ";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export interface InviteView {
  /** The business they are being let into. */
  workspace: string;
  /** Whoever added them. */
  invitedBy: string;
  /** What the product is called on this deployment. */
  panel: string;
  /** Where to sign in, or empty when the deployment does not know its own URL. */
  url: string;
  /** The address this was sent to, which is also the credential. */
  to: string;
  /**
   * An https URL serving this business's logo, or empty for the letters.
   *
   * A URL rather than the stored value, because the logo is kept as a data URL
   * and mail clients strip those out of an img tag. /mark/[workspaceId] re-serves
   * it as a real PNG that a client will fetch like any other remote image.
   */
  markUrl?: string;
}

const INK = "#1c1f22";
const MUTED = "#5b6167";
const LINE = "#e3e6e8";
const BRAND = "#156d7f";
const PAPER = "#f6f7f8";

export function inviteHtml(view: InviteView): string {
  const workspace = escapeHtml(view.workspace);
  const invitedBy = escapeHtml(view.invitedBy);
  const panel = escapeHtml(view.panel);
  const url = escapeHtml(view.url);
  const to = escapeHtml(view.to);
  const mark = escapeHtml(initials(view.workspace));


  const font =
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

  /*
   * The logo when the business has set one, and its letters otherwise.
   *
   * Both are the same 44px rounded square, so the header does not move when a
   * business adds a logo. The image keeps the brand colour behind it: a logo
   * with transparency would otherwise sit on white in a light client and
   * disappear in a dark one, and a mail client that blocks remote images shows
   * the alt text on the coloured tile rather than an empty gap.
   */
  const markUrl = view.markUrl ? escapeHtml(view.markUrl) : "";
  const badge = markUrl
    ? `<td width="44" height="44" align="center" valign="middle" bgcolor="#ffffff"
           style="border-radius:12px;border:1px solid ${LINE};${font};font-size:15px;font-weight:700;color:${MUTED};letter-spacing:0.5px">
        <img src="${markUrl}" width="44" height="44" alt="${mark}"
             style="display:block;width:44px;height:44px;border:0;border-radius:11px" />
      </td>`
    : `<td width="44" height="44" align="center" valign="middle" bgcolor="${BRAND}"
           style="border-radius:12px;${font};font-size:15px;font-weight:700;color:#ffffff;letter-spacing:0.5px">
        ${mark}
      </td>`;

  const button = url
    ? `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px">
        <tr>
          <td align="center" bgcolor="${BRAND}" style="border-radius:999px">
            <a href="${url}"
               style="display:inline-block;padding:14px 32px;${font};font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px">
              Open ${panel}
            </a>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 28px;${font};font-size:13px;line-height:1.6;color:${MUTED}">
        Or paste this into your browser:<br />
        <a href="${url}" style="color:${BRAND};text-decoration:underline;word-break:break-all">${url}</a>
      </p>`
    : `<p style="margin:0 0 28px;${font};font-size:15px;line-height:1.6;color:${INK}">
         Ask ${invitedBy} for the web address to sign in at.
       </p>`;

  const step = (n: string, title: string, body: string) => `
    <tr>
      <td width="28" valign="top" style="padding:0 12px 14px 0;${font};font-size:14px;font-weight:600;color:${BRAND}">${n}</td>
      <td valign="top" style="padding:0 0 14px;${font};font-size:14px;line-height:1.6;color:${INK}">
        <strong style="font-weight:600">${title}</strong><br />
        <span style="color:${MUTED}">${body}</span>
      </td>
    </tr>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<title>You have been added to ${workspace}</title>
</head>
<body style="margin:0;padding:0;background:${PAPER};-webkit-text-size-adjust:100%">

  <!-- The inbox preview line. Hidden in the message itself, and padded so a
       client does not pull the next visible words in after it. -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">
    ${invitedBy} added you to ${workspace}. Sign in with this email address. There is no password to set.
    &#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAPER}">
    <tr>
      <td align="center" style="padding:32px 16px">

        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"
               style="width:100%;max-width:560px;background:#ffffff;border:1px solid ${LINE};border-radius:16px">

          <tr>
            <td style="padding:36px 36px 0">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  ${badge}
                  <td style="padding-left:12px;${font};font-size:14px;font-weight:600;color:${MUTED}">
                    ${panel}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:28px 36px 0">
              <h1 style="margin:0 0 12px;${font};font-size:24px;line-height:1.3;font-weight:700;color:${INK}">
                You have been added to ${workspace}
              </h1>
              <p style="margin:0 0 28px;${font};font-size:16px;line-height:1.6;color:${MUTED}">
                <strong style="color:${INK};font-weight:600">${invitedBy}</strong> gave you access.
                Everything the business has written, its heads, its work and its notes, is
                waiting for you inside.
              </p>
              ${button}
            </td>
          </tr>

          <tr>
            <td style="padding:0 36px">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="background:${PAPER};border-radius:12px">
                <tr>
                  <td style="padding:20px 20px 6px">
                    <p style="margin:0 0 14px;${font};font-size:13px;font-weight:600;letter-spacing:0.4px;text-transform:uppercase;color:${MUTED}">
                      What happens next
                    </p>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      ${step("1", "Sign in with Google", `Use <strong style="color:${INK};font-weight:600">${to}</strong>, the address this was sent to.`)}
                      ${step("2", "No password, no code", "Your email address is what grants you access. There is nothing to set up.")}
                      ${step("3", "Start where you like", "Ask a question, read the wiki, or look at what is on the board.")}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:28px 36px 36px">
              <p style="margin:0;padding-top:20px;border-top:1px solid ${LINE};${font};font-size:13px;line-height:1.6;color:${MUTED}">
                You are getting this because ${invitedBy} added ${to} to ${workspace}.
                If that was not meant for you, ignore it. Nothing happens until you sign in.
              </p>
            </td>
          </tr>

        </table>

        <p style="margin:20px 0 0;${font};font-size:12px;color:${MUTED}">
          Sent by ${panel}
        </p>

      </td>
    </tr>
  </table>

</body>
</html>`;
}

/** The same message for a client showing plain text, which some still do. */
export function inviteText(view: InviteView): string {
  return [
    `${view.invitedBy} added you to ${view.workspace} on ${view.panel}.`,
    "",
    view.url
      ? `Open it here:\n${view.url}`
      : `Ask ${view.invitedBy} for the web address to sign in at.`,
    "",
    "WHAT HAPPENS NEXT",
    "",
    `1. Sign in with Google, using ${view.to}, the address this was sent to.`,
    "2. There is no password to set and no code to enter. Your email address",
    "   is what grants you access.",
    "3. Start wherever you like: ask a question, read the wiki, or look at",
    "   what is on the board.",
    "",
    `You are getting this because ${view.invitedBy} added ${view.to} to`,
    `${view.workspace}. If that was not meant for you, ignore it. Nothing`,
    "happens until you sign in.",
  ].join("\n");
}
