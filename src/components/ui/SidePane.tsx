"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cx } from "./index";
import {
  clampWidth,
  setPaneHidden,
  setPaneWidth,
  usePane,
} from "@/lib/paneLayout";

/**
 * A side column somebody can drag, fold away, and get back.
 *
 * Every list in the panel sat in a column of a width chosen here and unarguable
 * there. In a conversation two of them stack up before the thread starts, which
 * on a 1600px window came to 24% of it. That is a defensible default and a poor
 * rule: how much furniture is worth the room depends on the screen and on what
 * somebody is doing right now.
 *
 * Three ways to change it, because people reach for different ones. Drag the
 * edge. Press the edge and use the arrow keys, for anybody not using a mouse.
 * Or fold it away entirely, which is the one that matters when the thread is
 * the work and the list is not.
 *
 * Folded is a rail rather than nothing. A pane that vanishes completely takes
 * the way back with it, and then the only way to find it again is to remember
 * that it exists.
 */

/** Below this the pane is the whole screen, so it gets no width and no handle. */
const BREAKPOINTS = { expanded: 840, large: 1200 } as const;

export interface SidePaneProps {
  /** Where the width is remembered. Stable across releases, not a title. */
  id: string;
  breakpoint: keyof typeof BREAKPOINTS;
  defaultWidth: number;
  minWidth?: number;
  maxWidth?: number;
  /** What the fold button says, for a screen reader. */
  label: string;
  className?: string;
  /**
   * Scroll the contents rather than letting them handle it.
   *
   * The handle and the fold button are positioned against the pane, so the pane
   * itself must not be the thing that scrolls: `bottom-2` inside a scrolling
   * box is the bottom of the content, which for a long list is a button nobody
   * will ever see. Panes whose child already owns its scrolling leave this off.
   */
  scroll?: boolean;
  /** Padding for the scrolling area, when `scroll` is on. */
  contentClassName?: string;
  children: ReactNode;
}

/** How much an arrow key moves the edge. Shift multiplies it. */
const NUDGE = 16;

const FOLDED = 28;

/**
 * Everything about dragging one edge, without any opinion about the column.
 *
 * Split out because the navigation is a pane too and does not want the rest of
 * this: it already folds to the icon rail, which is a better fold than a strip
 * with a chevron on it, and it has its own way back. What it was missing was
 * only the ability to be a different width.
 */
export function usePaneResize({
  id,
  breakpoint,
  defaultWidth,
  minWidth = 200,
  maxWidth = 560,
}: {
  id: string;
  breakpoint: keyof typeof BREAKPOINTS;
  defaultWidth: number;
  minWidth?: number;
  maxWidth?: number;
}) {
  const stored = usePane(id);
  const [wide, setWide] = useState(false);
  const [dragging, setDragging] = useState(false);
  const paneRef = useRef<HTMLDivElement | null>(null);

  /*
   * Whether this is a side column at all.
   *
   * Below the breakpoint the pane is the screen: it fills the window, the
   * thread waits its turn, and the shell's own back arrow is how you leave. An
   * inline width there would pin the list to 320px on a phone, and a fold
   * button would offer to hide the only thing on screen.
   */
  useEffect(() => {
    const query = window.matchMedia(
      `(min-width: ${BREAKPOINTS[breakpoint]}px)`,
    );
    const sync = () => setWide(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, [breakpoint]);

  /*
   * A ceiling that also answers to the window, not only to the pane.
   *
   * A width stored on a wide monitor comes back on a laptop, and 560px of list
   * against 700px of window is a pane that has eaten the page. Half the window
   * is the most any one column may hold whatever is remembered.
   */
  const [ceiling, setCeiling] = useState(maxWidth);
  useEffect(() => {
    const measure = () =>
      setCeiling(Math.max(minWidth, Math.min(maxWidth, window.innerWidth / 2)));
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [minWidth, maxWidth]);

  const width = clampWidth(stored.width ?? defaultWidth, minWidth, ceiling);

  const resizeTo = useCallback(
    (next: number) => setPaneWidth(id, clampWidth(next, minWidth, ceiling)),
    [id, minWidth, ceiling],
  );

  /*
   * Dragging is on the window rather than on the handle.
   *
   * The pointer leaves a 5px strip on the first fast movement, and a handle
   * that only listens to itself stops following at exactly the moment somebody
   * is dragging hardest. Pointer capture would do it too; this also survives
   * the pointer crossing an iframe.
   */
  useEffect(() => {
    if (!dragging) return;

    const move = (event: PointerEvent) => {
      const left = paneRef.current?.getBoundingClientRect().left ?? 0;
      resizeTo(event.clientX - left);
    };
    const stop = () => setDragging(false);

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    /*
     * Nothing selects while the edge is moving. Without this a drag across the
     * list highlights every conversation title it passes over, which looks
     * like the app has misunderstood the gesture.
     */
    const previous = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      document.body.style.userSelect = previous;
      document.body.style.cursor = "";
    };
  }, [dragging, resizeTo]);

  return {
    stored,
    wide,
    width,
    ceiling,
    minWidth,
    dragging,
    setDragging,
    paneRef,
    resizeTo,
  };
}

export function SidePane({
  id,
  breakpoint,
  defaultWidth,
  minWidth = 200,
  maxWidth = 560,
  label,
  className,
  scroll = false,
  contentClassName,
  children,
}: SidePaneProps) {
  const {
    stored,
    wide,
    width,
    ceiling,
    dragging,
    setDragging,
    paneRef,
    resizeTo,
  } = usePaneResize({
    id,
    breakpoint,
    defaultWidth,
    minWidth,
    maxWidth,
  });

  const hidden = wide && Boolean(stored.hidden);

  /*
   * One element whose width changes, rather than two that swap.
   *
   * Folding used to return a different element entirely, so there was nothing
   * for a transition to run on: the pane was 320px wide and then it was 28,
   * with no frames in between. Keeping one element and moving its width is what
   * makes the fold something you can watch, and watching it is what tells you
   * the list went somewhere rather than closed.
   *
   * The contents keep their full width inside a wrapper that clips them. Left
   * to reflow, four hundred milliseconds of a conversation list re-wrapping
   * every title through every width between 320 and 28 is not an animation, it
   * is a seizure.
   */
  return (
    <div
      ref={paneRef}
      className={cx(
        "relative min-h-0 min-w-0 flex-1 flex-col",
        breakpoint === "large"
          ? "large:flex large:flex-none large:border-r large:border-outline-variant"
          : "expanded:flex expanded:flex-none expanded:border-r expanded:border-outline-variant",
        // Never while dragging: an edge that eases towards the pointer instead
        // of following it feels like the window is stuck, not like it is smooth.
        wide && !dragging && "motion-safe:transition-[width] motion-safe:duration-200 ease-out",
        hidden && "bg-low",
        className,
      )}
      style={wide ? { width: hidden ? FOLDED : width, flex: "none" } : undefined}
    >
      <div
        className={cx(
          "flex min-h-0 w-full flex-1 flex-col overflow-hidden",
          hidden && "pointer-events-none opacity-0 motion-safe:transition-opacity",
        )}
      >
        <div
          className="flex min-h-0 flex-1 flex-col"
          // The width it has when open, held through the fold so the contents
          // slide out of view rather than being squeezed through it.
          style={wide ? { width } : undefined}
        >
          {scroll ? (
            <div className={cx("min-h-0 flex-1 overflow-y-auto", contentClassName)}>
              {children}
            </div>
          ) : (
            children
          )}
        </div>
      </div>

      {wide && hidden ? <PaneUnfoldButton id={id} label={label} folded /> : null}

      {wide && !hidden ? (
        <>
          <PaneResizeHandle
            id={id}
            label={label}
            width={width}
            minWidth={minWidth}
            maxWidth={ceiling}
            dragging={dragging}
            onStart={() => setDragging(true)}
            onResize={resizeTo}
            onFold={() => setPaneHidden(id, true)}
          />

          <PaneFoldButton id={id} label={label} />
        </>
      ) : null}
    </div>
  );
}

/**
 * Fold this pane away. Bottom right of the column, on every pane there is.
 *
 * It replaced a control nobody could find. The navigation used to fold by
 * clicking the company mark, which showed a chevron over itself on hover and
 * looked exactly like a logo the rest of the time, so the only people who knew
 * the sidebar folded at all were the people who had been told.
 *
 * The absolute goes on a wrapper rather than on the button, because `md-state`
 * sets `position: relative` for its state layer and loads after Tailwind, so
 * `absolute` on the same element loses silently. The button then sat eight
 * pixels outside the pane it was folding.
 */
export function PaneFoldButton({
  id,
  label,
  onFold,
}: {
  id: string;
  label: string;
  /**
   * How this pane folds, when simply setting the flag is not enough.
   *
   * The navigation needs it. Its width is fit-content, no browser will animate
   * from an intrinsic size to a number, and measuring in the same breath as
   * folding does not help because React batches the two and the element never
   * renders at the measured width. So it takes the measurement, waits for it to
   * be painted, and only then folds.
   */
  onFold?: () => void;
}) {
  return (
    <div className="absolute bottom-2 right-2 z-10">
      <button
        type="button"
        onClick={() => (onFold ? onFold() : setPaneHidden(id, true))}
        aria-label={`Hide ${label}`}
        title={`Hide ${label}`}
        /*
         * A background of its own at rest, not only on hover. It floats over
         * the end of the list, and against a full one a bare chevron reads as
         * part of whatever row it happens to land on.
         */
        className="md-state grid h-8 w-8 place-items-center rounded-full border border-outline-variant bg-low text-on-variant shadow-e1 transition-colors hover:text-on-surface"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
    </div>
  );
}

/** Bring it back. Sits where the fold button was, on whatever is left behind. */
export function PaneUnfoldButton({
  id,
  label,
  className,
  folded,
}: {
  id: string;
  label: string;
  className?: string;
  /**
   * Sitting on a pane that has folded to a rail, rather than in a column of
   * its own. It is positioned rather than laid out, because the pane it is on
   * still holds its contents at full width underneath, clipped.
   */
  folded?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => setPaneHidden(id, false)}
      aria-label={`Show ${label}`}
      title={`Show ${label}`}
      className={cx(
        "md-state grid place-items-center text-on-variant transition-colors hover:text-on-surface",
        folded && "absolute inset-x-0 top-0 z-10 h-10",
        className ?? (folded ? "" : "h-10 w-full flex-none"),
      )}
    >
      <ChevronRight className="h-4 w-4" />
    </button>
  );
}

/**
 * The strip you grab, sitting over the border rather than beside it.
 *
 * Wider than it looks. The line is 1px and a 1px target is a target nobody
 * hits, so the hit area is 8px and centred on it. Invisible until the pointer
 * is near, which is the convention for these and keeps a page with three panes
 * from looking like a spreadsheet.
 *
 * A real separator, not a div with a cursor: it takes focus, reports its width
 * and its bounds, and answers the arrow keys. Somebody who cannot use a mouse
 * would otherwise be the only person stuck with the width shipped here.
 */
export function PaneResizeHandle({
  id,
  label,
  width,
  minWidth,
  maxWidth,
  dragging,
  onStart,
  onResize,
  onFold,
}: {
  id: string;
  label: string;
  width: number;
  minWidth: number;
  maxWidth: number;
  dragging: boolean;
  onStart: () => void;
  onResize: (width: number) => void;
  /** Absent where a pane folds some other way, as the navigation does. */
  onFold?: () => void;
}) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${label}`}
      aria-valuenow={width}
      aria-valuemin={minWidth}
      aria-valuemax={maxWidth}
      tabIndex={0}
      onPointerDown={(event) => {
        // Left button only, or a right click starts a drag that never ends.
        if (event.button !== 0) return;
        event.preventDefault();
        onStart();
      }}
      // Back to the width it shipped with, which is quicker than dragging for
      // it and is what a double click on an edge means everywhere else.
      onDoubleClick={() => setPaneWidth(id, undefined)}
      onKeyDown={(event) => {
        const step = event.shiftKey ? NUDGE * 4 : NUDGE;
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          onResize(width - step);
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          onResize(width + step);
        } else if (onFold && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onFold();
        }
      }}
      className={cx(
        "group absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize touch-none",
        "focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-primary",
      )}
    >
      <span
        aria-hidden
        className={cx(
          "pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 rounded-full transition-colors",
          dragging ? "bg-primary" : "bg-transparent group-hover:bg-primary/60",
        )}
      />
    </div>
  );
}

function ChevronLeft({ className }: { className?: string }) {
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

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="m10 6 6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
