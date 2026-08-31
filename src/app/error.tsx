"use client";

import { useEffect } from "react";

/**
 * Segment-level boundary. Anything thrown while rendering a page lands here
 * instead of blanking the app, and reset() retries without a full reload.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[render]", error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center p-8 text-center">
      <div className="max-w-md">
        <p className="md-label-sm text-error">Something broke</p>
        <h1 className="md-headline mt-1">This page failed to render</h1>
        <p className="md-body mt-2 text-on-variant">
          Your conversations and skills are stored locally and are unaffected.
        </p>
        {error.message ? (
          <pre className="md-label mt-4 overflow-x-auto rounded-xl bg-low px-3 py-2 text-left font-mono text-on-variant">
            {error.message}
          </pre>
        ) : null}
        <button
          onClick={reset}
          className="md-state md-label mt-6 rounded-full bg-primary px-5 py-2.5 text-on-primary"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
