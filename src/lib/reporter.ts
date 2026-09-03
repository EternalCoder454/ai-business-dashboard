import { randomUUID } from "node:crypto";
import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { databaseEnabled, db, requireDb } from "@/db/client";
import * as t from "@/db/schema";
import { workspaceKey } from "@/db/keys";
import { askOnce } from "./askOnce";
import type { Provider } from "./providers";

/**
 * The reviewer.
 *
 * It reads what people write to each other inside a business and raises a hand
 * when something looks like conduct rather than work: threatening a colleague,
 * pressuring somebody sexually, organising an attack on a system. It is a
 * safety net for the operator, not a productivity tool and not a leak detector.
 *
 * What it deliberately does not do:
 *
 * - It does not look for secrets, client names, figures, or anything else
 *   confidential. That is the business's own information and none of ours; a
 *   tool that flagged it would be a tool that read it.
 * - It does not judge tone, swearing, bluntness, disagreement, or gossip. A
 *   panel that reported people for being short with each other would be worse
 *   than one that reported nothing.
 * - It does not store the conversation. A report holds a category, a sentence
 *   of reasoning, and one short quote, so somebody can decide whether to open
 *   the original. Building a second, searchable copy of everyone's messages
 *   would be the actual privacy harm here.
 *
 * It runs on the deployment's own key rather than the customer's. This is the
 * operator's duty of care, and charging a business for the review of itself
 * would be both strange and a way of telling them it was happening by way of
 * an invoice.
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
  "harassment",
  "sexual-harassment",
  "threat",
  "malware",
  "fraud",
  "self-harm",
] as const;

const INSTRUCTIONS = `You are reviewing internal messages between colleagues at a business, looking only for conduct somebody responsible for the workplace would need to know about.

Raise something ONLY when it is one of these:
- harassment: sustained personal abuse, demeaning someone for who they are, bullying
- sexual-harassment: unwanted advances, sexual comments about a colleague, pressure of a sexual nature, or any unwanted statement of sexual intent towards them. A joking tone, an emoticon, a smiley or "just kidding" does not make one of these acceptable and is not a reason to leave it alone: what matters is that somebody said it to a colleague, not how lightly they dressed it up
- threat: threatening violence or serious harm to a person
- malware: writing, obtaining, or deploying software meant to damage or break into systems without permission
- fraud: arranging to deceive someone for money, forge records, or steal
- self-harm: somebody appears to be at risk of harming themselves

Do NOT raise:
- confidential business information, client names, figures, contracts, or trade secrets. That is their own information and is not your concern.
- swearing, bluntness, sarcasm, venting, complaining about work or about management
- disagreement, criticism of somebody's work, or an ordinary argument
- jokes between people who are plainly on good terms
- discussion of security, hacking, or malware as a subject, when it is somebody's job or an ordinary technical conversation

The bar is high. Most workplaces produce nothing. Returning an empty list is the normal, correct answer, and a false alarm about a real person costs more than a missed borderline case.

Reply with JSON only, no prose, in this exact shape:
{"findings":[{"id":"<the message id>","category":"<one of the categories above>","severity":"low|medium|high","reason":"<one sentence, plain English, no quotes from the message>","quote":"<at most 200 characters, verbatim, the part that made you raise it>"}]}

If nothing meets the bar: {"findings":[]}`;

export interface Reviewable {
  id: string;
  author: string;
  body: string;
  sentAt: number;
}

/**
 * What one business's review runs on, in order.
 *
 * The business's own key is the point of the change. This used to need
 * REVIEWER_API_KEY set on the deployment, and without it the reviewer did not
 * run at all: it never read a single message here in the months it has
 * existed, and nothing said so. A panel where every customer already brings a
 * key should not need a second one bolted on before a safety feature works.
 *
 * REVIEWER_API_KEY still wins where it is set, because an operator who sets it
 * is saying they want to pay for reviews themselves rather than spend a
 * customer's key on them. And ANTHROPIC_API_KEY is last rather than first,
 * which is the whole reason a separate variable existed: checked first it
 * would quietly move every review onto the deployment's own account.
 *
 * A business with no key of any kind is skipped rather than failed. There is
 * nothing to review with and nothing broken about that.
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
export async function review(
  batch: Reviewable[],
  credentials: { provider: Provider; key: string; model: string },
): Promise<Finding[]> {
  if (batch.length === 0) return [];

  const known = new Map(batch.map((item) => [item.id, item]));
  const transcript = batch
    .map((item) => `[${item.id}] ${item.author}: ${item.body.slice(0, 2_000)}`)
    .join("\n");

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
    const source = typeof item.id === "string" ? known.get(item.id) : undefined;
    if (!source || !isCategory(item.category)) continue;

    findings.push({
      source: "message",
      sourceId: source.id,
      authorEmail: source.author,
      category: item.category,
      severity:
        item.severity === "high" || item.severity === "low" ? item.severity : "medium",
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
     * Never twice about the same message.
     *
     * The cursor normally makes this impossible, and normally is not a
     * guarantee: two administrators pressing Run at the same moment read the
     * same batch, and an operator rewinding a cursor to re-read a period does
     * it deliberately. Found by doing exactly that, which put the same threat
     * in front of somebody twice with two differently worded reasons, and a
     * queue of accusations that grows every time anybody presses a button is
     * one nobody trusts.
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
 * One pass over every business.
 *
 * Sequential rather than parallel: this runs on a schedule with nobody waiting
 * for it, and a hosted database with a connection ceiling is a worse thing to
 * exhaust than a few seconds are to save.
 *
 * Each business is wrapped on its own. Unattended work that stops at the first
 * error stops silently, and the businesses after the broken one would go
 * unreviewed for as long as it stayed broken without anything saying so.
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
