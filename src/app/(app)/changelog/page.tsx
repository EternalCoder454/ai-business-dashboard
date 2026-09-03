"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, Chip, cx } from "@/components/ui";
import { CHANGELOG, type ChangelogEntry } from "@/lib/changelog.data";
import { markChangelogSeen, seenChangelog } from "@/lib/changelogSeen";
import { useStore } from "@/lib/store";

/**
 * What has changed in the panel, newest first.
 *
 * Built from the commit history by scripts/changelog.ts, so it is whatever was
 * actually shipped rather than whatever somebody remembered to write down.
 *
 * Opening the page marks everything read. The dot on the account menu is the
 * whole point of the feature for anybody already using the panel, and a dot
 * that survives being looked at is one people learn to ignore.
 */
export default function ChangelogPage() {
  const { settings } = useStore();
  const [seen] = useState(() => seenChangelog());

  useEffect(() => {
    markChangelogSeen();
  }, []);

  const days = useMemo(() => groupByDay(CHANGELOG), []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader eyebrow={settings.companyName} title="Changelog" />

      <div className="min-h-0 flex-1 overflow-y-auto page-x py-6">
        <ol className="measure flex flex-col gap-6">
          {days.map(([date, entries]) => (
            <li key={date}>
              <div className="mb-2 flex items-baseline gap-2">
                <h2 className="md-title">{longDate(date)}</h2>
                <span className="md-label-sm text-on-variant/70">
                  {entries.length} {entries.length === 1 ? "change" : "changes"}
                </span>
              </div>

              <ul className="flex flex-col gap-3">
                {entries.map((entry) => {
                  // Anything at or above the mark the last visit left behind.
                  const isNew = seen ? entry.id !== seen && after(entry, seen) : false;
                  return (
                    <li key={entry.id}>
                      <Card>
                        <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
                          <h3 className={cx("md-title min-w-0 flex-1")}>{entry.title}</h3>
                          {isNew ? <Chip tone="primary">New</Chip> : null}
                        </div>
                        {entry.detail ? (
                          <p className="md-body mt-1.5 text-on-variant">{entry.detail}</p>
                        ) : null}
                      </Card>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/** Entries are already newest first, so grouping preserves that order. */
function groupByDay(entries: ChangelogEntry[]): [string, ChangelogEntry[]][] {
  const days = new Map<string, ChangelogEntry[]>();
  for (const entry of entries) {
    const list = days.get(entry.date);
    if (list) list.push(entry);
    else days.set(entry.date, [entry]);
  }
  return [...days];
}

/** Whether this entry is newer than the one last seen. */
function after(entry: ChangelogEntry, seen: string): boolean {
  const index = CHANGELOG.findIndex((e) => e.id === seen);
  if (index === -1) return true;
  return CHANGELOG.indexOf(entry) < index;
}

function longDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
