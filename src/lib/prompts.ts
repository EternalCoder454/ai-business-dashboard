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
): string {
  const context = buildCompanyContext(profile, companyName);

  const identity = department.personaName
    ? `Your name is ${department.personaName}. You are the ${department.roleTitle} at ${companyName}.`
    : "";

  // Order is deliberate and matters for prompt caching: everything here is
  // stable for a department, so the whole block sits inside the cached prefix.
  // Writing rules go last so they win any conflict with the sections above.
  const sections = [
    identity,
    department.persona?.trim(),
    department.systemPrompt.trim(),
    buildSkillsBlock(skills),
    context,
    account ? buildUserContext(account, companyName) : "",
    // Late on purpose. The prompt is one cached prefix, so a change here
    // leaves everything above it cached, and the record is what changes most.
    buildMemoryBlock(memory, department.id),
    buildTasksBlock(tasks, department.id),
    buildToolsBlock(tools),
    SHARED_OPERATING_RULES,
    writingRules.trim(),
  ].filter(Boolean);

  return sections.join("\n\n");
}

/**
 * Words that carry no meaning in a title, only in a sentence.
 *
 * A title made by truncating the first message reads like half a sentence,
 * because it keeps the scaffolding: "I need pricing for websites to sell"
 * rather than "Website Pricing". Stripping the framing and the grammar leaves
 * the subject, which is the only part worth putting in a list.
 */
const TITLE_NOISE = new Set([
  // Openings people type before getting to the point.
  "i", "we", "you", "need", "want", "would", "like", "could", "can", "should",
  "please", "help", "me", "us", "my", "our", "your", "give", "get", "make",
  "write", "draft", "do", "let", "just", "quick", "question", "about",
  "think", "know", "find", "tell", "show", "explain", "look", "check", "going",
  // Grammar that is not the subject.
  "a", "an", "the", "of", "for", "to", "in", "on", "at", "with", "and", "or",
  "is", "are", "be", "it", "that", "this", "some", "any", "how", "what",
]);

const TITLE_WORDS = 5;

/**
 * A short label for a conversation, taken from its first message.
 *
 * Deliberately not a model call: a title is worth about nothing and a request
 * costs real money, so this is done from the text. It reads the subject rather
 * than the sentence, so "I need pricing for websites to sell" files itself as
 * "Pricing Websites Sell" rather than as the whole sentence with an ellipsis.
 */
export function deriveConversationTitle(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return "New conversation";

  // Only the first sentence, since anything after it is detail.
  const first = cleaned.split(/(?<=[.!?])\s/)[0] ?? cleaned;

  const words = first
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

  const kept = words.filter((word) => !TITLE_NOISE.has(word.toLowerCase()));
  // Everything was filler, so the original is more use than nothing.
  const chosen = (kept.length ? kept : words).slice(0, TITLE_WORDS);
  if (!chosen.length) return "New conversation";

  return chosen
    .map((word) =>
      // A word already carrying capitals is a name or an acronym: UE5, NeoForge.
      /[A-Z]/.test(word.slice(1)) ? word : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join(" ");
}
