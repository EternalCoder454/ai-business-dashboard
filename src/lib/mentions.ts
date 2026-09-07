/**
 * Pointing a head at something else in the panel, with @.
 *
 * A head could only ever see the conversation it was in. So "what did Finance
 * say about this" got a polite explanation that it has no way to look, and the
 * answer was to copy the other conversation in by hand.
 *
 * Now the question can name what it means: another head, a project, or a
 * conversation, and the thing named is read into the request.
 *
 * The reference lives in the text of the message rather than in a column beside
 * it, which is a deliberate choice and not the lazy one:
 *
 *   The transcript says what was asked. "@Finance what did they say" is
 *   readable a year later by somebody who never saw the menu.
 *
 *   The reference stays current. Naming a conversation means the conversation,
 *   so a follow-up three replies later reads what is in it now rather than a
 *   copy taken the moment somebody pressed a key.
 *
 *   Nothing is stored twice. Copying a whole thread into every message that
 *   mentions it is how a panel that measures its writing in kilobytes stops
 *   doing that.
 *
 * The cost is that a rename breaks the link, which is the same cost a wiki link
 * has and is understood by everybody who has used one.
 */

export type MentionKind = "department" | "conversation" | "project";

/** Something that can be named, offered by the menu and matched by the parser. */
export interface Mentionable {
  kind: MentionKind;
  id: string;
  label: string;
  /** Shown beside the label in the menu, never part of the token. */
  detail?: string;
}

export interface Mention extends Mentionable {
  /** The exact token in the text, so it can be highlighted or replaced. */
  token: string;
}

/**
 * `@Finance` and `@[Q4 pricing]`.
 *
 * The bracketed form exists because most things worth naming have a space in
 * the name, and a bare @ cannot tell where "Q4 pricing review" stops and the
 * rest of the sentence starts. The menu writes the brackets, so nobody has to
 * know that.
 */
const TOKEN = /@\[([^\]\n]{1,120})\]|@([A-Za-z0-9][A-Za-z0-9._'&-]{0,60})/g;

/** Names compare loosely, so @finance finds Finance. */
const key = (label: string) => label.trim().toLowerCase();

export function findMentions(text: string, available: Mentionable[]): Mention[] {
  if (!text.includes("@")) return [];

  const byName = new Map<string, Mentionable>();
  // First wins, so the menu's own order decides which Finance is meant when a
  // project and a conversation share a name.
  for (const item of available) {
    const name = key(item.label);
    if (name && !byName.has(name)) byName.set(name, item);
  }

  const found: Mention[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(TOKEN)) {
    /*
     * The @ has to start a word, the same rule the menu opens on. Without it
     * "email someone@finance.co" is a message that quietly carries the whole of
     * Finance's context, and nothing on screen said so.
     */
    const at = match.index ?? 0;
    if (at > 0 && !/[\s(\[]/.test(text[at - 1])) continue;

    const name = match[1] ?? match[2] ?? "";
    const item = byName.get(key(name));
    // A word after an @ that names nothing is a word after an @. Email
    // addresses land here constantly and must pass through untouched.
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    found.push({ ...item, token: match[0] });
  }

  return found;
}

/** What the menu writes into the draft. */
export function tokenFor(item: Mentionable): string {
  return /[\s\]]/.test(item.label) ? `@[${item.label}]` : `@${item.label}`;
}

/**
 * The @ being typed right now, if the cursor is in one.
 *
 * Only ever the token the cursor sits in: an @ earlier in the sentence has been
 * finished with and reopening its menu halfway through the next word is the
 * behaviour that makes an autocomplete something people work around.
 */
export function mentionUnderCursor(
  text: string,
  cursor: number,
): { query: string; from: number } | null {
  const before = text.slice(0, cursor);

  const bracketed = before.match(/@\[([^\]\n]*)$/);
  if (bracketed) {
    return { query: bracketed[1], from: cursor - bracketed[0].length };
  }

  const bare = before.match(/@([A-Za-z0-9._'&-]*)$/);
  if (!bare) return null;

  /*
   * An @ has to start a word. Without this every email address in a draft
   * opens the menu on the domain, which is both wrong and impossible to type
   * past.
   */
  const at = cursor - bare[0].length;
  if (at > 0 && !/[\s(\[]/.test(text[at - 1])) return null;

  return { query: bare[1], from: at };
}

/** The menu's list, narrowed to what has been typed so far. */
export function matchMentions(query: string, available: Mentionable[]): Mentionable[] {
  const wanted = key(query);
  if (!wanted) return available.slice(0, 8);

  // Anything starting with what was typed, then anything containing it, so
  // typing "fin" puts Finance above "Q1 refinancing".
  const starts: Mentionable[] = [];
  const contains: Mentionable[] = [];
  for (const item of available) {
    const name = key(item.label);
    if (name.startsWith(wanted)) starts.push(item);
    else if (name.includes(wanted)) contains.push(item);
  }
  return [...starts, ...contains].slice(0, 8);
}

/**
 * What a mention adds to the request.
 *
 * Sent as its own block ahead of the question rather than spliced into the
 * sentence, so a head can tell the difference between what somebody asked and
 * what was fetched on their behalf.
 */
export function mentionBlock(parts: { label: string; kind: MentionKind; body: string }[]): string {
  if (parts.length === 0) return "";

  const named = parts
    .map(({ label, kind, body }) => `<${kind} name="${label}">\n${body.trim()}\n</${kind}>`)
    .join("\n\n");

  return `The message below refers to these by name. They are here because they were named, not because they are the subject.\n\n${named}`;
}
