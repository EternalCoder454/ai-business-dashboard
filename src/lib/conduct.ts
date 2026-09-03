/**
 * What the conduct review can raise, what each kind is worth, and what it is
 * called on screen.
 *
 * One module with no imports, because the reviewer runs on the server and the
 * Reports screen is a client component: keeping the three lists together is
 * what stops a category being added to the prompt and rendering as its raw
 * slug, or being raised with no severity floor at all.
 */

export const CATEGORIES = [
  // Aimed at a colleague.
  "abuse",
  "disrespect",
  "toxicity",
  "harassment",
  "discrimination",
  "sexual-harassment",
  "sexual-content",
  "stalking",
  "extortion",
  "retaliation",
  // Aimed at somebody's safety.
  "threat",
  "violence",
  "child-safety",
  "self-harm",
  "safety",
  "extremism",
  // Aimed at the business or its customers.
  "drugs",
  "fraud",
  "data-theft",
  "sabotage",
  "malware",
  /**
   * Not raised by the model. Written when a link is stripped from a message,
   * so the two arrive on the same screen and are dismissed the same way.
   */
  "suspicious-link",
] as const;

export type Category = (typeof CATEGORIES)[number];

export type Severity = "low" | "medium" | "high";

/**
 * What each category is worth, so the model cannot rate its own severity.
 *
 * It was free to pick low, medium or high for anything, which made severity a
 * mood rather than a scale: the same threat came back high on one pass and
 * medium on another. The kind of thing decides the floor and the model can
 * only raise it, so disrespect is never an emergency and a threat is never a
 * footnote.
 */
export const FLOOR: Record<Category, Severity> = {
  abuse: "medium",
  disrespect: "low",
  toxicity: "medium",
  harassment: "medium",
  discrimination: "high",
  "sexual-harassment": "high",
  "sexual-content": "high",
  stalking: "high",
  extortion: "high",
  retaliation: "high",
  threat: "high",
  violence: "high",
  "child-safety": "high",
  "self-harm": "high",
  safety: "high",
  extremism: "high",
  drugs: "medium",
  fraud: "high",
  "data-theft": "high",
  sabotage: "high",
  malware: "high",
  "suspicious-link": "low",
};

/** What each is called on the Reports screen. */
export const CATEGORY_LABEL: Record<Category, string> = {
  abuse: "Abuse",
  disrespect: "Disrespect",
  toxicity: "Toxicity",
  harassment: "Harassment",
  discrimination: "Discrimination",
  "sexual-harassment": "Sexual harassment",
  "sexual-content": "Sexual content",
  stalking: "Stalking",
  extortion: "Extortion",
  retaliation: "Retaliation",
  threat: "Threat",
  violence: "Violence",
  "child-safety": "Child safety",
  "self-harm": "Someone may be at risk",
  safety: "Safety",
  extremism: "Extremism",
  drugs: "Drugs",
  fraud: "Fraud",
  "data-theft": "Data theft",
  sabotage: "Sabotage",
  malware: "Malware",
  "suspicious-link": "Link removed",
};

export const RANK: Record<Severity, number> = { low: 0, medium: 1, high: 2 };

export function isCategory(value: unknown): value is Category {
  return typeof value === "string" && (CATEGORIES as readonly string[]).includes(value);
}

/** The severity the model asked for, or the floor for this kind, whichever is worse. */
export function atLeast(asked: unknown, floor: Severity): Severity {
  const wanted: Severity =
    asked === "low" || asked === "medium" || asked === "high" ? asked : floor;
  return RANK[wanted] >= RANK[floor] ? wanted : floor;
}

/**
 * What to call a category that came out of the database.
 *
 * A stored report keeps whatever it was raised as, so a row written before a
 * category was renamed still has the old word in it. Falling back to the word
 * itself shows something readable rather than nothing.
 */
export function labelFor(category: string): string {
  return isCategory(category) ? CATEGORY_LABEL[category] : category;
}

/** The floor for a stored category, or medium for one nothing recognises. */
export function floorFor(category: string): Severity {
  return isCategory(category) ? FLOOR[category] : "medium";
}
