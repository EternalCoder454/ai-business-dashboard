"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Markdown } from "@/components/ChatView";
import {
  Button,
  Card,
  Chip,
  Dialog,
  DownloadIcon,
  EmptyState,
  Field,
  PlusIcon,
  Select,
  SparkIcon,
  TextArea,
  TextInput,
  TrashIcon,
  cx,
} from "@/components/ui";
import { useStore } from "@/lib/store";
import { formatRelativeTime } from "@/lib/routes";

interface Schedule {
  id: string;
  name: string;
  departmentId: string;
  prompt: string;
  cadence: "daily" | "weekly" | "monthly";
  weekday: number;
  dayOfMonth: number;
  enabled: boolean;
  lastRunAt: number | null;
}

interface Briefing {
  id: string;
  scheduleName: string;
  departmentId: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: number;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function cadenceLine(schedule: Schedule): string {
  if (schedule.cadence === "daily") return "Every day";
  if (schedule.cadence === "weekly") return `Every ${DAYS[schedule.weekday] ?? "Monday"}`;
  return `Day ${schedule.dayOfMonth} of the month`;
}

type Draft = Omit<Schedule, "lastRunAt">;

const BLANK: Draft = {
  id: "",
  name: "",
  departmentId: "",
  prompt: "",
  cadence: "weekly",
  weekday: 1,
  dayOfMonth: 1,
  enabled: true,
};

/**
 * What the panel did while nobody was looking.
 *
 * The reason this page exists rather than an email: a business owner does not
 * open a tool to ask what to focus on, they open it when something is already
 * there. Two of the shipped skills, Weekly Priority Call and Monthly Books
 * Check, are rhythms that nothing was running, so they happened twice and then
 * never.
 */
export default function BriefingsPage() {
  const { departments, ceo, settings } = useStore();
  const heads = ceo ? [ceo, ...departments] : departments;

  const [schedules, setSchedules] = useState<Schedule[] | null>(null);
  const [briefings, setBriefings] = useState<Briefing[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [reading, setReading] = useState<Briefing | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/workspace/schedules");
    const body = (await response.json().catch(() => null)) as {
      schedules?: Schedule[];
      briefings?: Briefing[];
      canEdit?: boolean;
      error?: string;
    } | null;
    if (!response.ok) {
      setError(body?.error ?? "Could not read your schedules.");
      return;
    }
    setSchedules(body?.schedules ?? []);
    setBriefings(body?.briefings ?? []);
    setCanEdit(Boolean(body?.canEdit));
    setError(null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const post = async (payload: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/workspace/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(result?.error ?? "Could not make that change.");
        return false;
      }
      await load();
      return true;
    } catch {
      setError("Could not reach the server.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const open = (briefing: Briefing) => {
    setReading(briefing);
    if (!briefing.read) {
      setBriefings((current) =>
        current.map((b) => (b.id === briefing.id ? { ...b, read: true } : b)),
      );
      void post({ action: "read", id: briefing.id });
    }
  };

  const nameOf = (id: string) => heads.find((h) => h.id === id)?.name ?? id;
  const unread = briefings.filter((b) => !b.read).length;

  return (
    <>
      <PageHeader
        eyebrow={settings.companyName}
        title="Briefings"
        actions={
          canEdit ? (
            <Button onClick={() => setDraft({ ...BLANK, departmentId: heads[0]?.id ?? "" })}>
              <PlusIcon className="h-4 w-4" />
              New schedule
            </Button>
          ) : undefined
        }
      />

      <div className="measure flex flex-col gap-5 p-4 sm:p-6">
        {error ? <p className="md-label text-error">{error}</p> : null}

        {briefings.length === 0 && (schedules?.length ?? 0) === 0 ? (
          <EmptyState
            icon={<SparkIcon className="h-8 w-8" />}
            title="Nothing on a rhythm yet"
            description={
              canEdit
                ? "A schedule puts a question to one of your heads on a cadence, and the answer is waiting here when you next sign in."
                : "An administrator sets these up."
            }
          />
        ) : null}

        {briefings.length > 0 ? (
          <section className="flex flex-col gap-3">
            <h2 className="md-title-lg">
              Waiting for you{unread > 0 ? ` · ${unread} unread` : ""}
            </h2>
            <ul className="flex flex-col gap-3">
              {briefings.map((briefing) => (
                <li key={briefing.id}>
                  <button
                    onClick={() => open(briefing)}
                    className="block w-full text-left"
                  >
                    <Card className={cx(briefing.read && "opacity-60")}>
                      <div className="flex flex-wrap items-center gap-2">
                        {!briefing.read ? (
                          <span aria-hidden className="h-2 w-2 flex-none rounded-full bg-primary" />
                        ) : null}
                        <span className="md-title min-w-0 flex-1 truncate">
                          {briefing.title}
                        </span>
                        <Chip>{nameOf(briefing.departmentId)}</Chip>
                        <span className="md-label-sm text-on-variant/75">
                          {formatRelativeTime(briefing.createdAt)}
                        </span>
                      </div>
                      <p className="md-body mt-2 line-clamp-2 text-on-variant">
                        {briefing.body.replace(/[#*`>|-]/g, " ").replace(/\s+/g, " ").trim()}
                      </p>
                    </Card>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {(schedules?.length ?? 0) > 0 ? (
          <section className="flex flex-col gap-3">
            <h2 className="md-title-lg">Rhythms</h2>
            <ul className="flex flex-col gap-3">
              {schedules?.map((schedule) => (
                <li key={schedule.id}>
                  <Card className={cx(!schedule.enabled && "opacity-60")}>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <div className="min-w-0 flex-1">
                        <p className="md-title truncate">{schedule.name}</p>
                        <p className="md-label-sm truncate text-on-variant/75">
                          {cadenceLine(schedule)} · {nameOf(schedule.departmentId)} ·{" "}
                          {schedule.lastRunAt
                            ? `last ran ${formatRelativeTime(schedule.lastRunAt)}`
                            : "not run yet"}
                        </p>
                      </div>
                      {!schedule.enabled ? <Chip>Paused</Chip> : null}
                      {canEdit ? (
                        <>
                          <Button
                            size="sm"
                            variant="text"
                            disabled={busy}
                            onClick={() => setDraft({ ...schedule })}
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="text"
                            disabled={busy}
                            onClick={() => void post({ action: "delete", id: schedule.id })}
                          >
                            <TrashIcon className="h-4 w-4" />
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <Dialog
        open={Boolean(reading)}
        title={reading?.title ?? ""}
        onClose={() => setReading(null)}
        width="max-w-3xl"
        footer={
          <>
            <Button
              variant="text"
              onClick={() => {
                if (!reading) return;
                const blob = new Blob([`# ${reading.title}\n\n${reading.body}\n`], {
                  type: "text/markdown",
                });
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement("a");
                anchor.href = url;
                anchor.download = `${reading.title.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-")}.md`;
                anchor.click();
                URL.revokeObjectURL(url);
              }}
            >
              <DownloadIcon className="h-4 w-4" />
              Save
            </Button>
            <Button onClick={() => setReading(null)}>Close</Button>
          </>
        }
      >
        {reading ? <Markdown>{reading.body}</Markdown> : null}
      </Dialog>

      <Dialog
        open={Boolean(draft)}
        title={draft?.id ? "Edit schedule" : "New schedule"}
        onClose={() => setDraft(null)}
        width="max-w-lg"
        footer={
          <>
            <Button variant="text" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button
              disabled={busy || !draft?.name.trim() || !draft?.prompt.trim()}
              onClick={async () => {
                if (!draft) return;
                const done = await post({ action: "save", ...draft, id: draft.id || undefined });
                if (done) setDraft(null);
              }}
            >
              {busy ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        {draft ? (
          <>
            <Field label="Name">
              <TextInput
                autoFocus
                value={draft.name}
                placeholder="Monday priorities"
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </Field>

            <Field label="Who answers it">
              <Select
                value={draft.departmentId}
                onChange={(event) => setDraft({ ...draft, departmentId: event.target.value })}
              >
                {heads.map((head) => (
                  <option key={head.id} value={head.id}>
                    {head.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="The question">
              <TextArea
                rows={4}
                value={draft.prompt}
                placeholder="Read my tasks, decisions, and figures, and tell me the three things that matter this week."
                onChange={(event) => setDraft({ ...draft, prompt: event.target.value })}
              />
            </Field>

            <div className="grid grid-cols-1 gap-3 medium:grid-cols-2">
              <Field label="How often">
                <Select
                  value={draft.cadence}
                  onChange={(event) =>
                    setDraft({ ...draft, cadence: event.target.value as typeof draft.cadence })
                  }
                >
                  <option value="daily">Every day</option>
                  <option value="weekly">Every week</option>
                  <option value="monthly">Every month</option>
                </Select>
              </Field>

              {draft.cadence === "weekly" ? (
                <Field label="On">
                  <Select
                    value={String(draft.weekday)}
                    onChange={(event) =>
                      setDraft({ ...draft, weekday: Number(event.target.value) })
                    }
                  >
                    {DAYS.map((day, index) => (
                      <option key={day} value={index}>
                        {day}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}

              {draft.cadence === "monthly" ? (
                <Field label="On day">
                  <Select
                    value={String(draft.dayOfMonth)}
                    onChange={(event) =>
                      setDraft({ ...draft, dayOfMonth: Number(event.target.value) })
                    }
                  >
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                      <option key={day} value={day}>
                        {day}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}
            </div>

            <Field label="Running">
              <Select
                value={draft.enabled ? "on" : "off"}
                onChange={(event) =>
                  setDraft({ ...draft, enabled: event.target.value === "on" })
                }
              >
                <option value="on">Running</option>
                <option value="off">Paused</option>
              </Select>
            </Field>
          </>
        ) : null}
      </Dialog>
    </>
  );
}
