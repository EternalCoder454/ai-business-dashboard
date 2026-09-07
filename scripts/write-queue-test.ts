/**
 * That changes reach the server in the order they were made, and once each.
 *
 * The workspace used to send every change immediately in its own unawaited
 * request. Two bugs came out of that and both are the kind you cannot see: a
 * field saving per keystroke could store a prefix of what was typed, because
 * the browser delivers concurrent requests in whatever order it likes and the
 * last to arrive wins. And a failure refetches the whole workspace to recover,
 * which quietly replaced writes that were still in the air with a snapshot from
 * before they landed.
 *
 * Neither shows up in a type, and neither is reliably reproducible by hand,
 * which is exactly why the ordering is asserted here instead.
 *
 *   npm run write-queue-test
 */
import { createWriteQueue } from "../src/lib/writeQueue";

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures += 1;
}

/** Resolves after the event loop has turned over, so pending sends can finish. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

void (async () => {
  console.log("\nchanges arrive in the order they were made");
  {
    const sent: number[][] = [];
    const queue = createWriteQueue<number>({
      send: async (batch) => {
        await settle();
        sent.push([...batch]);
      },
      onFailure: () => {},
    });

    // Fired together and unawaited, which is how the screens actually write.
    const all = [1, 2, 3, 4, 5].map((n) => queue.push(n));
    await Promise.all(all);

    check("every change was sent", sent.flat().length === 5, JSON.stringify(sent));
    check(
      "in the order they were queued",
      JSON.stringify(sent.flat()) === JSON.stringify([1, 2, 3, 4, 5]),
      JSON.stringify(sent.flat()),
    );
    check("and none was sent twice", new Set(sent.flat()).size === 5);
    /*
     * All five in one request, which is stronger than merely being ordered.
     *
     * The sender defers its first look at the queue by a microtask, so anything
     * written in the same tick is already waiting by the time it reads. Five
     * changes made together therefore cost one round trip rather than five, and
     * a field that saves per keystroke sends what was typed, once.
     */
    check("as one request, not five", sent.length === 1, `${sent.length} requests`);
  }

  console.log("\nonly one request is ever in the air");
  {
    let open = 0;
    let peak = 0;
    const queue = createWriteQueue<number>({
      send: async () => {
        open += 1;
        peak = Math.max(peak, open);
        await settle();
        open -= 1;
      },
      onFailure: () => {},
    });
    await Promise.all(Array.from({ length: 20 }, (_, i) => queue.push(i)));
    check("never two at once", peak === 1, `peak ${peak}`);
  }

  console.log("\na batch is capped so one request cannot grow without limit");
  {
    const sizes: number[] = [];
    const queue = createWriteQueue<number>({
      batchSize: 4,
      send: async (batch) => {
        await settle();
        sizes.push(batch.length);
      },
      onFailure: () => {},
    });
    await Promise.all(Array.from({ length: 10 }, (_, i) => queue.push(i)));
    check("no batch exceeded the cap", sizes.every((n) => n <= 4), JSON.stringify(sizes));
    check("and everything still went", sizes.reduce((a, b) => a + b, 0) === 10);
  }

  console.log("\na failure stops the queue rather than writing on top of it");
  {
    const sent: number[] = [];
    let failed = 0;
    const queue = createWriteQueue<number>({
      batchSize: 1,
      send: async (batch) => {
        await settle();
        if (batch[0] === 2) throw new Error("refused");
        sent.push(...batch);
      },
      onFailure: () => {
        failed += 1;
      },
    });
    await Promise.all([1, 2, 3, 4].map((n) => queue.push(n)));

    check("the changes before the failure were sent", JSON.stringify(sent) === "[1]", JSON.stringify(sent));
    /*
     * Three and four are dropped on purpose. Each was made against the screen
     * as it looked before two failed, so sending them would write later edits
     * on top of a state the database never accepted. The refetch that follows
     * is the truth, and it is only safe to trust because nothing is in flight.
     */
    check("the ones queued behind it were dropped", !sent.includes(3) && !sent.includes(4));
    check("the failure was reported once", failed === 1, `${failed} times`);
    check("and nothing is left waiting", queue.waiting === 0, `${queue.waiting} waiting`);
  }

  console.log("\nthe queue starts again after it has emptied");
  {
    /*
     * The bug this guards against is a one microtask gap. Clearing the sender
     * in a .finally() on the promise rather than inside it leaves a window
     * where a new change sees a send still apparently running, waits on one
     * that has already stopped reading the queue, and sits there unsent until
     * something else happens to be written.
     */
    const sent: number[] = [];
    const queue = createWriteQueue<number>({
      send: async (batch) => {
        await settle();
        sent.push(...batch);
      },
      onFailure: () => {},
    });

    await queue.push(1);
    check("the first change went", JSON.stringify(sent) === "[1]", JSON.stringify(sent));
    check("and the sender is idle again", !queue.busy);

    await queue.push(2);
    check("a change after the queue emptied also went", sent.includes(2), JSON.stringify(sent));

    // The same again with no await between, which is the shape that broke.
    const a = queue.push(3);
    const b = queue.push(4);
    await Promise.all([a, b]);
    check(
      "and so do two queued back to back",
      sent.includes(3) && sent.includes(4),
      JSON.stringify(sent),
    );
  }

  console.log("\npush resolves only once the change has actually been sent");
  {
    const sent: number[] = [];
    const queue = createWriteQueue<number>({
      send: async (batch) => {
        await settle();
        sent.push(...batch);
      },
      onFailure: () => {},
    });
    await queue.push(7);
    check("awaiting a push means it landed", sent.includes(7));
  }

  console.log(failures === 0 ? "\nall checks passed" : `\n${failures} FAILURES ABOVE`);
  process.exit(failures === 0 ? 0 : 1);
})();
