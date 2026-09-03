"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Chip, EmptyState, ReportIcon, cx } from "./ui";
import { formatRelativeTime } from "@/lib/routes";

interface ReportRow {
  id: string;
  workspaceName: string;
  source: string;
  sourceId: string;
  authorEmail: string;
  category: string;
  severity: "low" | "medium" | "high";
  reason: string;
  quote: string;
  hasTranscript: boolean;
  status: string;
  createdAt: number;
}

/**
 * What a card looks like at a glance.
 *
 * A queue where every row looks the same is a queue read top to bottom, and the
 * one that needs somebody today is as likely to be at the bottom as the top. A
 * stripe down the edge rather than a whole tinted card: eight red panels in a
 * row is just a red screen, and the point is that the red one stands out from
 * the ones around it.
 *
 * Low is deliberately plain. Somebody being short with a colleague is worth
 * recording and is not worth a colour that makes a person's stomach drop.
 */
const SEVERITY: Record<string, { edge: string; label: string; chip: "error" | "primary" }> = {
  high: { edge: "border-l-4 border-l-error", label: "text-error", chip: "error" },
  medium: { edge: "border-l-4 border-l-warning", label: "text-warning", chip: "primary" },
  low: { edge: "border-l-4 border-l-outline-variant", label: "text-on-variant", chip: "primary" },
};

const SEVERITY_LABEL: Record<string, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

const CATEGORY_LABEL: Record<string, string> = {
  disrespect: "Disrespect",
  toxicity: "Toxicity",
  harassment: "Harassment",
  "sexual-harassment": "Sexual harassment",
  threat: "Threat",
  malware: "Malware",
  fraud: "Fraud",
  "self-harm": "Someone may be at risk",
};

/**
 * What the reviewer has raised, for a person to decide about.
 *
 * Nothing here acts on its own. Every row is a prompt to go and look, and the
 * two buttons record that somebody did, which is the point. An automated
 * judgement about a real person's conduct should never be the last word, and
 * this screen is built so it cannot be.
 */
export function ReportsTab() {
  const [rows, setRows] = useState<ReportRow[] | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [lastRunAt, setLastRunAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [showClosed, setShowClosed] = useState(false);

  /*
   * Fetched when somebody opens one, not shipped with the list.
   *
   * A transcript is up to four thousand characters and the list can hold two
   * hundred rows, so sending them all to render a page that shows none of them
   * was most of the payload for none of the value.
   */
  const [transcripts, setTranscripts] = useState<Record<string, string>>({});

  const loadTranscript = useCallback(
    async (id: string) => {
      if (transcripts[id] !== undefined) return;
      try {
        const response = await fetch(`/api/reports?transcript=${encodeURIComponent(id)}`);
        const body = (await response.json()) as { transcript?: string };
        setTranscripts((current) => ({ ...current, [id]: body.transcript ?? "" }));
      } catch {
        setTranscripts((current) => ({ ...current, [id]: "Could not load it." }));
      }
    },
    [transcripts],
  );

  /*
   * Whether this is the operator looking across businesses or an administrator
   * looking at their own. Worked out from the rows rather than passed in,
   * because the route already decides which rows the caller may see and a prop
   * would be a second place for the two to disagree.
   */
  const manyBusinesses = new Set((rows ?? []).map((row) => row.workspaceName)).size > 1;

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/reports");
      if (!response.ok) throw new Error(String(response.status));
      const body = await response.json();
      setRows(body.reports ?? []);
      setEnabled(Boolean(body.enabled));
      setLastRunAt(body.lastRunAt ?? null);
    } catch {
      setError("Could not read the reports.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setStatus = async (id: string, status: "new" | "reviewed" | "dismissed") => {
    setRows((current) =>
      current ? current.map((row) => (row.id === id ? { ...row, status } : row)) : current,
    );
    await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "status", id, status }),
    }).catch(() => {});
  };

  const run = async () => {
    setRunning(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run" }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        result?: { workspaces: number; reviewed: number; raised: number; failed?: string[] };
      } | null;
      if (!response.ok) {
        setError(body?.error ?? "That pass did not run.");
        return;
      }
      const result = body?.result;
      setNotice(
        result
          ? `Read ${result.reviewed} new message${result.reviewed === 1 ? "" : "s"} across ` +
            `${result.workspaces} business${result.workspaces === 1 ? "" : "es"}. ` +
            `${result.raised === 0 ? "Nothing raised." : `${result.raised} raised.`}` +
            (result.failed?.length
              ? ` Could not read: ${result.failed.join(", ")}.`
              : "")
          : null,
      );
      await load();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setRunning(false);
    }
  };

  if (error && rows === null) return <p className="md-label text-error">{error}</p>;

  /*
   * Something on screen while it loads.
   *
   * This rendered nothing at all until the fetch came back, which is why this
   * tab felt slower than the others: they draw from data the page already
   * fetched on mount, and this one waits for its own round trip with a blank
   * panel where the answer goes.
   */
  if (rows === null) {
    return (
      <ul className="flex flex-col gap-3" aria-hidden>
        {[0, 1, 2].map((n) => (
          <li key={n}>
            <Card className="border-l-4 border-l-outline-variant">
              <div className="h-4 w-40 animate-pulse rounded bg-high" />
              <div className="mt-3 h-3 w-full animate-pulse rounded bg-high" />
              <div className="mt-2 h-3 w-2/3 animate-pulse rounded bg-high" />
            </Card>
          </li>
        ))}
      </ul>
    );
  }

  const open = rows.filter((row) => row.status === "new");
  const visible = showClosed ? rows : open;

  return (
    <div className="measure flex flex-col gap-4">
      <Card>
        <div className="flex flex-wrap items-start gap-3">
          <ReportIcon className="mt-0.5 h-5 w-5 flex-none text-on-variant" />
          <div className="min-w-0 flex-1">
            <p className="md-title">Conduct review</p>
            <p className="md-body mt-1 text-on-variant">
              Reads internal messages for harassment, threats, fraud, malware, and
              anyone who may be at risk. It does not look at business secrets, client
              information, or figures, and it does not judge tone. It reads on a
              schedule and raises what it finds here; acting on any of it is a
              person&apos;s job, and every row is a prompt to go and look.
            </p>
            <p className="md-label-sm mt-2 text-on-variant/75">
              {enabled
                ? "Runs on its own once a day. "
                : "Off. This deployment has no database. "}
              {lastRunAt ? `Last pass ${formatRelativeTime(lastRunAt)}.` : "Not run yet."}
            </p>
          </div>
          <Button disabled={running || !enabled} onClick={() => void run()}>
            {running ? "Reading…" : "Run one now"}
          </Button>
        </div>
      </Card>

      {error ? <p className="md-label text-error">{error}</p> : null}
      {notice ? <p className="md-label text-primary">{notice}</p> : null}

      {rows.length > open.length ? (
        <div className="filter-row">
          <Chip selected={!showClosed} onClick={() => setShowClosed(false)}>
            Open · {open.length}
          </Chip>
          <Chip selected={showClosed} onClick={() => setShowClosed(true)}>
            Everything · {rows.length}
          </Chip>
        </div>
      ) : null}

      {visible.length === 0 ? (
        <EmptyState
          icon={<ReportIcon className="h-8 w-8" />}
          title="Nothing raised"
          description="Nothing raised in this period."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((row) => (
            <li key={row.id}>
              <Card
                className={cx(
                  (SEVERITY[row.severity] ?? SEVERITY.low).edge,
                  // A handled row keeps its stripe so the queue still reads at a
                  // glance, and loses everything else.
                  row.status !== "new" && "opacity-60",
                )}
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Chip tone={(SEVERITY[row.severity] ?? SEVERITY.low).chip}>
                    {CATEGORY_LABEL[row.category] ?? row.category}
                  </Chip>
                  <span
                    className={cx(
                      "md-label-sm",
                      (SEVERITY[row.severity] ?? SEVERITY.low).label,
                    )}
                  >
                    {SEVERITY_LABEL[row.severity] ?? row.severity}
                  </span>
                  {/* Only where there is more than one business to tell
                      apart. On an administrator's own screen every row is the
                      same name, which is a column of their own company name
                      repeated down the page. */}
                  {manyBusinesses ? (
                    <span className="md-title truncate">{row.workspaceName}</span>
                  ) : null}
                  <span className="md-label-sm text-on-variant/75">
                    {formatRelativeTime(row.createdAt)}
                  </span>
                </div>

                <p className="md-body">{row.reason}</p>

                {row.quote ? (
                  <blockquote
                    className={cx(
                      "mt-2 border-l-2 border-outline-variant pl-3",
                      "md-body italic text-on-variant [overflow-wrap:anywhere]",
                    )}
                  >
                    {row.quote}
                  </blockquote>
                ) : null}

                {/*
                  * Folded away rather than shown.
                  *
                  * The quote is what the reviewer thought was wrong and the
                  * transcript is what surrounded it. Open by default this
                  * screen becomes pages of other people's conversation to
                  * scroll past, and the point of opening it deliberately is
                  * that reading somebody's messages should be a thing you
                  * chose to do.
                  */}
                {row.hasTranscript ? (
                  <details
                    className="mt-2"
                    onToggle={(event) => {
                      if (event.currentTarget.open) void loadTranscript(row.id);
                    }}
                  >
                    <summary className="md-label-sm inline-flex items-center gap-1 text-primary">
                      Surrounding messages
                    </summary>
                    <pre
                      className={cx(
                        "md-label-sm mt-2 max-h-72 overflow-auto rounded-xl bg-lowest p-3",
                        "whitespace-pre-wrap [overflow-wrap:anywhere] text-on-variant",
                      )}
                    >
                      {transcripts[row.id] ?? "Loading…"}
                    </pre>
                  </details>
                ) : null}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="md-label-sm text-on-variant/75">
                    Written by {row.authorEmail}
                  </span>
                  {row.status === "new" ? (
                    <>
                      <Button
                        size="sm"
                        variant="text"
                        className="ml-auto"
                        onClick={() => void setStatus(row.id, "dismissed")}
                      >
                        Not a problem
                      </Button>
                      <Button size="sm" onClick={() => void setStatus(row.id, "reviewed")}>
                        Looked at it
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="text"
                      className="ml-auto"
                      onClick={() => void setStatus(row.id, "new")}
                    >
                      Reopen
                    </Button>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
