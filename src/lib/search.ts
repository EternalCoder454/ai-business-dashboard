import { conversationHref, departmentHrefById } from "./routes";
import { COMPANY_ID } from "./seed";
import type {
  AllHandsRun,
  Conversation,
  Deliverable,
  Department,
  Skill,
} from "./types";

export type ResultKind =
  | "department"
  | "conversation"
  | "message"
  | "skill"
  | "deliverable"
  | "room"
  | "page";

export interface SearchResult {
  id: string;
  kind: ResultKind;
  title: string;
  subtitle: string;
  /** The matching line of body text, with the query left in place. */
  snippet?: string;
  href: string;
  icon: string;
  score: number;
}

export interface SearchCorpus {
  departments: Department[];
  conversations: Conversation[];
  skills: Skill[];
  deliverables: Deliverable[];
  allHandsRuns: AllHandsRun[];
}

const PAGES: { title: string; subtitle: string; href: string; icon: string }[] = [
  { title: "Org Chart", subtitle: "Every head and how they report", href: "/", icon: "🏛" },
  { title: "CEO Office", subtitle: "Talk to Ruth", href: "/ceo", icon: "🧠" },
  { title: "All Hands", subtitle: "Ask the whole room at once", href: "/all-hands", icon: "👥" },
  { title: "Library", subtitle: "Files, deliverables, and skills", href: "/library", icon: "📁" },
  { title: "Skills", subtitle: "SKILL.md playbooks", href: "/library/skills", icon: "✨" },
  { title: "Deliverables", subtitle: "Everything produced", href: "/library/deliverables", icon: "📄" },
  { title: "Information", subtitle: "What the heads actually receive", href: "/information", icon: "🧩" },
  { title: "Company Profile", subtitle: "Shared context for every head", href: "/profile", icon: "🏢" },
  { title: "Account", subtitle: "Your name, role, and timezone", href: "/account", icon: "👤" },
  { title: "Settings", subtitle: "API key, model, departments, data", href: "/settings", icon: "⚙️" },
];

/**
 * Scores a field against the query. A name that starts with the query beats one
 * that merely contains it, and a title match beats a body match, so typing
 * "camp" surfaces the Campaign Brief skill rather than a message mentioning
 * campaigns in passing.
 */
function scoreField(haystack: string, needle: string, weight: number): number {
  const text = haystack.toLowerCase();
  const index = text.indexOf(needle);
  if (index === -1) return 0;
  if (text === needle) return weight * 3;
  if (index === 0) return weight * 2;
  // A match at a word boundary is worth more than one inside a word.
  return text[index - 1] === " " ? weight * 1.5 : weight;
}

/** The line containing the match, trimmed to something readable. */
function snippetAround(body: string, needle: string, radius = 70): string | undefined {
  const index = body.toLowerCase().indexOf(needle);
  if (index === -1) return undefined;
  const start = Math.max(0, index - radius);
  const end = Math.min(body.length, index + needle.length + radius);
  return `${start > 0 ? "…" : ""}${body.slice(start, end).replace(/\s+/g, " ").trim()}${
    end < body.length ? "…" : ""
  }`;
}

export function search(query: string, corpus: SearchCorpus, limit = 24): SearchResult[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];

  const results: SearchResult[] = [];
  const nameOf = (id: string) =>
    id === COMPANY_ID
      ? "Every head"
      : corpus.departments.find((d) => d.id === id)?.name ?? "Unassigned";
  const emojiOf = (id: string) =>
    id === COMPANY_ID ? "🏢" : corpus.departments.find((d) => d.id === id)?.emoji ?? "📄";

  for (const page of PAGES) {
    const score = scoreField(page.title, needle, 8);
    if (score) {
      results.push({ ...page, id: `page:${page.href}`, kind: "page", score });
    }
  }

  for (const department of corpus.departments) {
    const score =
      scoreField(department.name, needle, 10) +
      scoreField(department.personaName ?? "", needle, 10) +
      scoreField(department.roleTitle, needle, 5);
    if (score) {
      results.push({
        id: `dept:${department.id}`,
        kind: "department",
        title: department.personaName
          ? `${department.personaName}, ${department.roleTitle}`
          : department.name,
        subtitle: department.name,
        href: departmentHrefById(department.id),
        icon: department.emoji,
        score,
      });
    }
  }

  for (const skill of corpus.skills) {
    const score =
      scoreField(skill.name, needle, 9) +
      scoreField(skill.description, needle, 4) +
      scoreField(skill.content, needle, 1);
    if (score) {
      results.push({
        id: `skill:${skill.id}`,
        kind: "skill",
        title: skill.name,
        subtitle: `Skill · ${nameOf(skill.departmentId)}`,
        snippet: snippetAround(skill.content, needle),
        href: `/library/skills?dept=${encodeURIComponent(skill.departmentId)}`,
        icon: emojiOf(skill.departmentId),
        score,
      });
    }
  }

  for (const deliverable of corpus.deliverables) {
    const score =
      scoreField(deliverable.title, needle, 9) + scoreField(deliverable.body, needle, 2);
    if (score) {
      results.push({
        id: `del:${deliverable.id}`,
        kind: "deliverable",
        title: deliverable.title,
        subtitle: `Deliverable · ${nameOf(deliverable.departmentId)}`,
        snippet: snippetAround(deliverable.body, needle),
        href: "/library/deliverables",
        icon: emojiOf(deliverable.departmentId),
        score,
      });
    }
  }

  for (const conversation of corpus.conversations) {
    if (conversation.messages.length === 0) continue;

    const titleScore = scoreField(conversation.title, needle, 8);
    if (titleScore) {
      results.push({
        id: `conv:${conversation.id}`,
        kind: "conversation",
        title: conversation.title,
        subtitle: `Conversation · ${nameOf(conversation.departmentId)}`,
        href: conversationHref(conversation.departmentId, conversation.id),
        icon: emojiOf(conversation.departmentId),
        score: titleScore,
      });
    }

    // The most recent matching message only. Ten hits from one thread would
    // bury every other kind of result.
    const hit = [...conversation.messages]
      .reverse()
      .find((message) => message.content.toLowerCase().includes(needle));

    if (hit) {
      results.push({
        id: `msg:${hit.id}`,
        kind: "message",
        title: conversation.title,
        subtitle: `${hit.role === "user" ? "You" : nameOf(conversation.departmentId)} · in conversation`,
        snippet: snippetAround(hit.content, needle),
        href: conversationHref(conversation.departmentId, conversation.id),
        icon: emojiOf(conversation.departmentId),
        score: 3,
      });
    }
  }

  for (const run of corpus.allHandsRuns) {
    let score = scoreField(run.title, needle, 8);
    let snippet: string | undefined;

    for (const round of run.rounds) {
      score += scoreField(round.question, needle, 4);
      if (!snippet) snippet = snippetAround(round.question, needle);
      for (const response of round.responses) {
        if (!snippet && response.content.toLowerCase().includes(needle)) {
          score += 1;
          snippet = snippetAround(response.content, needle);
        }
      }
    }

    if (score) {
      results.push({
        id: `room:${run.id}`,
        kind: "room",
        title: run.title,
        subtitle: `All Hands · ${run.rounds.length} ${
          run.rounds.length === 1 ? "question" : "questions"
        }`,
        snippet,
        href: "/all-hands",
        icon: "👥",
        score,
      });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

export const KIND_LABEL: Record<ResultKind, string> = {
  page: "Go to",
  department: "Heads",
  conversation: "Conversations",
  message: "Messages",
  skill: "Skills",
  deliverable: "Deliverables",
  room: "All Hands",
};

/** Groups results for display while preserving the overall ranking. */
export function groupResults(results: SearchResult[]): [ResultKind, SearchResult[]][] {
  const order: ResultKind[] = [
    "page",
    "department",
    "conversation",
    "skill",
    "deliverable",
    "room",
    "message",
  ];
  return order
    .map((kind) => [kind, results.filter((r) => r.kind === kind)] as [ResultKind, SearchResult[]])
    .filter(([, items]) => items.length > 0);
}
