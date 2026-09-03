"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, Chip, cx } from "./ui";

interface CalendarEvent {
  id: string;
  title: string;
  start: number;
  end: number;
  allDay: boolean;
  location: string;
  status: string;
}

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
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/calendar?days=3")
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { events?: CalendarEvent[]; problem?: string } | null) => {
        if (cancelled || !body) return;
        setEvents(body.events ?? []);
        setProblem(body.problem ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Still loading, or nobody has connected one. Neither is worth a card.
  if (events === null || problem === "not-connected") return null;

  /*
   * Connected, and we could not read it.
   *
   * This used to be hidden with everything else, which meant a calendar that
   * had stopped working looked exactly like one nobody had set up: the card
   * disappeared, the heads said they had no access, and there was nothing
   * anywhere to suggest the connection was the problem. Somebody who went to
   * the trouble of connecting a calendar is owed the difference between
   * "nothing on" and "could not look".
   */
  if (problem) {
    return (
      <Card>
        <h2 className="md-title-lg mb-1">Your calendar</h2>
        <p className="md-body text-on-variant">
          Connected, but it could not be read just now.
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
