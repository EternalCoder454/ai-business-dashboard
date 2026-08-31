import type { Skill } from "./types";

/**
 * Skills are stored as SKILL.md documents: YAML frontmatter carrying the name
 * and the "when to use" description, then a markdown body of instructions.
 * Same shape people already write by hand, so a file can move either way.
 */
export function skillToMarkdown(skill: Skill): string {
  const escape = (value: string) => value.replace(/\r?\n/g, " ").trim();
  return `---
name: ${escape(skill.name)}
description: ${escape(skill.description)}
---

${skill.content.trim()}
`;
}

export interface ParsedSkill {
  name: string;
  description: string;
  content: string;
}

/**
 * Reads a SKILL.md back. Frontmatter is optional: a plain markdown file becomes
 * a skill named after its first heading, so dropping in any document works.
 */
export function parseSkillMarkdown(raw: string, fallbackName = "Untitled skill"): ParsedSkill {
  const text = raw.replace(/^﻿/, "").replace(/\r\n/g, "\n");
  const match = text.match(/^---\n([\s\S]*?)\n---\n?/);

  let name = "";
  let description = "";
  let body = text;

  if (match) {
    body = text.slice(match[0].length);
    for (const line of match[1].split("\n")) {
      const field = line.match(/^([A-Za-z_-]+)\s*:\s*(.*)$/);
      if (!field) continue;
      const key = field[1].toLowerCase();
      const value = field[2].trim().replace(/^["']|["']$/g, "");
      if (key === "name") name = value;
      else if (key === "description") description = value;
    }
  }

  if (!name) {
    const heading = body.match(/^#\s+(.+)$/m);
    name = heading ? heading[1].trim() : fallbackName;
  }

  if (!description) {
    const firstProse = body
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith("#") && !line.startsWith("---"));
    description = firstProse ?? "";
  }

  return { name, description, content: body.trim() };
}

/** Turns a skill name into a safe SKILL.md filename. */
export function skillFileName(skill: Skill): string {
  const slug =
    skill.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "skill";
  return `${slug}.SKILL.md`;
}

/**
 * The skills block injected into a department's system prompt. Kept between the
 * department prompt and the company profile: skills change rarely, so this
 * stays inside the cached prefix.
 */
export function buildSkillsBlock(skills: Skill[]): string {
  const active = skills.filter((skill) => skill.enabled && skill.content.trim());
  if (active.length === 0) return "";

  const bodies = active
    .map(
      (skill) =>
        `## Skill: ${skill.name}\nWhen to use: ${skill.description || "No trigger described."}\n\n${skill.content.trim()}`,
    )
    .join("\n\n");

  return `=== YOUR SKILLS ===
You have ${active.length} skill${active.length === 1 ? "" : "s"}. Each one is a playbook you wrote for a recurring kind of work.

Read the "When to use" line on each. If the request matches one, follow that skill's instructions exactly, including any format it specifies, and say at the top which skill you are using. If none match, work normally and do not mention skills at all. Never invent a skill you do not have.

${bodies}
=== END SKILLS ===`;
}
