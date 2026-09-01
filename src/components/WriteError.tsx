"use client";

import { CloseIcon, cx } from "./ui";
import { createRipple } from "./ui/ripple";
import { useStore } from "@/lib/store";

/**
 * What the server said when it refused a change.
 *
 * A hosted write is optimistic, so a rejected one appears and then vanishes
 * when the snapshot is refetched. That looked exactly like the app forgetting
 * things at random, and it is how three broken tables went unnoticed: the API
 * was rejecting memory, tasks, and wiki pages with a 400 and nothing said so.
 *
 * A bar rather than a dialog, because the change is already lost by the time
 * this appears and there is nothing to decide. In normal flow above the bottom
 * navigation, not fixed to the viewport, where it landed on top of it.
 */
export function WriteError() {
  const { writeError, dismissWriteError } = useStore();
  if (!writeError) return null;

  return (
    <div
      role="alert"
      className="safe-x flex flex-none justify-center px-4 pb-3 pt-1"
    >
      <div
        className={cx(
          "flex w-full max-w-md items-start gap-3 rounded-xl",
          "bg-error-container px-4 py-3 text-on-error-container shadow-e3",
        )}
      >
        <span className="md-body flex-1">
          Not saved. {writeError}
        </span>
        <button
          onClick={(event) => {
            createRipple(event);
            dismissWriteError();
          }}
          aria-label="Dismiss"
          className="md-state md-target -my-1 grid flex-none place-items-center rounded-full"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
