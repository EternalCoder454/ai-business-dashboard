"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, Chip, EmptyState, ReportIcon, cx } from "./ui";
import { formatRelativeTime } from "@/lib/routes";

interface Row {
  workspaceId: string;
  workspaceName: string;
  operation: string;
  source: string;
  calls: number;
  errors: number;
  totalMs: number;
  maxMs: number;
  slow: number;
  lastErrorKind: string | null;
  lastErrorNote: string | null;
  lastErrorAt: number | null;
}

interface Hour {
  bucket: number;
  calls: number;
  errors: number;
  totalMs: number;
  slow: number;
}

const WINDOWS: { label: string; hours: number }[] = [
  { label: "24 hours", hours: 24 },
  { label: "7 days", hours: 24 * 7 },
  { label: "14 days", hours: 24 * 14 },
];

const compact = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
      ? `${(n / 1_000).toFixed(1)}k`
      : String(n);

const ms = (n: number) => (n >= 1_000 ? `${(n / 1_000).toFixed(1)}s` : `${Math.round(n)}ms`);

/**
 * How the deployment has been behaving, by business.
 *
 * Sorted by errors and then by how slow things were, rather than by name or by
 * volume. The reason anybody opens this screen is that something is wrong, and
 * a list in alphabetical order is a list you have to read all of.
 */
export function TelemetryTab() {
  const [hours, setHours] = useState(24);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [byHour, setByHour] = useState<Hour[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (window: number) => {
    try {
      const response = await fetch(`/api/telemetry?hours=${window}`);
      if (!response.ok) throw new Error(String(response.status));
      const body = (await response.json()) as { rows?: Row[]; byHour?: Hour[] };
      setRows(body.rows ?? []);
      setByHour(body.byHour ?? []);
      setError(null);
    } catch {
      setError("Could not read the telemetry.");
    }
  }, []);

  useEffect(() => {
    void load(hours);
  }, [load, hours]);

  const totals = useMemo(() => {
    const seed = { calls: 0, errors: 0, totalMs: 0, slow: 0 };
    return (rows ?? []).reduce(
      (sum, row) => ({
        calls: sum.calls + row.calls,
        errors: sum.errors + row.errors,
        totalMs: sum.totalMs + row.totalMs,
        slow: sum.slow + row.slow,
      }),
      seed,
    );
  }, [rows]);

  /** Grouped by business, worst first. */
  const businesses = useMemo(() => {
    const byWorkspace = new Map<string, { name: string; rows: Row[] }>();
    for (const row of rows ?? []) {
      const found = byWorkspace.get(row.workspaceId) ?? { name: row.workspaceName, rows: [] };
      found.rows.push(row);
      byWorkspace.set(row.workspaceId, found);
    }
    return [...byWorkspace.entries()]
      .map(([id, group]) => {
        const calls = group.rows.reduce((n, r) => n + r.calls, 0);
        const errors = group.rows.reduce((n, r) => n + r.errors, 0);
        const slow = group.rows.reduce((n, r) => n + r.slow, 0);
        const totalMs = group.rows.reduce((n, r) => n + r.totalMs, 0);
        return {
          id,
          name: group.name,
          calls,
          errors,
          slow,
          average: calls > 0 ? totalMs / calls : 0,
          rows: [...group.rows].sort((a, b) => b.errors - a.errors || b.calls - a.calls),
        };
      })
      .sort((a, b) => b.errors - a.errors || b.slow - a.slow || b.calls - a.calls);
  }, [rows]);

  const peak = Math.max(1, ...byHour.map((h) => h.calls));

  if (error) {
    return <p className="md-body text-error">{error}</p>;
  }

  if (rows && rows.length === 0) {
    return (
      <EmptyState
        icon={<ReportIcon className="h-6 w-6" />}
        title="Nothing recorded yet"
        description="Numbers appear here once the panel has been used."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {WINDOWS.map((window) => (
          <Chip
            key={window.hours}
            selected={hours === window.hours}
            onClick={() => setHours(window.hours)}
          >
            {window.label}
          </Chip>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 medium:grid-cols-4">
        <Figure label="Calls" value={compact(totals.calls)} />
        <Figure
          label="Errors"
          value={compact(totals.errors)}
          tone={totals.errors > 0 ? "bad" : undefined}
        />
        <Figure
          label="Error rate"
          value={`${totals.calls > 0 ? ((totals.errors / totals.calls) * 100).toFixed(2) : "0.00"}%`}
          tone={totals.calls > 0 && totals.errors / totals.calls > 0.01 ? "bad" : undefined}
        />
        <Figure
          label="Average"
          value={totals.calls > 0 ? ms(totals.totalMs / totals.calls) : "0ms"}
        />
      </div>

      {byHour.length > 1 ? (
        <Card>
          <h3 className="md-title mb-3">By hour</h3>
          <div className="flex h-24 items-end gap-0.5 overflow-x-auto">
            {byHour.map((hour) => (
              <div
                key={hour.bucket}
                title={`${hour.calls} calls, ${hour.errors} errors`}
                className="flex min-w-1 flex-1 flex-col justify-end gap-px"
              >
                {hour.errors > 0 ? (
                  <div
                    className="rounded-t-sm bg-error"
                    style={{ height: `${Math.max(2, (hour.errors / peak) * 96)}px` }}
                  />
                ) : null}
                <div
                  className="rounded-t-sm bg-primary/70"
                  style={{ height: `${Math.max(1, (hour.calls / peak) * 96)}px` }}
                />
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {businesses.map((business) => (
        <Card key={business.id}>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h3 className="md-title truncate">{business.name}</h3>
            <span className="md-label-sm text-on-variant">
              {compact(business.calls)} calls · {ms(business.average)} average
              {business.errors > 0 ? ` · ${compact(business.errors)} errors` : ""}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] border-collapse">
              <thead>
                <tr className="border-b border-outline-variant text-left">
                  <Th>Operation</Th>
                  <Th align="right">Calls</Th>
                  <Th align="right">Errors</Th>
                  <Th align="right">Average</Th>
                  <Th align="right">Slowest</Th>
                  <Th align="right">Over 1s</Th>
                </tr>
              </thead>
              <tbody>
                {business.rows.map((row) => (
                  <tr
                    key={`${row.operation}:${row.source}`}
                    className="border-b border-outline-variant/40 last:border-0"
                  >
                    <Td>
                      <span className="md-body">{row.operation}</span>
                      {row.source === "browser" ? (
                        <span className="md-label-sm ml-2 text-on-variant/70">browser</span>
                      ) : null}
                      {row.lastErrorKind ? (
                        <span className="md-label-sm mt-0.5 block truncate text-error">
                          {row.lastErrorKind}
                          {row.lastErrorNote ? `: ${row.lastErrorNote}` : ""}
                          {row.lastErrorAt
                            ? ` · ${formatRelativeTime(row.lastErrorAt)}`
                            : ""}
                        </span>
                      ) : null}
                    </Td>
                    <Td align="right">{compact(row.calls)}</Td>
                    <Td align="right" tone={row.errors > 0 ? "bad" : undefined}>
                      {row.errors > 0 ? compact(row.errors) : "0"}
                    </Td>
                    <Td align="right">{row.calls > 0 ? ms(row.totalMs / row.calls) : "0ms"}</Td>
                    <Td align="right" tone={row.maxMs >= 3_000 ? "bad" : undefined}>
                      {ms(row.maxMs)}
                    </Td>
                    <Td align="right">{row.slow > 0 ? compact(row.slow) : "0"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
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

function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return (
    <th
      className={cx(
        "md-label-sm pb-2 font-normal text-on-variant",
        align === "right" ? "text-right" : "text-left",
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
        "md-body py-2 align-top",
        align === "right" ? "text-right tabular-nums" : "min-w-0",
        tone === "bad" && "text-error",
      )}
    >
      {children}
    </td>
  );
}
