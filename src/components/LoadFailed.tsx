"use client";

import { Button, cx } from "./ui";
import { useStore } from "@/lib/store";

/**
 * The workspace could not be read, and here is the way back.
 *
 * Distinct from a write failing, which is what WriteError says: a rejected
 * change is one thing lost from a screen that still works, and this is the
 * screen never arriving at all.
 *
 * The version before this caught the failure and did nothing, on the honest
 * grounds that a loading state beats an empty workspace that is not really
 * empty. It was still the wrong end of the trade. One dropped request, a cold
 * start that timed out, a moment of database trouble, and the app sat blank for
 * the rest of the session with nothing to say and nothing to press. Somebody
 * who does not think to refresh concludes the product is broken, and they are
 * not being unreasonable.
 *
 * Covers the screen on purpose. There is nothing behind it to use.
 */
export function LoadFailed() {
  const { loadFailed, retryLoad } = useStore();
  if (!loadFailed) return null;

  return (
    <div
      role="alert"
      className={cx(
        "fixed inset-0 z-[60] grid place-items-center bg-surface/95 px-6",
        "backdrop-blur-sm",
      )}
    >
      <div className="measure-read text-center">
        <h1 className="md-title-lg mb-2">Could not load your workspace</h1>
        <p className="md-body mb-5 text-on-variant">
          Your work is safe. This is the connection between this browser and the
          server, and it usually clears on a second try.
        </p>
        <Button onClick={retryLoad}>Try again</Button>
      </div>
    </div>
  );
}
