import { SHARED_OPERATING_RULES, WRITING_RULES } from "./seed";
import { buildSkillsBlock } from "./skills";
import type { CompanyProfile, Department, Skill, UserAccount } from "./types";

/** True when the profile has at least one field worth injecting. */
export function hasProfileContent(profile: CompanyProfile | undefined): boolean {
  if (!profile) return false;
  return Boolean(
    profile.mission.trim() ||
      profile.audience.trim() ||
      profile.brandVoice.trim() ||
      profile.keyFacts.trim(),
  );
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

  if (profile.mission.trim()) lines.push("", "Mission:", profile.mission.trim());
  if (profile.audience.trim()) lines.push("", "Audience:", profile.audience.trim());
  if (profile.brandVoice.trim()) lines.push("", "Brand voice:", profile.brandVoice.trim());
  if (profile.keyFacts.trim()) lines.push("", "Key facts:", profile.keyFacts.trim());

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
  if (!name && !account.timezone) return "";

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

  lines.push("=== END ===");
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
