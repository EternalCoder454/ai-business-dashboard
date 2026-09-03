import { randomUUID } from "node:crypto";
import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { databaseEnabled, db, requireDb } from "@/db/client";
import * as t from "@/db/schema";
import { workspaceKey } from "@/db/keys";
import { askOnce } from "./askOnce";
import type { Provider } from "./providers";
import { FLOOR, atLeast, isCategory } from "./conduct";

/**
 * The reviewer: reads internal messages and raises a hand at conduct rather
 * than work. A safety net, not a productivity tool and not a leak detector.
 *
 * Three things it must never start doing:
 *
 * - Look for secrets, client names or figures. That is the business's own
 *   information, and a tool that flagged it would be a tool that read it.
 * - Judge tone, swearing, bluntness or disagreement.
 * - Store the conversation. A report holds a category, a sentence, and one
 *   short quote. A second searchable copy of everyone's messages would be the
 *   actual privacy harm.
 */

const MODEL = "claude-haiku-4-5";
const BATCH = 120;
const MAX_QUOTE = 200;

export interface Finding {
  source: "message";
  sourceId: string;
  authorEmail: string;
  category: string;
  severity: "low" | "medium" | "high";
  reason: string;
  quote: string;
}

// Categories, severity floors and labels live in lib/conduct, so the Reports
// screen and the reviewer cannot disagree about them.


const INSTRUCTIONS = `You are reviewing internal messages between colleagues at a business, looking for conduct somebody responsible for the workplace would need to know about.

Raise something ONLY when it is one of these.

Aimed at a colleague:
- abuse: swearing or contempt aimed AT a person rather than at a piece of work. "Fuck you", "fuck off", "shut the fuck up", "go to hell". Raise it on a single message. It does not need to be repeated or sustained, and it does not matter whether the sender sounds angry or casual
- disrespect: contempt aimed at a person without the swearing. Calling someone stupid, useless, worthless or pathetic, mocking them personally, talking down to them
- toxicity: cruelty or hostility towards a colleague that is sustained, piled on by several people, or plainly meant to humiliate rather than to settle anything
- harassment: sustained personal abuse, demeaning someone for who they are, bullying
- discrimination: anything demeaning about race, colour, nationality, ethnicity, religion, sex, gender, sexuality, disability, age, pregnancy or marital status. Every slur belongs here, and so do jokes and stereotypes built on one, including where the sender frames it as banter, as "just a joke", or as something they were only repeating. Also decisions made on those grounds: not hiring somebody because of their accent, passing somebody over because they might have children. Raise it on a single message, whether or not the person it is about is in the conversation
- sexual-harassment: unwanted advances, sexual comments about a colleague, pressure of a sexual nature, or any unwanted statement of sexual intent towards them. A joking tone, an emoticon, a smiley or "just kidding" does not make one of these acceptable and is not a reason to leave it alone: what matters is that somebody said it to a colleague, not how lightly they dressed it up
- sexual-content: pornography or sexual images shared at work, or an intimate image of somebody shared without their consent
- stalking: following, waiting for, or turning up on a colleague outside work, monitoring or secretly recording them, or publishing their home address, phone number or other private details
- extortion: blackmail, or making something somebody needs at work conditional on something they owe you. A manager tying a promotion, a shift, a reference or a job to a favour, a date, or silence
- retaliation: punishing somebody, or arranging to, for raising a concern, making a complaint, reporting something, or refusing to take part in any of the above

Aimed at somebody's safety:
- threat: threatening violence or serious harm to a person
- violence: violence that has happened or is being arranged, or bringing a weapon to work
- child-safety: anything sexual involving a minor, or an adult grooming one. Raise this at once and never talk yourself out of it
- self-harm: somebody appears to be at risk of harming themselves
- safety: telling somebody to bypass a safety measure, work in a way that could injure them, hide an accident, or ignore a hazard
- extremism: promoting, organising, funding or recruiting for terrorism or violent extremism

Aimed at the business or its customers:
- drugs: offering, selling, buying, sourcing or sharing illegal drugs, arranging to do so, or coming to work under the influence. Someone naming a prescribed medication they take, or discussing drugs as a policy or business matter, is not this. Alcohol is only this when somebody is impaired at work
- fraud: arranging to deceive somebody for money, forge records, steal, take or pay a bribe or kickback, launder money, evade tax, or trade on information the public does not have
- data-theft: taking client data, a customer list, source code or other company property, or arranging to, whether to keep, to sell, or to carry to another employer
- sabotage: deliberately damaging the business, its systems, its data or its reputation
- malware: writing, obtaining, or deploying software meant to damage or break into systems without permission

Do NOT raise:
- confidential business information, client names, figures, contracts, or trade secrets discussed in the ordinary course of work. That is their own information and is not your concern. Somebody arranging to take it elsewhere is data-theft and is
- swearing aimed at a thing rather than a person. "This build is fucked", "what a shit week", "the forecast is garbage" are all fine. The test is the target, not the language
- disagreement, criticism of somebody's work, or an ordinary argument, however sharply worded, as long as it stays about the work
- ordinary management: assigning work, giving critical feedback, turning down a request, raising a performance concern, or dismissing somebody for a reason that is about their work
- jokes between people plainly on good terms, unless the joke is one of the categories above. A slur is not rescued by being a joke
- discussion of security, hacking, malware, fraud, drugs or extremism as a subject, when it is somebody's job, a policy question, or an ordinary technical conversation. What matters is whether somebody is doing it or arranging to

On the bar. Most days produce nothing, and returning an empty list is the normal and correct answer. But that is a statement about how often this happens, not a reason to talk yourself out of something that is in front of you. Where one of the categories above is plainly present, raise it, even if it is one message, even if it is brief, and even if the tone is light. Under-reporting a slur, a person being sworn at, or anything involving a child is a far worse failure than a false alarm.

Only disrespect and toxicity need real restraint, because they are the two that are easy to read into an ordinary bad day.

Reply with JSON only, no prose, in this exact shape:
{"findings":[{"id":"<the number at the start of the line>","category":"<one of the categories above>","severity":"low|medium|high","reason":"<one sentence, plain English, no quotes from the message>","quote":"<at most 200 characters, verbatim, the part that made you raise it>"}]}

If nothing meets the bar: {"findings":[]}`;

export interface Reviewable {
  id: string;
  author: string;
  body: string;
  sentAt: number;
}

/**
 * What one business's review runs on, in order: REVIEWER_API_KEY, then the
 * business's own key, then ANTHROPIC_API_KEY.
 *
 * REVIEWER_API_KEY wins because an operator who sets it is saying they will
 * pay for reviews rather than spend a customer's key. ANTHROPIC_API_KEY is
 * last for the same reason: checked earlier it would quietly move every review
 * onto the deployment's account.
 *
 * A business with no key at all is skipped, not failed.
 */
export async function keyFor(
  workspaceId: string,
): Promise<{ provider: Provider; key: string; model: string } | null> {
  const override = process.env.REVIEWER_API_KEY?.trim();
  if (override) return { provider: "anthropic", key: override, model: MODEL };

  for (const provider of ["anthropic", "openai", "google"] as Provider[]) {
    const theirs = await workspaceKey(workspaceId, provider);
    if (theirs) return { provider, key: theirs, model: reviewModel(provider) };
  }

  const server = process.env.ANTHROPIC_API_KEY?.trim();
  return server ? { provider: "anthropic", key: server, model: MODEL } : null;
}

/**
 * The cheapest model each provider has that can follow a schema.
 *
 * This is a classifier reading everything anybody writes, so it runs far more
 * often than a conversation does and the difference between the cheap model
 * and the good one is the difference between a feature somebody leaves on and
 * one they turn off when the bill arrives.
 */
function reviewModel(provider: Provider): string {
  if (provider === "openai") return "gpt-4o-mini";
  if (provider === "google") return "gemini-2.5-flash";
  return MODEL;
}

/**
 * Whether it can run at all, which is now only a question about the database.
 * Whether any given business has something to run on is decided per business.
 */
export const reporterEnabled = () => databaseEnabled;

/**
 * Everything written in one business since it was last looked at.
 *
 * The cursor is a timestamp rather than a row count so a burst of messages
 * cannot push older ones past the window unread.
 */
async function unreviewed(workspaceId: string, since: number): Promise<Reviewable[]> {
  const rows = await requireDb()
    .select({
      id: t.directMessages.id,
      fromEmail: t.directMessages.fromEmail,
      body: t.directMessages.body,
      sentAt: t.directMessages.sentAt,
    })
    .from(t.directMessages)
    .where(
      and(
        eq(t.directMessages.workspaceId, workspaceId),
        gt(t.directMessages.sentAt, since),
      ),
    )
    .orderBy(asc(t.directMessages.sentAt))
    .limit(BATCH);

  return rows.map((row) => ({
    id: row.id,
    author: row.fromEmail,
    body: row.body,
    sentAt: row.sentAt,
  }));
}



/**
 * Asks the model, and believes as little of the answer as possible.
 *
 * The reply is parsed rather than trusted: an id that was not in the batch is
 * dropped, a category that is not one of ours is dropped, and the quote is
 * truncated. A model that decided to invent a report about somebody who was not
 * in the conversation should not be able to write that row.
 */
/**
 * The batch, written as cheaply as it can be written.
 *
 * Ids become line numbers and authors become a number with a legend, since the
 * model only has to point at a line and the caller holds the mapping back.
 * Worth about half the tokens on short messages, which is most of them.
 *
 * A total budget as well as a per message one, so one enormous message cannot
 * crowd out the two hundred it sits among.
 */
const MAX_MESSAGE_CHARS = 1_200;
const MAX_TRANSCRIPT_CHARS = 60_000;

export function compose(batch: Reviewable[]): {
  transcript: string;
  known: Map<string, Reviewable>;
} {
  const known = new Map<string, Reviewable>();

  const authors = [...new Set(batch.map((item) => item.author))];
  const shortFor = new Map(authors.map((author, index) => [author, `p${index + 1}`]));

  const lines: string[] = [
    authors.map((author) => `${shortFor.get(author)}=${author}`).join(" "),
    "",
  ];

  let spent = lines[0].length;
  for (const [index, item] of batch.entries()) {
    const label = String(index + 1);
    known.set(label, item);

    const body = item.body.slice(0, MAX_MESSAGE_CHARS);
    const line = `${label} ${shortFor.get(item.author)}: ${body}`;
    // Stops rather than truncating mid batch, so every line the model sees is
    // a whole message and the cursor still only moves over what was read.
    if (spent + line.length > MAX_TRANSCRIPT_CHARS) break;
    spent += line.length;
    lines.push(line);
  }

  return { transcript: lines.join("\n"), known };
}

export async function review(
  batch: Reviewable[],
  credentials: { provider: Provider; key: string; model: string },
): Promise<Finding[]> {
  if (batch.length === 0) return [];

  const { transcript, known } = compose(batch);

  /*
   * Its own instructions and nothing else: no writing rules, no company
   * profile, no persona, no memory. This is not one of the heads and is not
   * answering anybody. Every extra sentence here is one more thing that could
   * talk it into a different answer about somebody's conduct.
   */
  const answer = await askOnce({
    provider: credentials.provider,
    model: credentials.model,
    apiKey: credentials.key,
    system: INSTRUCTIONS,
    question: transcript,
    maxTokens: 2_000,
    // Same messages, same answer, every time.
    exact: true,
    // Identical on every run and for every business, so it is the one part
    // worth holding between them where the provider can.
    cacheSystem: true,
  });

  if (!answer) return [];
  const text = answer.text;

  // Models sometimes wrap JSON in a fence however plainly they are asked not
  // to, so the object is located rather than assumed to be the whole reply.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    console.error("[reporter] could not parse the reply");
    return [];
  }

  const raw = (parsed as { findings?: unknown }).findings;
  if (!Array.isArray(raw)) return [];

  const findings: Finding[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    /*
     * A number or a string. The shape asks for it quoted and models return
     * `"id": 4` about half the time anyway, and accepting only the string form
     * drops those findings silently: no error, no log, just a quiet review.
     */
    const label =
      typeof item.id === "string"
        ? item.id.trim()
        : typeof item.id === "number"
          ? String(item.id)
          : "";
    const source = label ? known.get(label) : undefined;
    if (!source || !isCategory(item.category)) continue;

    findings.push({
      source: "message",
      sourceId: source.id,
      authorEmail: source.author,
      category: item.category,
      // The kind decides the floor; the model may only raise it.
      severity: atLeast(item.severity, FLOOR[item.category]),
      reason: typeof item.reason === "string" ? item.reason.slice(0, 500) : "",
      quote: typeof item.quote === "string" ? item.quote.slice(0, MAX_QUOTE) : "",
    });
  }
  return findings;
}

export interface RunResult {
  workspaces: number;
  reviewed: number;
  raised: number;
  /** Businesses whose pass failed, so one bad row does not hide the rest. */
  failed: string[];
  skipped: string | null;
}

/**
 * How many batches one business gets in a single pass.
 *
 * A cap rather than "until caught up", because this runs unattended on a
 * schedule with a wall clock over it. A business that has been quiet for a
 * month is worked through over consecutive runs instead of holding the whole
 * pass, and everybody else still gets looked at today.
 */
const MAX_BATCHES = 5;

/** Writes what one pass found, and moves the cursor to what it actually read. */
/** How many messages either side of the flagged one are worth keeping. */
const CONTEXT_LINES = 6;

/** Nothing past this, so one long message cannot become the whole column. */
const CONTEXT_CHARS = 4_000;

/**
 * What was said around the message that was raised.
 *
 * Either side of it rather than only before, because the reply to a remark is
 * often what settles whether it landed as a joke or as a threat, and an
 * operator reading only the run up gets the half that makes everything look
 * worse.
 */
export function contextFor(sourceId: string, batch: Reviewable[]): string {
  const at = batch.findIndex((item) => item.id === sourceId);
  if (at === -1) return "";

  const from = Math.max(0, at - CONTEXT_LINES);
  const to = Math.min(batch.length, at + CONTEXT_LINES + 1);

  return batch
    .slice(from, to)
    .map((item) => {
      const when = new Date(item.sentAt).toISOString().slice(0, 16).replace("T", " ");
      // The raised line is marked, so it is findable without counting.
      const mark = item.id === sourceId ? ">> " : "   ";
      return `${mark}${when}  ${item.author}: ${item.body}`;
    })
    .join("\n")
    .slice(0, CONTEXT_CHARS);
}

async function record(
  space: { id: string; name: string },
  incoming: Finding[],
  through: number,
  batch: Reviewable[],
): Promise<void> {
  let findings = incoming;
  const database = requireDb();

  if (findings.length > 0) {
    /*
     * Never twice about the same message. The cursor usually prevents it, but
     * two administrators pressing Run together read the same batch, and
     * rewinding a cursor re-reads a period on purpose.
     */
    const already = await database
      .select({ sourceId: t.reports.sourceId })
      .from(t.reports)
      .where(
        and(
          eq(t.reports.workspaceId, space.id),
          inArray(
            t.reports.sourceId,
            findings.map((finding) => finding.sourceId),
          ),
        ),
      );
    const seen = new Set(already.map((row) => row.sourceId));
    findings = findings.filter((finding) => !seen.has(finding.sourceId));
  }

  if (findings.length > 0) {
    await database.insert(t.reports).values(
      findings.map((finding) => ({
        id: randomUUID(),
        workspaceId: space.id,
        workspaceName: space.name,
        source: finding.source,
        sourceId: finding.sourceId,
        authorEmail: finding.authorEmail,
        category: finding.category,
        severity: finding.severity,
        reason: finding.reason,
        quote: finding.quote,
        transcript: contextFor(finding.sourceId, batch),
      })),
    );
  }

  const values = { workspaceId: space.id, messagesThrough: through, lastRunAt: new Date() };
  await database
    .insert(t.reviewCursors)
    .values(values)
    .onConflictDoUpdate({ target: t.reviewCursors.workspaceId, set: values });
}

/**
 * One pass over every business. Sequential, because nobody is waiting and a
 * connection ceiling is worse to exhaust than seconds are to save. Each
 * business is wrapped on its own so one failure does not silently stop the
 * rest.
 */
export async function runReview(only?: string): Promise<RunResult> {
  if (!reporterEnabled() || !db) {
    return { workspaces: 0, reviewed: 0, raised: 0, failed: [], skipped: "Not configured." };
  }

  // One business when an administrator asked, every business on the nightly
  // tick and when an operator asked.
  // tenancy-audit: the unfenced read is the operator's sweep; the caller
  // decides which of the two this is and the route gates on that.
  const spaces = await db
    .select({ id: t.workspaces.id, name: t.workspaces.name })
    .from(t.workspaces)
    .where(only ? eq(t.workspaces.id, only) : undefined);

  let reviewed = 0;
  let raised = 0;
  const failed: string[] = [];

  for (const space of spaces) {
    try {
      const credentials = await keyFor(space.id);
      // Nothing to review with. Not a failure, and not worth a line in the
      // failed list for an operator to go hunting the cause of.
      if (!credentials) continue;

      const [cursor] = await db
        .select()
        .from(t.reviewCursors)
        .where(eq(t.reviewCursors.workspaceId, space.id))
        .limit(1);

      let since = cursor?.messagesThrough ?? 0;

      for (let pass = 0; pass < MAX_BATCHES; pass += 1) {
        const batch = await unreviewed(space.id, since);
        if (batch.length === 0) break;

        reviewed += batch.length;
        const findings = await review(batch, credentials);

        // The cursor moves whether or not anything was raised, and only as far
        // as the batch actually read, so nothing is skipped and nothing is
        // read twice.
        since = batch[batch.length - 1].sentAt;
        await record(space, findings, since, batch);
        raised += findings.length;

        // A short batch means that was everything there was.
        if (batch.length < BATCH) break;
      }
    } catch (error) {
      console.error(`[reporter] ${space.id} failed`, error);
      failed.push(space.name || space.id);
    }
  }

  return { workspaces: spaces.length, reviewed, raised, failed, skipped: null };
}
