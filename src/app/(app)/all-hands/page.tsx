"use client";

import { hasKeyFor } from "@/lib/hasKey";
import Link from "next/link";
import { DepartmentAvatar } from "@/components/DepartmentAvatar";
import { MeetingList } from "@/components/MeetingList";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Markdown } from "@/components/ChatView";
import {
  BookmarkIcon,
  Button,
  CheckIcon,
  ChevronIcon,
  Chip,
  CopyIcon,
  PlusIcon,
  SparkIcon,
  StatusDot,
  TrashIcon,
  UsersIcon,
  cx,
} from "@/components/ui";
import { ProfileMenu } from "@/components/ProfileMenu";
import { createRipple } from "@/components/ui/ripple";
import { ROOM_BUDGET, runAllHandsRound, runUsage } from "@/lib/allHands";
import { deriveConversationTitle } from "@/lib/prompts";
import { formatRelativeTime } from "@/lib/routes";
import { departmentAccent } from "@/lib/seed";
import { useStore } from "@/lib/store";
import type { AllHandsResponse, AllHandsRun, Department } from "@/lib/types";

/**
 * Height at which a head's answer collapses behind a "Show more".
 *
 * Seven full answers at once blows past working memory (Miller) and turns the
 * page into a scroll hunt. Collapsing to a readable preview keeps every voice
 * on one or two screens, and expanding is one click.
 */
const COLLAPSE_AT = 260;

export default function AllHandsPage() {
  const {
    ready,
    departments,
    ceo,
    allDepartments,
    allHandsRuns,
    profile,
    settings,
    serverKeys,
    workspaceKeys,
    memory,
    tasks,
    calendar,
    skillsFor,
    account,
    saveAllHandsRun,
    deleteAllHandsRun,
    createDeliverable,
    updateSettings,
  } = useStore();

  const [question, setQuestion] = useState("");
  const [synthesize, setSynthesize] = useState(true);
  const [live, setLive] = useState<AllHandsRun | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  // Explicit "starting a fresh room" state. Without it, clearing the selection
  // just falls back to the newest thread and the empty room never shows.
  const [composingNew, setComposingNew] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  /*
   * Who is being asked, held as who is left out rather than who is in.
   *
   * Everyone by default, and a head added to the business later joins the room
   * without anybody having to remember to tick it. Kept per visit rather than
   * saved: a room picked for one question is rarely the room for the next, and
   * a selection that quietly persists is one somebody sends a question to the
   * wrong half of the company with.
   */
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  const asking = useMemo(
    () => departments.filter((d) => !excluded.has(d.id)),
    [departments, excluded],
  );

  const toggle = (id: string) =>
    setExcluded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const stickToBottom = useRef(true);

  useEffect(() => () => abortRef.current?.abort(), []);

  const running = live?.status === "running";

  /*
   * Meetings that actually happened, which is what decides whether the list is
   * worth showing at all.
   */
  const held = useMemo(() => allHandsRuns.filter((r) => r.rounds.length > 0), [allHandsRuns]);

  /*
   * The list, once the room has met.
   *
   * This screen used to fall back to the newest meeting whenever nothing was
   * chosen, so every visit for the rest of the month reopened the same one: a
   * second subject went into the middle of the first, and the way to a clean
   * room was to delete what was there. The fallback is gone, and with nothing
   * open you get the list instead.
   */
  const showList = !live && !composingNew && !openId && held.length > 0;

  const thread: AllHandsRun | undefined = useMemo(() => {
    if (live) return live;
    if (composingNew) return undefined;
    // No fallback to the newest. Nothing chosen means the list, not whichever
    // meeting happened to be last.
    if (openId) return allHandsRuns.find((r) => r.id === openId);
    return held.length > 0 ? undefined : allHandsRuns[0];
  }, [live, composingNew, openId, allHandsRuns, held.length]);

  const departmentOf = useCallback(
    (id: string) => allDepartments.find((d) => d.id === id),
    [allDepartments],
  );

  const currentRound = thread?.rounds[thread.rounds.length - 1];

  const answeredCount = currentRound
    ? currentRound.responses.filter((r) => !r.pending).length
    : 0;

  useLayoutEffect(() => {
    const node = feedRef.current;
    if (!node || !stickToBottom.current) return;
    node.scrollTop = node.scrollHeight;
  }, [thread?.id, thread?.rounds.length, answeredCount, currentRound?.synthesis]);

  const ask = async (startNew: boolean) => {
    const text = question.trim();
    if (!text || running || asking.length === 0) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setQuestion("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    stickToBottom.current = true;

    const finished = await runAllHandsRound({
      run: startNew || composingNew ? undefined : thread,
      question: text,
      departments: asking,
      ceo,
      profile,
      settings,
      skillsFor,
      account,
      memory,
      tasks,
      calendar,
      synthesize,
      signal: controller.signal,
      onProgress: setLive,
    });

    await saveAllHandsRun(finished);
    abortRef.current = null;
    setLive(null);
    setComposingNew(false);
    setOpenId(finished.id);
  };

  const jumpTo = (departmentId: string) => {
    stickToBottom.current = false;
    document
      .getElementById(`msg-${departmentId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const usage = thread ? runUsage(thread) : null;

  if (showList) {
    return (
      <MeetingList
        runs={allHandsRuns}
        onOpen={(id) => setOpenId(id)}
        onNew={() => {
          setOpenId(null);
          setComposingNew(true);
        }}
        onDelete={(id) => void deleteAllHandsRun(id)}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header doubles as the thread switcher, so past threads never sit at
          the bottom of the scroll where you have to hunt for them. */}
      <header className="flex flex-none items-center gap-3 border-b border-outline-variant px-4 medium:px-6 expanded:px-8 py-3.5">
        {/* Back to every meeting. The phone's own back gesture goes wherever
            they came from; this always goes to the list. */}
        {held.length > 0 ? (
          <button
            type="button"
            aria-label="All meetings"
            onClick={(event) => {
              createRipple(event);
              setOpenId(null);
              setComposingNew(false);
            }}
            className="md-state md-target grid flex-none place-items-center rounded-full text-on-variant"
          >
            <ChevronIcon className="h-5 w-5 rotate-180" />
          </button>
        ) : (
          <div className="grid h-10 w-10 flex-none place-items-center rounded-2xl bg-primary-container text-on-primary-container">
            <UsersIcon className="h-5 w-5" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          {/* The switcher that used to live here, a chevron and a count that
              unfolded a panel over the transcript, is the list now. Two ways to
              reach the same meetings, one of them hidden inside a heading, was
              one too many. */}
          <h1 className="md-title truncate">{thread?.title ?? "New meeting"}</h1>
          <p className="md-label-sm truncate text-on-variant">
            {thread
              ? `${thread.rounds.length} question${thread.rounds.length === 1 ? "" : "s"}`
              : ""}
            {usage && usage.output > 0
              ? ` · ${usage.output.toLocaleString()} tokens out${
                  usage.cacheRead > 0 ? `, ${usage.cacheRead.toLocaleString()} cached` : ""
                }`
              : ""}
          </p>
        </div>
        {thread ? (
          <button
            onClick={async (event) => {
              createRipple(event);
              await deleteAllHandsRun(thread.id);
              setOpenId(null);
              setComposingNew(false);
            }}
            title="Delete this meeting"
            className="md-state md-target grid h-9 w-9 flex-none place-items-center rounded-full text-on-variant"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        ) : null}
        <Button
          variant="outlined"
          size="sm"
          aria-label="New meeting"
          className="flex-none px-2 medium:px-3"
          icon={<PlusIcon className="h-4 w-4" />}
          onClick={() => {
            setLive(null);
            setOpenId(null);
            setComposingNew(true);
            inputRef.current?.focus();
          }}
        >
          <span className="hidden medium:inline">New meeting</span>
        </Button>
        {/* The top app bar carries it on compact, so this would be the second
            avatar on the same screen. */}
        <div className="hidden medium:block">
          <ProfileMenu />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Below the large window class the roster pane is gone, so the same
            information becomes a horizontal strip above the feed. */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {thread ? (
            <div className="flex flex-none gap-1.5 overflow-x-auto border-b border-outline-variant px-4 py-2 large:hidden">
              {departments.map((department) => {
                const response = currentRound?.responses.find(
                  (r) => r.departmentId === department.id,
                );
                const done = response && !response.pending && !response.error;
                const failed = response?.error;
                const inRoom = !excluded.has(department.id);
                return (
                  /*
                   * The chip is a container with two buttons rather than one
                   * button doing two jobs. Tapping it takes the head in or out
                   * of the meeting; the arrow, once they have answered, jumps
                   * to what they said. A button inside a button is invalid, so
                   * the toggle stretches over the chip and the arrow sits above
                   * it.
                   */
                  <span
                    key={department.id}
                    className={cx(
                      "relative flex flex-none items-center gap-1.5 rounded-full border py-1 pl-2.5",
                      done ? "pr-1" : "pr-2.5",
                      !inRoom
                        ? "border-outline-variant text-on-variant/50"
                        : failed
                          ? "border-error/40 text-error"
                          : done
                            ? "border-transparent bg-secondary-container text-on-secondary-container"
                            : "border-outline-variant text-on-variant",
                    )}
                  >
                    <button
                      type="button"
                      aria-pressed={inRoom}
                      onClick={() => toggle(department.id)}
                      title={
                        inRoom
                          ? `${department.personaName}, ${department.roleTitle}. Tap to leave out.`
                          : `${department.personaName} is not in this meeting. Tap to include.`
                      }
                      className="md-state flex items-center gap-1.5 before:absolute before:inset-0 before:rounded-full"
                    >
                      <span className={cx(!inRoom && "opacity-40")}>
                        <DepartmentAvatar department={department} size={18} />
                      </span>
                      <span className="md-label-sm">{department.personaName}</span>
                      {response?.pending ? <span className="typing-dot" /> : null}
                    </button>
                    {done ? (
                      <button
                        type="button"
                        aria-label={`Jump to ${department.personaName}`}
                        onClick={() => jumpTo(department.id)}
                        className="md-state relative z-10 grid h-5 w-5 place-items-center rounded-full"
                      >
                        <ChevronIcon className="h-3.5 w-3.5 rotate-90" />
                      </button>
                    ) : null}
                  </span>
                );
              })}
            </div>
          ) : null}

        {/* Feed */}
        <div
          ref={feedRef}
          onScroll={() => {
            const node = feedRef.current;
            if (!node) return;
            stickToBottom.current =
              node.scrollHeight - node.scrollTop - node.clientHeight < 140;
          }}
          className="min-h-0 flex-1 overflow-y-auto px-4 medium:px-6 py-6"
        >
          <div className="measure-read flex flex-col gap-5">
            {!thread ? (
              <Opening departments={asking} ceoName={ceo?.personaName} />
            ) : (
              thread.rounds.map((round) => (
                <div key={round.id} className="flex flex-col gap-4">
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-3xl rounded-br-lg bg-primary-container px-4 py-3 text-on-primary-container shadow-e1">
                      <p className="md-body whitespace-pre-wrap">{round.question}</p>
                    </div>
                  </div>

                  {round.responses.map((response) => (
                    <HeadMessage
                      key={response.departmentId}
                      response={response}
                      department={departmentOf(response.departmentId)}
                      onSave={async () => {
                        await createDeliverable({
                          title: `${
                            departmentOf(response.departmentId)?.name ?? "Department"
                          }: ${deriveConversationTitle(round.question)}`,
                          body: response.content,
                          departmentId: response.departmentId,
                        });
                      }}
                    />
                  ))}

                  {round.synthesis ? (
                    <SynthesisMessage
                      ceo={ceo}
                      text={round.synthesis}
                      error={round.synthesisError}
                    />
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>

        </div>

        {/* Who is in the room. Keeps the cast visible without scrolling, and
            gives an answer to "has Desmond replied yet" at a glance. */}
        <aside className="hidden w-[13.75rem] flex-none flex-col border-l border-outline-variant bg-low large:flex">
          <div className="flex items-baseline justify-between gap-2 px-4 pb-1 pt-4">
            <p className="md-label-sm text-on-variant/70">In the room</p>
            {excluded.size > 0 ? (
              <button
                type="button"
                onClick={() => setExcluded(new Set())}
                className="md-state md-label-sm rounded-lg px-1.5 py-0.5 text-primary"
              >
                Everyone
              </button>
            ) : null}
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
            {departments.map((department) => {
              const response = currentRound?.responses.find(
                (r) => r.departmentId === department.id,
              );
              const state = !response
                ? "idle"
                : response.pending
                  ? response.content
                    ? "typing"
                    : "waiting"
                  : response.error
                    ? "failed"
                    : "done";
              const inRoom = !excluded.has(department.id);
              return (
                /*
                 * Clicking a head takes them out of the meeting and clicking
                 * again puts them back, which is where anybody would look for
                 * it: this list is already headed "in the room".
                 *
                 * Two buttons in the row rather than one doing both jobs. The
                 * name toggles, and the arrow beside it jumps to what they said
                 * once there is something to jump to.
                 */
                <li
                  key={department.id}
                  className="relative flex items-center gap-2.5 rounded-xl px-2.5 py-2"
                >
                  <button
                    type="button"
                    aria-pressed={inRoom}
                    onClick={() => toggle(department.id)}
                    className={cx(
                      "md-state flex min-w-0 flex-1 items-center gap-2.5 text-left",
                      "before:absolute before:inset-0 before:rounded-xl",
                      !inRoom && "opacity-45",
                    )}
                  >
                    <DepartmentAvatar department={department} size={20} />
                    <span className="min-w-0 flex-1">
                      <span className="md-body block truncate">
                        {department.personaName || department.name}
                      </span>
                      <span className="md-label-sm block truncate text-on-variant/75">
                        {!inRoom
                          ? "Not in this meeting"
                          : state === "typing"
                            ? "typing…"
                            : state === "waiting"
                              ? "thinking…"
                              : state === "failed"
                                ? "failed"
                                : state === "done"
                                  ? "answered"
                                  : department.name}
                      </span>
                    </span>
                  </button>

                  {!inRoom ? null : state === "done" ? (
                    <button
                      type="button"
                      aria-label={`Jump to ${department.personaName || department.name}`}
                      onClick={() => jumpTo(department.id)}
                      className="md-state relative z-10 grid h-7 w-7 flex-none place-items-center rounded-full text-success"
                    >
                      <CheckIcon className="h-3.5 w-3.5" />
                    </button>
                  ) : state === "failed" ? (
                    <span className="md-label-sm flex-none text-error">!</span>
                  ) : (
                    <StatusDot
                      status={state === "idle" ? "offline" : "busy"}
                      animate={state !== "idle"}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </aside>
      </div>

      {/* Composer */}
      <div className="flex-none border-t border-outline-variant px-4 medium:px-6 py-4">
        <div className="measure-read">
          {running && currentRound ? (
            <Progress
              answered={answeredCount}
              total={currentRound.responses.length}
              waiting={currentRound.responses
                .filter((r) => r.pending)
                .map((r) => departmentOf(r.departmentId)?.personaName ?? "")
                .filter(Boolean)}
            />
          ) : null}

          <div className="flex items-end gap-2 rounded-3xl border border-outline-variant bg-lowest py-2 pl-4 pr-2 transition-colors focus-within:border-primary">
            <textarea
              ref={inputRef}
              value={question}
              rows={1}
              placeholder={
                thread && !running ? "Ask a follow up…" : "Ask the room…"
              }
              onChange={(event) => {
                setQuestion(event.target.value);
                const el = event.target;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void ask(false);
                }
              }}
              className="md-body max-h-[200px] min-h-10 w-full min-w-0 resize-none bg-transparent py-2 text-on-surface placeholder:text-on-variant/70 focus:outline-none"
            />
            {running ? (
              <Button
                variant="outlined"
                className="flex-none"
                onClick={() => abortRef.current?.abort()}
              >
                Stop
              </Button>
            ) : (
              <Button
                className="flex-none"
                disabled={!question.trim() || asking.length === 0}
                onClick={() => void ask(false)}
              >
                {thread
                  ? "Ask again"
                  : asking.length === departments.length
                    ? "Ask everyone"
                    : `Ask ${asking.length}`}
              </Button>
            )}
          </div>

          <div className="filter-row mt-2.5">
            <Chip
              selected={settings.roomBrevity !== "standard"}
              title="Length of each reply."
              onClick={() =>
                void updateSettings({
                  roomBrevity: settings.roomBrevity === "standard" ? "tight" : "standard",
                })
              }
            >
              {settings.roomBrevity === "standard" ? "Standard" : "Tight"} ·{" "}
              {ROOM_BUDGET[settings.roomBrevity ?? "tight"]} words each
            </Chip>
            <Chip selected={synthesize} onClick={() => setSynthesize((value) => !value)}>
              {synthesize ? <CheckIcon className="h-3.5 w-3.5" /> : null}
              {ceo?.personaName ?? "CEO"} reads across the room
            </Chip>
            {ready &&
            !hasKeyFor(settings.model, {
              serverKeys,
              workspaceKeys,
              browserKey: settings.apiKey,
            }) ? (
              <span className="md-label text-warning">
                No API key yet. Add one in{" "}
                <Link href="/settings" className="underline">
                  Settings
                </Link>
                .
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Progress while the room answers. Naming who is still out makes the wait feel
 * bounded rather than open ended, and the bar gives the finish line a shape.
 */
function Progress({
  answered,
  total,
  waiting,
}: {
  answered: number;
  total: number;
  waiting: string[];
}) {
  return (
    <div className="mb-3">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="md-label text-on-variant">
          {answered} of {total} answered
        </span>
        <span className="md-label-sm truncate text-on-variant/75">
          {waiting.length ? `waiting on ${waiting.join(", ")}` : "wrapping up"}
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-highest">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
          style={{ width: `${total ? (answered / total) * 100 : 0}%` }}
        />
      </div>
    </div>
  );
}

function Opening({
  departments,
  ceoName,
}: {
  departments: Department[];
  ceoName: string | undefined;
}) {
  return (
    <div className="animate-rise rounded-3xl border border-outline-variant bg-container/60 px-7 py-9 text-center">
      <div className="mb-4 flex flex-wrap justify-center gap-1.5">
        {departments.map((department) => (
          <DepartmentAvatar
            key={department.id}
            department={department}
            size={40}
            title={`${department.personaName}, ${department.roleTitle}`}
            className="shadow-e1 ring-2"
            ringColor={departmentAccent(department.id).dot}
          />
        ))}
      </div>
      <h2 className="md-title-lg">Ask every department at once</h2>
    </div>
  );
}

function HeadMessage({
  response,
  department,
  onSave,
}: {
  response: AllHandsResponse;
  department: Department | undefined;
  onSave: () => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const node = bodyRef.current;
    if (!node) return;
    setOverflowing(node.scrollHeight > COLLAPSE_AT + 40);
  }, [response.content]);

  const collapsed = overflowing && !expanded;
  const accent = departmentAccent(response.departmentId);

  return (
    <div id={`msg-${response.departmentId}`} className="animate-rise group flex gap-3">
      {department ? (
        <DepartmentAvatar
          department={department}
          size={36}
          title={department.roleTitle}
          className="mt-1 shadow-e1"
        />
      ) : (
        <span aria-hidden className="mt-1 h-9 w-9 flex-none rounded-full bg-high" />
      )}

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-baseline gap-2">
          <span className="md-title" style={{ color: accent.dot }}>
            {department?.personaName || department?.name || response.departmentId}
          </span>
          <span className="md-label-sm truncate text-on-variant/75">
            {department?.roleTitle}
          </span>
          {response.pending ? (
            <span className="flex items-center gap-1" title="Still replying">
              <span className="typing-dot" style={{ background: accent.dot }} />
              <span
                className="typing-dot"
                style={{ background: accent.dot, animationDelay: "0.15s" }}
              />
              <span
                className="typing-dot"
                style={{ background: accent.dot, animationDelay: "0.3s" }}
              />
            </span>
          ) : null}
        </div>

        <div
          className={cx(
            "relative rounded-3xl rounded-tl-lg px-4 py-3 shadow-e1",
            // A left edge in the department's own colour, so eight replies
            // arriving at once are told apart without reading the names.
            "border-l-4",
            response.error ? "bg-error-container text-on-error-container" : "bg-container",
            response.pending && "animate-pulse-edge",
          )}
          style={
            response.error
              ? undefined
              : { borderLeftColor: accent.dot, background: accent.soft }
          }
        >
          <div
            ref={bodyRef}
            style={collapsed ? { maxHeight: COLLAPSE_AT, overflow: "hidden" } : undefined}
          >
            {response.content ? (
              <Markdown>{response.content}</Markdown>
            ) : (
              <p className="md-body text-on-variant/75">Thinking…</p>
            )}
          </div>

          {collapsed ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 rounded-b-3xl bg-gradient-to-t from-[var(--md-container)] to-transparent" />
          ) : null}
        </div>

        <div className="mt-1.5 flex items-center gap-1">
          {overflowing ? (
            <button
              onClick={() => setExpanded((value) => !value)}
              className="md-state md-label-sm flex items-center gap-1 rounded-lg px-2 py-1 text-primary"
            >
              <ChevronIcon
                className={cx("h-3.5 w-3.5 transition-transform", expanded && "rotate-90")}
              />
              {expanded ? "Show less" : "Show more"}
            </button>
          ) : null}

          {!response.pending && !response.error ? (
            <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <button
                onClick={async (event) => {
                  createRipple(event);
                  await navigator.clipboard.writeText(response.content);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1600);
                }}
                className="md-state md-label-sm flex items-center gap-1.5 rounded-lg px-2 py-1 text-on-variant"
              >
                {copied ? (
                  <CheckIcon className="h-3.5 w-3.5" />
                ) : (
                  <CopyIcon className="h-3.5 w-3.5" />
                )}
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                onClick={async (event) => {
                  createRipple(event);
                  await onSave();
                  setSaved(true);
                  setTimeout(() => setSaved(false), 2400);
                }}
                className="md-state md-label-sm flex items-center gap-1.5 rounded-lg px-2 py-1 text-on-variant"
              >
                {saved ? (
                  <CheckIcon className="h-3.5 w-3.5" />
                ) : (
                  <BookmarkIcon className="h-3.5 w-3.5" />
                )}
                {saved ? "Saved" : "Save"}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * The CEO's read closes every round. It is the last thing in the round and the
 * only message styled differently, because it is the part worth remembering.
 */
function SynthesisMessage({
  ceo,
  text,
  error,
}: {
  ceo: Department | undefined;
  text: string;
  error?: boolean;
}) {
  return (
    <div className="animate-rise flex gap-3">
      {ceo ? (
        <DepartmentAvatar department={ceo} size={36} className="mt-1 shadow-e2" />
      ) : (
        <span aria-hidden className="mt-1 h-9 w-9 flex-none rounded-full bg-primary" />
      )}
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-baseline gap-2">
          <span className="md-title">{ceo?.personaName ?? "CEO"}</span>
          <span className="md-label-sm text-primary">
            <SparkIcon className="mr-1 inline h-3 w-3" />
            the call
          </span>
        </div>
        <div
          className={cx(
            "rounded-3xl rounded-tl-lg px-4 py-3 shadow-e2",
            error
              ? "bg-error-container text-on-error-container"
              : "bg-primary-container text-on-primary-container",
          )}
        >
          <Markdown>{text}</Markdown>
        </div>
      </div>
    </div>
  );
}
