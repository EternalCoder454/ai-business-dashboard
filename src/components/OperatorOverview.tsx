"use client";

import { Card, ChevronIcon, cx } from "./ui";
import { createRipple } from "./ui/ripple";
import { formatExactTime } from "@/lib/routes";
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

export function OperatorOverview({
  overview,
  onOpen,
}: {
  overview: AdminOverview | null;
  /**
   * Opens the tab that explains a number.
   *
   * The screen said "2 of 4 businesses inactive" and stopped there, so the
   * answer to every alert on it was to read the alert, work out which of the
   * other seven tabs it came from, and go there. An alert that names a problem
   * and cannot show it is a notification, not a dashboard.
   */
  onOpen: (tab: "reports" | "feedback" | "health" | "businesses") => void;
}) {
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
                onOpen={() => onOpen("reports")}
              />
            ) : null}

            {waiting.feedback > 0 ? (
              <Alert
                tone="warn"
                title={`${waiting.feedback} unread feedback`}
                body="Awaiting review."
                onOpen={() => onOpen("feedback")}
              />
            ) : null}

            {cronLate ? (
              <Alert
                tone="bad"
                title="Nightly run overdue"
                body={
                  waiting.cronAt
                    ? `Last run ${formatExactTime(waiting.cronAt)}. Briefings and reports depend on it.`
                    : "Never run. Briefings and reports depend on it."
                }
                onOpen={() => onOpen("health")}
              />
            ) : null}

            {quiet > 0 ? (
              <Alert
                tone="warn"
                title={`${quiet} of ${businesses.total} businesses inactive`}
                body="No activity in 30 days."
                onOpen={() => onOpen("businesses")}
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
        <p className="md-label-sm mb-4 text-on-variant/75">
          Since tracking began. Each business spends on its own key.
        </p>
        <dl className="grid grid-cols-2 gap-3 medium:grid-cols-5">
          {(
            [
              ["Input, new", compact(u.input)],
              ["Input, cached", compact(u.cacheRead)],
              ["Cache writes", compact(u.cacheWrite)],
              ["Output", compact(u.output)],
              [
                "From cache",
                totalIn > 0 ? `${Math.round((u.cacheRead / totalIn) * 100)}%` : "0%",
              ],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <dt className="md-label-sm text-on-variant">{label}</dt>
              <dd className="md-title mt-0.5 tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        {/*
          * The cache share as a figure beside the others, not a sentence under
          * them. It read "52% of input tokens served from cache, at roughly a
          * tenth of the price", which is a paragraph explaining arithmetic to
          * the one person on the deployment who already knows what a cache read
          * costs. The number is the whole of what it was saying.
          */}
      </Card>
    </div>
  );
}

/** One thing waiting, with a stripe so the queue reads at a glance. */
/**
 * One thing that is wrong, and the way to it.
 *
 * A button rather than a card, because every one of these is about something on
 * another tab and the whole of an operator's job here is to go and look. It was
 * a card that said what was wrong and left you to work out where.
 */
function Alert({
  tone,
  title,
  body,
  onOpen,
}: {
  tone: "bad" | "warn";
  title: string;
  body: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        createRipple(event);
        onOpen();
      }}
      className={cx(
        "md-state md-press w-full rounded-2xl border-l-4 bg-container p-5 text-left shadow-e1",
        "transition-shadow hover:shadow-e2",
        tone === "bad" ? "border-l-error" : "border-l-warning",
      )}
    >
      <span className="flex items-start gap-2">
        <span className="min-w-0 flex-1">
          <span className={cx("md-title block", tone === "bad" ? "text-error" : "text-warning")}>
            {title}
          </span>
          <span className="md-body mt-1 block text-on-variant">{body}</span>
        </span>
        {/* Points where pressing it goes, which is the half a card could not
            say. */}
        <ChevronIcon aria-hidden className="mt-0.5 h-4 w-4 flex-none text-on-variant/60" />
      </span>
    </button>
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
