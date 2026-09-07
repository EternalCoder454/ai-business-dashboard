/**
 * That a backup actually restores, against a real database.
 *
 * backups-test reads the lists and checks nothing has fallen out of them. It
 * cannot tell you whether a restore works, and a restore is the one feature
 * here whose only use is the day something has gone wrong. Shipping it on the
 * strength of it having compiled is not good enough, so this does the whole
 * round trip: write rows, back them up, destroy them, put them back, and look.
 *
 * It runs against a scratch workspace whose id is generated per run and checked
 * against the real ones before anything is written. restoreBackup deletes every
 * row in the workspace it is given, so the id it is handed is the only thing
 * standing between this test and somebody's business. It is asserted, not
 * assumed, and everything is removed afterwards either way.
 *
 *   npm run backups-live
 */
import { and, eq, inArray } from "drizzle-orm";
import { requireDb } from "../src/db/client";
import * as t from "../src/db/schema";
import { createBackup, deleteBackup, listBackups, restoreBackup } from "../src/db/backups";

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures += 1;
}

const SCRATCH = `ws_backupselftest_${Date.now().toString(36)}`;

void (async () => {
  const db = requireDb();

  /*
   * Before anything at all. A restore deletes every row in the workspace it is
   * pointed at, so the one thing that must be true is that this id belongs to
   * nobody. Checked against the table rather than reasoned about.
   */
  const real = await db.select({ id: t.workspaces.id }).from(t.workspaces);
  const names = real.map((row) => row.id);
  if (names.includes(SCRATCH)) {
    console.log(`\nREFUSING: ${SCRATCH} is a real workspace.`);
    process.exit(1);
  }
  console.log(`\nusing a scratch workspace (${SCRATCH}, ${names.length} real ones untouched)`);

  const cleanup = async () => {
    for (const table of [t.tasks, t.memory, t.wikiPages, t.departments, t.settings, t.backups]) {
      await db
        .delete(table)
        .where(eq((table as { workspaceId: typeof t.tasks.workspaceId }).workspaceId, SCRATCH));
    }
  };

  try {
    console.log("\nsomething to lose");
    {
      await db.insert(t.departments).values({
        id: "dept_one",
        workspaceId: SCRATCH,
        name: "Engineering",
        roleTitle: "Head of Engineering",
        status: "active",
      });
      await db.insert(t.wikiPages).values({
        id: "wiki_one",
        workspaceId: SCRATCH,
        title: "How we ship",
        body: "Small changes, often.",
      });
      await db.insert(t.tasks).values([
        { id: "task_one", workspaceId: SCRATCH, title: "Keep this one", departmentId: "dept_one" },
        { id: "task_two", workspaceId: SCRATCH, title: "And this one", departmentId: "dept_one" },
      ]);
      await db.insert(t.memory).values({
        id: "mem_one",
        workspaceId: SCRATCH,
        kind: "decision",
        label: "Priced at 9.99",
        departmentId: "dept_one",
        occurredAt: Date.now(),
      });

      const tasks = await db.select().from(t.tasks).where(eq(t.tasks.workspaceId, SCRATCH));
      check("four tables written", tasks.length === 2, `${tasks.length} tasks`);
    }

    console.log("\na backup of it");
    let backupId = "";
    {
      const made = await createBackup({
        workspaceId: SCRATCH,
        label: "Self test",
        kind: "manual",
        takenBy: "self-test",
      });
      check("the backup was taken", !("error" in made), "error" in made ? made.error : "");
      if ("error" in made) throw new Error(made.error);

      backupId = made.backup.id;
      check("it counted the tasks", made.backup.counts.tasks === 2, `${made.backup.counts.tasks}`);
      check("and the wiki page", made.backup.counts.wikiPages === 1);
      check("and the department", made.backup.counts.departments === 1);
      check("and it has a size", made.backup.bytes > 100, `${made.backup.bytes} bytes`);
    }

    console.log("\nno backup carries a provider key, and no restore disturbs one");
    {
      /*
       * The keys live on the settings row, which is otherwise worth backing up
       * in full. Two failures were possible and both are checked here: a
       * payload holding a live credential, and a restore reinstating a key that
       * had been rotated since, or wiping it entirely by taking the column
       * default.
       */
      const SECRET = "sk-ant-KEYTEST-backup-selftest";
      await db.insert(t.settings).values({
        workspaceId: SCRATCH,
        anthropicKey: SECRET,
        model: "claude-opus-5",
      });

      const made = await createBackup({
        workspaceId: SCRATCH,
        label: "With a key set",
        kind: "manual",
        takenBy: "self-test",
      });
      if ("error" in made) throw new Error(made.error);

      const [stored] = await db
        .select({ payload: t.backups.payload })
        .from(t.backups)
        .where(and(eq(t.backups.workspaceId, SCRATCH), eq(t.backups.id, made.backup.id)))
        .limit(1);

      check("the key is not in the payload", !stored.payload.includes(SECRET));
      check(
        "nor is the column that holds it",
        !stored.payload.includes("anthropicKey"),
        stored.payload.includes("anthropicKey") ? "found anthropicKey" : "",
      );
      check("but the settings row is still backed up", made.backup.counts.settings === 1);

      // Rotated after the backup was taken, which is the case that matters.
      const ROTATED = "sk-ant-KEYTEST-rotated-afterwards";
      await db
        .update(t.settings)
        .set({ anthropicKey: ROTATED })
        .where(eq(t.settings.workspaceId, SCRATCH));

      const done = await restoreBackup({
        workspaceId: SCRATCH,
        id: made.backup.id,
        restoredBy: "self-test",
      });
      check("the restore succeeded", !("error" in done), "error" in done ? done.error : "");

      const [after] = await db
        .select()
        .from(t.settings)
        .where(eq(t.settings.workspaceId, SCRATCH))
        .limit(1);

      check("the current key survived the restore", after?.anthropicKey === ROTATED, after?.anthropicKey);
      check("the old one was not reinstated", after?.anthropicKey !== SECRET);
      check("and it was not wiped to empty", (after?.anthropicKey ?? "") !== "");
      check("while an ordinary setting did come back", after?.model === "claude-opus-5", after?.model);

      /*
       * Only the two this block made: the backup above and the safety copy the
       * restore took. Clearing every backup in the workspace was the first
       * version and it deleted the one the restore test further down was
       * holding an id for, which failed there rather than here.
       */
      await db.delete(t.settings).where(eq(t.settings.workspaceId, SCRATCH));
      const mine = [made.backup.id, ...("ok" in done ? [done.safety] : [])];
      await db
        .delete(t.backups)
        .where(and(eq(t.backups.workspaceId, SCRATCH), inArray(t.backups.id, mine)));
    }

    console.log("\nthe nightly pass skips a workspace nobody touched");
    {
      /*
       * Without this a business nobody opened for a fortnight spends its whole
       * retention on fourteen identical copies of itself, and pushes out the
       * last backup taken while it was still being used, which is the one
       * somebody would actually want.
       */
      const first = await createBackup({
        workspaceId: SCRATCH,
        label: "Daily backup",
        kind: "automatic",
        takenBy: "",
        onlyIfChanged: true,
      });
      check("the first nightly backup is taken", "backup" in first);

      const second = await createBackup({
        workspaceId: SCRATCH,
        label: "Daily backup",
        kind: "automatic",
        takenBy: "",
        onlyIfChanged: true,
      });
      check("a second with nothing changed is skipped", "unchanged" in second);

      // Compared on the tables alone. Every payload carries the moment it was
      // taken, so comparing the whole thing would differ every single time.
      await db
        .update(t.wikiPages)
        .set({ body: "Changed since the last nightly." })
        .where(eq(t.wikiPages.workspaceId, SCRATCH));

      const third = await createBackup({
        workspaceId: SCRATCH,
        label: "Daily backup",
        kind: "automatic",
        takenBy: "",
        onlyIfChanged: true,
      });
      check("and one after a change is taken", "backup" in third);

      // Put it back, so the restore below is checking what it thinks it is.
      await db
        .update(t.wikiPages)
        .set({ body: "Small changes, often." })
        .where(eq(t.wikiPages.workspaceId, SCRATCH));

      const nightly = (await listBackups(SCRATCH)).filter((row) => row.kind === "automatic");
      check("two nightly backups exist, not three", nightly.length === 2, `${nightly.length}`);
    }

    console.log("\nnow lose it, the way somebody would");
    {
      await db.delete(t.tasks).where(and(eq(t.tasks.workspaceId, SCRATCH), eq(t.tasks.id, "task_two")));
      await db
        .update(t.wikiPages)
        .set({ body: "Overwritten by mistake." })
        .where(eq(t.wikiPages.workspaceId, SCRATCH));
      await db.delete(t.memory).where(eq(t.memory.workspaceId, SCRATCH));

      const tasks = await db.select().from(t.tasks).where(eq(t.tasks.workspaceId, SCRATCH));
      const memory = await db.select().from(t.memory).where(eq(t.memory.workspaceId, SCRATCH));
      check("a task is gone", tasks.length === 1);
      check("the memory is gone", memory.length === 0);
    }

    console.log("\nand put it back");
    {
      const done = await restoreBackup({
        workspaceId: SCRATCH,
        id: backupId,
        restoredBy: "self-test",
      });
      check("the restore reported success", !("error" in done), "error" in done ? done.error : "");
      if ("error" in done) throw new Error(done.error);

      const tasks = await db
        .select()
        .from(t.tasks)
        .where(eq(t.tasks.workspaceId, SCRATCH));
      const [wiki] = await db.select().from(t.wikiPages).where(eq(t.wikiPages.workspaceId, SCRATCH));
      const memory = await db.select().from(t.memory).where(eq(t.memory.workspaceId, SCRATCH));
      const depts = await db.select().from(t.departments).where(eq(t.departments.workspaceId, SCRATCH));

      check("the deleted task is back", tasks.length === 2, `${tasks.length} tasks`);
      check("with its title intact", tasks.some((row) => row.title === "And this one"));
      check("the overwritten page is back", wiki?.body === "Small changes, often.", wiki?.body);
      check("the deleted memory is back", memory.length === 1);
      check("and nothing was duplicated", depts.length === 1, `${depts.length} departments`);

      /*
       * The property that makes a restore safe to try: it takes a backup of
       * what was there first, so restoring the wrong one is recoverable by
       * restoring the one it just made.
       */
      const all = await listBackups(SCRATCH);
      const safety = all.find((row) => row.id === done.safety);
      check("a safety backup was taken first", Boolean(safety), done.safety);
      check("named for what it was taken before", safety?.label.startsWith("Before restoring") ?? false, safety?.label);
      check("and marked as one", safety?.kind === "before-restore", safety?.kind);

      /*
       * It has to hold the broken state, not the restored one, or it is not an
       * undo of anything. One task, because that is what was there.
       */
      check(
        "holding what was there before the restore",
        safety?.counts.tasks === 1,
        `${safety?.counts.tasks} tasks`,
      );
    }

    console.log("\nand a backup from another workspace is refused");
    {
      const [row] = await db
        .select({ id: t.backups.id })
        .from(t.backups)
        .where(eq(t.backups.workspaceId, SCRATCH))
        .limit(1);

      // Moved to a workspace it did not come from, which the payload records.
      await db
        .update(t.backups)
        .set({ workspaceId: `${SCRATCH}_other` })
        .where(and(eq(t.backups.workspaceId, SCRATCH), eq(t.backups.id, row.id)));

      const refused = await restoreBackup({
        workspaceId: `${SCRATCH}_other`,
        id: row.id,
        restoredBy: "self-test",
      });
      check(
        "it belongs to a different workspace",
        "error" in refused && refused.error.includes("different workspace"),
        "error" in refused ? refused.error : "it was allowed",
      );

      await db.delete(t.backups).where(eq(t.backups.workspaceId, `${SCRATCH}_other`));
    }

    console.log("\nremoving a backup leaves the rows alone");
    {
      const before = await db.select().from(t.tasks).where(eq(t.tasks.workspaceId, SCRATCH));
      await deleteBackup(SCRATCH, backupId);
      const after = await db.select().from(t.tasks).where(eq(t.tasks.workspaceId, SCRATCH));
      const left = await listBackups(SCRATCH);
      check("the tasks are untouched", before.length === after.length, `${after.length}`);
      check("and the backup is gone", !left.some((row) => row.id === backupId));
    }
  } finally {
    await cleanup();
    const left = await db.select().from(t.tasks).where(eq(t.tasks.workspaceId, SCRATCH));
    const backupsLeft = await listBackups(SCRATCH);
    console.log("\nthe scratch workspace is cleaned up");
    check("no rows left", left.length === 0, `${left.length}`);
    check("no backups left", backupsLeft.length === 0, `${backupsLeft.length}`);
  }

  console.log(failures === 0 ? "\nall checks passed" : `\n${failures} FAILURES ABOVE`);
  process.exit(failures === 0 ? 0 : 1);
})();
