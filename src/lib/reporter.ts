import { randomUUID } from "node:crypto";
import { and, asc, eq, gt } from "drizzle-orm";
import { databaseEnabled, db, requireDb } from "@/db/client";
import * as t from "@/db/schema";

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
- sexual-harassment: unwanted advances, sexual comments about a colleague, pressure of a sexual nature
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

interface Reviewable {
  id: string;
  author: string;
  body: string;
  sentAt: number;
}

/**
 * The deployment's own key. Absent means the reviewer simply does not run.
 *
 * REVIEWER_API_KEY first, and it exists because the obvious variable is a trap
 * here. ANTHROPIC_API_KEY is checked before a workspace's own key everywhere
 * else, so setting it to give the reviewer something to run on would silently
 * take every customer off their own key and put the whole deployment's spend
 * on ours. A separate variable lets the review run without touching who pays
 * for chat. The fallback is for a single-tenant deployment, where the two are
 * the same key and there is nothing to keep apart.
 */
function serverKey(): string | null {
  return (
    process.env.REVIEWER_API_KEY?.trim() || process.env.ANTHROPIC_API_KEY?.trim() || null
  );
}

export const reporterEnabled = () => Boolean(serverKey()) && databaseEnabled;

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
async function review(batch: Reviewable[]): Promise<Finding[]> {
  const key = serverKey();
  if (!key || batch.length === 0) return [];

  const known = new Map(batch.map((item) => [item.id, item]));
  const transcript = batch
    .map((item) => `[${item.id}] ${item.author}: ${item.body.slice(0, 2_000)}`)
    .join("\n");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2_000,
      system: [
        {
          type: "text",
          text: INSTRUCTIONS,
          // The instructions are identical on every run and for every business,
          // so this is the one part worth holding between them.
          cache_control: { type: "ephemeral", ttl: "1h" },
        },
      ],
      messages: [{ role: "user", content: transcript }],
    }),
  });

  if (!response.ok) {
    console.error("[reporter] model refused", response.status, await response.text());
    return [];
  }

  const body = (await response.json()) as {
    content?: { type: string; text?: string }[];
  };
  const text = body.content?.find((block) => block.type === "text")?.text ?? "";

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
async function record(
  space: { id: string; name: string },
  findings: Finding[],
  through: number,
): Promise<void> {
  const database = requireDb();

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
export async function runReview(): Promise<RunResult> {
  if (!reporterEnabled() || !db) {
    return { workspaces: 0, reviewed: 0, raised: 0, failed: [], skipped: "Not configured." };
  }

  const spaces = await db
    .select({ id: t.workspaces.id, name: t.workspaces.name })
    .from(t.workspaces);

  let reviewed = 0;
  let raised = 0;
  const failed: string[] = [];

  for (const space of spaces) {
    try {
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
        const findings = await review(batch);

        // The cursor moves whether or not anything was raised, and only as far
        // as the batch actually read, so nothing is skipped and nothing is
        // read twice.
        since = batch[batch.length - 1].sentAt;
        await record(space, findings, since);
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
