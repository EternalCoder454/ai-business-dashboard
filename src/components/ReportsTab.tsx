"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Card,
  Chip,
  CloseIcon,
  EmptyState,
  LinkIcon,
  ReportIcon,
  TextInput,
  cx,
} from "./ui";
import { formatRelativeTime } from "@/lib/routes";
import { labelFor } from "@/lib/conduct";
import { useStore } from "@/lib/store";

interface AllowedLink {
  domain: string;
  addedBy: string;
  createdAt: number;
}

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


/**
 * What the reviewer has raised, for a person to decide about.
 *
 * Nothing here acts on its own. Every row is a prompt to go and look, and the
 * two buttons record that somebody did, which is the point. An automated
 * judgement about a real person's conduct should never be the last word, and
 * this screen is built so it cannot be.
 *
 * The same screen twice, and `scope` is which one. On the operator panel it is
 * every business; under a business's own people it is that business, including
 * when the person reading it happens to be the operator. Without that an
 * operator opening their own panel got the whole deployment's reports under
 * their own company name, and a pass run from there read every customer.
 */
export function ReportsTab({
  scope = "deployment",
}: {
  scope?: "deployment" | "workspace";
}) {
  const { isOperator } = useStore();
  const mineOnly = scope === "workspace";
  const [rows, setRows] = useState<ReportRow[] | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [lastRunAt, setLastRunAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [showClosed, setShowClosed] = useState(false);

  /*
   * Fetched when somebody opens one, not shipped with the list: four thousand
   * characters across two hundred rows is most of the payload to render a page
   * that shows none of it.
   */
  const [transcripts, setTranscripts] = useState<Record<string, string>>({});

  /** The link hosts this business allows. Empty on the operator's own screen. */
  const [links, setLinks] = useState<AllowedLink[]>([]);
  const [domain, setDomain] = useState("");

  const loadTranscript = useCallback(
    async (id: string) => {
      if (transcripts[id] !== undefined) return;
      try {
        const response = await fetch(
          `/api/reports?transcript=${encodeURIComponent(id)}${mineOnly ? "&scope=workspace" : ""}`,
        );
        const body = (await response.json()) as { transcript?: string };
        setTranscripts((current) => ({ ...current, [id]: body.transcript ?? "" }));
      } catch {
        setTranscripts((current) => ({ ...current, [id]: "Could not load it." }));
      }
    },
    [transcripts, mineOnly],
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
      const response = await fetch(mineOnly ? "/api/reports?scope=workspace" : "/api/reports");
      if (!response.ok) throw new Error(String(response.status));
      const body = await response.json();
      setRows(body.reports ?? []);
      setLinks(body.links ?? []);
      setEnabled(Boolean(body.enabled));
      setLastRunAt(body.lastRunAt ?? null);
    } catch {
      setError("Could not read the reports.");
    }
  }, [mineOnly]);

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
      body: JSON.stringify({ action: "status", id, status, scope }),
    }).catch(() => {});
  };

  /*
   * The operator's alone. Dismissing keeps the row, which is what an
   * administrator does; this removes it, for the duplicates and false alarms
   * that would otherwise sit at the top of the list forever. The row leaves
   * the screen before the request answers and comes back if it fails.
   */
  const remove = async (id: string) => {
    const before = rows;
    setRows((current) => (current ? current.filter((row) => row.id !== id) : current));
    const response = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id, scope }),
    }).catch(() => null);
    if (!response?.ok) {
      setRows(before);
      setError("Could not delete that.");
    }
  };

  /*
   * Adding a domain and taking one away, which both answer with the whole list
   * rather than the one row that changed. It is a handful of entries, and the
   * alternative is two places deciding what the list now looks like.
   */
  const changeLink = async (action: "allow-link" | "disallow-link", value: string) => {
    setError(null);
    const response = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, domain: value, scope }),
    }).catch(() => null);

    const body = (await response?.json().catch(() => null)) as {
      links?: AllowedLink[];
      error?: string;
    } | null;

    if (!response?.ok) {
      setError(body?.error ?? "Could not change the allowed links.");
      return;
    }
    setLinks(body?.links ?? []);
    setDomain("");
  };

  const run = async () => {
    setRunning(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run", scope }),
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
   * Something on screen while it loads. Every other tab draws from data the
   * page already has; this one waits on its own round trip, and a blank panel
   * reads as slower than it is.
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
            {/* One line rather than the paragraph that was here. It filled a
                phone screen before a single report was visible, and everything
                it said beyond the scope of the pass was already obvious from
                the rows underneath it. */}
            <p className="md-body mt-1 text-on-variant">
              Harassment, threats, fraud, malware, and anyone at risk. Not client
              information, business secrets, or figures.
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

      {/*
        * Only on a business's own panel. The list belongs to one workspace and
        * the operator's screen spans every one of them, so there is no single
        * list to show there.
        */}
      {mineOnly ? (
        <Card>
          <div className="flex flex-wrap items-start gap-3">
            <LinkIcon className="mt-0.5 h-5 w-5 flex-none text-on-variant" />
            <div className="min-w-0 flex-1">
              <p className="md-title">Allowed links</p>
              <p className="md-body mt-1 text-on-variant">
                A link in a message is removed unless its address is here. An
                address covers its own subdomains.
              </p>

              <form
                className="mt-3 flex flex-wrap items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (domain.trim()) void changeLink("allow-link", domain);
                }}
              >
                <TextInput
                  value={domain}
                  onChange={(event) => setDomain(event.target.value)}
                  placeholder="example.com"
                  aria-label="Address to allow"
                  className="w-full medium:w-64"
                />
                <Button type="submit" size="sm" disabled={!domain.trim()}>
                  Allow
                </Button>
              </form>

              {links.length > 0 ? (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {links.map((entry) => (
                    <li key={entry.domain}>
                      <span className="inline-flex items-center gap-1 rounded-lg border border-outline-variant px-2.5 py-1">
                        <span className="md-label">{entry.domain}</span>
                        <button
                          onClick={() => void changeLink("disallow-link", entry.domain)}
                          aria-label={`Stop allowing ${entry.domain}`}
                          className="md-state grid h-5 w-5 place-items-center rounded-full text-on-variant"
                        >
                          <CloseIcon className="h-3 w-3" />
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="md-label-sm mt-3 text-on-variant/75">
                  Nothing allowed yet, so every link is removed.
                </p>
              )}
            </div>
          </div>
        </Card>
      ) : null}

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
                    {labelFor(row.category)}
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
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    {/* The one report somebody can act on from here: the quote
                        is the host, so allowing it is one press. */}
                    {mineOnly && row.category === "suspicious-link"
                      ? row.quote
                          .split(/\s+/)
                          .filter(Boolean)
                          .map((host) => (
                            <Button
                              key={host}
                              size="sm"
                              variant="outlined"
                              onClick={() => void changeLink("allow-link", host)}
                            >
                              Allow {host}
                            </Button>
                          ))
                      : null}
                    {isOperator ? (
                      <Button
                        size="sm"
                        variant="text"
                        className="text-error"
                        onClick={() => void remove(row.id)}
                      >
                        Delete
                      </Button>
                    ) : null}
                    {row.status === "new" ? (
                      <>
                        <Button
                          size="sm"
                          variant="text"
                          onClick={() => void setStatus(row.id, "dismissed")}
                        >
                          Dismiss
                        </Button>
                        <Button size="sm" onClick={() => void setStatus(row.id, "reviewed")}>
                          Reviewed
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="text"
                        onClick={() => void setStatus(row.id, "new")}
                      >
                        Reopen
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
