/**
 * Checks every foreground/background pair the interface actually uses against
 * WCAG 2.1 contrast minimums, in both themes.
 *
 * Colour choices are otherwise argued by taste. This is the part that is
 * objectively right or wrong: text below 4.5:1 is hard to read, and a palette
 * can look considered while failing it. Run after any change to the tokens.
 *
 *   npm run contrast-test
 */
import { readFileSync } from "node:fs";

const CSS = readFileSync("src/app/globals.css", "utf8");

/** WCAG 2.1: normal text, large text (18.66px bold or 24px), and UI edges. */
const AA_TEXT = 4.5;
const AA_LARGE = 3;
const AA_NON_TEXT = 3;

function tokens(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--(md-[a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    out[m[1]] = m[2];
  }
  return out;
}

/**
 * The tokens declared in one theme's rule.
 *
 * Matched as a selector immediately followed by its brace, not by a plain
 * substring search: the file mentions [data-theme="light"] in a comment near
 * the top, and a loose search found that, then took the next block, which is
 * the dark one. Both themes then measured identically and every check passed
 * for the wrong reason.
 */
function themeBlock(selector: RegExp): Record<string, string> {
  const match = selector.exec(CSS);
  if (!match) throw new Error(`cannot find a rule for ${selector}`);
  const open = CSS.indexOf("{", match.index + match[0].length - 1);
  const close = CSS.indexOf("}", open);
  const found = tokens(CSS.slice(open, close));
  if (!found["md-surface"]) throw new Error(`no tokens in the rule for ${selector}`);
  return found;
}

function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/** Relative luminance, per WCAG 2.1. */
function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/**
 * The pairs that actually appear on screen.
 *
 * Written out rather than generated from every combination, because most
 * combinations never happen and a report full of irrelevant failures is a
 * report nobody reads.
 */
const PAIRS: [fg: string, bg: string, min: number, what: string][] = [
  ["md-on-surface", "md-surface", AA_TEXT, "body text on the page"],
  ["md-on-surface", "md-container", AA_TEXT, "body text on a card"],
  ["md-on-surface", "md-container-low", AA_TEXT, "body text in the drawer"],
  ["md-on-surface", "md-container-high", AA_TEXT, "body text on a raised card"],
  ["md-on-surface", "md-container-highest", AA_TEXT, "body text on the highest layer"],
  ["md-on-surface-variant", "md-surface", AA_TEXT, "secondary text on the page"],
  ["md-on-surface-variant", "md-container", AA_TEXT, "secondary text on a card"],
  ["md-on-surface-variant", "md-container-low", AA_TEXT, "secondary text in the drawer"],
  ["md-on-surface-variant", "md-container-high", AA_TEXT, "secondary text on a raised card"],
  ["md-primary", "md-surface", AA_TEXT, "a link on the page"],
  ["md-primary", "md-container", AA_TEXT, "a link on a card"],
  ["md-primary", "md-container-low", AA_TEXT, "a link in the drawer"],
  ["md-on-primary", "md-primary", AA_TEXT, "label on a filled button"],
  ["md-on-primary-container", "md-primary-container", AA_TEXT, "label on a tonal button"],
  ["md-on-secondary-container", "md-secondary-container", AA_TEXT, "label on a chip"],
  ["md-on-error-container", "md-error-container", AA_TEXT, "label on an error banner"],
  ["md-on-error", "md-error", AA_TEXT, "label on a filled error button"],
  ["md-error", "md-surface", AA_TEXT, "error text on the page"],
  ["md-error", "md-container", AA_TEXT, "error text on a card"],
  ["md-warning", "md-surface", AA_TEXT, "warning text on the page"],
  ["md-warning", "md-container", AA_TEXT, "warning text on a card"],
  ["md-success", "md-surface", AA_TEXT, "success text on the page"],
  ["md-success", "md-container", AA_TEXT, "success text on a card"],
  ["md-outline", "md-surface", AA_NON_TEXT, "a form field border"],
  ["md-outline", "md-container", AA_NON_TEXT, "a border on a card"],
  ["md-outline-variant", "md-surface", 1.4, "a divider on the page"],
  ["md-outline-variant", "md-container", 1.25, "a divider on a card"],
  ["md-primary", "md-container-highest", AA_LARGE, "an accent on the highest layer"],
];

let failures = 0;
const rows: string[] = [];

const DARK = /:root,\s*\[data-theme="dark"\]\s*\{/;
const LIGHT = /\[data-theme="light"\]\s*\{/;

for (const [selector, theme] of [
  [DARK, "dark"],
  [LIGHT, "light"],
] as const) {
  const t = themeBlock(selector);
  rows.push(`\n${theme}`);
  for (const [fg, bg, min, what] of PAIRS) {
    const a = t[fg];
    const b = t[bg];
    if (!a || !b) {
      failures += 1;
      rows.push(`  FAIL ${what}: missing token ${a ? bg : fg}`);
      continue;
    }
    const ratio = contrast(a, b);
    const ok = ratio >= min;
    if (!ok) failures += 1;
    rows.push(
      `  ${ok ? "ok  " : "FAIL"} ${what.padEnd(38)} ${ratio.toFixed(2)}:1 (needs ${min})`,
    );
  }
}

console.log(rows.join("\n"));

/**
 * Department accents, each against the card it is drawn on in its own theme.
 *
 * Checked per theme rather than every value against both, which is what the
 * first version of this did: it reported the light accents failing on a dark
 * card, a pairing that never happens on screen.
 */
for (const [selector, theme] of [
  [DARK, "dark"],
  [LIGHT, "light"],
] as const) {
  const t = themeBlock(selector);
  const accents = Object.entries(t).filter(([name]) => name.startsWith("md-accent-"));
  if (!accents.length) continue;
  console.log(`
${theme} department accents (${accents.length})`);
  for (const [name, hex] of accents) {
    const onCard = contrast(hex, t["md-container"]);
    const ok = onCard >= AA_NON_TEXT;
    if (!ok) failures += 1;
    console.log(
      `  ${ok ? "ok  " : "FAIL"} ${name.replace("md-accent-", "").padEnd(8)} ${hex}  ${onCard.toFixed(2)}:1`,
    );
  }
}

console.log(failures ? `\n${failures} pair(s) below the minimum` : "\nevery pair passes");
process.exit(failures ? 1 : 0);
