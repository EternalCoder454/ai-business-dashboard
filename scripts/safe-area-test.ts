/**
 * That nothing asks for safe-area padding and Tailwind padding at once.
 *
 * `.safe-x` does not add to the padding already on an element, it sets the
 * property: `padding-left: calc(var(--safe-pad-x) + env(safe-area-inset-left))`.
 * So `safe-x px-3` is not three units plus the inset. It is the inset alone,
 * and on any device without a notch that is zero.
 *
 * It fails in the quietest possible way. The class is present, the intent reads
 * correctly, every review of the line says three units of padding, and it looks
 * right on a desktop browser where the element is not using safe-x for anything
 * anyway. It only shows on a phone, which is where it matters, and it showed on
 * the phone title bar: the company name flush against the left edge and the
 * account picture running off the right.
 *
 * The fix is to set the variable, so `safe-x safe-px-3`. This checks nobody has
 * gone back to the version that reads better and does nothing.
 *
 *   npm run safe-area-test
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures += 1;
}

/** Which Tailwind padding utilities each safe-area class would silently win over. */
const CONFLICTS: { safe: string; padding: RegExp; use: string }[] = [
  // p-* covers every side, so it collides with all three.
  { safe: "safe-x", padding: /(?:^|[\s"'`:])(?:p|px|pl|pr)-\[?[\w.]+\]?/, use: "safe-px-*" },
  { safe: "safe-top", padding: /(?:^|[\s"'`:])(?:p|py|pt)-\[?[\w.]+\]?/, use: "safe-pt-*" },
  { safe: "safe-bottom", padding: /(?:^|[\s"'`:])(?:p|py|pb)-\[?[\w.]+\]?/, use: "safe-pb-*" },
  { safe: "safe-left", padding: /(?:^|[\s"'`:])(?:p|px|pl)-\[?[\w.]+\]?/, use: "safe-px-*" },
];

function sources(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) sources(path, found);
    else if (entry.endsWith(".tsx")) found.push(path);
  }
  return found;
}

/**
 * The class lists in a file, one per string literal.
 *
 * Per literal rather than per file, because a file may well hold one element
 * using safe-x and a different element using px-4, and those do not conflict.
 * Only a single element carrying both is wrong.
 */
function classLists(source: string): { text: string; line: number }[] {
  const found: { text: string; line: number }[] = [];
  // Every quoted string, which over-collects and is fine: a string with no
  // safe- class in it is discarded by the caller anyway.
  const literal = /"([^"\n]*)"|'([^'\n]*)'|`([^`\n]*)`/g;

  for (let m = literal.exec(source); m; m = literal.exec(source)) {
    const text = m[1] ?? m[2] ?? m[3] ?? "";
    if (!text.includes("safe-")) continue;
    found.push({ text, line: source.slice(0, m.index).split("\n").length });
  }
  return found;
}

const files = [...sources("src/components"), ...sources("src/app")];

console.log(`\nsafe-area padding is never cancelled by a Tailwind utility (${files.length} files)`);
{
  const problems: string[] = [];

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const { text, line } of classLists(source)) {
      for (const rule of CONFLICTS) {
        /*
         * Word boundaries matter here. `safe-x` must not match inside
         * `safe-px-3`, or the helper that fixes the problem would be read as
         * the problem, and this whole check would fail on correct code.
         */
        const hasSafe = new RegExp(`(?:^|\\s)${rule.safe}(?:\\s|$)`).test(text);
        if (!hasSafe) continue;
        if (!rule.padding.test(text)) continue;
        problems.push(
          `${file.replace(/\\/g, "/")}:${line} has ${rule.safe} with a padding utility; use ${rule.use}`,
        );
      }
    }
  }

  check("nothing pairs the two", problems.length === 0, problems.join("\n         ") || "none");
}

console.log("\nand the helpers those elements need exist");
{
  const css = readFileSync("src/app/globals.css", "utf8");
  const used = new Set<string>();

  for (const file of files) {
    for (const { text } of classLists(readFileSync(file, "utf8"))) {
      for (const cls of text.split(/\s+/)) {
        if (/^(?:[a-z]+:)?safe-p[txb]?-/.test(cls)) used.add(cls);
      }
    }
  }

  const missing = [...used].filter((cls) => !css.includes(`.${cls.replace(":", "\\:")} `));
  check(
    "every safe padding class used is defined",
    missing.length === 0,
    missing.join(", ") || `${used.size} in use`,
  );
}

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} FAILURES ABOVE`);
process.exit(failures === 0 ? 0 : 1);
