"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Chip, EmptyState, SparkIcon, cx, Dialog} from "./ui";
import { formatExactTime } from "@/lib/routes";

interface FeedbackFile {
  id: string;
  name: string;
  mediaType: string;
  size: number;
}

interface FeedbackRow {
  files?: FeedbackFile[];
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
  const [viewing, setViewing] = useState<FeedbackFile | null>(null);

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

  /*
   * Gone rather than filed away. Marking a note done is for one that was acted
   * on; a duplicate or a test line is noise, and leaving it behind the
   * "Everything" chip means it is there the next time anybody looks.
   */
  const remove = async (id: string) => {
    const before = rows;
    setRows((current) => (current ? current.filter((row) => row.id !== id) : current));
    const response = await fetch("/api/feedback", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => null);
    if (!response?.ok) {
      setRows(before);
      setError("Could not delete that.");
    }
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
        description="Sent from the account menu."
      />
    );
  }

  return (
    <div className="measure-full flex flex-col gap-4">
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
                  {formatExactTime(row.createdAt)}
                </span>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="text"
                    className="text-error"
                    onClick={() => void remove(row.id)}
                  >
                    Delete
                  </Button>
                  <Button
                    size="sm"
                    variant="text"
                    onClick={() => void setStatus(row.id, row.status === "done" ? "new" : "done")}
                  >
                    {row.status === "done" ? "Reopen" : "Mark done"}
                  </Button>
                </div>
              </div>

              {/* Kept as typed: line breaks are how somebody separates two
                  thoughts, and flattening them loses the second one. */}
              <p className="md-body whitespace-pre-wrap [overflow-wrap:anywhere]">{row.body}</p>

              {/*
                * What they attached, played and shown here rather than
                * downloaded and opened somewhere else.
                *
                * Native img and video and nothing more. A player library would
                * be several times the weight of this whole screen to gain
                * controls the browser already draws, and these are short clips
                * on an internal page rather than a media product.
                *
                * Pictures open larger on click, because a screenshot of a
                * screen shrunk into a card is a screenshot of nothing.
                */}
              {row.files?.length ? (
                <ul className="mt-3 grid grid-cols-2 gap-2 medium:grid-cols-3">
                  {row.files.map((file) => (
                    <li key={file.id}>
                      {file.mediaType.startsWith("video/") ? (
                        <video
                          controls
                          preload="metadata"
                          className="w-full rounded-xl bg-highest"
                          src={`/api/feedback/file/${file.id}`}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setViewing(file)}
                          aria-label={`Open ${file.name || "the picture"}`}
                          className="md-state block w-full overflow-hidden rounded-xl bg-highest"
                        >
                          <img
                            src={`/api/feedback/file/${file.id}`}
                            alt={file.name}
                            loading="lazy"
                            className="h-28 w-full object-cover"
                          />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : null}


              <p className="md-label-sm mt-2 text-on-variant/75">{row.email}</p>
            </Card>
          </li>
        ))}
      </ul>
      {/* One picture, as large as the window allows. Nothing about this is a
          gallery: there is a next and a previous only if somebody asks for
          them, and so far nobody has needed one. */}
      <Dialog
        open={Boolean(viewing)}
        title={viewing?.name || "Attachment"}
        onClose={() => setViewing(null)}
        width="max-w-4xl"
      >
        {viewing ? (
          <img
            src={`/api/feedback/file/${viewing.id}`}
            alt={viewing.name}
            className="max-h-[70vh] w-full rounded-xl object-contain"
          />
        ) : null}
      </Dialog>

    </div>
  );
}
