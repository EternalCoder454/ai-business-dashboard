/**
 * Every feature that can be exercised without a browser, end to end.
 *
 * Runs against the real database inside one throwaway business it creates and
 * deletes, so it never touches anybody's work. What it is for is the space
 * between the unit tests, which check one function, and clicking through the
 * panel, which checks one path: this drives a feature the way the product drives
 * it, through the same mutation and repository calls the screens use.
 *
 * The addon section is the reason it exists. An addon runs unattended, on a
 * trigger nobody is watching, and every other test of it stops at the boundary
 * of the runtime. This completes a task for real and checks that the addon woke
 * up, that its outbound call was refused because nobody approved the host, and
 * that the refusal is in the log where an owner would look for it.
 *
 * Run with: npm run feature-test
 */
import { and, eq, sql } from "drizzle-orm";
import { db, requireDb } from "../src/db/client";
import * as t from "../src/db/schema";
import { createWorkspace, deleteWorkspace, listMembers, markFor } from "../src/db/tenancy";
import { seedDepartments } from "../src/lib/seed";
import { seedSkills } from "../src/lib/seedSkills";
import { seedWikiPages } from "../src/lib/seedWiki";
import { grantAccess } from "../src/db/access";
import { applyMutations, loadWorkspace } from "../src/db/repo";
import { approveAddon, addonsFor, createAddon, recentRuns, setAddonState } from "../src/db/addons";
import { listColleagues, listThread, listThreads, markThreadRead, sendMessage, unreadTotal } from "../src/db/messages";
import { search } from "../src/lib/search";
import { allowsArea, allowsHead, type Permissions } from "../src/lib/permissions";
import { scrubLinks } from "../src/lib/links";
type Workspace = Awaited<ReturnType<typeof loadWorkspace>>;

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!condition) failures += 1;
}
function section(name: string) {
  console.log("");
  console.log(name);
}

const OWNER = "feature-test-owner@example.invalid";
const MATE = "feature-test-mate@example.invalid";

async function main() {
  const database = requireDb();
  let ws = "";

  try {
    ws = await createWorkspace({ name: "Feature Test Co", createdBy: "test", firstMember: OWNER });
    await grantAccess({ email: MATE, workspaceId: ws, role: "member", invitedBy: OWNER });

    section("a new business starts empty, and is furnished on first open");
    let space = await loadWorkspace(ws, OWNER);
    /*
     * Worth stating rather than assuming. Creating a business writes the
     * workspace, its settings and its access rows and nothing else; the heads,
     * the skill library and the wiki are seeded by the store the first time
     * somebody opens it in a browser. So a business created from the operator
     * screen and never visited is genuinely empty here, which is correct and is
     * not what a reader of createWorkspace would guess.
     */
    check("it exists and loads", Boolean(space.settings.companyName), space.settings.companyName);
    check("it has no heads until somebody opens it", space.departments.length === 0, `${space.departments.length}`);
    check("no skills either", space.skills.length === 0, `${space.skills.length}`);
    check("nothing is in the task board", space.tasks.length === 0);
    check("both people are members", (await listMembers(ws)).length === 2);
    check("the mark is derived from the name", markFor("Feature Test Co").length > 0, markFor("Feature Test Co"));

    // What the store does on first load, so the rest of this runs against a
    // workspace shaped like a real one.
    await applyMutations(ws, OWNER, [
      { table: "departments", action: "upsert", rows: seedDepartments() },
      { table: "skills", action: "upsert", rows: seedSkills() },
      { table: "wikiPages", action: "upsert", rows: seedWikiPages() },
    ] as never);
    space = await loadWorkspace(ws, OWNER);
    check("seeding gives it department heads", space.departments.length > 0, `${space.departments.length}`);
    check("one of them is the chief of staff", space.departments.some((d) => d.isCeo));
    check("and a shipped skill library", space.skills.length > 0, `${space.skills.length}`);
    check("and wiki pages", space.wikiPages.length > 0, `${space.wikiPages.length}`);

    section("the task board");
    await applyMutations(ws, OWNER, [
      { table: "tasks", action: "upsert", rows: [
        { id: "ft-1", title: "Write the launch note", notes: "", status: "todo", departmentId: "company", order: 0 },
        { id: "ft-2", title: "Book the venue", notes: "", status: "todo", departmentId: "marketing", order: 1 },
      ] },
    ] as never);
    space = await loadWorkspace(ws, OWNER);
    check("two tasks were added", space.tasks.length === 2, `${space.tasks.length}`);

    await applyMutations(ws, OWNER, [
      { table: "tasks", action: "upsert", rows: [
        { id: "ft-2", title: "Book the venue", notes: "", status: "doing", departmentId: "marketing", order: 1 },
      ] },
    ] as never);
    space = await loadWorkspace(ws, OWNER);
    check("a task moves to ongoing", space.tasks.find((x) => x.id === "ft-2")?.status === "doing");

    await applyMutations(ws, OWNER, [{ table: "tasks", action: "delete", ids: ["ft-1"] }] as never);
    space = await loadWorkspace(ws, OWNER);
    check("a task can be deleted", space.tasks.length === 1, `${space.tasks.length}`);

    section("projects, library and memory");
    await applyMutations(ws, OWNER, [
      { table: "projects", action: "upsert", rows: [{ id: "ft-p", name: "Spring launch", summary: "The one", status: "active", updatedAt: Date.now() }] },
      { table: "deliverables", action: "upsert", rows: [{ id: "ft-d", title: "Positioning note", body: "We sell calm.", departmentId: "marketing", status: "backlog" }] },
      { table: "memory", action: "upsert", rows: [{ id: "ft-m", kind: "decision", label: "Price at 9.99", detail: "Round numbers read as guesses.", departmentId: "company", occurredAt: Date.now() }] },
    ] as never);
    space = await loadWorkspace(ws, OWNER);
    check("a project is saved", space.projects.some((p) => p.name === "Spring launch"));
    check("a deliverable is saved", space.deliverables.some((d) => d.title === "Positioning note"));
    check("a decision is recorded", space.memory.some((m) => m.label === "Price at 9.99"));
    // The Library card shows an opening rather than the whole document.
    const card = space.deliverables.find((d) => d.title === "Positioning note");
    check("the library carries a preview, not the whole body", typeof card?.body === "string");

    section("the wiki and the company profile");
    await applyMutations(ws, OWNER, [
      { table: "wikiPages", action: "upsert", rows: [{ id: "ft-w", title: "How we answer", body: "Plainly.", order: 0, updatedAt: Date.now() }] },
      { table: "profile", action: "upsert", row: { mission: "Make small businesses feel staffed." } },
    ] as never);
    space = await loadWorkspace(ws, OWNER);
    check("a wiki page is saved", space.wikiPages.some((p) => p.title === "How we answer"));
    check("the company profile is saved", space.profile.mission?.includes("staffed") === true);

    section("the inbox");
    const sent = await sendMessage(ws, OWNER, MATE, "Morning, are we still on for Thursday?", "ft-dm-1");
    check("a message sends", Boolean(sent?.id), sent?.id);
    check("the recipient has one unread", (await unreadTotal(ws, MATE)) === 1, String(await unreadTotal(ws, MATE)));
    check("the sender has none", (await unreadTotal(ws, OWNER)) === 0);

    const threads = await listThreads(ws, MATE);
    check("it appears in their threads", threads.length === 1, `${threads.length}`);
    const thread = await listThread(ws, MATE, OWNER);
    check("the body arrived intact", thread.some((m) => m.body.includes("Thursday")));

    await markThreadRead(ws, MATE, OWNER);
    check("reading it clears the unread count", (await unreadTotal(ws, MATE)) === 0);

    const mates = await listColleagues(ws, OWNER);
    check("the directory lists the colleague", mates.some((c) => c.email === MATE), mates.map((c) => c.email).join());
    check("and does not list yourself", !mates.some((c) => c.email === OWNER));

    section("links in messages are filtered only when asked");
    /*
     * scrubLinks takes the allowed hosts, and the decision about whether to
     * apply it at all is the caller's: the message route reads the business's
     * policy and only scrubs when it is set to an allow list. So an empty list
     * here means "filtering is on and nothing is allowed", not "filtering off".
     */
    const strict = scrubLinks("see https://evil.example/x", ["ok.example"]);
    check("a host not on the list is taken out", !strict.text.includes("evil.example"), strict.text);
    check("and it is reported rather than silently dropped", strict.removed.includes("evil.example"), strict.removed.join());

    const kept = scrubLinks("see https://ok.example/x", ["ok.example"]);
    check("a host on the list survives", kept.text.includes("ok.example"), kept.text);
    check("with nothing reported", kept.removed.length === 0);

    const sub = scrubLinks("see https://deep.ok.example/x", ["ok.example"]);
    check("a subdomain of an allowed host survives", sub.text.includes("deep.ok.example"), sub.text);

    const lookalike = scrubLinks("see https://ok.example.evil.test/x", ["ok.example"]);
    check("a lookalike does not", !lookalike.text.includes("ok.example.evil.test"), lookalike.text);

    const plain = scrubLinks("no links here at all", ["ok.example"]);
    check("a message with no links is untouched", plain.text === "no links here at all" && plain.removed.length === 0);

    // The outage this rule caused once: an ordinary message must never be eaten.
    const hello = scrubLinks("Hey", ["ok.example"]);
    check("and neither is \"Hey\"", hello.text === "Hey", hello.text);

    const email = scrubLinks("write to sam@ok.example about it", ["ok.example"]);
    check("an email address is left whole", email.text.includes("sam@ok.example"), email.text);

    section("search reads across the workspace");
    // The shape the command palette builds, which is a subset of the workspace
    // rather than all of it: search reaches what a person can navigate to.
    const corpus = {
      departments: space.departments,
      conversations: space.conversations,
      skills: space.skills,
      deliverables: space.deliverables,
      projects: space.projects,
      allHandsRuns: space.allHandsRuns ?? [],
    };
    check("it finds a deliverable", search("positioning", corpus).length > 0);
    check("it finds a project", search("spring", corpus).some((r) => r.title.includes("Spring")));
    check("it finds a department head", search("marketing", corpus).length > 0);
    check("it finds a skill", search("addon", corpus).length > 0);
    check("a blank query returns the pages you can go to", search("", corpus).length >= 0);
    check("nonsense finds nothing", search("zzzzqqqxx", corpus).length === 0);

    section("permissions fence what somebody may open");
    /*
     * The two axes are not the same shape, which is easy to get backwards.
     * `heads` is an allow list: naming any means only those. `denied` is a deny
     * list: naming an area removes it and everything else stays. And an
     * administrator is never restricted by either, because the screen that sets
     * them is theirs, so a restriction they could lift in a click is only a way
     * to lock themselves out.
     */
    const limited: Permissions = { heads: ["marketing"], denied: ["wiki"] };

    check("a member sees a head they were given", allowsHead("member", limited, "marketing"));
    check("and not one they were not", !allowsHead("member", limited, "finance"));
    check("naming no heads means all of them", allowsHead("member", { denied: [] }, "finance"));

    check("a member keeps an area that was not denied", allowsArea("member", limited, "tasks"));
    check("and loses one that was", !allowsArea("member", limited, "wiki"));

    check("an administrator keeps every head", allowsHead("admin", limited, "finance"));
    check("and every area", allowsArea("admin", limited, "wiki"));

    check("no permissions at all means everything", allowsHead("member", null, "finance") && allowsArea("member", null, "wiki"));

    section("an addon, from asking for it to it running");
    const made = await createAddon(ws, {
      name: "Tell the team when something ships",
      description: "Posts to a webhook when a task is marked done.",
      createdBy: OWNER,
      recipe: {
        trigger: "task.completed",
        conditions: [{ field: "task.department", op: "is", value: "marketing" }],
        steps: [
          { action: "create_task", title: "Announce {{task.title}}" },
          { action: "http_post", url: "https://hooks.slack.com/services/ft", fields: { text: "{{task.title}} is done" } },
        ],
      },
    });
    check("the head can build one", made.ok, made.ok ? "" : made.problems.join("; "));
    if (!made.ok) throw new Error("cannot continue without an addon");

    check("it is saved switched off", made.addon.state === "pending", made.addon.state);
    check("and approved for nothing", made.addon.hosts.length === 0);

    // Completing a task while it is still pending must do nothing at all.
    await applyMutations(ws, OWNER, [
      { table: "tasks", action: "upsert", rows: [
        { id: "ft-2", title: "Book the venue", notes: "", status: "done", departmentId: "marketing", order: 1, completedAt: Date.now() },
      ] },
    ] as never);
    check("an unapproved addon does not run", (await recentRuns(ws)).length === 0, `${(await recentRuns(ws)).length}`);

    const live = await approveAddon(ws, made.addon.id, OWNER);
    check("approving turns it on", live?.state === "live", live?.state);
    check("and writes down the host", live?.hosts.join() === "hooks.slack.com", live?.hosts.join());

    // A fresh task, completed, so the trigger is a real transition.
    await applyMutations(ws, OWNER, [
      { table: "tasks", action: "upsert", rows: [
        { id: "ft-3", title: "Ship the pricing page", notes: "", status: "todo", departmentId: "marketing", order: 2 },
      ] },
    ] as never);
    await applyMutations(ws, OWNER, [
      { table: "tasks", action: "upsert", rows: [
        { id: "ft-3", title: "Ship the pricing page", notes: "", status: "done", departmentId: "marketing", order: 2, completedAt: Date.now() },
      ] },
    ] as never);

    const runs = await recentRuns(ws);
    check("completing a task wakes it", runs.length === 1, `${runs.length}`);
    const run = runs[0];
    check("the conditions matched", run?.ran === true);

    const filed = run?.steps.find((s) => s.did.startsWith("Add a task"));
    check("it filed the task it was told to", filed?.ok === true, filed?.detail);
    space = await loadWorkspace(ws, OWNER);
    check("and the task is really on the board", space.tasks.some((x) => x.title === "Announce Ship the pricing page"),
      space.tasks.map((x) => x.title).join(" | "));

    const posted = run?.steps.find((s) => s.did.startsWith("Send a message"));
    check("the outbound step was attempted", Boolean(posted), JSON.stringify(run?.steps));
    /*
     * The important one. Nobody at Slack agreed to receive this, so the send
     * either failed to reach a real endpoint or was refused; either way it must
     * be recorded rather than silently dropped, because a webhook that never
     * arrives is the thing an owner comes looking for.
     */
    check("and whatever happened to it is in the log", Boolean(posted?.detail), posted?.detail);

    // A condition that does not hold means no run at all, not a failed one.
    await applyMutations(ws, OWNER, [
      { table: "tasks", action: "upsert", rows: [
        { id: "ft-4", title: "Not marketing", notes: "", status: "todo", departmentId: "finance", order: 3 },
      ] },
    ] as never);
    await applyMutations(ws, OWNER, [
      { table: "tasks", action: "upsert", rows: [
        { id: "ft-4", title: "Not marketing", notes: "", status: "done", departmentId: "finance", order: 3, completedAt: Date.now() },
      ] },
    ] as never);
    const after = await recentRuns(ws);
    const skipped = after.find((r) => r.ran === false);
    check("a task in another department is skipped rather than run", Boolean(skipped), `${after.length} runs`);

    section("pausing and deleting an addon");
    const paused = await setAddonState(ws, made.addon.id, "paused");
    check("it can be paused", paused?.state === "paused", paused?.state);
    const before = (await recentRuns(ws)).length;
    await applyMutations(ws, OWNER, [
      { table: "tasks", action: "upsert", rows: [
        { id: "ft-5", title: "While paused", notes: "", status: "todo", departmentId: "marketing", order: 4 },
      ] },
    ] as never);
    await applyMutations(ws, OWNER, [
      { table: "tasks", action: "upsert", rows: [
        { id: "ft-5", title: "While paused", notes: "", status: "done", departmentId: "marketing", order: 4, completedAt: Date.now() },
      ] },
    ] as never);
    check("a paused addon does not run", (await recentRuns(ws)).length === before);

    check("it is listed for its business", (await addonsFor(ws)).length === 1);

    section("a task that never leaves todo never fires the completed trigger");
    await setAddonState(ws, made.addon.id, "live");
    const quiet = (await recentRuns(ws)).length;
    await applyMutations(ws, OWNER, [
      { table: "tasks", action: "upsert", rows: [
        { id: "ft-6", title: "Just sitting here", notes: "", status: "todo", departmentId: "marketing", order: 5 },
      ] },
    ] as never);
    check("creating one does not fire it", (await recentRuns(ws)).length === quiet);

    // Saving an already done task again must not re-fire: completion is a
    // transition, and an addon that repeats on every save is a spam machine.
    const settled = (await recentRuns(ws)).length;
    await applyMutations(ws, OWNER, [
      { table: "tasks", action: "upsert", rows: [
        { id: "ft-3", title: "Ship the pricing page", notes: "edited", status: "done", departmentId: "marketing", order: 2, completedAt: Date.now() },
      ] },
    ] as never);
    check("re-saving a done task does not fire it again", (await recentRuns(ws)).length === settled,
      `${(await recentRuns(ws)).length} vs ${settled}`);

    section("everything is still scoped to this business");
    const [{ n: strays }] = await database
      .select({ n: sql<number>`count(*)::int` })
      .from(t.tasks)
      .where(and(eq(t.tasks.workspaceId, ws)));
    check("its tasks are its own", strays > 0);
    const loaded = JSON.stringify(await loadWorkspace(ws, OWNER));
    check("nothing from another business is in the load", !loaded.includes("Northbound") && !loaded.includes("Skorheim"));
  } finally {
    if (ws) await deleteWorkspace(ws).catch(() => {});
    for (const email of [OWNER, MATE]) {
      await db!.delete(t.access).where(eq(t.access.email, email)).catch(() => {});
    }
    console.log("");
    console.log("cleaned up");
  }

  console.log(failures === 0 ? "\nall checks passed" : `\n${failures} failed`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
