/**
 * Changes waiting to be sent, in the order they were made.
 *
 * Written because the workspace sent every change the moment it was made, in
 * its own unawaited request, racing every other request in flight. That is fine
 * exactly as long as no two changes are close together, and two things made it
 * not fine:
 *
 * A field that saved on each keystroke sent a request per character. The
 * browser may deliver those in any order and the last to arrive wins, which is
 * not the last one typed, so the stored value could settle on a prefix of what
 * somebody entered while the screen showed the whole thing.
 *
 * And the failure path refetches the whole workspace to recover. A write that
 * failed while others were still in the air replaced them with a snapshot taken
 * before they landed, so work that had saved perfectly well disappeared from
 * the screen.
 *
 * One sender draining a shared queue fixes both, and batching what has piled up
 * while a request was in the air turns thirty requests into two.
 */

export interface WriteQueue<Op> {
  /** Queues one change and resolves once the send carrying it has finished. */
  push(op: Op): Promise<void>;
  /** How many changes are waiting. For tests and for deciding to warn on exit. */
  readonly waiting: number;
  /** Whether a request is in the air. */
  readonly busy: boolean;
}

export interface WriteQueueOptions<Op> {
  /** Sends one batch. Rejecting means the batch did not apply. */
  send(batch: Op[]): Promise<void>;
  /**
   * Called once when a batch fails, after the rest of the queue is dropped.
   *
   * Dropping is deliberate. Each queued change was made against the screen as
   * it looked before this one failed, so sending them would write later edits
   * on top of a state the database never accepted.
   */
  onFailure(error: unknown): Promise<void> | void;
  /** Called after a batch lands, so a screen can clear a stale error. */
  onSuccess?(): void;
  /**
   * How many changes travel in one request. The endpoint refuses more than two
   * hundred, since each becomes its own branch of a single transaction, so the
   * default leaves room to be wrong about the limit.
   */
  batchSize?: number;
}

export function createWriteQueue<Op>(options: WriteQueueOptions<Op>): WriteQueue<Op> {
  const batchSize = options.batchSize ?? 100;
  const pending: Op[] = [];
  let sending: Promise<void> | null = null;

  function drain(): Promise<void> {
    if (sending) return sending;

    const run = (async () => {
      /*
       * Nothing in the body runs before `sending` is assigned below. Without
       * this a queue that was somehow already empty would finish the whole
       * function synchronously, and the assignment would then park a settled
       * promise there that no later change could ever clear.
       */
      await Promise.resolve();
      try {
        /*
         * Rechecked each time rather than taking a copy up front, so a change
         * made while a request was in the air joins the next batch instead of
         * starting a second sender that races the first.
         */
        while (pending.length) {
          const batch = pending.splice(0, batchSize);
          try {
            await options.send(batch);
            options.onSuccess?.();
          } catch (error) {
            pending.length = 0;
            await options.onFailure(error);
            return;
          }
        }
      } finally {
        /*
         * Cleared here rather than in a .finally() on the promise, which runs a
         * microtask later. In that gap a change could queue, see a sender still
         * apparently running, and wait on one that had already stopped looking
         * at the queue, so it would sit there until something else was written.
         */
        sending = null;
      }
    })();

    sending = run;
    return run;
  }

  return {
    push(op: Op): Promise<void> {
      pending.push(op);
      return drain();
    },
    get waiting(): number {
      return pending.length;
    },
    get busy(): boolean {
      return sending !== null;
    },
  };
}
