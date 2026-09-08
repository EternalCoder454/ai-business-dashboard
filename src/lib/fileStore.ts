/**
 * Where uploaded bytes live, now that they live on this machine.
 *
 * They used to go to Vercel Blob, which meant the browser uploaded straight to
 * a store this app never touched. Off that platform there is no store to upload
 * to, so the bytes come through the app and land on a disk beside it. The shape
 * either side is unchanged: a row still points at somewhere else rather than
 * carrying base64, and reads still go through the app so that every one of them
 * is checked against a workspace first.
 *
 * The directory is the deployment's to choose and is expected to be a volume.
 * Without one the whole thing turns off and uploads fall back to keeping bytes
 * in the row, which is what a local checkout does and what this deployment did
 * before there was a store at all.
 */
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

/*
 * Read on every call rather than once at import.
 *
 * A module level constant would be read whenever this file first happens to be
 * loaded, which in Next is not a moment anything here controls, and it makes
 * the directory impossible to change without restarting the process. It is one
 * property lookup.
 */
function root(): string {
  return process.env.FILE_STORE_DIR?.trim() ?? "";
}

/** Whether this deployment has anywhere to put a file. */
export function fileStoreEnabled(): boolean {
  return Boolean(root());
}

/**
 * The extension a stored file gets, by what it is.
 *
 * From the type rather than from the name somebody uploaded. A name is theirs
 * and can be anything; the type is one of a handful this app agreed to accept,
 * and a file on disk that can be opened by double clicking it is worth the map.
 */
const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
};

/**
 * A key is ours, generated here, and never anything a request supplied.
 *
 * Checked anyway on the way back in. The value reaches this module from a
 * database column, and a column is only as trustworthy as everything that has
 * ever written to it; a path traversal that costs one regular expression to
 * close is not worth reasoning about twice.
 */
const KEY = /^workspaces\/[A-Za-z0-9_-]{1,64}\/[a-f0-9]{32}\.[a-z0-9]{1,8}$/;

function pathFor(key: string): string | null {
  const base = root();
  if (!base || !KEY.test(key)) return null;

  const home = resolve(base);
  const full = resolve(home, key);
  // Belt and braces behind the pattern above: whatever the key turned out to
  // be, the file it names has to be inside the directory we were given.
  if (full !== home && !full.startsWith(home + sep)) return null;
  return full;
}

/**
 * Writes one file and returns the key that finds it again.
 *
 * The workspace is in the path so that a person looking at the disk can see
 * whose files these are, and so that deleting a business is a directory rather
 * than a query. It is not what keeps one business out of another's files: every
 * read goes through this app and is checked against the session, the same as it
 * was when the bytes were somewhere else.
 */
export async function putFile(input: {
  workspaceId: string;
  mediaType: string;
  bytes: Buffer | Uint8Array;
}): Promise<string | null> {
  if (!root()) return null;

  // The id comes out of the database and is ours, but it is going into a path,
  // so anything that could climb out of one is refused rather than escaped.
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(input.workspaceId)) return null;

  const extension = EXTENSIONS[input.mediaType] ?? "bin";
  const key = `workspaces/${input.workspaceId}/${randomBytes(16).toString("hex")}.${extension}`;
  const full = pathFor(key);
  if (!full) return null;

  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, input.bytes);
  return key;
}

/** One file's bytes, or nothing if the key names something that is not there. */
export async function readStoredFile(key: string): Promise<Buffer | null> {
  const full = pathFor(key);
  if (!full) return null;

  try {
    return await readFile(full);
  } catch (error) {
    // A missing file is a real state and not a fault: a restore that brought
    // the database back without the disk leaves rows pointing at nothing.
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("[files] could not read", key, error);
    }
    return null;
  }
}

/**
 * Removes bytes whose row has gone.
 *
 * Nothing on the disk knows about this app's tables, so without this a deleted
 * conversation leaves its attachments behind, taking up room and unreachable,
 * for as long as the volume exists. This product already grew one leak of
 * exactly that shape and it took a while to notice.
 *
 * Best effort, and deliberately outside the transaction that removed the rows.
 * A file that will not delete must not roll back a delete somebody asked for,
 * and bytes left behind are a smaller problem than a file somebody deleted
 * coming back.
 */
export async function forgetStoredFiles(
  keys: (string | null | undefined)[],
): Promise<void> {
  if (!root()) return;

  for (const key of keys) {
    if (!key) continue;
    const full = pathFor(key);
    if (!full) continue;
    try {
      await rm(full, { force: true });
    } catch (error) {
      console.error("[files] could not delete", key, error);
    }
  }
}

/**
 * Everything one workspace has on disk, for when the workspace itself goes.
 *
 * A directory rather than a list of keys, so a business that is deleted takes
 * its files with it even if a row went missing somewhere along the way.
 */
export async function forgetWorkspaceFiles(workspaceId: string): Promise<void> {
  const base = root();
  if (!base || !/^[A-Za-z0-9_-]{1,64}$/.test(workspaceId)) return;

  const full = join(resolve(base), "workspaces", workspaceId);
  try {
    await rm(full, { recursive: true, force: true });
  } catch (error) {
    console.error("[files] could not clear the workspace directory", error);
  }
}

/** What one stored file weighs, for anything that needs to check. */
export async function storedFileSize(key: string): Promise<number> {
  const full = pathFor(key);
  if (!full) return 0;
  try {
    return (await stat(full)).size;
  } catch {
    return 0;
  }
}
