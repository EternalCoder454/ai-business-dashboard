"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CheckIcon, DocIcon, PlusIcon, SparkIcon, UploadIcon, cx } from "./ui";
import { createRipple } from "./ui/ripple";
import type { WebSearchMode } from "@/lib/types";

/** The settings that open a panel of their own rather than sitting in the list. */
type SubmenuId = "search" | "effort" | "brevity";

/**
 * The one control at the left of the composer, and everything it can add.
 *
 * There were two icon buttons here, a paperclip and a document, and adding web
 * search would have made three, all of them unlabelled circles a person has to
 * hover to identify. One plus that opens a named list scales: a fourth thing
 * costs a row rather than another guessable glyph.
 *
 * Web search belongs here rather than only in Integrations. Integrations is
 * where an administrator puts the key and decides the business will pay for
 * searching at all, which is a decision made once. Whether a particular head
 * should be reaching for the web is a decision made while working, by whoever
 * is working, and it was two screens away from the message that needed it.
 * Both switches still apply, and the business's is the outer one: this cannot
 * turn on something the business has switched off.
 */
export function ComposerMenu({
  onAddFiles,
  onFromLibrary,
  libraryCount,
  search,
  effort,
  brevity,
  synthesis,
}: {
  onAddFiles?: () => void;
  onFromLibrary?: () => void;
  /** How many Library files this department can reach, for the row's label. */
  libraryCount: number;
  /**
   * Absent when the business has not turned searching on at all, which is the
   * difference between a head choosing not to search and a business that
   * cannot. Offering a control that does nothing is worse than offering none.
   *
   * `perplexity` says whether that engine is worth listing: it needs a second
   * paid account, and a row that always fails is not a choice.
   */
  search?: {
    mode: WebSearchMode;
    perplexity: boolean;
    onPick: (mode: WebSearchMode) => void;
  };
  /**
   * How hard the head thinks, where the model takes the setting at all.
   *
   * Absent when it does not, rather than shown and inert: Haiku 4.5 and
   * anything older answer 400 to it, so a control there would be a switch that
   * breaks the next message.
   *
   * `levels` is what this business allows, not what exists. The ceiling is
   * enforced on the server as well, and has to be, but there is no reason to
   * offer somebody a setting that would be quietly reduced on the way out.
   */
  effort?: {
    current: string;
    levels: { id: string; label: string; hint: string }[];
    onPick: (effort: string) => void;
  };
  /**
   * How long each head's answer runs, in a meeting.
   *
   * Meetings had these as chips under the composer while the chat had the same
   * kind of choice inside this menu, so the two composers disagreed about where
   * the settings live. They are one control now.
   */
  brevity?: {
    current: string;
    levels: { id: string; label: string; detail: string }[];
    onPick: (id: string) => void;
  };
  /** Whether the orchestrator reads across the room at the end. */
  synthesis?: { on: boolean; label: string; detail: string; onToggle: () => void };
}) {
  const [open, setOpen] = useState(false);
  /** Which settings panel is open beside the menu, if any. */
  const [submenu, setSubmenu] = useState<SubmenuId | null>(null);
  const wrapper = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      // Escape closes the panel first and the menu second, so it retraces the
      // way in rather than throwing both away at once.
      if (event.key !== "Escape") return;
      if (submenu) setSubmenu(null);
      else setOpen(false);
    };
    // Pointerdown rather than click, so the menu is gone before whatever was
    // clicked behind it reacts. Same as the account menu.
    const onOutside = (event: PointerEvent) => {
      if (wrapper.current?.contains(event.target as Node)) return;
      setOpen(false);
      setSubmenu(null);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onOutside);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onOutside);
    };
  }, [open, submenu]);

  const rows: ReactNode[] = [];

  if (onAddFiles) {
    rows.push(
      <MenuRow
        key="files"
        icon={<UploadIcon className="h-4 w-4" />}
        label="Add files"
        detail="Images, PDFs, Word and text"
        onClick={() => {
          setOpen(false);
          onAddFiles();
        }}
      />,
    );
  }

  if (onFromLibrary && libraryCount > 0) {
    rows.push(
      <MenuRow
        key="library"
        icon={<DocIcon className="h-4 w-4" />}
        label="From the Library"
        detail={String(libraryCount) + " shared with this department"}
        onClick={() => {
          setOpen(false);
          onFromLibrary();
        }}
      />,
    );
  }

  /*
   * The two settings, each behind one row that opens a panel beside this one.
   *
   * They were both spelled out in place, three choices and five, which made a
   * menu of ten rows out of a menu of two. Everything here is something you do
   * to the next message, and the two that are settings rather than actions do
   * not need to shout their options at somebody who came to attach a file.
   *
   * The row carries the current answer, so the menu still says how the head is
   * set without anything being opened.
   */
  const groups: {
    id: SubmenuId;
    label: string;
    value: string;
    choices: { id: string; label: string; detail: string }[];
    onPick: (id: string) => void;
  }[] = [];

  if (search) {
    /*
     * Off, the head's own provider, or Perplexity are alternatives rather than
     * levels, so they are a set to pick from rather than something to cycle.
     *
     * Perplexity is listed only where a key exists, since it is a second paid
     * account and the row would otherwise be an offer the panel cannot keep.
     */
    groups.push({
      id: "search",
      label: "Search the web",
      value:
        search.mode === "off"
          ? "Off"
          : search.mode === "native"
            ? "This head's own provider"
            : "Perplexity",
      choices: [
        { id: "off", label: "Off", detail: "Answers from what it already knows" },
        { id: "native", label: "Native", detail: "This head's own provider searches" },
        ...(search.perplexity
          ? [
              {
                id: "perplexity",
                label: "Perplexity",
                detail: "The same search whatever model it runs on",
              },
            ]
          : []),
      ],
      onPick: (id) => search.onPick(id as WebSearchMode),
    });
  }

  if (brevity && brevity.levels.length > 1) {
    groups.push({
      id: "brevity",
      label: "Reply length",
      value:
        brevity.levels.find((level) => level.id === brevity.current)?.label ?? brevity.current,
      choices: brevity.levels.map((level) => ({
        id: level.id,
        label: level.label,
        detail: level.detail,
      })),
      onPick: brevity.onPick,
    });
  }

  if (effort && effort.levels.length > 1) {
    groups.push({
      id: "effort",
      label: "Thinking effort",
      value:
        effort.levels.find((level) => level.id === effort.current)?.label ?? effort.current,
      choices: effort.levels.map((level) => ({
        id: level.id,
        label: level.label,
        detail: level.hint,
      })),
      onPick: effort.onPick,
    });
  }

  if (synthesis) {
    rows.push(
      <MenuRow
        key="synthesis"
        icon={<SparkIcon className="h-4 w-4" />}
        label={synthesis.label}
        detail={synthesis.detail}
        checked={synthesis.on}
        toggle
        // Stays open, so the tick is visible where it was pressed.
        onClick={synthesis.onToggle}
      />,
    );
  }

  if (rows.length === 0 && groups.length === 0) return null;

  const active = groups.find((group) => group.id === submenu);

  return (
    <div ref={wrapper} className="relative flex-none">
      <button
        type="button"
        onClick={(event) => {
          createRipple(event);
          setOpen((value) => !value);
          setSubmenu(null);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Add to this message"
        className="md-state md-target grid h-10 w-10 place-items-center rounded-lg text-on-variant"
      >
        <PlusIcon className="h-5 w-5" />
      </button>

      {open ? (
        <>
          <div
            role="menu"
            className={cx(
              // Upwards, because the composer is at the bottom of the screen and
              // a menu below it would open off the edge.
              "absolute bottom-12 left-0 z-50 w-64 overflow-hidden rounded-2xl",
              "border border-outline-variant bg-container shadow-e3",
              /*
               * On a narrow window the panel beside this one has nowhere to go,
               * so it lands on top instead and this steps out of the way. The
               * panel's own header is the way back.
               */
              active && "hidden medium:block",
            )}
          >
            {rows}
            {groups.length > 0 ? (
              <div className={rows.length > 0 ? "border-t border-outline-variant" : undefined}>
                {groups.map((group) => (
                  <MenuRow
                    key={group.id}
                    icon={<SparkIcon className="h-4 w-4" />}
                    label={group.label}
                    detail={group.value}
                    opensPanel
                    highlighted={submenu === group.id}
                    onClick={() => setSubmenu(submenu === group.id ? null : group.id)}
                  />
                ))}
              </div>
            ) : null}
          </div>

          {active ? (
            <div
              role="menu"
              aria-label={active.label}
              className={cx(
                "absolute bottom-12 left-0 z-50 w-64 overflow-hidden rounded-2xl",
                "border border-outline-variant bg-container shadow-e3",
                // Beside the menu where there is room, over it where there is not.
                "medium:left-[17rem]",
              )}
            >
              <button
                type="button"
                onClick={() => setSubmenu(null)}
                className="md-state flex w-full items-center gap-2 border-b border-outline-variant px-3 py-2 text-left text-on-variant"
              >
                <BackChevron className="h-4 w-4 flex-none" />
                <span className="md-label-sm">{active.label}</span>
              </button>
              {active.choices.map((choice) => (
                <MenuRow
                  key={choice.id}
                  icon={<SparkIcon className="h-4 w-4" />}
                  label={choice.label}
                  detail={choice.detail}
                  checked={
                    (active.id === "search"
                      ? search?.mode
                      : active.id === "brevity"
                        ? brevity?.current
                        : effort?.current) === choice.id
                  }
                  // Stays open. Somebody who has just changed how a head answers
                  // may want to see that it took, and closing hides the answer.
                  onClick={() => active.onPick(choice.id)}
                />
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function BackChevron({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="m14 6-6 6 6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MenuRow({
  icon,
  label,
  detail,
  checked,
  toggle,
  opensPanel,
  highlighted,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  detail: string;
  /** Present only on a row that is a switch rather than an action. */
  checked?: boolean;
  /**
   * A switch that stands alone rather than one of a set.
   *
   * Only the role differs, and it is the difference between a screen reader
   * saying "one of three, selected" about something that is simply on.
   */
  toggle?: boolean;
  /** A row that opens a panel beside this one rather than doing something. */
  opensPanel?: boolean;
  /** That panel is the one currently open. */
  highlighted?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role={
        checked === undefined ? "menuitem" : toggle ? "menuitemcheckbox" : "menuitemradio"
      }
      aria-checked={checked}
      aria-haspopup={opensPanel ? "menu" : undefined}
      aria-expanded={opensPanel ? highlighted : undefined}
      onClick={(event) => {
        createRipple(event);
        onClick();
      }}
      className={cx(
        "md-state flex w-full items-center gap-3 px-3 py-2.5 text-left",
        highlighted && "bg-secondary-container text-on-secondary-container",
      )}
    >
      <span className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-highest text-on-variant">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="md-body block truncate">{label}</span>
        <span className="md-body-sm block truncate text-on-variant/75">{detail}</span>
      </span>
      {checked ? <CheckIcon className="h-4 w-4 flex-none text-primary" /> : null}
      {opensPanel ? (
        <BackChevron className="h-4 w-4 flex-none rotate-180 text-on-variant/70" />
      ) : null}
    </button>
  );
}
