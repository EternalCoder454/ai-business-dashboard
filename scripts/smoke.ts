/**
 * Exercises the repository layer against the real database.
 *
 * The hosted path is otherwise only reachable through a signed-in browser, so
 * without this the first real sign in would also be the first test. Everything
 * is written under a throwaway address and removed again at the end.
 *
 *   npm run smoke
 */
import { and, eq } from "drizzle-orm";

import { requireDb } from "../src/db/client";
import * as schema from "../src/db/schema";
import { applyMutations, isEmpty, loadWorkspace } from "../src/db/repo";
import { seedDepartments } from "../src/lib/seed";
import { seedSkills } from "../src/lib/seedSkills";
import type { Conversation } from "../src/lib/types";

const USER = "smoke-test@example.invalid";

function check(label: string, condition: boolean, detail = "") {
  console.log(`${condition ? "  ok  " : "  FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!condition) process.exitCode = 1;
}

async function wipe() {
  const current = await loadWorkspace(USER);
  await applyMutations(USER, [
    { table: "conversations", action: "delete", ids: current.conversations.map((c) => c.id) },
    { table: "departments", action: "delete", ids: current.departments.map((d) => d.id) },
    { table: "skills", action: "delete", ids: current.skills.map((s) => s.id) },
    { table: "deliverables", action: "delete", ids: current.deliverables.map((d) => d.id) },
    { table: "files", action: "delete", ids: current.files.map((f) => f.id) },
    { table: "allHands", action: "delete", ids: current.allHandsRuns.map((r) => r.id) },
    { table: "projects", action: "delete", ids: current.projects.map((p) => p.id) },
  ]);
}

async function main() {
  console.log("clearing any previous run");
  await wipe();
  check("account reads as empty", await isEmpty(USER));

  console.log("\nseeding");
  await applyMutations(USER, [
    { table: "departments", action: "upsert", rows: seedDepartments() },
    { table: "skills", action: "upsert", rows: seedSkills() },
    {
      table: "profile",
      action: "upsert",
      row: {
        mission: "Ship things.",
        audience: "Founders",
        brandVoice: "Plain",
        keyFacts: "Neon, Vercel",
        products: "",
        stage: "",
        competitors: "",
        constraints: "",
        goals: "",
      },
    },
    {
      table: "settings",
      action: "upsert",
      row: { model: "claude-sonnet-5", companyName: "Eterneon" },
    },
  ]);

  const seeded = await loadWorkspace(USER);
  check("departments round trip", seeded.departments.length === 8, `${seeded.departments.length}`);
  check("ceo flag survives", Boolean(seeded.departments.find((d) => d.isCeo)));
  check("order preserved", seeded.departments[0]?.order === 0);
  check("persona text survives", (seeded.departments[1]?.persona.length ?? 0) > 20);
  check(
    "skills round trip",
    seeded.skills.length === seedSkills().length,
    `${seeded.skills.length} of ${seedSkills().length}`,
  );
  check(
    "company wide skills present",
    seeded.skills.filter((s) => s.departmentId === "company").length === 2,
  );
  check("profile round trip", seeded.profile.mission === "Ship things.");
  check("settings round trip", seeded.settings.companyName === "Eterneon");
  check("no api key reaches the client", !("apiKey" in seeded.settings));

  console.log("\nconversation carrying an attachment");
  const conversation: Conversation = {
    id: "conv_smoke",
    departmentId: "design",
    title: "Sprite review",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [
      {
        id: "msg_smoke_1",
        role: "user",
        content: "What do you make of this?",
        timestamp: Date.now(),
        attachments: [
          {
            id: "att_smoke_1",
            kind: "image",
            mediaType: "image/png",
            name: "sprite.png",
            data: "iVBORw0KGgo=",
            width: 32,
            height: 32,
            size: 128,
          },
        ],
      },
      {
        id: "msg_smoke_2",
        role: "assistant",
        content: "The silhouette reads at one to one.",
        thinking: "checking readability",
        timestamp: Date.now() + 1,
      },
    ],
  };
  await applyMutations(USER, [{ table: "conversations", action: "upsert", rows: [conversation] }]);

  const withConv = await loadWorkspace(USER);
  const loaded = withConv.conversations.find((c) => c.id === "conv_smoke");
  check("conversation stored", Boolean(loaded));
  check(
    "messages come back in order",
    loaded?.messages[0]?.id === "msg_smoke_1" && loaded?.messages[1]?.id === "msg_smoke_2",
  );
  check("attachment rehydrated", loaded?.messages[0]?.attachments?.[0]?.name === "sprite.png");
  // Bytes deliberately do not travel with a message either. A conversation
  // full of screenshots used to re-download all of them on every page load;
  // they are fetched from /api/files when one is opened or re-sent.
  check(
    "attachment bytes stay out of the snapshot",
    loaded?.messages[0]?.attachments?.[0]?.data === undefined,
  );
  check("thinking survives", loaded?.messages[1]?.thinking === "checking readability");
  check(
    "chat attachment stays out of the Library",
    !withConv.files.some((f) => f.id === "att_smoke_1"),
  );

  console.log("\nappending a turn does not duplicate the earlier ones");
  await applyMutations(USER, [
    {
      table: "conversations",
      action: "upsert",
      rows: [
        {
          ...conversation,
          messages: [
            ...conversation.messages,
            {
              id: "msg_smoke_3",
              role: "user",
              content: "And at 20px?",
              timestamp: Date.now() + 2,
            },
          ],
        },
      ],
    },
  ]);
  const appended = await loadWorkspace(USER);
  const appendedCount = appended.conversations.find((c) => c.id === "conv_smoke")?.messages.length;
  check("three messages, not five", appendedCount === 3, String(appendedCount));

  console.log("\nall hands round trip");
  await applyMutations(USER, [
    {
      table: "allHands",
      action: "upsert",
      rows: [
        {
          id: "room_smoke",
          title: "Raise prices?",
          status: "done",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          rounds: [
            {
              id: "round_smoke_1",
              question: "Should we raise mod prices?",
              createdAt: Date.now(),
              synthesis: "Hold for now.",
              responses: [
                { departmentId: "finance", content: "Margins allow it.", pending: false },
                { departmentId: "social", content: "The community will notice.", pending: false },
              ],
            },
          ],
        },
      ],
    },
  ]);
  const rooms = await loadWorkspace(USER);
  const room = rooms.allHandsRuns.find((r) => r.id === "room_smoke");
  check("run stored", Boolean(room));
  check("round responses survive as json", room?.rounds[0]?.responses.length === 2);
  check("synthesis survives", room?.rounds[0]?.synthesis === "Hold for now.");

  console.log("\nlibrary file round trip");
  await applyMutations(USER, [
    {
      table: "files",
      action: "upsert",
      rows: [
        {
          id: "file_smoke",
          kind: "document",
          mediaType: "text/plain",
          name: "contract.txt",
          data: "",
          text: "Payment terms are net 30.",
          width: 0,
          height: 0,
          size: 25,
          note: "client A",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
    },
  ]);
  const withFile = await loadWorkspace(USER);
  const file = withFile.files.find((f) => f.id === "file_smoke");
  check("library file stored", Boolean(file));
  check("extracted text survives", file?.text === "Payment terms are net 30.");
  check("note survives", file?.note === "client A");

  console.log("\nprojects group work across departments");
  await applyMutations(USER, [
    {
      table: "projects",
      action: "upsert",
      rows: [
        {
          id: "proj_smoke",
          name: "Ravenmoor launch",
          summary: "Modpack and client site together.",
          status: "active",
          accent: "cyan",
          dueOn: "2026-09-30",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
    },
  ]);

  // The fixture has no deliverable of its own, and a check that passes because
  // there was nothing to check is worse than no check at all.
  await applyMutations(USER, [
    {
      table: "deliverables",
      action: "upsert",
      rows: [
        {
          id: "del_smoke",
          title: "Launch checklist",
          body: "Pack, site, announcement.",
          departmentId: "ops",
          status: "backlog",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
    },
  ]);

  // File work from more than one department under the one project, which is
  // the whole reason projects exist.
  const beforeFiling = await loadWorkspace(USER);
  await applyMutations(USER, [
    {
      table: "conversations",
      action: "upsert",
      rows: beforeFiling.conversations.map((row) => ({ ...row, projectId: "proj_smoke" })),
    },
    {
      table: "deliverables",
      action: "upsert",
      rows: beforeFiling.deliverables.map((row) => ({ ...row, projectId: "proj_smoke" })),
    },
    {
      table: "files",
      action: "upsert",
      rows: beforeFiling.files.map((row) => ({ ...row, projectId: "proj_smoke" })),
    },
  ]);

  const filed = await loadWorkspace(USER);
  const project = filed.projects.find((p) => p.id === "proj_smoke");
  check("project stored", Boolean(project));
  check("project summary survives", project?.summary === "Modpack and client site together.");
  check("accent survives", project?.accent === "cyan");
  check("due date survives", project?.dueOn === "2026-09-30");
  check(
    "conversations filed",
    filed.conversations.filter((c) => c.projectId === "proj_smoke").length > 0,
  );
  check("deliverables filed", filed.deliverables.some((d) => d.projectId === "proj_smoke"));
  check("files filed", filed.files.some((f) => f.projectId === "proj_smoke"));

  console.log("\ndeleting a project releases its work rather than deleting it");
  const conversationCount = filed.conversations.length;
  const deliverableCount = filed.deliverables.length;
  const fileCount = filed.files.length;
  await applyMutations(USER, [{ table: "projects", action: "delete", ids: ["proj_smoke"] }]);
  const released = await loadWorkspace(USER);
  check("project gone", !released.projects.some((p) => p.id === "proj_smoke"));
  check(
    "conversations survived",
    released.conversations.length === conversationCount,
    `${released.conversations.length} of ${conversationCount}`,
  );
  check(
    "deliverables survived",
    released.deliverables.length === deliverableCount,
    `${released.deliverables.length} of ${deliverableCount}`,
  );
  check("files survived", released.files.length === fileCount, `${released.files.length}`);
  check(
    "every link cleared",
    released.conversations.every((c) => !c.projectId) &&
      released.deliverables.every((d) => !d.projectId) &&
      released.files.every((f) => !f.projectId),
  );

  console.log("\nthe studio record survives a round trip");
  {
    const now = Date.now();
    await applyMutations(USER, [
      {
        table: "memory",
        action: "upsert",
        rows: [
          {
            id: "mem_smoke_1",
            kind: "decision",
            label: "Smoke decision",
            value: "",
            detail: "Because the test said so.",
            revisitWhen: "The test is deleted",
            departmentId: "company",
            occurredAt: now - 86_400_000,
            archived: false,
            createdAt: now,
            updatedAt: now,
          },
          {
            id: "mem_smoke_2",
            kind: "figure",
            label: "Wishlists",
            value: "1,240",
            detail: "",
            revisitWhen: "",
            departmentId: "marketing",
            occurredAt: now,
            archived: false,
            createdAt: now,
            updatedAt: now,
          },
        ],
      },
    ]);

    const back = await loadWorkspace(USER);
    check("both entries came back", back.memory.length === 2, `${back.memory.length}`);
    const decision = back.memory.find((entry) => entry.id === "mem_smoke_1");
    check("the kind survived", decision?.kind === "decision");
    check("the reasoning survived", decision?.detail === "Because the test said so.");
    check("the trigger survived", decision?.revisitWhen === "The test is deleted");
    // A bigint read back as a string would silently break every date on screen.
    check("occurredAt is still a number", typeof decision?.occurredAt === "number");
    check("and still the same instant", decision?.occurredAt === now - 86_400_000);
    check("archived defaults to false", decision?.archived === false);
    const figure = back.memory.find((entry) => entry.id === "mem_smoke_2");
    check("the reading survived", figure?.value === "1,240");
    check("newest first", back.memory[0]?.id === "mem_smoke_2", back.memory[0]?.id);

    await applyMutations(USER, [
      { table: "memory", action: "delete", ids: ["mem_smoke_1", "mem_smoke_2"] },
    ]);
    check("and they delete", (await loadWorkspace(USER)).memory.length === 0);
  }

  console.log("\ntasks survive a round trip");
  {
    const now = Date.now();
    await applyMutations(USER, [
      {
        table: "tasks",
        action: "upsert",
        rows: [
          {
            id: "task_smoke_1",
            title: "Smoke task",
            notes: "With notes.",
            status: "doing",
            departmentId: "marketing",
            dueAt: now + 86_400_000,
            order: -3,
            createdAt: now,
            updatedAt: now,
          },
        ],
      },
    ]);

    const back = await loadWorkspace(USER);
    const task = back.tasks.find((row) => row.id === "task_smoke_1");
    check("it came back", Boolean(task));
    check("the status survived", task?.status === "doing");
    check("the notes survived", task?.notes === "With notes.");
    // bigint columns read back as strings would break every date on screen.
    check("dueAt is still a number", typeof task?.dueAt === "number");
    check("and still the same instant", task?.dueAt === now + 86_400_000);
    check("hand ordering survived, negatives included", task?.order === -3);
    check("nothing invented a completedAt", task?.completedAt === undefined);

    await applyMutations(USER, [{ table: "tasks", action: "delete", ids: ["task_smoke_1"] }]);
    check("and it deletes", (await loadWorkspace(USER)).tasks.length === 0);
  }

  console.log("\nfile bytes stay in the database and out of the snapshot");
  {
    const now = Date.now();
    // Big enough that carrying it in the snapshot would be obvious.
    const data = "A".repeat(200_000);
    await applyMutations(USER, [
      {
        table: "files",
        action: "upsert",
        rows: [
          {
            id: "file_payload_1",
            kind: "image",
            mediaType: "image/png",
            name: "screenshot.png",
            data,
            width: 100,
            height: 100,
            size: 150_000,
            createdAt: now,
            updatedAt: now,
          },
        ],
      },
    ]);

    const back = await loadWorkspace(USER);
    const file = back.files.find((row) => row.id === "file_payload_1");
    check("the file is listed", Boolean(file));
    check("its name survived", file?.name === "screenshot.png");
    check("its size survived, so the interface can still show one", file?.size === 150_000);
    // The whole point: metadata travels, bytes do not.
    check("the bytes are not in the snapshot", file?.data === undefined);

    const serialised = JSON.stringify(back).length;
    check(
      "so the snapshot is nowhere near the size of the file",
      serialised < 100_000,
      `${serialised.toLocaleString()} bytes`,
    );

    // Still stored, or /api/files would have nothing to serve.
    const [row] = await requireDb()
      .select()
      .from(schema.files)
      .where(and(eq(schema.files.userEmail, USER), eq(schema.files.id, "file_payload_1")))
      .limit(1);
    check("the bytes are still in the database", row?.data.length === data.length);

    await applyMutations(USER, [{ table: "files", action: "delete", ids: ["file_payload_1"] }]);
    const after = await loadWorkspace(USER);
    check(
      "and it deletes",
      !after.files.some((row) => row.id === "file_payload_1"),
      `${after.files.length} file(s) left from earlier checks`,
    );
  }

  console.log("\ndeleting a head takes its conversations with it");
  await applyMutations(USER, [{ table: "departments", action: "delete", ids: ["design"] }]);
  const afterDelete = await loadWorkspace(USER);
  check("department gone", !afterDelete.departments.some((d) => d.id === "design"));
  check(
    "its conversation went too",
    !afterDelete.conversations.some((c) => c.departmentId === "design"),
  );

  console.log("\ncleaning up");
  await wipe();
  check("account empty again", await isEmpty(USER));

  console.log(process.exitCode ? "\nFAILURES ABOVE" : "\nall checks passed");
  process.exit(process.exitCode ?? 0);
}

main().catch((error) => {
  console.error("smoke test threw:", error);
  process.exit(1);
});
