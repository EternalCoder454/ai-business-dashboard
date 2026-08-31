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
  const mine = tasks
    .filter(
      (task) =>
        task.status !== "done" &&
        (task.departmentId === departmentId || task.departmentId === COMPANY_ID),
    )
    .sort((a, b) => {
      // Dated work first, soonest first, then whatever has been ordered by hand.
      if (a.dueAt && b.dueAt) return a.dueAt - b.dueAt;
      if (a.dueAt) return -1;
      if (b.dueAt) return 1;
      return a.order - b.order;
    });

  if (!mine.length) return "";

  const lines = ["=== OPEN WORK IN YOUR AREA ==="];
  for (const task of mine.slice(0, MAX_TASKS)) {
    const bits = [task.status === "doing" ? "in progress" : "not started"];
    if (task.dueAt) bits.push(`due ${new Date(task.dueAt).toISOString().slice(0, 10)}`);
    lines.push(`- ${task.title.trim()} (${bits.join(", ")})`);
    if (task.notes.trim()) lines.push(`  ${task.notes.trim().slice(0, 200)}`);
  }
  if (mine.length > MAX_TASKS) {
    lines.push(`- and ${mine.length - MAX_TASKS} more not listed here.`);
  }

  lines.push(
    "",
    "This is what is already outstanding. Weigh it before proposing anything new, say plainly when a new idea should wait behind it, and never propose something already on the list as though it were fresh.",
    "=== END OPEN WORK ===",
  );
  return lines.join("\n");
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
    SHARED_OPERATING_RULES,
    writingRules.trim(),
  ].filter(Boolean);

  return sections.join("\n\n");
}

/** First user message, trimmed into something that reads well in the sidebar. */
export function deriveConversationTitle(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return "New conversation";
  if (cleaned.length <= 48) return cleaned;
  const cut = cleaned.slice(0, 48);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 24 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}
