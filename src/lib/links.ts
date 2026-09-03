/**
 * Links in a message, and which of them a business has agreed to.
 *
 * A link from a colleague is the one thing in a panel that carries somebody
 * somewhere else, and the address bar is the only thing that would have told
 * them where. Phishing inside a company's own tools works because the message
 * arrives from a name they trust.
 *
 * So a link survives only when its host is on the business's list. Everything
 * else is replaced with a marker before the message is stored, which means the
 * recipient never sees it and no later change of mind can bring it back.
 *
 * Removed rather than rewritten or warned about, because a warning next to a
 * live link is a warning people click past.
 *
 * @see db/links for the list itself, and api/messages for where this runs.
 */

/** What replaces a link nobody agreed to. */
export const REMOVED = "[link removed]";

/**
 * Endings that look like a domain and are not.
 *
 * `report.pdf`, `index.ts` and `v2.io` are all a dot followed by letters, and
 * a naive domain match turns every filename in a message into a link. This is
 * the list of endings that lose, and it deliberately includes `io`, `sh`, `me`
 * and `ai`, which are real top level domains and far more often a file.
 */
const NOT_A_DOMAIN = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs", "json", "md", "mdx", "txt", "csv",
  "py", "rb", "go", "rs", "java", "php", "css", "scss", "html", "htm", "xml",
  "yml", "yaml", "toml", "lock", "sql", "sh", "bat", "ps1", "env", "log",
  "png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "pdf", "doc", "docx",
  "xls", "xlsx", "ppt", "pptx", "zip", "tar", "gz", "mp4", "mov", "mp3", "wav",
]);

/**
 * Anything that reads as a link.
 *
 * Three shapes, in the order they are tried: a full URL, a `www.` host, and a
 * bare `host.tld` with an optional path. The last is the one that catches a
 * phishing domain typed without a scheme, and the one that needs the list
 * above to stay useful.
 *
 * The lookbehind is what keeps an email address whole. `\b` matches after the
 * `@` in ada@example.com, so without it that domain is a bare host and the
 * message comes out as "ask ada@[link removed] about it".
 */
const LINK = /(?<![@\w.-])((?:https?:\/\/|www\.)[^\s<>()[\]{}"'`]+|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,24}(?:\/[^\s<>()[\]{}"'`]*)?)/gi;

/** Punctuation that ends a sentence rather than a URL. */
const TRAILING = /[.,;:!?)\]}'"]+$/;

export interface FoundLink {
  /** As it appeared in the message. */
  raw: string;
  /** Lowercased host, with any `www.` removed. */
  host: string;
}

/** Every link in a message, in the order they appear. */
export function findLinks(text: string): FoundLink[] {
  const found: FoundLink[] = [];
  for (const match of text.matchAll(LINK)) {
    const raw = match[1].replace(TRAILING, "");
    if (!raw) continue;
    const host = hostOf(raw);
    if (!host) continue;
    found.push({ raw, host });
  }
  return found;
}

/**
 * The host part, or empty when this is not a link after all.
 *
 * An address is a host when it has a dot, a top level domain of letters, and
 * an ending that is not on the filename list. An email address is not a link
 * and is left alone: there is an `@` before the host, and taking the domain
 * out of somebody's address would mangle every message that names a colleague.
 */
export function hostOf(raw: string): string {
  const cleaned = raw.replace(TRAILING, "");
  const withScheme = /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;

  let host: string;
  try {
    const url = new URL(withScheme);
    // A URL carrying credentials is a classic disguise: the part before the @
    // is not the host, however much it looks like one.
    if (url.username || url.password) return url.hostname.toLowerCase();
    host = url.hostname.toLowerCase();
  } catch {
    return "";
  }

  if (!host.includes(".")) return "";
  const tld = host.slice(host.lastIndexOf(".") + 1);
  if (!/^[a-z]{2,24}$/.test(tld)) return "";
  if (NOT_A_DOMAIN.has(tld)) return "";

  return host.startsWith("www.") ? host.slice(4) : host;
}

/**
 * Whether a host is covered by the list.
 *
 * An entry covers itself and everything under it, so `example.com` allows
 * `docs.example.com`. It does not work upwards: allowing `docs.example.com`
 * says nothing about `example.com`, which is the whole point of being able to
 * name a subdomain.
 */
export function isAllowed(host: string, allowed: Iterable<string>): boolean {
  const target = host.toLowerCase().replace(/^www\./, "");
  for (const raw of allowed) {
    const entry = raw.toLowerCase().replace(/^www\./, "").replace(/^\.+|\.+$/g, "");
    if (!entry) continue;
    if (target === entry || target.endsWith(`.${entry}`)) return true;
  }
  return false;
}

export interface Scrubbed {
  /** The message as it will be stored. */
  text: string;
  /** Hosts that were taken out, each once, in the order they appeared. */
  removed: string[];
}

/**
 * Takes out every link the business has not agreed to.
 *
 * The marker replaces the link rather than the sentence around it, so what
 * somebody wrote still reads and the recipient can see that something was
 * there. Consecutive markers collapse: a message that was three bad links and
 * nothing else should say so once.
 */
export function scrubLinks(text: string, allowed: Iterable<string>): Scrubbed {
  const list = [...allowed];
  const removed: string[] = [];

  const scrubbed = text.replace(LINK, (match) => {
    const raw = match.replace(TRAILING, "");
    const tail = match.slice(raw.length);
    const host = hostOf(raw);
    if (!host) return match;
    if (isAllowed(host, list)) return match;
    if (!removed.includes(host)) removed.push(host);
    return REMOVED + tail;
  });

  return {
    text: scrubbed.replace(
      new RegExp(`(?:${escape(REMOVED)}[\\s,]*){2,}`, "g"),
      `${REMOVED} `,
    ).trimEnd(),
    removed,
  };
}

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * What a domain becomes when somebody types it into the allowlist.
 *
 * People paste a whole URL, so a scheme, a path and a `www.` all have to come
 * off. An empty result means it was not a domain and should be refused rather
 * than stored, since an empty entry would match nothing and look like it had
 * worked.
 */
export function normaliseDomain(input: string): string {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return "";
  return hostOf(trimmed);
}
