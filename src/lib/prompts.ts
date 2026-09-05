import { buildMemoryBlock } from "./memory";
import { COMPANY_ID, SHARED_OPERATING_RULES, WRITING_RULES } from "./seed";
import { buildSkillsBlock } from "./skills";
import type {
  CompanyProfile,
  Department,
  MemoryEntry,
  Skill,
  Task,
  UserAccount,
} from "./types";

/**
 * The order the profile is written into a prompt, and the label each field
 * gets. Empty fields are skipped entirely, so an unused field costs nothing.
 */
const PROFILE_FIELDS: [keyof CompanyProfile, string][] = [
  ["mission", "Mission"],
  ["products", "What we make"],
  ["audience", "Audience"],
  ["stage", "Where the business is"],
  ["goals", "What we are aiming at"],
  ["competitors", "Competition"],
  ["constraints", "Constraints"],
  ["brandVoice", "Brand voice"],
  ["keyFacts", "Key facts"],
];

/** True when the profile has at least one field worth injecting. */
export function hasProfileContent(profile: CompanyProfile | undefined): boolean {
  if (!profile) return false;
  // A field can be missing on a profile written before it existed, and a
  // crash here would take out every message rather than one screen.
  return PROFILE_FIELDS.some(([key]) => (profile[key] ?? "").trim());
}

/**
 * The shared-context block injected into every department's system prompt so all
 * departments work from the same business facts.
 */
export function buildCompanyContext(
  profile: CompanyProfile | undefined,
  companyName: string,
): string {
  if (!hasProfileContent(profile) || !profile) return "";

  const lines: string[] = [
    "=== COMPANY PROFILE (shared context that every department sees) ===",
    `Company: ${companyName}`,
  ];

  for (const [key, label] of PROFILE_FIELDS) {
    const value = (profile[key] ?? "").trim();
    if (value) lines.push("", `${label}:`, value);
  }

  lines.push(
    "",
    "Treat everything above as established fact about the business. Do not contradict it, and do not ask the user to restate it.",
    "=== END COMPANY PROFILE ===",
  );

  return lines.join("\n");
}

/**
 * Who the head is speaking to, and when.
 *
 * Without this a head has no idea whose question it is answering, and no idea
 * what "this week" means. The date is deliberately a date and not a timestamp:
 * it changes once a day, which a one hour cache would have expired through
 * anyway, whereas a clock time would invalidate the prefix on every message.
 */
export function buildUserContext(account: UserAccount, companyName: string): string {
  const name = account.displayName.trim();
  const extras = [
    ["What they know", account.expertise],
    ["How they like answers", account.preferences],
    ["What they are working on", account.currentFocus],
    ["Also worth knowing", account.notes],
  ] as const;
  const hasExtras = extras.some(([, value]) => value.trim());
  if (!name && !account.timezone && !hasExtras) return "";

  const lines = ["=== WHO YOU ARE TALKING TO ==="];

  if (name) {
    const role = account.roleTitle.trim();
    lines.push(
      `You are talking to ${name}${role ? `, the ${role} at ${companyName}` : ""}.`,
    );
    lines.push(`Address them as ${name} where it is natural. Never call them "the user".`);
  }

  if (account.pronouns.trim()) {
    lines.push(`Their pronouns are ${account.pronouns.trim()}. Use them, and never guess.`);
  }

  if (account.timezone) {
    try {
      const today = new Intl.DateTimeFormat("en-GB", {
        timeZone: account.timezone,
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date());
      lines.push(`Today is ${today}. They are in ${account.timezone}.`);
      lines.push("Work out dates and deadlines from that, and never invent today's date.");
    } catch {
      // An unrecognised zone is not worth failing a whole prompt over.
    }
  }

  for (const [label, value] of extras) {
    if (value.trim()) lines.push("", `${label}: ${value.trim()}`);
  }

  lines.push("=== END ===");
  return lines.join("\n");
}

/** How many open tasks reach a prompt. Past this it is a backlog, not context. */
const MAX_TASKS = 15;

/**
 * The open work in this head's area.
 *
 * Without it, asking Ruth what to focus on is answered from nothing, and every
 * answer restates the question back as a plan. Done tasks are left out: they
 * are history, and history belongs in the record rather than in front of every
 * reply.
 */
export function buildTasksBlock(tasks: Task[], departmentId: string): string {
  const open = tasks.filter(
    (task) =>
      task.status !== "done" &&
      (task.departmentId === departmentId || task.departmentId === COMPANY_ID),
  );
  if (!open.length) return "";

  // Dated work first, soonest first, then whatever has been ordered by hand.
  const byUrgency = (a: Task, b: Task) => {
    if (a.dueAt && b.dueAt) return a.dueAt - b.dueAt;
    if (a.dueAt) return -1;
    if (b.dueAt) return 1;
    return a.order - b.order;
  };

  /**
   * Company-wide work is guaranteed a place, the same as company-wide memory.
   * Sorting everything together and slicing dropped an undated company-wide
   * task behind twenty dated department ones, so it never reached the prompt.
   */
  const shared = open.filter((t) => t.departmentId === COMPANY_ID).sort(byUrgency);
  const own = open.filter((t) => t.departmentId !== COMPANY_ID).sort(byUrgency);
  const taken = [...shared.slice(0, MAX_TASKS)];
  taken.push(...own.slice(0, Math.max(0, MAX_TASKS - taken.length)));

  const lines = ["=== OPEN WORK IN YOUR AREA ==="];
  for (const task of taken) {
    const bits = [task.status === "doing" ? "in progress" : "not started"];
    if (task.dueAt) bits.push(`due ${new Date(task.dueAt).toISOString().slice(0, 10)}`);
    if (task.departmentId === COMPANY_ID) bits.push("company-wide");
    lines.push(`- ${task.title.trim()} (${bits.join(", ")})`);
    if (task.notes.trim()) lines.push(`  ${task.notes.trim().slice(0, 200)}`);
  }
  if (open.length > taken.length) {
    lines.push(`- and ${open.length - taken.length} more not listed here.`);
  }

  lines.push(
    "",
    "This is what is already outstanding. Weigh it before proposing anything new, say plainly when a new idea should wait behind it, and never propose something already on the list as though it were fresh.",
    "=== END OPEN WORK ===",
  );
  return lines.join("\n");
}

/**
 * What a department can do besides reply, spelled out in the prompt.
 *
 * The schemas are already sent, but a model given tools and no guidance either
 * ignores them or reaches for one on every message. This says when.
 */
export function buildToolsBlock(tools: { name: string }[]): string {
  if (!tools.length) return "";
  return [
    "=== WHAT YOU CAN DO ===",
    `Besides replying, you can call: ${tools.map((t) => t.name).join(", ")}.`,
    "",
    "Nothing you call happens on its own. It is shown to the user as something to approve, so a call they did not want costs them a glance rather than a wrong record.",
    "Call one when the user has agreed to the thing, or asked you to write it down. Do not call one to show willing, and never call one instead of answering the question.",
    "Say what you did in the reply as well, in a clause, so the transcript reads on its own.",
    "=== END ===",
  ].join("\n");
}

/**
 * Composes the full system prompt sent to the API: department identity, shared
 * company context, and the house rules every department follows.
 */
/**
 * What the person's next few days look like, so a head answering "what should
 * I focus on" knows the week they actually have.
 *
 * Titles, times, and whether something is all day. Never the guest list, the
 * description, or the joining link: those belong to other people who did not
 * agree to be described to a model, and none of them change the advice.
 */
export interface PromptCalendarEvent {
  title: string;
  start: number;
  end: number;
  allDay: boolean;
}

/**
 * Whether we have a calendar at all, which is not the same as whether it has
 * anything in it.
 *
 * Three states, because collapsing them is how a connected calendar with a
 * quiet week became "I do not have access to your calendar". Nobody had
 * connected one and nobody had a free week looked identical from inside the
 * prompt, and the head told the person the wrong one.
 */
export type CalendarStatus = "connected" | "not-connected" | "unavailable";

export function buildCalendarBlock(
  events: PromptCalendarEvent[],
  status: CalendarStatus = "not-connected",
): string {
  // Nothing connected. No block, and the head correctly has no calendar.
  if (status === "not-connected") return "";

  /*
   * Connected, and we could not read it. This has to be said rather than left
   * blank, because the dangerous answer is not "I cannot see it", it is a head
   * cheerfully telling somebody their week is clear when it never managed to
   * look.
   */
  if (status === "unavailable") {
    return [
      "## Their calendar",
      "",
      "They have connected a calendar, but it could not be read just now. Do",
      "not say their diary is clear or that they have nothing on: you do not",
      "know. If the answer depends on what is booked, say that the calendar is",
      "connected but unavailable and answer without it.",
    ].join("\n");
  }

  /*
   * Connected and genuinely empty, which is a real answer and a useful one.
   * "You have nothing booked for the next week" is worth saying, and it is a
   * different sentence from "I cannot see your calendar".
   */
  if (events.length === 0) {
    return [
      "## Their calendar",
      "",
      "Their calendar is connected and there is nothing booked in the next few",
      "days. That is a real answer: if they ask what is on, tell them the diary",
      "is clear rather than that you cannot see it.",
    ].join("\n");
  }

  const midnight = (at: number) => {
    const d = new Date(at);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  const today = midnight(Date.now());

  const dayName = (at: number) => {
    const days = Math.round((midnight(at) - today) / 86_400_000);
    if (days === 0) return "Today";
    if (days === 1) return "Tomorrow";
    return new Date(at).toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "short",
    });
  };

  const time = (at: number) =>
    new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  const byDay = new Map<string, string[]>();
  for (const event of events.slice(0, 40)) {
    const key = dayName(event.start);
    const when = event.allDay ? "All day" : `${time(event.start)}-${time(event.end)}`;
    byDay.set(key, [...(byDay.get(key) ?? []), `  ${when}  ${event.title}`]);
  }

  const lines = [...byDay.entries()].map(([day, items]) => [day, ...items].join("\n"));

  return [
    "## Their calendar",
    "",
    "What is already booked in the next few days. Take it into account when you",
    "suggest what to do and when: a day that is full is not a day for a big",
    "piece of work, and a clear morning is worth naming. Do not mention the",
    "calendar when it has no bearing on the answer.",
    "",
    ...lines,
  ].join("\n");
}

export function buildSystemPrompt(
  department: Department,
  profile: CompanyProfile | undefined,
  companyName: string,
  skills: Skill[] = [],
  writingRules: string = WRITING_RULES,
  account?: UserAccount,
  memory: MemoryEntry[] = [],
  tasks: Task[] = [],
  tools: { name: string }[] = [],
  calendar: PromptCalendarEvent[] = [],
  calendarStatus: CalendarStatus = "not-connected",
): { stable: string; volatile: string } {
  const context = buildCompanyContext(profile, companyName);

  const identity = department.personaName
    ? `Your name is ${department.personaName}. You are the ${department.roleTitle} at ${companyName}.`
    : "";

  /*
   * Two parts, and the split is the whole point.
   *
   * `stable` is everything that does not change between one message and the
   * next: who this head is, what it knows, the company, the rules. It is sent
   * as its own block with the cache breakpoint on it, so it is written once and
   * read by every message after.
   *
   * `volatile` is the record, the board and the week, which change whenever
   * anybody files anything. It goes after the breakpoint, so adding a task
   * costs a few hundred tokens instead of rewriting the whole prefix.
   *
   * This used to be one string with one breakpoint at the end of all of it. The
   * ordering was written so that a change to the tasks would leave everything
   * above it cached, which is how prefix caching works, but with the only
   * breakpoint after the last section there was no prefix left to keep: every
   * task added rewrote the lot. It cost nothing while boards were empty, and it
   * would have cost every customer who filled one.
   */
  const stable = [
    identity,
    department.persona?.trim(),
    department.systemPrompt.trim(),
    buildSkillsBlock(skills),
    context,
    account ? buildUserContext(account, companyName) : "",
    buildToolsBlock(tools),
    SHARED_OPERATING_RULES,
  ]
    .filter(Boolean)
    .join("\n\n");

  const volatile = [
    buildMemoryBlock(memory, department.id),
    buildTasksBlock(tasks, department.id),
    buildCalendarBlock(calendar, calendarStatus),
    /*
     * Genuinely last, after the record and the board, because the point of them
     * is to win any conflict with everything above.
     *
     * That puts them past the cache breakpoint, so they are sent fresh on every
     * message rather than cached. They are a few hundred tokens and the rule
     * they encode is worth more than the saving, which is the right way round:
     * caching should bend to the prompt, not the prompt to the caching.
     */
    writingRules.trim(),
  ]
    .filter(Boolean)
    .join("\n\n");

  return { stable, volatile };
}

/**
 * The whole prompt as one string.
 *
 * For the places that only read or measure it, such as the context screen.
 * Nothing that sends a request should use this: it throws away the split that
 * keeps the cache warm.
 */
export function systemPromptText(...args: Parameters<typeof buildSystemPrompt>): string {
  const { stable, volatile } = buildSystemPrompt(...args);
  return [stable, volatile].filter(Boolean).join("\n\n");
}

/**
 * The run of words people type before they get to the point. Stripped only as
 * a leading run, so the rest of the sentence survives intact.
 *
 * Question words are deliberately absent: "What should we charge for a five
 * page site" is a title already, and cutting into it leaves a fragment.
 */
const TITLE_OPENERS = new Set([
  "hi", "hey", "hello", "morning", "please", "thanks", "ok", "okay", "so",
  "um", "uh", "just", "quick", "question", "i", "im", "i'm", "we", "you",
  "can", "could", "would", "will", "need", "want", "help", "me", "us", "my",
  "our", "let", "lets", "let's", "give", "tell",
]);

/** About as much as a sidebar row shows before it truncates. */
const TITLE_LENGTH = 48;

/**
 * A short label for a conversation, from its first message. Instant, since the
 * sidebar shows it the moment somebody presses send; /api/workspace/title asks
 * a model for a better one afterwards, and this stands if that fails.
 *
 * It keeps the sentence rather than harvesting words out of it.
 */
export function deriveConversationTitle(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return "New conversation";

  // Only the first sentence, since anything after it is detail.
  const first = cleaned.split(/(?<=[.!?])\s/)[0] ?? cleaned;

  const words = first.split(" ").filter(Boolean);
  let from = 0;
  while (
    from < words.length - 1 &&
    TITLE_OPENERS.has(words[from]!.toLowerCase().replace(/[^\p{L}\p{N}']/gu, ""))
  ) {
    from += 1;
  }

  const kept = words
    .slice(from)
    // Standalone "i" is the one word worth correcting: it is the only letter
    // that is wrong in lower case, and people type it that way constantly.
    .map((word) => (word.toLowerCase() === "i" ? "I" : word))
    .join(" ")
    // Trailing punctuation belongs to the sentence, not to the label.
    .replace(/[\s.,;:!?-]+$/u, "");

  if (!kept) return "New conversation";

  const title = kept.length > TITLE_LENGTH ? cutToWord(kept, TITLE_LENGTH) : kept;
  return title.charAt(0).toUpperCase() + title.slice(1);
}

/** Cuts at the last whole word inside the limit, rather than mid word. */
function cutToWord(text: string, limit: number): string {
  const slice = text.slice(0, limit);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > limit / 2 ? slice.slice(0, lastSpace) : slice;
  return cut.replace(/[\s.,;:!?-]+$/u, "") + "…";
}

/**
 * A model's reply, made into a label.
 *
 * Models add things to a short answer however plainly they are asked not to: a
 * pair of quotes, a full stop, a line of preamble above it. This takes the
 * first line with anything on it and strips the decoration, and returns an
 * empty string for anything that came back too long or as the refusal word, so
 * the caller falls back to the title it already has rather than putting a
 * sentence in the sidebar.
 */
export function tidyTitle(raw: string): string {
  const lines = raw
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
  // A preamble announces itself with a colon and is always above the answer,
  // so where the first line ends in one the label is the last line instead.
  const line = (lines[0]?.endsWith(":") && lines.length > 1 ? lines.at(-1) : lines[0]) ?? "";
  const stripped = line
    .replace(/^["'`“‘]+|["'`”’]+$/g, "")
    .replace(/[.:\s]+$/u, "")
    .replace(/\s+/g, " ");
  const words = stripped.split(" ").filter(Boolean).slice(0, 6);
  const title = words.join(" ");
  if (!title || title.length > 60) return "";
  if (title.toLowerCase() === "unclear") return "";
  return title.charAt(0).toUpperCase() + title.slice(1);
}
