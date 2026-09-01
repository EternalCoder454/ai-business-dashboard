/**
 * The admin read path, against the real database.
 *
 * What matters here is not that an administrator can read, but that the reads
 * stay inside the account they name: a query that leaked one person's messages
 * into another person's transcript would be invisible until it mattered.
 *
 * Run with: npm run admin-test
 */
import { applyMutations, loadWorkspace } from "../src/db/repo";
import {
  deleteEverythingFor,
  departmentNamesFor,
  detailFor,
  listConversationsFor,
  listPeople,
  overview,
  readConversation,
} from "../src/db/admin";
import { OPERATOR_EMAILS, isOperator } from "../src/lib/admin";
import { parseEmailList } from "../src/auth";

const ONE = "admin-one@example.invalid";
const TWO = "admin-two@example.invalid";

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!condition) failures += 1;
}

async function wipe(email: string) {
  const current = await loadWorkspace(email, email);
  await applyMutations(email, email, [
    { table: "conversations", action: "delete", ids: current.conversations.map((c) => c.id) },
    { table: "departments", action: "delete", ids: current.departments.map((d) => d.id) },
  ]);
}

async function seed(email: string, title: string, body: string, withUsage = false) {
  await applyMutations(email, email, [
    {
      table: "departments",
      action: "upsert",
      rows: [
        {
          id: "ops",
          name: "Operations",
          personaName: "Theo",
          roleTitle: "Head of Operations",
          persona: "",
          systemPrompt: "",
          status: "online",
          order: 0,
        },
      ],
    },
    {
      table: "conversations",
      action: "upsert",
      rows: [
        {
          id: `conv_${email.split("@")[0]}`,
          departmentId: "ops",
          title,
          messages: [
            { id: `m_${email}`, role: "user", content: body, timestamp: Date.now() },
            ...(withUsage
              ? [
                  {
                    id: `r_${email}`,
                    role: "assistant" as const,
                    content: "Understood.",
                    timestamp: Date.now() + 1,
                    model: "claude-sonnet-5",
                    usage: { input: 100, output: 40, cacheRead: 300, cacheWrite: 20 },
                  },
                ]
              : []),
          ],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
    },
  ]);
}

async function main() {
  await Promise.all([wipe(ONE), wipe(TWO)]);

  console.log("only the configured addresses are administrators");
  const configured = OPERATOR_EMAILS[0] ?? "";
  check("a configured address is", isOperator(configured), configured);
  check("case does not matter", isOperator(configured.toUpperCase()));
  check("surrounding space does not matter", isOperator(`  ${configured}  `));
  check("a stranger is not", !isOperator("nobody@example.invalid"));
  check("an empty value is not", !isOperator(""));
  check("a null value is not", !isOperator(null));

  console.log("\nan address list survives however it was typed");
  check("commas", parseEmailList("a@x.com,b@x.com").length === 2);
  check("newlines", parseEmailList("a@x.com\nb@x.com").length === 2);
  check("commas and newlines together", parseEmailList("a@x.com,\n b@x.com").length === 2);
  check("semicolons", parseEmailList("a@x.com; b@x.com").length === 2);
  check("trailing separators are dropped", parseEmailList("a@x.com,\n").length === 1);
  check("lowercased", parseEmailList("A@X.com")[0] === "a@x.com");

  await seed(ONE, "Server migration", "The staging box keeps falling over.", true);
  await seed(TWO, "Invoice run", "Client B has not paid since March.");

  console.log("\nthe roster covers everyone with a workspace");
  const people = await listPeople();
  const emails = people.map((p) => p.workspaceId);
  check("both accounts appear", emails.includes(ONE) && emails.includes(TWO));
  const one = people.find((p) => p.workspaceId === ONE);
  check("counts are per account", one?.conversations === 1, String(one?.conversations));
  check("last active is set", Boolean(one?.lastActive));

  console.log("\nreads stay inside the account they name");
  const listOne = await listConversationsFor(ONE);
  check("one conversation for the first account", listOne.length === 1, String(listOne.length));
  check("and it is theirs", listOne[0]?.title === "Server migration", listOne[0]?.title);

  const listTwo = await listConversationsFor(TWO);
  check("and the second sees only its own", listTwo[0]?.title === "Invoice run", listTwo[0]?.title);

  console.log("\na conversation id from one account does not open under another");
  const crossed = await readConversation(TWO, listOne[0].id);
  check("no leak across accounts", crossed === null, crossed ? "LEAKED" : "");

  const thread = await readConversation(ONE, listOne[0].id);
  check("the owner's own read works", thread?.messages.length === 2, String(thread?.messages.length));
  check(
    "and the reply carries what it cost",
    thread?.messages[1]?.usage?.output === 40,
    String(thread?.messages[1]?.usage?.output),
  );
  check("and which model produced it", thread?.messages[1]?.model === "claude-sonnet-5");
  check("message content survives", Boolean(thread?.messages[0]?.content.startsWith("The staging box")));

  console.log("\ndepartment names resolve per account");
  const names = await departmentNamesFor(ONE);
  check("the head is named", names.ops === "Theo, Operations", names.ops);

  console.log("\nempty conversations are not listed");
  await applyMutations(ONE, ONE, [
    {
      table: "conversations",
      action: "upsert",
      rows: [
        {
          id: "conv_empty",
          departmentId: "ops",
          title: "Never used",
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
    },
  ]);
  const afterEmpty = await listConversationsFor(ONE);
  check("still one conversation", afterEmpty.length === 1, String(afterEmpty.length));
  console.log("\nusage is recorded per message and totalled per person");
  const withUsage = await listPeople();
  const first = withUsage.find((p) => p.workspaceId === ONE);
  check("usage is present", Boolean(first?.usage));
  check("output tokens counted", first?.usage.output === 40, String(first?.usage.output));
  check("cached input counted", first?.usage.cacheRead === 300, String(first?.usage.cacheRead));
  check("the other account is separate", 
    withUsage.find((p) => p.workspaceId === TWO)?.usage.output === 0);

  console.log("\nthe overview totals across everyone");
  const totals = await overview();
  check("counts both accounts", totals.people >= 2, String(totals.people));
  check("sums output tokens", totals.usage.output >= 40, String(totals.usage.output));

  console.log("\nper person detail is scoped to that person");
  const d = await detailFor(ONE);
  check("one department", d.departments === 1, String(d.departments));
  check("no projects yet", d.projects === 0);

  console.log("\ndeleting a workspace leaves the other one alone");
  await deleteEverythingFor(ONE);
  check("their conversations are gone", (await listConversationsFor(ONE)).length === 0);
  check("their account row is gone", !(await listPeople()).some((p) => p.workspaceId === ONE));
  check(
    "the other account survived",
    (await listConversationsFor(TWO)).length === 1,
    String((await listConversationsFor(TWO)).length),
  );


  console.log("\ncleaning up");
  await Promise.all([wipe(ONE), wipe(TWO)]);
  check("nothing left", (await listConversationsFor(ONE)).length === 0);

  console.log(failures ? "\nFAILURES ABOVE" : "\nall checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error("admin test threw:", error);
  process.exit(1);
});
