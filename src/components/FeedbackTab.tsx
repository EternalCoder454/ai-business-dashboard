"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Chip, EmptyState, SparkIcon, cx } from "./ui";
import { formatRelativeTime } from "@/lib/routes";

interface FeedbackRow {
  id: string;
  workspaceName: string;
  email: string;
  displayName: string;
  body: string;
  status: string;
  createdAt: number;
}

/**
 * What people have said about the panel.
 *
 * Every note carries who wrote it, from which business, and when, because the
 * server put those there rather than asking. Marking one done is the only
 * change an operator makes: this is a record of what was said, not a ticket
 * system, and anything that needs one belongs in the tasks board.
 */
export function FeedbackTab() {
  const [rows, setRows] = useState<FeedbackRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/feedback");
      if (!response.ok) throw new Error(String(response.status));
      const body = await response.json();
      setRows(body.feedback ?? []);
    } catch {
      setError("Could not read the feedback.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setStatus = async (id: string, status: "new" | "done") => {
    setRows((current) =>
      current ? current.map((row) => (row.id === id ? { ...row, status } : row)) : current,
    );
    await fetch("/api/feedback", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    }).catch(() => {});
  };

  if (error) return <p className="md-label text-error">{error}</p>;
  if (rows === null) return null;

  const visible = showDone ? rows : rows.filter((row) => row.status !== "done");
  const done = rows.filter((row) => row.status === "done").length;

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<SparkIcon className="h-8 w-8" />}
        title="Nothing yet"
        description="Anyone using the panel can send a note from their account menu."
      />
    );
  }

  return (
    <div className="measure flex flex-col gap-4">
      {done > 0 ? (
        <div className="filter-row">
          <Chip selected={!showDone} onClick={() => setShowDone(false)}>
            Open · {rows.length - done}
          </Chip>
          <Chip selected={showDone} onClick={() => setShowDone(true)}>
            Everything · {rows.length}
          </Chip>
        </div>
      ) : null}

      <ul className="flex flex-col gap-3">
        {visible.map((row) => (
          <li key={row.id}>
            <Card className={cx(row.status === "done" && "opacity-60")}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="md-title">{row.displayName || row.email}</span>
                <Chip tone="primary">{row.workspaceName || "No business"}</Chip>
                <span className="md-label-sm text-on-variant/75">
                  {formatRelativeTime(row.createdAt)}
                </span>
                <Button
                  size="sm"
                  variant="text"
                  className="ml-auto"
                  onClick={() => void setStatus(row.id, row.status === "done" ? "new" : "done")}
                >
                  {row.status === "done" ? "Reopen" : "Mark done"}
                </Button>
              </div>

              {/* Kept as typed: line breaks are how somebody separates two
                  thoughts, and flattening them loses the second one. */}
              <p className="md-body whitespace-pre-wrap [overflow-wrap:anywhere]">{row.body}</p>

              <p className="md-label-sm mt-2 text-on-variant/75">{row.email}</p>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
