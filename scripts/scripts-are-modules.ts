/**
 * Every file under scripts/ has to be a module.
 *
 * TypeScript puts the top level of a file with no import or export into the
 * global scope. Two such files declaring the same `failures` counter and the
 * same `check` helper, which every test script here does, is a redeclaration
 * error. It does not show up when either runs, because tsx compiles one file at
 * a time; it shows up in `next build`, which type checks the whole project, and
 * therefore first appears as a failed deploy.
 *
 * Run with: npm run scripts-check
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = "scripts";
const MODULE = /^\s*(import|export)\b/m;

let failures = 0;
for (const name of readdirSync(DIR).filter((f) => f.endsWith(".ts")).sort()) {
  const source = readFileSync(join(DIR, name), "utf8");
  const ok = MODULE.test(source);
  if (!ok) failures += 1;
  if (!ok) {
    console.log(`  FAIL ${name} has no import or export, so it shares the global scope`);
  }
}

console.log(
  failures === 0
    ? `all ${readdirSync(DIR).filter((f) => f.endsWith(".ts")).length} scripts are modules`
    : `\n${failures} would collide. Add \`export {};\` to each.`,
);
process.exit(failures === 0 ? 0 : 1);
