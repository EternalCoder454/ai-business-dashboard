import { titleBody } from "@/lib/schemas";
import { auth } from "@/auth";
import { workspaceKey } from "@/db/keys";
import { membershipFor } from "@/db/tenancy";
import { askOnce } from "@/lib/askOnce";
import { readJson } from "@/lib/guard";
import { retryAfter } from "@/lib/rateLimit";
import { deriveConversationTitle, tidyTitle } from "@/lib/prompts";
import type { Provider } from "@/lib/providers";
import { track } from "@/lib/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What to call a conversation.
 *
 * The sidebar's title used to be written from the first message alone, by
 * rule, and it could only ever be a shortened version of the question. That is
 * fine for "Draft an email to the landlord" and useless for the half of
 * conversations that open with a paragraph of background, because the subject
 * is not in the first sentence and no rule can find it there.
 *
 * So this reads the question and the answer and writes a label. One call, on
 * the cheapest model each provider has, a few words out. It runs once per
 * conversation, after the first reply, and it costs a fraction of what the
 * reply it just read cost.
 *
 * On the business's own key. It is their conversation and their panel, and a
 * feature quietly billed to the deployment is a feature that gets switched off
 * the first time somebody totals up the invoice.
 *
 * Nothing here fails loudly. A title is worth about nothing next to the answer
 * it sits beside, so every way this can go wrong returns the one written from
 * the text, which is what the caller is already showing.
 */

const MAX_BODY = 8_000;

/** As much of either side as is worth reading to name the subject. */
const EXCERPT = 1_200;

const INSTRUCTIONS = [
  "Name this conversation.",
  "",
  "Reply with the name and nothing else. Two to six words. No quotes, no full",
  "stop, no preamble. Capitalise it as a sentence, not as a headline.",
  "",
  "Name the subject, not the request: a conversation that opens by asking for",
  "help pricing a rebuild is called Pricing the rebuild, not Request for help.",
  "Use the words the people used, including names of products, clients and",
  "places. If the subject is unclear from what you are given, answer with the",
  "single word Unclear.",
].join("\n");

/** The cheapest thing each provider sells that can write six words. */
function namingModel(provider: Provider): string {
  if (provider === "openai") return "gpt-4o-mini";
  if (provider === "google") return "gemini-2.5-flash";
  return "claude-haiku-4-5";
}

async function credentials(
  workspaceId: string | null,
): Promise<{ provider: Provider; key: string } | null> {
  for (const provider of ["anthropic", "openai", "google"] as Provider[]) {
    const theirs = workspaceId ? await workspaceKey(workspaceId, provider) : "";
    if (theirs) return { provider, key: theirs };
  }
  const server = process.env.ANTHROPIC_API_KEY?.trim();
  return server ? { provider: "anthropic", key: server } : null;
}

export async function POST(request: Request) {
  const parsed = await readJson(request, titleBody, MAX_BODY);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: parsed.status });

  const question = (parsed.body.question ?? "").trim();
  const answer = (parsed.body.answer ?? "").trim();
  const fallback = deriveConversationTitle(question);
  if (!question) return Response.json({ title: fallback });

  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return Response.json({ title: fallback });

  /*
   * One conversation is named once, so this is a loop guard rather than a
   * ration. Thirty an hour is more conversations than anybody starts and far
   * fewer than a page refreshing in a cycle would make.
   */
  if ((await retryAfter(`title:${email}`, 30, 60 * 60_000)) > 0) {
    return Response.json({ title: fallback });
  }

  const workspaceId = (await membershipFor(email))?.workspaceId ?? null;
  const found = await credentials(workspaceId);
  if (!found) return Response.json({ title: fallback });

  const named = await track("conversation.title", workspaceId ?? undefined, async () => {
    const reply = await askOnce({
      provider: found.provider,
      model: namingModel(found.provider),
      apiKey: found.key,
      system: INSTRUCTIONS,
      question: [
        `Asked: ${question.slice(0, EXCERPT)}`,
        answer ? `Answered: ${answer.slice(0, EXCERPT)}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      maxTokens: 24,
      // The same conversation should not be called two different things on
      // two different days.
      exact: true,
      cacheSystem: true,
    });
    return reply ? tidyTitle(reply.text) : "";
  }).catch(() => "");

  return Response.json({ title: named || fallback });
}
