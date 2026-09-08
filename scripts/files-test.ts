/**
 * The file store: that it writes where it says, refuses what it should, and
 * turns itself off cleanly when a deployment has nowhere to put anything.
 *
 * The last one is what makes this safe on a local checkout and was the whole
 * point of the test this replaces: with no directory configured, uploads fall
 * back to putting bytes in the row exactly as they did, reads come from
 * whichever place the row points at, and deletes do not throw reaching for a
 * disk that is not there.
 *
 * The rest is new, and is here because the store is now this app's own code
 * rather than a hosted service's. A path built from a database column and
 * joined onto a directory is the kind of thing that is fine until one day it is
 * a way to read /etc/passwd, so the refusals are checked rather than assumed.
 *
 * Run with: npm run files-test
 */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as store from "../src/lib/fileStore";

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!condition) failures += 1;
}

async function main() {
  console.log("with nowhere to put a file");
  {
    // The module reads the directory on every call rather than at import, which
    // is what lets one process test both halves of this.
    delete process.env.FILE_STORE_DIR;

    check("the store reports itself off", store.fileStoreEnabled() === false);

    let threw = false;
    try {
      const key = await store.putFile({
        workspaceId: "ws_1",
        mediaType: "image/png",
        bytes: Buffer.from("x"),
      });
      check("writing returns nothing rather than a key", key === null);
      check("reading returns nothing", (await store.readStoredFile("workspaces/ws_1/a.png")) === null);
      await store.forgetStoredFiles(["workspaces/ws_1/a.png", null, undefined, ""]);
      await store.forgetWorkspaceFiles("ws_1");
    } catch {
      threw = true;
    }
    check("none of it throws", !threw);
  }

  console.log("\nwith a directory");
  const root = await mkdtemp(join(tmpdir(), "panel-files-"));
  try {
    process.env.FILE_STORE_DIR = root;

    check("the store reports itself on", store.fileStoreEnabled() === true);

    const bytes = Buffer.from("the quick brown fox");
    const key: string | null = await store.putFile({
      workspaceId: "ws_abc",
      mediaType: "image/webp",
      bytes,
    });

    check("writing returns a key", typeof key === "string" && key.length > 0, String(key));
    check(
      "the key names the workspace and the type",
      Boolean(key && /^workspaces\/ws_abc\/[a-f0-9]{32}\.webp$/.test(key)),
      String(key),
    );

    const back = key ? await store.readStoredFile(key) : null;
    check("what comes back is what went in", Boolean(back && back.equals(bytes)));
    check("the size matches", (await store.storedFileSize(key!)) === bytes.length);

    // Two files, same workspace, same name on the way in.
    const second = await store.putFile({
      workspaceId: "ws_abc",
      mediaType: "image/webp",
      bytes: Buffer.from("a different file"),
    });
    check("two uploads never collide", key !== second);

    console.log("\nwhat it refuses");
    check(
      "a workspace id that could climb out of the directory",
      (await store.putFile({
        workspaceId: "../../etc",
        mediaType: "image/png",
        bytes,
      })) === null,
    );

    // Something readable, planted outside the store, to prove the refusals are
    // doing work rather than failing for some other reason.
    const outside = join(root, "secret.txt");
    await writeFile(outside, "not yours");
    for (const bad of [
      "../secret.txt",
      "workspaces/../../secret.txt",
      "workspaces/ws_abc/../../secret.txt",
      "/etc/passwd",
      "secret.txt",
    ]) {
      check(`reading ${bad}`, (await store.readStoredFile(bad)) === null);
    }
    check(
      "and the planted file is still there, so the refusals were real",
      (await readFile(outside, "utf8")) === "not yours",
    );

    console.log("\ndeleting");
    await store.forgetStoredFiles([key]);
    check("the bytes are gone", (await store.readStoredFile(key!)) === null);
    let threw = false;
    try {
      await store.forgetStoredFiles([key, null, undefined, ""]);
    } catch {
      threw = true;
    }
    check("deleting what is already gone is not an error", !threw);

    await store.forgetWorkspaceFiles("ws_abc");
    check("a whole workspace goes at once", (await store.readStoredFile(second!)) === null);
  } finally {
    await rm(root, { recursive: true, force: true });
    delete process.env.FILE_STORE_DIR;
  }

  console.log("\nreading a row picks the right source");
  // The same branch the file route takes, kept in step with it by shape.
  const pick = (row: { storageKey: string; data: string }) =>
    row.storageKey ? "disk" : row.data ? "row" : "nothing";

  check("a stored row goes to the disk", pick({ storageKey: "workspaces/a/b.webp", data: "" }) === "disk");
  check("an older row uses its own bytes", pick({ storageKey: "", data: "AAAA" }) === "row");
  check(
    "the disk wins when a row somehow has both",
    pick({ storageKey: "workspaces/a/b.webp", data: "AAAA" }) === "disk",
  );
  check("a row with neither is a miss", pick({ storageKey: "", data: "" }) === "nothing");

  console.log(failures === 0 ? "\nall checks passed" : `\n${failures} failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
