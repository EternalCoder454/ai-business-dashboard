/**
 * Every read and write is fenced to one business.
 *
 * A tenancy bug does not announce itself. Nothing throws, no test goes red,
 * and the first sign is a customer seeing a name they should not know. This
 * codebase has already had two: a settings write that let the row choose its
 * own workspace, and a listing that keyed accounts by address into a map keyed
 * by workspace and invented a client per person.
 *
 * So this reads the source rather than the behaviour. It finds every query
 * against a workspace-scoped table and checks that the same statement filters
 * on a workspace id, and it finds every route that takes one from a request.
 * Neither is something a type checker can see.
 *
 * Run with: npm run tenancy-audit
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** Tables holding one business's own data. Reading one unfenced is a leak. */
const SCOPED = [
  "departments",
  "projects",
  "conversations",
  "messages",
  "skills",
  "deliverables",
  "files",
  "allHandsRuns",
  "allHandsRounds",
  "tasks",
  "wikiPages",
  "memory",
  "profiles",
  "settings",
  "directMessages",
  "apiKeys",
  "schedules",
  "briefings",
  "reports",
];

/**
 * Tables that are deliberately not fenced, and why.
 *
 * Each of these is a decision rather than an oversight, so each is named here
 * and the reason is written down. Anything not on this list and not in SCOPED
 * is something nobody has thought about, which the audit says out loud.
 */
const UNFENCED: Record<string, string> = {
  workspaces: "the list of businesses itself; the operator screen reads it",
  access: "keyed by address, and the thing that decides which workspace anybody gets",
  accounts: "identity follows the person, not the business they are currently in",
  feedback: "about the product; only an operator reads it",
  reviewCursors: "keyed by workspace id, so a row is already one business",
  idempotency: "keyed by API key id, which is already one business",
  googleConnections: "keyed by the person; it is their own calendar",
};

interface Finding {
  file: string;
  line: number;
  text: string;
  why: string;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(path);
  }
  return out;
}

/**
 * The whole chained statement a `.from(t.x)` belongs to.
 *
 * Drizzle statements run over many lines, so checking the one line a table is
 * named on would find almost nothing. This walks forward to the end of the
 * chain, which is the first line that closes it.
 */
function statementAt(lines: string[], start: number): string {
  const parts: string[] = [];
  for (let i = start; i < Math.min(start + 30, lines.length); i += 1) {
    parts.push(lines[i]);
    const joined = parts.join(" ");
    // The end of a chain: a semicolon, or a closing brace at the outer level.
    if (/;\s*$/.test(lines[i]) || /^\s*(\)|\},|\];)/.test(lines[i + 1] ?? "")) break;
    if (joined.includes("await") && /;\s*$/.test(lines[i])) break;
  }
  return parts.join(" ");
}

function main() {
  const files = walk("src").filter((f) => !f.endsWith("schema.ts"));
  const unfenced: Finding[] = [];
  const fromRequest: Finding[] = [];
  const unknownTables = new Set<string>();
  // Counted so a pass says how much was looked at. "nothing found" and "nothing
  // looked at" print the same otherwise, which is how a broken audit goes on
  // reporting success.
  let queriesChecked = 0;

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const lines = source.split("\n");

    lines.forEach((line, index) => {
      // Every query naming a table.
      const from = /\.(?:from|into|update|delete)\(\s*t\.(\w+)/.exec(line);
      const insert = /\.insert\(\s*t\.(\w+)/.exec(line);
      const table = from?.[1] ?? insert?.[1];

      if (table) {
        if (!SCOPED.includes(table) && !(table in UNFENCED)) unknownTables.add(table);

        if (SCOPED.includes(table)) {
          queriesChecked += 1;
          const statement = statementAt(lines, index);

          /*
           * Three ways a query counts as fenced.
           *
           * Named outright is the common one.
           *
           * A `where(condition)` or `values(row)` holding a variable is the
           * second, and the variable is followed back to where it was built
           * rather than assumed. Refusing to follow it flagged code that was
           * correct, and an audit that cries wolf is one nobody reads.
           *
           * The third is a written justification at the site: a
           * `tenancy-audit:` comment within a few lines above. Some queries are
           * genuinely and correctly unfenced, and the honest way to record that
           * is a sentence beside the query, not a list in this file that drifts
           * away from the code it is describing.
           */
          const named = /workspaceId/.test(statement);

          const viaVariable = (() => {
            const held =
              /\.where\(\s*([a-zA-Z_$][\w$]*)\s*\)/.exec(statement) ??
              /\.values\(\s*([a-zA-Z_$][\w$]*)\s*\)/.exec(statement) ??
              /\.values\(\{\s*\.\.\.([a-zA-Z_$][\w$]*)/.exec(statement);
            if (!held) return false;
            return new RegExp(
              `(const|let)\\s+${held[1]}\\s*(:[^=]*)?=[\\s\\S]{0,500}?workspaceId`,
            ).test(source);
          })();

          /*
           * A justification covers the statement it introduces.
           *
           * Walking back a fixed number of lines was too blunt in both
           * directions: too few and a comment above a Promise.all does not
           * reach the queries inside it, too many and a comment justifies
           * something several statements away. So this walks back to the start
           * of the enclosing statement, which is the previous blank line or the
           * previous line that ended one.
           */
          const justified = (() => {
            for (let i = index - 1; i >= 0 && i > index - 30; i -= 1) {
              const near = lines[i];
              if (near.includes("tenancy-audit:")) return true;
              const isComment = /^\s*(\/\/|\*|\/\*)/.test(near);
              if (!isComment && (near.trim() === "" || /;\s*$/.test(near))) return false;
            }
            return false;
          })();

          const fenced = named || viaVariable || justified;
          if (!fenced) {
            unfenced.push({
              file,
              line: index + 1,
              text: line.trim().slice(0, 100),
              why: `${table} is workspace-scoped but this statement does not mention workspaceId`,
            });
          }
        }
      }

      // A workspace id arriving from outside. Exactly one route may do this.
      const fromBody =
        /body\.workspaceId|searchParams\.get\(\s*["']workspace/.test(line) ||
        /request\.headers\.get\(\s*["']x-workspace/.test(line);
      if (fromBody) {
        fromRequest.push({
          file,
          line: index + 1,
          text: line.trim().slice(0, 100),
          why: "takes a workspace id from the request",
        });
      }
    });
  }

  let failures = 0;
  const report = (
    label: string,
    findings: Finding[],
    allowed: (f: Finding) => boolean,
    examined: number,
  ) => {
    console.log(`\n${label}`);
    const bad = findings.filter((f) => !allowed(f));
    if (bad.length === 0) {
      console.log(`  ok   ${examined} checked, none unaccounted for`);
      return;
    }
    for (const f of bad) {
      console.log(`  FAIL ${f.file}:${f.line}`);
      console.log(`       ${f.text}`);
      console.log(`       ${f.why}`);
    }
    failures += bad.length;
  };

  report(
    "every query on a scoped table names a workspace",
    unfenced,
    () => false,
    queriesChecked,
  );

  report(
    "only the operator route takes a workspace id from a request",
    fromRequest,
    // The operator screen creates, renames, and deletes businesses, so it has
    // to name one. It is gated on OPERATOR_EMAILS, which is read from the
    // environment and cannot be granted by anything the app does.
    (f) => f.file.replace(/\\/g, "/").includes("api/admin/route.ts"),
    fromRequest.length,
  );

  /*
   * Deleting a business actually deletes it.
   *
   * This exists because the delete path is a list maintained by hand, and a
   * list maintained by hand falls behind a schema that grows. It had: eleven
   * tables were missing from it, and two more compared a workspace id to an
   * email column and so matched nothing. One of those was api_keys, whose
   * tokens went on authenticating against a business that no longer existed.
   */
  console.log("\ndeleting a business clears every table that holds its rows");
  const schema = readFileSync("src/db/schema.ts", "utf8");
  const scopedInSchema = new Set<string>();
  for (const match of schema.matchAll(/export const (\w+) = pgTable\(/g)) {
    const at = match.index ?? 0;
    const body = schema.slice(at, at + 2500);
    if (/workspace\(\)|text\("workspace_id"\)/.test(body)) scopedInSchema.add(match[1]);
  }

  const deleteBody = (() => {
    const source = readFileSync("src/db/admin.ts", "utf8");
    const from = source.indexOf("export async function deleteEverythingFor");
    return from === -1 ? "" : source.slice(from, from + 6000);
  })();

  // Left out on purpose, each for a reason written beside the delete itself.
  const KEPT = new Set(["accounts", "feedback", "access", "workspaces"]);

  const missing = [...scopedInSchema].filter(
    (table) => !KEPT.has(table) && !deleteBody.includes(`t.${table})`),
  );

  if (missing.length === 0) {
    console.log(`  ok   all ${scopedInSchema.size - KEPT.size} of them`);
  } else {
    for (const table of missing) {
      console.log(`  FAIL ${table} holds workspace rows and is never deleted`);
      failures += 1;
    }
  }

  console.log("\nevery table is either scoped or deliberately not");
  if (unknownTables.size === 0) {
    console.log(`  ok   nothing unaccounted for`);
  } else {
    for (const table of unknownTables) {
      console.log(`  FAIL ${table} is queried but is in neither list`);
      failures += 1;
    }
  }

  console.log("\ntables deliberately unfenced, and why");
  for (const [table, why] of Object.entries(UNFENCED)) {
    console.log(`  ..   ${table}: ${why}`);
  }

  console.log(failures ? `\n${failures} PROBLEMS ABOVE` : "\nall checks passed");
  process.exit(failures ? 1 : 0);
}

main();
