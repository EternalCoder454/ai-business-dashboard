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
  departmentNamesFor,
  listConversationsFor,
  listPeople,
  readConversation,
} from "../src/db/admin";
import { ADMIN_EMAILS, isAdminEmail } from "../src/lib/admin";
import { parseEmailList } from "../src/auth";

const ONE = "admin-one@example.invalid";
const TWO = "admin-two@example.invalid";

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!condition) failures += 1;
}

async function wipe(email: string) {
  const current = await loadWorkspace(email);
  await applyMutations(email, [
    { table: "conversations", action: "delete", ids: current.conversations.map((c) => c.id) },
    { table: "departments", action: "delete", ids: current.departments.map((d) => d.id) },
  ]);
}

async function seed(email: string, title: string, body: string) {
  await applyMutations(email, [
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
  const configured = ADMIN_EMAILS[0] ?? "";
  check("a configured address is", isAdminEmail(configured), configured);
  check("case does not matter", isAdminEmail(configured.toUpperCase()));
  check("surrounding space does not matter", isAdminEmail(`  ${configured}  `));
  check("a stranger is not", !isAdminEmail("nobody@example.invalid"));
  check("an empty value is not", !isAdminEmail(""));
  check("a null value is not", !isAdminEmail(null));

  console.log("\nan address list survives however it was typed");
  check("commas", parseEmailList("a@x.com,b@x.com").length === 2);
  check("newlines", parseEmailList("a@x.com\nb@x.com").length === 2);
  check("commas and newlines together", parseEmailList("a@x.com,\n b@x.com").length === 2);
  check("semicolons", parseEmailList("a@x.com; b@x.com").length === 2);
  check("trailing separators are dropped", parseEmailList("a@x.com,\n").length === 1);
  check("lowercased", parseEmailList("A@X.com")[0] === "a@x.com");

  await seed(ONE, "Server migration", "The staging box keeps falling over.");
  await seed(TWO, "Invoice run", "Client B has not paid since March.");

  console.log("\nthe roster covers everyone with a workspace");
  const people = await listPeople();
  const emails = people.map((p) => p.email);
  check("both accounts appear", emails.includes(ONE) && emails.includes(TWO));
  const one = people.find((p) => p.email === ONE);
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
  check("the owner's own read works", thread?.messages.length === 1);
  check("message content survives", Boolean(thread?.messages[0]?.content.startsWith("The staging box")));

  console.log("\ndepartment names resolve per account");
  const names = await departmentNamesFor(ONE);
  check("the head is named", names.ops === "Theo, Operations", names.ops);

  console.log("\nempty conversations are not listed");
  await applyMutations(ONE, [
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
