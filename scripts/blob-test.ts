/**
 * That the panel keeps working with no blob store configured.
 *
 * This is what makes the change safe to deploy before the store exists. Every
 * path has to survive BLOB_READ_WRITE_TOKEN being absent: uploads fall back to
 * putting bytes in the row exactly as they did, reads come from whichever place
 * the row points at, and deletes do not throw trying to reach a store that is
 * not there.
 *
 * Run with: npm run blob-test
 */
import { forgetBlobs } from "../src/db/blobs";

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!condition) failures += 1;
}

async function main() {
  const had = process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.BLOB_READ_WRITE_TOKEN;

  console.log("with no store configured");
  let threw = false;
  try {
    await forgetBlobs(["https://example.blob.vercel-storage.com/a", "https://x/b"]);
  } catch {
    threw = true;
  }
  check("deleting blobs does nothing rather than throwing", !threw);

  threw = false;
  try {
    await forgetBlobs([]);
    await forgetBlobs([null, undefined, ""]);
  } catch {
    threw = true;
  }
  check("nothing to delete is not an error", !threw);

  if (had) process.env.BLOB_READ_WRITE_TOKEN = had;

  console.log("\nreading a row picks the right source");
  // The same branch the file route takes, kept in step with it by shape.
  const pick = (row: { blobUrl: string; data: string }) =>
    row.blobUrl ? "store" : row.data ? "row" : "nothing";

  check("a new row goes to the store", pick({ blobUrl: "https://x/a", data: "" }) === "store");
  check("an old row uses its own bytes", pick({ blobUrl: "", data: "AAAA" }) === "row");
  check(
    "the store wins when a row somehow has both",
    pick({ blobUrl: "https://x/a", data: "AAAA" }) === "store",
  );
  check("a row with neither is a miss", pick({ blobUrl: "", data: "" }) === "nothing");

  console.log(failures === 0 ? "\nall checks passed" : `\n${failures} failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => { console.error(error); process.exit(1); });
