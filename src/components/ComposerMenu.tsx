"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CheckIcon, DocIcon, PlusIcon, SparkIcon, UploadIcon, cx } from "./ui";
import { createRipple } from "./ui/ripple";

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
}: {
  onAddFiles?: () => void;
  onFromLibrary?: () => void;
  /** How many Library files this department can reach, for the row's label. */
  libraryCount: number;
  /**
   * Absent when the business has not turned searching on at all, which is the
   * difference between a head that may not search and a business that cannot.
   * Offering a switch that does nothing is worse than offering none.
   */
  search?: { on: boolean; onToggle: () => void };
}) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    // Pointerdown rather than click, so the menu is gone before whatever was
    // clicked behind it reacts. Same as the account menu.
    const onOutside = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onOutside);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onOutside);
    };
  }, [open]);

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
        detail={`${libraryCount} shared with this department`}
        onClick={() => {
          setOpen(false);
          onFromLibrary();
        }}
      />,
    );
  }

  if (search) {
    rows.push(
      <MenuRow
        key="search"
        icon={<SparkIcon className="h-4 w-4" />}
        label="Search the web"
        detail={search.on ? "On for this head" : "Off for this head"}
        checked={search.on}
        // Stays open. A switch is a thing somebody may want to see the state of
        // after flipping it, and closing the menu hides the answer.
        onClick={search.onToggle}
      />,
    );
  }

  if (rows.length === 0) return null;

  return (
    <div ref={wrapper} className="relative flex-none">
      <button
        type="button"
        onClick={(event) => {
          createRipple(event);
          setOpen((value) => !value);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Add to this message"
        className="md-state md-target grid h-10 w-10 place-items-center rounded-full text-on-variant"
      >
        <PlusIcon className="h-5 w-5" />
      </button>

      {open ? (
        <div
          role="menu"
          className={cx(
            // Upwards, because the composer is at the bottom of the screen and
            // a menu below it would open off the edge.
            "absolute bottom-12 left-0 z-50 w-64 overflow-hidden rounded-2xl",
            "border border-outline-variant bg-container shadow-e3",
          )}
        >
          {rows}
        </div>
      ) : null}
    </div>
  );
}

function MenuRow({
  icon,
  label,
  detail,
  checked,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  detail: string;
  /** Present only on a row that is a switch rather than an action. */
  checked?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role={checked === undefined ? "menuitem" : "menuitemcheckbox"}
      aria-checked={checked}
      onClick={(event) => {
        createRipple(event);
        onClick();
      }}
      className="md-state flex w-full items-center gap-3 px-3 py-2.5 text-left"
    >
      <span className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-highest text-on-variant">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="md-body block truncate">{label}</span>
        <span className="md-body-sm block truncate text-on-variant/75">{detail}</span>
      </span>
      {checked ? <CheckIcon className="h-4 w-4 flex-none text-primary" /> : null}
    </button>
  );
}
