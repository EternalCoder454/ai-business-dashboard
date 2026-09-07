"use client";

import { useEffect, useState } from "react";
import { Card } from "./ui";
import { formatBytes } from "@/lib/files";

interface Line {
  label: string;
  rows: number;
  bytes: number;
}

/**
 * How much room this business is using, and what is taking it.
 *
 * The card this replaces counted rows: eight departments, thirty four skills,
 * sixty two messages. Worth knowing, and not what anybody means by how much
 * space they are using, because a row is not a size. One conversation with a
 * pasted contract in it outweighs a thousand tasks.
 *
 * The numbers come from Postgres rather than from the workspace the browser is
 * holding, which carries no message bodies at all: the largest thing in most
 * workspaces would otherwise have been the one thing this could not see.
 */
export function StorageCard() {
  const [lines, setLines] = useState<Line[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/storage")
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { lines?: Line[] } | null) => {
        if (!cancelled) setLines(body?.lines ?? []);
      })
      .catch(() => {
        if (!cancelled) setLines([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Nothing worth a card: no permission to read it, or a workspace with nothing
  // in it yet. Both are better as an absence than as a row of zeroes.
  if (lines !== null && lines.every((line) => line.rows === 0)) return null;

  const total = (lines ?? []).reduce((sum, line) => sum + line.bytes, 0);
  const biggest = (lines ?? [])[0]?.bytes ?? 0;
  const used = (lines ?? []).filter((line) => line.rows > 0);

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3">
        {/*
          * Two true numbers that look like a contradiction.
          *
          * A backup reads 131 KB on its own card and 65 KB here, because that
          * card measures the document it wrote and this measures the row it
          * landed in, after Postgres has compressed the long text in it. Both
          * are worth knowing: the first is what you get if you export it, the
          * second is what the business is actually paying to keep. So each says
          * which it is rather than one of them being quietly corrected to
          * agree with the other.
          */}
        <h2 className="md-title-lg">Storage</h2>
        {lines ? (
          <span className="md-label-sm tabular-nums text-on-variant/75">
            {formatBytes(total)} in total, as stored
          </span>
        ) : null}
      </div>

      {lines === null ? (
        <p className="md-body text-on-variant">Reading…</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {used.map((line) => (
            <li key={line.label}>
              <div className="flex items-baseline gap-2">
                <span className="md-body min-w-0 flex-1 truncate">{line.label}</span>
                <span className="md-label-sm text-on-variant/75">
                  {line.rows.toLocaleString()}
                </span>
                <span className="md-label ml-2 tabular-nums">{formatBytes(line.bytes)}</span>
              </div>
              {/* Against the largest rather than the total, for the same reason
                  the spend bars are: what this answers is which one is big. */}
              <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-highest">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${biggest ? Math.max((line.bytes / biggest) * 100, 1) : 0}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
