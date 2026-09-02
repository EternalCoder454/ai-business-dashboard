/**
 * Shared projects, against the real database.
 *
 * The load-bearing property is not that sharing works, it is that it stops
 * exactly where it should: a member reaches the shared project's conversations
 * and nothing else the owner has, and someone who was never added reaches
 * nothing at all.
 *
 * Run with: npm run sharing-test
 */
import { applyMutations, loadWorkspace } from "../src/db/repo";
import {
  membershipsFor,
  participantsOf,
  resolveConversationOwner,
  shareProject,
  sharesByProject,
  unshareProject,
} from "../src/db/sharing";

const OWNER = "share-owner@example.invalid";
const MEMBER = "share-member@example.invalid";
const OUTSIDER = "share-outsider@example.invalid";

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!condition) failures += 1;
}

async function wipe(email: string) {
  const current = await loadWorkspace(email, email);
  const own = current.conversations.filter((c) => !c.sharedFrom);
  await applyMutations(email, email, [
    { table: "conversations", action: "delete", ids: own.map((c) => c.id) },
    {
      table: "projects",
      action: "delete",
      ids: current.projects.filter((p) => !p.sharedFrom).map((p) => p.id),
    },
  ]);
}

const now = () => Date.now();

async function main() {
  for (const email of [OWNER, MEMBER, OUTSIDER]) {
    await unshareProject(OWNER, "proj_shared", email);
    await wipe(email);
  }

  console.log("the owner sets up a shared project and a private one");
  await applyMutations(OWNER, OWNER, [
    {
      table: "projects",
      action: "upsert",
      rows: [
        { id: "proj_shared", name: "Launch", summary: "", status: "active", accent: "cyan", dueOn: "", createdAt: now(), updatedAt: now() },
        { id: "proj_private", name: "Secret", summary: "", status: "active", accent: "rose", dueOn: "", createdAt: now(), updatedAt: now() },
      ],
    },
    {
      table: "conversations",
      action: "upsert",
      rows: [
        {
          id: "conv_shared",
          departmentId: "marketing",
          projectId: "proj_shared",
          title: "Launch plan",
          messages: [{ id: "m1", role: "user", content: "Where are we?", timestamp: now() }],
          createdAt: now(),
          updatedAt: now(),
        },
        {
          id: "conv_private",
          departmentId: "finance",
          projectId: "proj_private",
          title: "Payroll",
          messages: [{ id: "m2", role: "user", content: "Do not read this.", timestamp: now() }],
          createdAt: now(),
          updatedAt: now(),
        },
      ],
    },
  ]);

  console.log("\\nnothing is shared until it is shared");
  check("member sees nothing yet", (await membershipsFor(MEMBER)).length === 0);
  const before = await loadWorkspace(MEMBER, MEMBER);
  check("and has no projects", before.projects.length === 0, String(before.projects.length));

  console.log("\\nafter sharing, the member sees that project and only that project");
  check("share succeeds", await shareProject(OWNER, "proj_shared", MEMBER));
  const after = await loadWorkspace(MEMBER, MEMBER);
  check("one project", after.projects.length === 1, after.projects.map((p) => p.name).join(","));
  check("the shared one", after.projects[0]?.name === "Launch");
  check("marked as someone else's", after.projects[0]?.sharedFrom === OWNER);
  check("not the private one", !after.projects.some((p) => p.name === "Secret"));

  check("one conversation", after.conversations.length === 1, String(after.conversations.length));
  check("the shared one", after.conversations[0]?.title === "Launch plan");
  check("with its messages", after.conversations[0]?.messages.length === 1);
  check("not the private conversation", !after.conversations.some((c) => c.title === "Payroll"));

  console.log("\\nan outsider sees none of it");
  const outside = await loadWorkspace(OUTSIDER, OUTSIDER);
  check("no projects", outside.projects.length === 0);
  check("no conversations", outside.conversations.length === 0);

  console.log("\\nwrites from a member land under the owner, attributed to the member");
  const owner = await resolveConversationOwner(MEMBER, MEMBER, "conv_shared");
  check("resolves to the owner", owner === OWNER, String(owner));
  check(
    "and refuses the private one",
    (await resolveConversationOwner(MEMBER, MEMBER, "conv_private")) === null,
  );
  check(
    "and refuses an outsider entirely",
    (await resolveConversationOwner(OUTSIDER, OUTSIDER, "conv_shared")) === null,
  );

  const shared = after.conversations[0];
  await applyMutations(MEMBER, MEMBER, [
    {
      table: "conversations",
      action: "upsert",
      rows: [
        {
          ...shared,
          messages: [
            ...shared.messages,
            { id: "m3", role: "user", content: "Adding to it.", timestamp: now() },
          ],
        },
      ],
    },
  ]);

  const ownerView = await loadWorkspace(OWNER, OWNER);
  const ownerThread = ownerView.conversations.find((c) => c.id === "conv_shared");
  check("the owner sees the new message", ownerThread?.messages.length === 2, String(ownerThread?.messages.length));
  check(
    "attributed to the member",
    ownerThread?.messages[1]?.authorEmail === MEMBER,
    ownerThread?.messages[1]?.authorEmail,
  );
  check(
    "and their own message is not attributed",
    ownerThread?.messages[0]?.authorEmail === undefined,
  );
  check(
    "no duplicate copy under the member",
    (await loadWorkspace(MEMBER, MEMBER)).conversations.filter((c) => c.id === "conv_shared").length === 1,
  );

  console.log("\\nthe owner can see who it is shared with");
  const shares = await sharesByProject(OWNER);
  check("listed", shares.proj_shared?.includes(MEMBER) === true);
  check("the private one is not shared", shares.proj_private === undefined);
  const people = await participantsOf(OWNER, "proj_shared");
  check("participants are owner and member", people.length === 2 && people.includes(MEMBER));
  console.log("\na member cannot delete the owner's conversation");
  await applyMutations(MEMBER, MEMBER, [
    { table: "conversations", action: "delete", ids: ["conv_shared"] },
  ]);
  check(
    "it survives",
    (await loadWorkspace(OWNER, OWNER)).conversations.some((c) => c.id === "conv_shared"),
  );
  check(
    "with its messages intact",
    ((await loadWorkspace(OWNER, OWNER)).conversations.find((c) => c.id === "conv_shared")?.messages
      .length ?? 0) >= 2,
  );


  console.log("\\nunsharing takes it back");
  await unshareProject(OWNER, "proj_shared", MEMBER);
  const revoked = await loadWorkspace(MEMBER, MEMBER);
  check("member sees nothing", revoked.projects.length === 0 && revoked.conversations.length === 0);
  check(
    "and can no longer write to it",
    (await resolveConversationOwner(MEMBER, MEMBER, "conv_shared")) === null,
  );
  check(
    "while the owner keeps everything",
    (await loadWorkspace(OWNER, OWNER)).conversations.some((c) => c.id === "conv_shared"),
  );

  console.log("\\ncleaning up");
  for (const email of [OWNER, MEMBER, OUTSIDER]) await wipe(email);
  check("nothing left", (await loadWorkspace(OWNER, OWNER)).projects.length === 0);

  console.log(failures ? "\\nFAILURES ABOVE" : "\\nall checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error("sharing test threw:", error);
  process.exit(1);
});
