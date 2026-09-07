/**
 * The offer at the end of a reply, pulled out and made clickable.
 *
 * Heads finish on one nearly every time: "Want me to draft the email?", "Should
 * I check last month's numbers too?". It is the most useful sentence in the
 * answer and it was the least usable, because acting on it meant typing back
 * the thing the head had just written.
 *
 * Two things happen here. The offer comes out of the prose, so the reply ends
 * on its last real sentence instead of trailing off into a question. And it is
 * turned around into an instruction, because a button that sends "Want me to
 * draft the email?" is a person asking a head the head's own question.
 *
 *   "Want me to draft the email?"  ->  "Draft the email."
 *
 * Deliberately narrow. This reads text a model wrote and no pattern over that
 * is ever safe, so everything below fails towards leaving the reply alone: a
 * paragraph that is not entirely offers is not touched, and an offer whose
 * instruction cannot be read off it is dropped rather than guessed at. Nothing
 * is ever removed from a reply without a button appearing in its place.
 */

/** More than a few is a menu, and a menu is not what a head was doing. */
const MAX_OFFERS = 3;

/**
 * The shapes an offer arrives in, each capturing the part that is the actual
 * instruction. Ordered specific first: "want me to" has to be tried before the
 * bare "want", or the instruction comes out starting with "me to".
 */
const OFFERS: RegExp[] = [
  /^(?:and\s+|also,?\s+|or\s+)?(?:want|do you want|did you want)\s+me\s+to\s+(.+)$/i,
  /^(?:and\s+|also,?\s+|or\s+)?would you like me to\s+(.+)$/i,
  /^(?:and\s+|also,?\s+|or\s+)?(?:shall|should|can|could)\s+i\s+(.+)$/i,
  /^(?:and\s+|also,?\s+|or\s+)?let me know if you(?:'d| would)?\s*(?:like|want)\s+me\s+to\s+(.+)$/i,
  /^(?:and\s+|also,?\s+|or\s+)?i can\s+(.+?)\s+if you(?:'d| would)?\s*(?:like|want|prefer)\.?$/i,
  /^(?:and\s+|also,?\s+|or\s+)?happy to\s+(.+?)\s+if you(?:'d| would)?\s*(?:like|want|prefer)\.?$/i,
];

/**
 * A paragraph that is markup rather than prose, which this must not take apart.
 *
 * A closing line can be a bullet list of options or a table row, and a sentence
 * splitter run over either of those produces nonsense.
 */
const MARKUP = /^\s*(?:[-*+>#|]|\d+\.\s|```)/;

export interface Split {
  /** The reply with the offers removed, or unchanged when none were found. */
  body: string;
  /** What the buttons say and send, in the order they were offered. */
  offers: string[];
}

/** "draft the email?" -> "Draft the email." */
function asInstruction(tail: string): string {
  const text = tail.trim().replace(/[?.!,;:\s]+$/, "").trim();

  // Too short to be an instruction, or long enough that it is a paragraph
  // wearing a question mark rather than an offer.
  if (text.length < 3 || text.length > 200) return "";

  // A sentence of its own inside the offer means the split was wrong.
  if (/[.!?]\s/.test(text)) return "";

  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

/** The instruction inside one sentence, or nothing if it is not an offer. */
function offerIn(sentence: string): string {
  for (const pattern of OFFERS) {
    const found = sentence.match(pattern);
    if (found?.[1]) {
      const instruction = asInstruction(found[1]);
      if (instruction) return instruction;
    }
  }
  return "";
}

export function splitOffers(reply: string): Split {
  const body = reply.trimEnd();
  const unchanged: Split = { body: reply, offers: [] };

  /*
   * An odd number of fences means one is still open, which happens on every
   * frame of a streaming reply. Reading the "last paragraph" of a half written
   * code block and deleting it is not a thing to do to somebody's answer.
   */
  if ((body.match(/```/g) ?? []).length % 2 !== 0) return unchanged;

  const paragraphs = body.split(/\n\s*\n/);
  const last = paragraphs[paragraphs.length - 1] ?? "";

  if (!last.trim() || MARKUP.test(last) || last.includes("\n")) return unchanged;

  const sentences = last
    .trim()
    .split(/(?<=[.?!])\s+/)
    .filter(Boolean);

  /*
   * Taken from the end backwards, stopping at the first sentence that is not
   * an offer.
   *
   * The closing paragraph is usually not all offer. "That is a question for
   * Theo, he would know whether it is settings or hardware. Want me to log it
   * as a task?" is the ordinary shape, and a rule that wanted the whole
   * paragraph left the most common ending there is untouched. Working
   * backwards keeps the sentence that says something and takes the one that
   * asks.
   */
  const offers: string[] = [];
  let cut = sentences.length;
  for (let index = sentences.length - 1; index >= 0; index--) {
    const instruction = offerIn(sentences[index]);
    if (!instruction) break;
    if (!offers.includes(instruction)) offers.unshift(instruction);
    cut = index;
  }

  if (offers.length === 0) return unchanged;

  /*
   * A reply that is nothing but its offer keeps it. Removing it would leave an
   * empty bubble above a button, and the question is the whole message.
   */
  const rest = [...paragraphs.slice(0, -1), sentences.slice(0, cut).join(" ")]
    .filter((part) => part.trim())
    .join("\n\n")
    .trimEnd();
  if (!rest) return unchanged;

  return { body: rest, offers: offers.slice(0, MAX_OFFERS) };
}
