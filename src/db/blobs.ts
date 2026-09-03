import { del } from "@vercel/blob";

/**
 * Removes bytes from the blob store when the row that pointed at them goes.
 *
 * The store does not know about this app's tables, so nothing removes a blob
 * on its own: delete a conversation with a scan attached and, without this, the
 * row disappears and the scan stays, paid for and unreachable, for as long as
 * the store exists. This product already grew one storage leak of exactly that
 * shape and it took a while to notice, because a leak that costs money quietly
 * is the kind nobody reports.
 *
 * Deliberately not inside the database transaction. A blob delete that fails
 * must not roll back a delete the person asked for, and a row that is gone with
 * its bytes left behind is a smaller problem than a file somebody deleted
 * coming back. So the rows go first and this follows, best effort.
 */
export async function forgetBlobs(urls: (string | null | undefined)[]): Promise<void> {
  const real = urls.filter((url): url is string => Boolean(url));
  if (real.length === 0 || !process.env.BLOB_READ_WRITE_TOKEN?.trim()) return;

  try {
    // One call for the lot: the API takes an array, and a hundred separate
    // requests to delete a hundred files is a hundred chances to fail.
    await del(real);
  } catch (error) {
    console.error("[blobs] could not delete", real.length, "file(s)", error);
  }
}
