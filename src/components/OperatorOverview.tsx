"use client";

import { Card, cx } from "./ui";
import { formatRelativeTime } from "@/lib/routes";
import { useNow } from "@/lib/useNow";
import type { AdminOverview } from "@/db/admin";

/**
 * The one screen to open first.
 *
 * Built the way the dashboards in a practice management tool are built, and for
 * the same reason: the first thing on it is what is waiting for a person, not
 * what is merely true. A count of conversations goes up on its own and needs
 * nobody. An unread report has somebody at the end of it. So the queue leads,
 * the last day of behaviour follows, and the totals that only ever grow sit at
 * the bottom where they belong.
 *
 * Health and Usage keep their own tabs. This answers "is anything wrong" and
 * they answer "what exactly", which is a different question and a longer one.
 * This is meant to be read in about four seconds and then closed.
 *
 * Payments will sit between Waiting and The last day, once there is a Stripe
 * subscription to read. Deliberately not stubbed in the meantime: a card
 * promising a number it does not have is worse than no card, and the row it
 * goes into is already the right shape for it.
 */

const compact = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
      ? `${(n / 1_000).toFixed(1)}k`
      : String(n);

const bytes = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)} MB`
    : n >= 1_000
      ? `${Math.round(n / 1_000)} KB`
      : `${n} B`;

/** The cron is daily, so a bit past a day is a missed night, not a slow clock. */
const CRON_OVERDUE_MS = 26 * 60 * 60 * 1000;

export function OperatorOverview({ overview }: { overview: AdminOverview | null }) {
  const now = useNow();

  // Below the hook, because a hook after a return is not called on every
  // render and React counts them by position.
  if (!overview) return null;

  const u = overview.usage;
  const totalIn = u.input + u.cacheRead + u.cacheWrite;
  const { waiting, health, businesses } = overview;

  const cronLate = !waiting.cronAt || now - waiting.cronAt > CRON_OVERDUE_MS;
  const quiet = businesses.quiet;
  const clear =
    waiting.reports === 0 && waiting.feedback === 0 && quiet === 0 && !cronLate;

  const errorRate = health.calls > 0 ? (health.errors / health.calls) * 100 : 0;

  return (
    <div className="measure flex flex-col gap-5">
      <section>
        <h2 className="md-label-sm mb-2 text-on-variant/70">Alerts</h2>
        {clear ? (
          <Card>
            <p className="md-body text-on-variant">
              Nothing needs attention.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 medium:grid-cols-2">
            {waiting.reports > 0 ? (
              <Alert
                tone={waiting.urgentReports > 0 ? "bad" : "warn"}
                title={`${waiting.reports} open report${waiting.reports === 1 ? "" : "s"}`}
                body={
                  waiting.urgentReports > 0
                    ? `${waiting.urgentReports} high severity.`
                    : "None high severity."
                }
              />
            ) : null}

            {waiting.feedback > 0 ? (
              <Alert
                tone="warn"
                title={`${waiting.feedback} unread feedback`}
                body="Awaiting review."
              />
            ) : null}

            {cronLate ? (
              <Alert
                tone="bad"
                title="Nightly run overdue"
                body={
                  waiting.cronAt
                    ? `Last run ${formatRelativeTime(waiting.cronAt)}. Briefings and reports depend on it.`
                    : "Never run. Briefings and reports depend on it."
                }
              />
            ) : null}

            {quiet > 0 ? (
              <Alert
                tone="warn"
                title={`${quiet} of ${businesses.total} businesses inactive`}
                body="No activity in 30 days."
              />
            ) : null}
          </div>
        )}
      </section>

      <section>
        <h2 className="md-label-sm mb-2 text-on-variant/70">Last 24 hours</h2>
        <div className="grid grid-cols-2 gap-3 medium:grid-cols-4">
          <Stat label="Calls" value={compact(health.calls)} />
          <Stat
            label="Errors"
            value={compact(health.errors)}
            hint={health.calls > 0 ? `${errorRate.toFixed(2)}%` : undefined}
            tone={errorRate > 1 ? "bad" : undefined}
          />
          {/* Refused is the limits working, so it is never coloured. */}
          <Stat label="Refused" value={compact(health.refused)} />
          <Stat label="Over 1s" value={compact(health.slow)} />
        </div>
      </section>

      <section>
        <h2 className="md-label-sm mb-2 text-on-variant/70">Accounts</h2>
        <div className="grid grid-cols-2 gap-3 medium:grid-cols-4">
          <Stat label="Businesses" value={String(businesses.total)} />
          <Stat
            label="Active this week"
            value={String(businesses.active)}
            hint={`of ${businesses.total}`}
          />
          <Stat
            label="Accounts"
            value={String(overview.signedIn)}
            hint={`${overview.people} with a workspace`}
          />
          <Stat
            label="Attachments"
            value={compact(overview.files)}
            hint={bytes(overview.storageBytes)}
          />
        </div>
      </section>

      <section>
        <h2 className="md-label-sm mb-2 text-on-variant/70">Totals</h2>
        <div className="grid grid-cols-2 gap-3 medium:grid-cols-4">
          <Stat
            label="Conversations"
            value={compact(overview.conversations)}
            hint={`${compact(overview.messages)} messages`}
          />
          <Stat label="Deliverables" value={compact(overview.deliverables)} />
          <Stat label="Projects" value={compact(overview.projects)} />
          <Stat label="Output tokens" value={compact(u.output)} />
        </div>
      </section>

      <Card>
        <h2 className="md-title-lg mb-1">Tokens</h2>
        <p className="md-body mb-4 text-on-variant">
Since usage tracking began. Each business spends on its own key.
        </p>
        <dl className="grid grid-cols-1 gap-3 medium:grid-cols-4">
          {(
            [
              ["Input, new", u.input],
              ["Input, cached", u.cacheRead],
              ["Cache writes", u.cacheWrite],
              ["Output", u.output],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <dt className="md-label-sm text-on-variant">{label}</dt>
              <dd className="md-title mt-0.5">{compact(value)}</dd>
            </div>
          ))}
        </dl>
        {totalIn > 0 ? (
          <p className="md-label-sm mt-4 text-on-variant/75">
            {Math.round((u.cacheRead / totalIn) * 100)}% of input tokens served from
            cache, at roughly a tenth of the price.
          </p>
        ) : null}
      </Card>
    </div>
  );
}

/** One thing waiting, with a stripe so the queue reads at a glance. */
function Alert({
  tone,
  title,
  body,
}: {
  tone: "bad" | "warn";
  title: string;
  body: string;
}) {
  return (
    <Card className={cx("border-l-4", tone === "bad" ? "border-l-error" : "border-l-warning")}>
      <p className={cx("md-title", tone === "bad" ? "text-error" : "text-warning")}>
        {title}
      </p>
      <p className="md-body mt-1 text-on-variant">{body}</p>
    </Card>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "bad";
}) {
  return (
    <Card>
      <p className="md-label-sm text-on-variant">{label}</p>
      <p className={cx("md-title-lg mt-1", tone === "bad" && "text-error")}>{value}</p>
      {hint ? <p className="md-label-sm mt-0.5 text-on-variant/70">{hint}</p> : null}
    </Card>
  );
}
