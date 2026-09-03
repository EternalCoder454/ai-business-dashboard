"use client";

import { useEffect, useMemo } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Markdown } from "@/components/Markdown";
import { Card, Chip, cx } from "@/components/ui";
import { CHANGELOG, type ChangeKind, type ChangelogEntry } from "@/lib/changelog.data";
import {
  markChangelogSeen,
  seenChangelog,
  useChangelogView,
  setChangelogView,
  type ChangelogView,
} from "@/lib/changelogSeen";
import { useStore } from "@/lib/store";

/**
 * What has changed in the panel, newest first.
 *
 * Two views of one history. Simple is written for whoever uses the panel and
 * covers what was added, what got better and what was fixed. Technical is the
 * commit history itself, for whoever wants to know exactly what happened.
 *
 * Simple is the default because most people reading this did not write it. A
 * release with nothing written for it does not appear there at all, so the
 * Simple view is shorter than the Technical one by design rather than by
 * omission.
 *
 * Opening the page marks everything read. The dot on the account menu is the
 * whole point of the feature for anybody already using the panel, and a dot
 * that survives being looked at is one people learn to ignore.
 */
export default function ChangelogPage() {
  const { settings } = useStore();
  const view = useChangelogView();
  const seen = useMemo(() => seenChangelog(), []);

  useEffect(() => {
    markChangelogSeen();
  }, []);

  const entries = useMemo(
    () => (view === "simple" ? CHANGELOG.filter((entry) => entry.plain) : CHANGELOG),
    [view],
  );
  const days = useMemo(() => groupByDay(entries), [entries]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader eyebrow={settings.companyName} title="Changelog" />

      <div className="flex flex-none items-center gap-2 border-b border-outline-variant px-4 py-3 medium:px-6">
        {VIEWS.map(([key, label]) => (
          <Chip key={key} selected={view === key} onClick={() => setChangelogView(key)}>
            {label}
          </Chip>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto page-x py-6">
        <ol className="measure flex flex-col gap-7">
          {days.map(([date, forDay]) => (
            <li key={date}>
              <h2 className="md-title mb-3">{longDate(date)}</h2>

              <ul className="flex flex-col gap-3">
                {forDay.map((entry) => (
                  <li key={entry.id}>
                    <Entry entry={entry} view={view} isNew={newerThan(entry, seen)} />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

const VIEWS: [ChangelogView, string][] = [
  ["simple", "Simple"],
  ["technical", "Technical"],
];

/** What each kind is called, and the colour that carries it. */
const KIND: Record<ChangeKind, { label: string; tone: "success" | "primary" | "warning" }> = {
  new: { label: "New", tone: "success" },
  better: { label: "Improved", tone: "primary" },
  fixed: { label: "Fixed", tone: "warning" },
};

function Entry({
  entry,
  view,
  isNew,
}: {
  entry: ChangelogEntry;
  view: ChangelogView;
  isNew: boolean;
}) {
  const plain = view === "simple" ? entry.plain : undefined;
  const kind = plain ? KIND[plain.kind] : null;

  return (
    <Card>
      <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        {kind ? <Chip tone={kind.tone}>{kind.label}</Chip> : null}
        {isNew ? <Chip tone="primary">New to you</Chip> : null}
        {view === "technical" ? (
          // Not md-label-sm: that uppercases, and a commit hash is lowercase
          // everywhere else somebody would paste it.
          <code className="font-mono text-[0.6875rem] text-on-variant/70">{entry.id}</code>
        ) : null}
      </div>

      <h3 className="md-title">{plain ? plain.title : entry.title}</h3>

      {/* The same renderer the heads' replies use, so a bullet list here looks
          like a bullet list anywhere else in the panel. */}
      {(plain ? plain.detail : entry.detail) ? (
        <div className={cx("mt-1.5 text-on-variant")}>
          <Markdown>{plain ? plain.detail : entry.detail}</Markdown>
        </div>
      ) : null}
    </Card>
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

/** Whether this landed after the last entry this browser was shown. */
function newerThan(entry: ChangelogEntry, seen: string | null): boolean {
  if (!seen || entry.id === seen) return false;
  const mark = CHANGELOG.findIndex((other) => other.id === seen);
  if (mark === -1) return false;
  return CHANGELOG.indexOf(entry) < mark;
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
