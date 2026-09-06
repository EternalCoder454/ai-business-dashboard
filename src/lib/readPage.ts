import { request as httpsRequest } from "node:https";
import { pinnedLookup, resolvePublic } from "./addons/outbound";

/**
 * Reading one web page, for a head that was given an address.
 *
 * Search finds pages; this opens the one somebody named. They are different
 * questions and the panel could only answer the first, so "go to this address
 * and tell me what it is" got a head explaining it had no way to browse. It was
 * right: it had a search engine and no way to fetch.
 *
 * Every guard the addon sender uses applies here, and for a better reason. An
 * addon posts to a host an administrator approved in advance; this fetches
 * whatever address turns up in a conversation, which may have arrived in a
 * document, a search result or an email rather than from the person typing. So
 * the address is checked before the socket opens, the socket is pinned to the
 * address that was checked, redirects are refused, and nothing but https on the
 * standard port is allowed.
 */

/** Long enough for a slow page, short enough not to hang a reply behind it. */
const TIMEOUT_MS = 15_000;

/**
 * How much of a page is read off the wire.
 *
 * Generous, because it is bytes of markup rather than of text: a page with a
 * megabyte of script and styling can carry very little prose, and stopping
 * early would truncate the part worth reading.
 */
const MAX_BYTES = 2_000_000;

/** How much text comes back, after the markup is gone. */
const MAX_TEXT = 20_000;

export type PageResult =
  | { ok: true; url: string; title: string; text: string; truncated: boolean }
  /** Said plainly: this reaches a head mid answer, and then the person. */
  | { ok: false; detail: string };

/**
 * Readable text out of HTML, without a parser.
 *
 * Script and style go first and whole, contents included, because their bodies
 * are text as far as a tag stripper is concerned and a page's stylesheet is not
 * something a head should be reading. Then tags, then entities, then the
 * whitespace that markup leaves behind. It is not a browser and does not need
 * to be: what a head wants is the prose.
 */
export function textFromHtml(html: string): { title: string; text: string } {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "";

  const text = html
    .replace(/<(script|style|noscript|template|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    // Block ends become line breaks, so paragraphs do not run together into one
    // sentence that says something neither of them said.
    .replace(/<\/(p|div|section|article|h[1-6]|li|tr|br)[^>]*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();

  return { title: decodeEntities(title), text };
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .trim();
}

/** Never throws. A page that will not load is a sentence, not an exception. */
export async function readPage(address: string): Promise<PageResult> {
  let parsed: URL;
  try {
    // A bare hostname is what people type, so it is upgraded rather than
    // refused. https only either way: the upgrade never lands on http.
    parsed = new URL(/^https?:\/\//i.test(address) ? address : `https://${address}`);
  } catch {
    return { ok: false, detail: "That is not a web address." };
  }

  if (parsed.protocol !== "https:") {
    return { ok: false, detail: "Only https addresses can be read." };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, detail: "That address carried a sign-in, so it was not opened." };
  }
  if (parsed.port && parsed.port !== "443") {
    return { ok: false, detail: "Only the standard port can be read." };
  }

  const host = parsed.hostname.toLowerCase();
  const checked = await resolvePublic(host);
  if (!checked.ok) return { ok: false, detail: checked.detail };

  return get(parsed, checked.address, host);
}

/**
 * The request, pinned to an address that has already been checked.
 *
 * The pin is the point, exactly as it is for the addon sender: resolving,
 * approving, and then handing the hostname to a client that resolves it again
 * leaves a window where the second answer is a private address, which is the
 * whole of DNS rebinding.
 */
function get(url: URL, address: string, host: string): Promise<PageResult> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (result: PageResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const requested = httpsRequest(
      {
        protocol: "https:",
        host,
        port: 443,
        path: url.pathname + url.search,
        method: "GET",
        headers: {
          // Says what we are. A page that refuses this is a page that has
          // decided not to be read, which is its right.
          "User-Agent": "Eterneon-Panel/1 (+https://business.eterneon.net)",
          Accept: "text/html,text/plain;q=0.9,*/*;q=0.1",
          "Accept-Language": "en",
        },
        // TLS still verifies the certificate against the hostname, so pinning
        // the address does not weaken the identity check.
        servername: host,
        lookup: pinnedLookup(address),
        timeout: TIMEOUT_MS,
      },
      (response) => {
        const status = response.statusCode ?? 0;

        /*
         * Not followed, and this is the one place it costs something real: a
         * site that redirects http to https, or bare to www, simply will not
         * read. Following would mean checking the new address against every
         * guard again, and a redirect chain is the ordinary way a checked
         * public address becomes an unchecked private one. The head is told
         * where it was sent so it can ask for that address instead.
         */
        if (status >= 300 && status < 400) {
          const to = response.headers.location;
          requested.destroy();
          done({
            ok: false,
            detail: to
              ? `${host} redirects to ${to}. Ask for that address instead.`
              : `${host} redirected elsewhere.`,
          });
          return;
        }

        if (status < 200 || status >= 300) {
          requested.destroy();
          done({ ok: false, detail: `${host} answered ${status}.` });
          return;
        }

        const type = String(response.headers["content-type"] ?? "");
        if (type && !/text\/html|text\/plain|application\/xhtml/i.test(type)) {
          requested.destroy();
          done({ ok: false, detail: `${host} returned ${type.split(";")[0]}, which is not a page.` });
          return;
        }

        const chunks: Buffer[] = [];
        let seen = 0;
        response.on("data", (chunk: Buffer) => {
          seen += chunk.length;
          if (seen > MAX_BYTES) {
            response.destroy();
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => {
          const html = Buffer.concat(chunks).toString("utf8");
          const { title, text } = textFromHtml(html);
          if (!text) {
            done({ ok: false, detail: `${host} answered, but the page had no readable text.` });
            return;
          }
          done({
            ok: true,
            url: url.toString(),
            title: title || host,
            text: text.slice(0, MAX_TEXT),
            truncated: text.length > MAX_TEXT,
          });
        });
        response.on("error", () =>
          done({ ok: false, detail: `${host} stopped sending part way through.` }),
        );
      },
    );

    requested.on("timeout", () => {
      requested.destroy();
      done({ ok: false, detail: `${host} did not answer within ${TIMEOUT_MS / 1000} seconds.` });
    });
    // Logged rather than returned. The cause is useful to whoever runs the
    // server and is not something to hand a model, since a failure message can
    // carry the address and whatever the socket had to say about it.
    requested.on("error", (error) => {
      console.error("[readPage]", host, error);
      done({ ok: false, detail: `Could not reach ${host}.` });
    });
    requested.end();
  });
}
