"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, Chip, cx } from "./ui";
import { formatExactTime } from "@/lib/routes";
import { useNow } from "@/lib/useNow";

interface Row {
  id: string;
  name: string;
  createdAt: number;
  seats: number;
  activePeople: number;
  conversations: number;
  messages: number;
  recentMessages: number;
  deliverables: number;
  briefings: number;
  lastActivityAt: number | null;
}

const WINDOWS = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
];

const compact = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
      ? `${(n / 1_000).toFixed(1)}k`
      : String(n);

const DAY = 86_400_000;

/**
 * Which businesses are alive, and which have gone quiet.
 *
 * Not the same question as the Overview, which counts everything on the
 * deployment and says how big it is. This one is per business and over time,
 * and the row worth finding is the one that has stopped moving.
 *
 * Sorted by silence rather than by size, because a large customer who has not
 * opened it in three weeks is the thing you would want to have noticed, and
 * sorting by message count buries exactly that row at the bottom.
 */
export function UsageTab() {
  const [days, setDays] = useState(30);
  const now = useNow();

  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (window: number) => {
    try {
      const response = await fetch(`/api/usage?days=${window}`);
      if (!response.ok) throw new Error(String(response.status));
      const body = (await response.json()) as { rows?: Row[] };
      setRows(body.rows ?? []);
      setError(null);
    } catch {
      setError("Could not read usage.");
    }
  }, []);

  useEffect(() => {
    void load(days);
  }, [load, days]);

  const sorted = useMemo(() => {
    // Quiet first: never used, then longest since anybody said anything.
    return [...(rows ?? [])].sort((a, b) => (a.lastActivityAt ?? 0) - (b.lastActivityAt ?? 0));
  }, [rows]);

  const totals = useMemo(() => {
    const list = rows ?? [];
    const cutoff = now - days * DAY;
    return {
      businesses: list.length,
      active: list.filter((r) => (r.lastActivityAt ?? 0) >= cutoff).length,
      quiet: list.filter((r) => (r.lastActivityAt ?? 0) < cutoff).length,
      seats: list.reduce((n, r) => n + r.seats, 0),
      people: list.reduce((n, r) => n + r.activePeople, 0),
    };
  }, [rows, days, now]);

  if (error) return <p className="md-body text-error">{error}</p>;
  if (!rows) return null;

  const cutoff = now - days * DAY;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {WINDOWS.map((window) => (
          <Chip key={window.days} selected={days === window.days} onClick={() => setDays(window.days)}>
            {window.label}
          </Chip>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {/*
          * Gone quiet is not here any more. It is the same fact as Active read
          * backwards, out of the same pair of numbers, and the Overview already
          * carries it as an alert, which is where a business worth chasing
          * belongs. A tile that only ever restates the tile beside it is a tile
          * to remove.
          */}
        <Figure label="Businesses" value={String(totals.businesses)} />
        <Figure label="Active" value={String(totals.active)} />
        <Figure label="People signed in" value={`${totals.people} of ${totals.seats}`} />
      </div>

      <Card>
        {/* Fits the card rather than scrolling sideways inside it, for the
            reason the Health table gives: a column that sizes to its content
            is a column one long string away from a horizontal scrollbar. */}
        <div>
          <table className="w-full table-fixed border-collapse">
            <thead>
              <tr className="border-b border-outline-variant text-left">
                <Th>Business</Th>
                <Th align="right" width="w-14">Seats</Th>
                <Th align="right" width="w-20">Signed in</Th>
                <Th align="right" width="w-20">Messages</Th>
                <Th align="right" width="w-24">Conversations</Th>
                <Th align="right" width="w-24">Deliverables</Th>
                <Th align="right" width="w-20">Briefings</Th>
                <Th align="right" width="w-28">Last active</Th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => {
                const quiet = (row.lastActivityAt ?? 0) < cutoff;
                return (
                  <tr key={row.id} className="border-b border-outline-variant/40 last:border-0">
                    <Td>
                      <span className="md-body">{row.name}</span>
                      <span className="md-label-sm mt-0.5 block text-on-variant/70">
                        Since {new Date(row.createdAt).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </Td>
                    <Td align="right">{row.seats}</Td>
                    <Td align="right">{row.activePeople}</Td>
                    <Td align="right">
                      {compact(row.messages)}
                      {row.recentMessages > 0 ? (
                        <span className="md-label-sm block text-on-variant/70">
                          {compact(row.recentMessages)} recent
                        </span>
                      ) : null}
                    </Td>
                    <Td align="right">{compact(row.conversations)}</Td>
                    <Td align="right">{compact(row.deliverables)}</Td>
                    <Td align="right">{compact(row.briefings)}</Td>
                    <Td align="right" tone={quiet ? "bad" : undefined}>
                      {row.lastActivityAt ? formatExactTime(row.lastActivityAt) : "Never"}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: "bad" }) {
  return (
    <Card>
      <p className="md-label-sm text-on-variant">{label}</p>
      <p className={cx("md-title-lg mt-1", tone === "bad" && "text-error")}>{value}</p>
    </Card>
  );
}

function Th({
  children,
  align,
  width,
}: {
  children: React.ReactNode;
  align?: "right";
  /** Fixed columns need one, or the browser divides the width evenly. */
  width?: string;
}) {
  return (
    <th
      className={cx(
        "md-label-sm whitespace-nowrap px-3 pb-2 font-normal text-on-variant first:pl-0 last:pr-0",
        align === "right" ? "text-right" : "text-left",
        width,
      )}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
  tone,
}: {
  children: React.ReactNode;
  align?: "right";
  tone?: "bad";
}) {
  return (
    <td
      className={cx(
        // min-w-0 so a fixed column may actually clip what is in it.
        "md-body min-w-0 px-3 py-2 align-top first:pl-0 last:pr-0",
        align === "right" ? "whitespace-nowrap text-right tabular-nums" : "min-w-0",
        tone === "bad" && "text-error",
      )}
    >
      {children}
    </td>
  );
}
