"use client";

/**
 * The browser's side of the telemetry.
 *
 * Deliberately small. Everything here runs inside somebody's working day, so
 * it reports four things, caps how often it will speak, and never retries: a
 * measurement worth a second request is not a measurement worth having.
 *
 * Nothing about the page is sent. Not the path, not the query string, not what
 * is on screen. An operation name from a fixed list, a duration, and for a
 * failure a scrubbed message. The server decides which business it belongs to
 * from the session, so nothing here needs to know or say.
 */

/**
 * A page in a failure loop can throw hundreds of times a minute. The first few
 * say everything the rest would, and the rest are how a monitoring system
 * becomes the outage.
 */
const MAX_PER_PAGE = 8;
let sent = 0;

/** The same error from the same line, over and over, is one fact. */
const seen = new Set<string>();

export type ClientOperation =
  | "client.load"
  | "client.error"
  | "client.write"
  | "client.load-failed";

export function report(entry: {
  operation: ClientOperation;
  ms?: number;
  ok?: boolean;
  errorKind?: string;
  errorNote?: string;
}): void {
  if (typeof window === "undefined") return;
  if (sent >= MAX_PER_PAGE) return;

  const fingerprint = `${entry.operation}|${entry.errorKind ?? ""}|${(entry.errorNote ?? "").slice(0, 80)}`;
  if (entry.ok === false && seen.has(fingerprint)) return;
  seen.add(fingerprint);
  sent += 1;

  try {
    void fetch("/api/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
      // Survives the page being closed, which is exactly when the interesting
      // failures happen.
      keepalive: true,
    }).catch(() => {
      // A telemetry post that fails is not worth telling anybody about, least
      // of all by posting again.
    });
  } catch {
    // Same.
  }
}

/**
 * How long the app took to be usable, from the moment navigation started.
 *
 * `loadEventEnd` is zero until the load event has actually fired, so this waits
 * for it rather than reporting a nonsense duration that would drag the average
 * down and look like an improvement.
 */
export function reportLoad(): void {
  if (typeof window === "undefined" || typeof performance === "undefined") return;

  const measure = () => {
    const [nav] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
    if (!nav || !nav.loadEventEnd) return;
    report({ operation: "client.load", ms: Math.round(nav.loadEventEnd), ok: true });
  };

  if (document.readyState === "complete") measure();
  else window.addEventListener("load", () => window.setTimeout(measure, 0), { once: true });
}

/**
 * Anything that reached the window uncaught.
 *
 * Both kinds: a thrown error and a rejected promise nobody handled. The second
 * is the one that matters in this app, because almost everything it does is a
 * fetch, and a rejected fetch that nobody caught is a feature that silently
 * did nothing.
 */
export function watchForErrors(): () => void {
  if (typeof window === "undefined") return () => {};

  const onError = (event: ErrorEvent) => {
    report({
      operation: "client.error",
      ok: false,
      errorKind: event.error instanceof Error ? event.error.name : "Error",
      errorNote: event.message,
    });
  };

  const onRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    report({
      operation: "client.error",
      ok: false,
      errorKind: reason instanceof Error ? reason.name : "UnhandledRejection",
      errorNote: reason instanceof Error ? reason.message : String(reason),
    });
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
