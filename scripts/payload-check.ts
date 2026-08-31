/**
 * Measures what one workspace snapshot actually weighs.
 *
 * loadWorkspace maps every file row through toAttachment, which includes the
 * base64 `data` column, and rehydrates every message attachment the same way.
 * That means the whole snapshot, every byte of every image ever attached, is
 * serialised into a single JSON response on every page load. This puts a number
 * on it instead of a suspicion.
 *
 * Run with: npm run payload-check
 */
import { applyMutations, loadWorkspace } from "../src/db/repo";

const USER = "payload-check@example.invalid";

/** Roughly what a 1MB screenshot becomes once base64 encoded. */
const ONE_MB_AS_BASE64 = "A".repeat(1_400_000);

async function wipe() {
  const current = await loadWorkspace(USER);
  await applyMutations(USER, [
    { table: "conversations", action: "delete", ids: current.conversations.map((c) => c.id) },
    { table: "files", action: "delete", ids: current.files.map((f) => f.id) },
  ]);
}

function weigh(label: string, workspace: unknown) {
  const bytes = Buffer.byteLength(JSON.stringify(workspace), "utf8");
  console.log(`  ${label}: ${(bytes / 1_000_000).toFixed(2)} MB`);
  return bytes;
}

async function main() {
  await wipe();

  const empty = await loadWorkspace(USER);
  const baseline = weigh("empty workspace", empty);

  const screenshots = 8;
  await applyMutations(USER, [
    {
      table: "files",
      action: "upsert",
      rows: Array.from({ length: screenshots }, (_, i) => ({
        id: `payload_file_${i}`,
        kind: "image" as const,
        mediaType: "image/png",
        name: `screenshot-${i}.png`,
        data: ONE_MB_AS_BASE64,
        width: 1920,
        height: 1080,
        size: 1_000_000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })),
    },
  ]);

  const loaded = await loadWorkspace(USER);
  const withFiles = weigh(`after ${screenshots} one-megabyte screenshots`, loaded);

  console.log(
    `\n  every page load carries ${((withFiles - baseline) / 1_000_000).toFixed(2)} MB it does not display`,
  );
  console.log(
    "  the Library shows thumbnails and names; the bytes are only needed when one is opened",
  );

  await wipe();
  const after = await loadWorkspace(USER);
  console.log(`\n  cleaned up: ${after.files.length} files left`);
  process.exit(0);
}

main().catch((error) => {
  console.error("payload check threw:", error);
  process.exit(1);
});
