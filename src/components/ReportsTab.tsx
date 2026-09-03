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
  transcript: string;
  status: string;
  createdAt: number;
}

const CATEGORY_LABEL: Record<string, string> = {
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
  if (rows === null) return null;

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
          description="Which is the normal answer. A pass over a quiet week finds nothing at all."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((row) => (
            <li key={row.id}>
              <Card className={cx(row.status !== "new" && "opacity-60")}>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Chip tone={row.severity === "high" ? "error" : "primary"}>
                    {CATEGORY_LABEL[row.category] ?? row.category}
                  </Chip>
                  <span className="md-label-sm text-on-variant/75">{row.severity}</span>
                  <span className="md-title truncate">{row.workspaceName}</span>
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
                {row.transcript ? (
                  <details className="mt-2 group">
                    <summary className="md-label-sm inline-flex items-center gap-1 text-primary">
                      What was said around it
                    </summary>
                    <pre
                      className={cx(
                        "md-label-sm mt-2 max-h-72 overflow-auto rounded-xl bg-lowest p-3",
                        "whitespace-pre-wrap [overflow-wrap:anywhere] text-on-variant",
                      )}
                    >
                      {row.transcript}
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
