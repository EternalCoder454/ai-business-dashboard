import { mapWithConcurrency, streamChat } from "./chatClient";
import { newId } from "./db";
import { buildSystemPrompt, deriveConversationTitle } from "./prompts";
import type {
  AllHandsRound,
  AllHandsRun,
  CompanyProfile,
  Department,
  MemoryEntry,
  Role,
  RoomBrevity,
  Settings,
  Skill,
  UserAccount,
} from "./types";

/**
 * How many heads answer at once. Eight simultaneous streams is enough to trip a
 * rate limit on a small account, and the wall clock difference against four is
 * a few seconds.
 */
const CONCURRENCY = 4;

export interface AllHandsOptions {
  /** The thread to append to. Omit to start a new one. */
  run?: AllHandsRun;
  question: string;
  departments: Department[];
  ceo: Department | undefined;
  profile: CompanyProfile;
  settings: Settings;
  skillsFor: (departmentId: string) => Skill[];
  /** Who is asking, so the heads address them by name in the room too. */
  account?: UserAccount;
  /** The studio's record, so the room argues from the same facts as a 1:1. */
  memory?: MemoryEntry[];
  /** Whether the CEO reads across the round once every head has answered. */
  synthesize: boolean;
  onProgress: (run: AllHandsRun) => void;
  signal?: AbortSignal;
}

/** Word budgets for a room answer. Tight is the default, because the whole
 * point of asking eight heads at once is breadth, and depth is what the 1:1
 * department chat is for. */
export const ROOM_BUDGET: Record<RoomBrevity, number> = {
  tight: 60,
  standard: 140,
};

/**
 * Appended to the question in the user turn, not the system prompt, for two
 * reasons. It keeps each head's system prefix byte-identical to the one their
 * 1:1 chat uses, so both modes share a single cache entry. And it overrides the
 * handoff and length behaviour for this reply only, without permanently
 * rewriting how the head works.
 *
 * The scope disclaimers this kills ("this is not really my area, Desmond should
 * cover pricing") come from writing rule 33 and the shared operating rules.
 * Both are correct in a 1:1 chat and pure waste in a room where every other
 * head is answering their own slice in parallel.
 */
function roomProtocol(budget: number): string {
  return `ROOM PROTOCOL. You are one of several department heads answering this same question at the same time. This overrides writing rule 33 and the handoff line in your operating rules, for this reply only.

1. Answer only for your own department. Every other head is answering for theirs right now, in parallel.
2. Never mention scope. Do not say something is not your area, do not hand anything off, do not name another head, and do not caveat that someone else should cover a part of it. The user already knows who is in the room, so a scope disclaimer is pure waste.
3. If the question barely touches your remit, give the single most useful thing your department can contribute and stop. Do not explain that it hardly applies to you.
4. Speak about another department's area only if the user addressed that part to you by name.
5. Hard limit: ${budget} words. Come in under it.
6. No preamble, no restating the question, no closing summary. Your first sentence is the answer.
7. Keep the reasoning, but compress it. One clause of why, in the same breath as the answer, not a paragraph after it.
8. Prose, not bullets, unless the answer genuinely is a short list of two or three items.`;
}

/**
 * Each head keeps their own linear thread: their prior answers, plus the CEO's
 * read of the last round so they can respond to where the room landed.
 *
 * Sending every head's full answer to every other head would cost roughly seven
 * times as much per round and mostly repeats what the synthesis already says.
 * Rounds where a head errored are dropped rather than half included, because
 * the API requires strict user and assistant alternation.
 */
function buildHeadHistory(
  rounds: AllHandsRound[],
  departmentId: string,
  question: string,
  budget: number,
): { role: Role; content: string }[] {
  const history: { role: Role; content: string }[] = [];

  for (const round of rounds) {
    const mine = round.responses.find((r) => r.departmentId === departmentId);
    if (!mine || mine.error || !mine.content.trim()) continue;
    history.push({ role: "user", content: round.question });
    history.push({ role: "assistant", content: mine.content });
  }

  const previous = rounds[rounds.length - 1];
  const lead =
    previous?.synthesis && !previous.synthesisError
      ? `The room has moved on. Here is the read from the top after the last round:\n\n${previous.synthesis}\n\nNext question for you:\n\n`
      : "";

  history.push({
    role: "user",
    content: `${lead}${question}\n\n${roomProtocol(budget)}`,
  });
  return history;
}

/**
 * Puts one question to every head, then optionally has the CEO read across the
 * answers. Appends to an existing thread when `run` is given.
 *
 * This is the only code that knows the fan-out is N live streams. Moving it to
 * the Batches API (half price, but minutes to an hour of latency) means
 * rewriting this function to submit and poll, without touching the page or the
 * store. That trade only makes sense for work nobody is waiting on, such as a
 * scheduled overnight briefing.
 */
export async function runAllHandsRound(options: AllHandsOptions): Promise<AllHandsRun> {
  const {
    run: existing,
    question,
    departments,
    ceo,
    profile,
    settings,
    skillsFor,
    account,
    memory = [],
    synthesize,
    onProgress,
    signal,
  } = options;

  const budget = ROOM_BUDGET[settings.roomBrevity ?? "tight"];
  const now = Date.now();

  const run: AllHandsRun = existing
    ? { ...existing, rounds: [...existing.rounds], status: "running", updatedAt: now }
    : {
        id: newId("room"),
        title: deriveConversationTitle(question),
        rounds: [],
        status: "running",
        createdAt: now,
        updatedAt: now,
      };

  const priorRounds = run.rounds;

  const round: AllHandsRound = {
    id: newId("round"),
    question,
    createdAt: now,
    responses: departments.map((department) => ({
      departmentId: department.id,
      content: "",
      pending: true,
    })),
  };

  run.rounds = [...priorRounds, round];

  const publish = () => {
    run.updatedAt = Date.now();
    onProgress({
      ...run,
      rounds: run.rounds.map((r) => ({
        ...r,
        responses: r.responses.map((x) => ({ ...x })),
      })),
    });
  };

  publish();

  await mapWithConcurrency(departments, CONCURRENCY, async (department, index) => {
    const result = await streamChat(
      {
        system: buildSystemPrompt(
          department,
          profile,
          settings.companyName,
          skillsFor(department.id),
          settings.writingRules,
          account,
          memory,
        ),
        messages: buildHeadHistory(priorRounds, department.id, question, budget),
        model: settings.model,
        effort: settings.effort,
      },
      settings.apiKey,
      settings.workspaceId,
      {
        onText: (_delta, full) => {
          round.responses[index] = { ...round.responses[index], content: full };
          publish();
        },
      },
      signal,
    );

    round.responses[index] = {
      departmentId: department.id,
      content: result.text || result.error || "No response was returned.",
      thinking: result.thinking || undefined,
      usage: result.usage,
      error: !result.text && Boolean(result.error),
      pending: false,
    };
    publish();
  });

  if (signal?.aborted) {
    run.status = "cancelled";
    publish();
    return run;
  }

  const answered = round.responses.filter((r) => !r.error && r.content.trim());

  if (synthesize && ceo && answered.length > 1) {
    const transcript = answered
      .map((response) => {
        const department = departments.find((d) => d.id === response.departmentId);
        const who = department
          ? `${department.personaName || department.name}, ${department.roleTitle}`
          : response.departmentId;
        return `### ${who}\n${response.content}`;
      })
      .join("\n\n");

    const result = await streamChat(
      {
        // The department answers go in the user turn, not the system prompt, so
        // the CEO's cached system prefix survives every round.
        system: buildSystemPrompt(
          ceo,
          profile,
          settings.companyName,
          skillsFor(ceo.id),
          settings.writingRules,
          account,
          memory,
        ),
        messages: [
          {
            role: "user",
            content: `I put this to every department head:\n\n"${question}"\n\nHere is what each of them said:\n\n${transcript}\n\nGive me your read. Where do they actually agree, where do they genuinely conflict, and what is the one thing I should do first? Name the heads you are agreeing and disagreeing with. Keep it short.`,
          },
        ],
        model: settings.model,
        effort: settings.effort,
      },
      settings.apiKey,
      settings.workspaceId,
      {
        onText: (_delta, full) => {
          round.synthesis = full;
          publish();
        },
      },
      signal,
    );

    if (!result.text && result.error) {
      round.synthesis = result.error;
      round.synthesisError = true;
    }
  }

  run.status = signal?.aborted ? "cancelled" : "done";
  publish();
  return run;
}

/** Total tokens billed across a thread, for the cost line in the header. */
export function runUsage(run: AllHandsRun) {
  return run.rounds
    .flatMap((round) => round.responses)
    .reduce(
      (totals, response) => ({
        input: totals.input + (response.usage?.input ?? 0),
        output: totals.output + (response.usage?.output ?? 0),
        cacheRead: totals.cacheRead + (response.usage?.cacheRead ?? 0),
        cacheWrite: totals.cacheWrite + (response.usage?.cacheWrite ?? 0),
      }),
      { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    );
}
