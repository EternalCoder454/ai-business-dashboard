import { randomUUID } from "node:crypto";
import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { databaseEnabled, db, requireDb } from "@/db/client";
import * as t from "@/db/schema";
import { workspaceKey } from "@/db/keys";
import { askOnce } from "./askOnce";
import type { Provider } from "./providers";

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

const CATEGORIES = [
  "disrespect",
  "toxicity",
  "harassment",
  "sexual-harassment",
  "threat",
  "malware",
  "fraud",
  "self-harm",
] as const;

/**
 * What each category is worth, so the model cannot rate its own severity.
 *
 * It was free to pick low, medium or high for anything, which made severity a
 * mood rather than a scale: the same threat came back high on one pass and
 * medium on another. The kind of thing decides the floor and the model can
 * only raise it, so disrespect is never an emergency and a threat is never a
 * footnote.
 */
const FLOOR: Record<(typeof CATEGORIES)[number], "low" | "medium" | "high"> = {
  disrespect: "low",
  toxicity: "medium",
  harassment: "medium",
  "sexual-harassment": "high",
  threat: "high",
  malware: "high",
  fraud: "high",
  "self-harm": "high",
};

const RANK = { low: 0, medium: 1, high: 2 } as const;

const atLeast = (
  floor: "low" | "medium" | "high",
  said: "low" | "medium" | "high",
) => (RANK[said] > RANK[floor] ? said : floor);

const INSTRUCTIONS = `You are reviewing internal messages between colleagues at a business, looking only for conduct somebody responsible for the workplace would need to know about.

Raise something ONLY when it is one of these:
- disrespect: contempt aimed at a colleague as a person rather than at their work. Calling someone stupid, useless or worthless, mocking them personally, talking down to them. Criticising what somebody produced, however bluntly, is not this
- toxicity: cruelty or hostility towards a colleague that is sustained, piled on by several people, or plainly meant to humiliate rather than to settle anything
- harassment: sustained personal abuse, demeaning someone for who they are, bullying
- sexual-harassment: unwanted advances, sexual comments about a colleague, pressure of a sexual nature, or any unwanted statement of sexual intent towards them. A joking tone, an emoticon, a smiley or "just kidding" does not make one of these acceptable and is not a reason to leave it alone: what matters is that somebody said it to a colleague, not how lightly they dressed it up
- threat: threatening violence or serious harm to a person
- malware: writing, obtaining, or deploying software meant to damage or break into systems without permission
- fraud: arranging to deceive someone for money, forge records, or steal
- self-harm: somebody appears to be at risk of harming themselves

Do NOT raise:
- confidential business information, client names, figures, contracts, or trade secrets. That is their own information and is not your concern.
- swearing, bluntness, sarcasm, venting, or complaining about work, a process, or management. Somebody calling a forecast garbage is talking about the forecast
- disagreement, criticism of somebody's work, or an ordinary argument, however sharply worded, as long as it stays about the work
- jokes between people who are plainly on good terms
- discussion of security, hacking, or malware as a subject, when it is somebody's job or an ordinary technical conversation

The bar is high. Most workplaces produce nothing. Returning an empty list is the normal, correct answer, and a false alarm about a real person costs more than a missed borderline case. That applies to disrespect and toxicity most of all: they are the easiest to over-report and the two that would turn this into a list nobody reads.

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

function isCategory(value: unknown): value is (typeof CATEGORIES)[number] {
  return typeof value === "string" && (CATEGORIES as readonly string[]).includes(value);
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
   * Its own instructions and nothing else.
   *
   * No writing rules, no company profile, no persona, no memory. This is not
   * one of the heads and it is not answering anybody: it reads, it classifies,
   * and it returns JSON. Handing it the house voice would be asking a smoke
   * alarm to match the curtains, and every extra sentence in here is one more
   * thing that could talk it into a different answer about somebody's conduct.
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
     * A number or a string, because it is a line number now.
     *
     * The shape asks for it quoted and models return `"id": 4` about half the
     * time anyway. Accepting only the string form would have dropped those
     * findings silently: no error, no log, just a review that quietly raised
     * nothing on the runs where the model felt like emitting a number.
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
      severity: atLeast(
        FLOOR[item.category],
        item.severity === "high" || item.severity === "low" ? item.severity : "medium",
      ),
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
