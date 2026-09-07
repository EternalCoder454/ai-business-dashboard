"use client";

import Link from "next/link";
import { Card, Chip, cx } from "./ui";
import { useStore } from "@/lib/store";
import type { CalendarEvent } from "@/lib/google";

/** Today, tomorrow, or the weekday, which is how anybody reads a diary. */
function dayLabel(at: number): string {
  const date = new Date(at);
  const midnight = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((midnight(date) - midnight(new Date())) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });
}

const time = (at: number) =>
  new Date(at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/**
 * What the day actually looks like, beside the work.
 *
 * The reason this sits on the dashboard rather than being its own page: nobody
 * opens a panel to look at their calendar, they have a calendar for that. It is
 * here so that "what should I focus on" is asked in front of "you have four
 * hours of meetings", which is usually the answer.
 *
 * Silent when nobody has connected one. An empty card advertising a feature is
 * worse than no card, and Settings is where somebody goes looking.
 */
export function CalendarCard() {
  /*
   * From the store, not a second request.
   *
   * This used to fetch /api/calendar?days=3 while the store was fetching
   * ?days=7 for the prompts, so every page load asked Google for the same
   * calendar twice. Measured at 436 calls a day against 218 page loads, 822ms
   * each, which is the second slowest thing the panel does.
   *
   * Three days out of the seven the store holds, since a dashboard card is a
   * glance at what is next rather than the week.
   */
  const { calendar, calendarStatus, ready } = useStore();

  const horizon = Date.now() + 3 * 86_400_000;
  const events = calendar.filter((event) => event.start < horizon);
  const problem = calendarStatus === "connected" ? null : calendarStatus;

  // Still loading, or nobody has connected one. Neither is worth a card.
  if (!ready || problem === "not-connected") return null;

  /*
   * Connected, and we could not read it. Shown rather than hidden, because
   * somebody who went to the trouble of connecting a calendar is owed the
   * difference between "nothing on" and "could not look".
   */
  if (problem) {
    return (
      <Card>
        <h2 className="md-title-lg mb-1">Your calendar</h2>
        <p className="md-body text-on-variant">
          Connected. Could not be read.
        </p>
      </Card>
    );
  }

  if (events.length === 0) {
    return (
      <Card>
        <h2 className="md-title-lg mb-1">Your calendar</h2>
        <p className="md-body text-on-variant">Nothing in the next three days.</p>
      </Card>
    );
  }

  // Grouped by day, in order, because a flat list of times is not a diary.
  const byDay = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const key = dayLabel(event.start);
    byDay.set(key, [...(byDay.get(key) ?? []), event]);
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="md-title-lg">Your calendar</h2>
        <Link href="/settings" className="md-label-sm text-on-variant/75 hover:underline">
          Google
        </Link>
      </div>

      <div className="flex flex-col gap-4">
        {[...byDay.entries()].map(([day, items]) => (
          <div key={day}>
            <p className="md-label-sm mb-1.5 text-on-variant/75">{day}</p>
            <ul className="flex flex-col gap-1.5">
              {items.map((event) => (
                <li key={event.id} className="flex items-baseline gap-3">
                  <span
                    className={cx(
                      "md-label-sm w-16 flex-none tabular-nums",
                      event.status === "tentative" ? "text-on-variant/50" : "text-on-variant",
                    )}
                  >
                    {event.allDay ? "All day" : time(event.start)}
                  </span>
                  <span className="md-body min-w-0 flex-1 truncate">{event.title}</span>
                  {event.location ? (
                    <Chip>
                      {/* A meeting link is a location as far as Google is
                          concerned, and a full URL in a list is noise. */}
                      {/^https?:\/\//.test(event.location) ? "Call" : event.location}
                    </Chip>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}
