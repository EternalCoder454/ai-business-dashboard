"use client";

import Link from "next/link";
import { AnimatePresence, useReducedMotion, m } from "motion/react";
import {
  forwardRef,
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type MouseEvent,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import type { DepartmentStatus } from "@/lib/types";
import { createRipple } from "./ripple";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/*
 * Button
 */

type ButtonVariant = "filled" | "tonal" | "outlined" | "text" | "danger";
type ButtonSize = "sm" | "md";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  filled: "bg-primary text-on-primary shadow-e1 hover:shadow-e2",
  tonal: "bg-secondary-container text-on-secondary-container",
  outlined: "border border-outline-variant text-primary bg-transparent",
  text: "text-primary bg-transparent",
  danger: "border border-error/40 text-error bg-transparent",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[0.8125rem]",
  md: "h-10 px-5 text-[0.875rem]",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "filled", size = "md", icon, className, children, onClick, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      onClick={(event: MouseEvent<HTMLButtonElement>) => {
        createRipple(event);
        onClick?.(event);
      }}
      className={cx(
        "md-state inline-flex items-center justify-center gap-2 rounded-full font-medium",
        "transition-shadow duration-150 disabled:pointer-events-none disabled:opacity-[0.38]",
        BUTTON_SIZES[size],
        BUTTON_VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
});

/*
 * FAB
 */

export function Fab({
  label,
  onClick,
  className,
}: {
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={(event) => {
        createRipple(event);
        onClick();
      }}
      className={cx(
        "md-state fixed bottom-7 right-7 z-30 flex h-14 items-center gap-3 rounded-2xl",
        "bg-primary-container px-5 text-on-primary-container shadow-e3",
        "transition-transform duration-200 hover:-translate-y-0.5",
        className,
      )}
    >
      <PlusIcon className="h-5 w-5" />
      <span className="md-label">{label}</span>
    </button>
  );
}

/*
 * Card
 */

export function Card({
  children,
  className,
  elevated = true,
}: {
  children: ReactNode;
  className?: string;
  elevated?: boolean;
}) {
  return (
    <div
      className={cx(
        "rounded-2xl bg-container p-5",
        elevated ? "shadow-e1" : "border border-outline-variant",
        className,
      )}
    >
      {children}
    </div>
  );
}

/*
 * Chip
 */

export function Chip({
  children,
  tone = "neutral",
  selected = false,
  onClick,
  className,
  title,
  wrap = false,
}: {
  children: ReactNode;
  tone?: "neutral" | "primary" | "success" | "warning" | "error";
  selected?: boolean;
  onClick?: () => void;
  className?: string;
  title?: string;
  /** Lets the label run onto a second line instead of overflowing. */
  wrap?: boolean;
}) {
  const tones: Record<string, string> = {
    neutral: "text-on-variant",
    primary: "text-primary",
    success: "text-success",
    warning: "text-warning",
    error: "text-error",
  };

  const base = cx(
    "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 md-label",
    wrap ? "text-left" : "whitespace-nowrap",
    selected
      ? "border-transparent bg-secondary-container text-on-secondary-container"
      : cx("border-outline-variant bg-transparent", tones[tone]),
    className,
  );

  if (!onClick) {
    return (
      <span className={base} title={title}>
        {children}
      </span>
    );
  }

  return (
    <button
      type="button"
      title={title}
      onClick={(event) => {
        createRipple(event);
        onClick();
      }}
      // md-chip is a touch-size hook, not a look: a 28px chip is comfortable
      // to click and awkward to thumb, so it grows on a coarse pointer.
      className={cx(base, "md-chip md-state transition-colors")}
    >
      {children}
    </button>
  );
}

/*
 * Status dot
 */

const STATUS_COLOR: Record<DepartmentStatus, string> = {
  online: "var(--md-success)",
  busy: "var(--md-warning)",
  offline: "var(--md-outline)",
};

export const STATUS_LABEL: Record<DepartmentStatus, string> = {
  online: "Online",
  busy: "Busy",
  offline: "Offline",
};

export function StatusDot({
  status,
  animate = true,
}: {
  status: DepartmentStatus;
  animate?: boolean;
}) {
  return (
    <span
      aria-label={STATUS_LABEL[status]}
      // Compact windows drop the words beside it, so the dot has to answer for
      // itself when someone presses and holds.
      title={STATUS_LABEL[status]}
      className={animate && status === "online" ? "status-dot" : "status-dot [&::after]:hidden"}
      style={{ background: STATUS_COLOR[status] }}
    />
  );
}

/*
 * Form fields
 */

// min-w-0 matters more than it looks: a select's intrinsic minimum is the
// width of its longest option, and a grid or flex item is allowed to grow to
// its content's minimum. One long model name was widening every card on the
// settings page past the side of a phone.
const FIELD_BASE =
  "w-full min-w-0 rounded-xl border border-outline-variant bg-lowest md-body " +
  "text-on-surface placeholder:text-on-variant/70 transition-colors " +
  "focus:border-primary focus:outline-none";

/**
 * Field padding, as a prop rather than something a caller overrides.
 *
 * Passing `h-9 py-0` alongside the base's own `py-2.5` is a collision, and
 * which one wins is decided by the order Tailwind happens to emit them, not by
 * the call site. It lost: the Library's selects kept the 10px padding, kept a
 * 36px height, and squeezed a 24px line into the 14px left over, so every
 * label was cut off halfway down. A size never fights itself.
 */
const FIELD_SIZE = {
  sm: "px-3 py-1.5 text-[0.8125rem]",
  md: "px-3.5 py-2.5",
} as const;

type FieldSize = keyof typeof FIELD_SIZE;

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cx("block", className)}>
      <span className="md-label mb-1.5 block text-on-variant">{label}</span>
      {children}
      {hint ? <span className="md-label-sm mt-1.5 block text-on-variant/70">{hint}</span> : null}
    </label>
  );
}

// `size` is an HTML attribute on input and select, in characters. It is not
// useful on either of these and the name is worth more as the padding scale.
export const TextInput = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & { size?: FieldSize }
>(function TextInput({ className, size = "md", ...rest }, ref) {
  return <input ref={ref} className={cx(FIELD_BASE, FIELD_SIZE[size], className)} {...rest} />;
});

export const TextArea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { size?: FieldSize }
>(function TextArea({ className, size = "md", ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      className={cx(FIELD_BASE, FIELD_SIZE[size], "resize-y", className)}
      {...rest}
    />
  );
});

export function Select({
  className,
  size = "md",
  children,
  ...rest
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> & { size?: FieldSize }) {
  return (
    <select
      className={cx(
        FIELD_BASE,
        FIELD_SIZE[size],
        "cursor-pointer appearance-none",
        size === "sm" ? "pr-8" : "pr-9",
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
}

/*
 * Dialog
 */

export function Dialog({
  open,
  title,
  onClose,
  children,
  footer,
  width = "max-w-2xl",
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  /*
   * Which shape this is, so the two get the motion they should.
   *
   * A sheet rises from the edge it is attached to; a dialog grows in place.
   * Animating both the same way makes one of them wrong, and on a phone it is
   * the noticeable one.
   */
  const [sheet, setSheet] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 599px)");
    const sync = () => setSheet(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  /*
   * Motion rather than CSS here for one reason: an element being removed from
   * the tree cannot be animated by CSS, because it is already gone. Every
   * dialog in the panel used to vanish on the frame it closed while its scrim
   * faded, which reads as a glitch rather than as speed. AnimatePresence holds
   * it in the tree long enough to leave properly.
   *
   * Durations and easings are the same MD3 tokens the stylesheet uses, so this
   * matches everything animated in CSS rather than introducing a second feel.
   * Leaving is quicker than arriving and uses the accelerate curve: a thing on
   * its way out should not keep anybody waiting.
   */
  const enter = { duration: 0.3, ease: [0.05, 0.7, 0.1, 1] as const };
  const leave = { duration: 0.15, ease: [0.3, 0, 0.8, 0.15] as const };

  const hidden = reduced
    ? { opacity: 0 }
    : sheet
      ? { opacity: 0, y: 24 }
      : { opacity: 0, scale: 0.96 };
  const shown = reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 };

  return (
    <AnimatePresence>
      {open ? (
    <div className="fixed inset-0 z-50 flex items-end justify-center medium:items-center medium:p-4">
      <m.div
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={leave}
      />
      {/* A sheet on compact, rising from the edge the thumb is already near.
          A centred dialog from medium up, where there is room for one. */}
      <m.div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        // animate-sheet is gone: Motion owns this element's entrance now, and
        // running both would compound into a double slide.
        className={cx(
          "safe-bottom relative flex w-full flex-col overflow-hidden",
          "max-h-[92dvh] rounded-t-3xl bg-high shadow-e3",
          "medium:max-h-[86vh] medium:rounded-3xl",
          width,
        )}
        initial={hidden}
        animate={shown}
        exit={hidden}
        transition={enter}
      >
        <div className="flex justify-center pt-2 medium:hidden">
          <span className="sheet-handle" aria-hidden />
        </div>
        <div className="flex items-center justify-between border-b border-outline-variant px-4 py-3 medium:px-6 medium:py-4">
          <h2 className="md-title-lg">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="md-state md-target grid h-9 w-9 place-items-center rounded-full text-on-variant"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 medium:px-6 medium:py-5">{children}</div>
        {footer ? (
          <div className="flex justify-end gap-2 border-t border-outline-variant px-4 py-3 medium:px-6 medium:py-4">
            {footer}
          </div>
        ) : null}
      </m.div>
    </div>
      ) : null}
    </AnimatePresence>
  );
}

/*
 * Page scaffolding
 */


export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-outline-variant px-6 py-14 text-center">
      <div className="mb-3 text-3xl opacity-70">{icon}</div>
      <p className="md-title">{title}</p>
      <p className="md-body mt-1.5 max-w-md text-on-variant">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function LinkButton({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      onClick={createRipple}
      className={cx(
        "md-state inline-flex h-10 items-center justify-center gap-2 rounded-full",
        "bg-primary px-5 text-[0.875rem] font-medium text-on-primary shadow-e1",
        className,
      )}
    >
      {children}
    </Link>
  );
}

/*
 * Icons: inline so the app ships with no icon dependency
 */

type IconProps = { className?: string };

/**
 * A Material Symbol.
 *
 * Google exports these as a filled shape on a 960 grid drawn up from the
 * baseline, which is why the viewBox is negative. Inlining the path rather
 * than loading the icon font keeps the app dependency-free and costs nothing
 * on first paint.
 */
function symbol(d: string) {
  return function Icon({ className }: IconProps) {
    return (
      <svg
        viewBox="0 -960 960 960"
        fill="currentColor"
        aria-hidden
        className={className}
      >
        <path d={d} />
      </svg>
    );
  };
}

export const PlusIcon = symbol(
  "M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z",
);
export const CloseIcon = symbol(
  "m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z",
);
export const SendIcon = symbol(
  "M120-160v-640l760 320-760 320Zm80-120 474-200-474-200v140l240 60-240 60v140Zm0 0v-400 400Z",
);
/** Panels, for the dashboard. The org chart it replaced is gone. */
export const DashboardIcon = symbol(
  "M520-600v-240h320v240H520ZM120-440v-400h320v400H120Zm400 320v-400h320v400H520Zm-400 0v-240h320v240H120Zm80-400h160v-240H200v240Zm400 320h160v-240H600v240Zm0-480h160v-80H600v80ZM200-200h160v-80H200v80Zm160-320Zm240-160Zm0 240ZM360-280Z",
);
export const BriefcaseIcon = symbol(
  "M160-120q-33 0-56.5-23.5T80-200v-440q0-33 23.5-56.5T160-720h160v-80q0-33 23.5-56.5T400-880h160q33 0 56.5 23.5T640-800v80h160q33 0 56.5 23.5T880-640v440q0 33-23.5 56.5T800-120H160Zm240-600h160v-80H400v80Zm400 360H600v80H360v-80H160v160h640v-160Zm-360 0h80v-80h-80v80Zm-280-80h200v-80h240v80h200v-200H160v200Zm320 40Z",
);
export const DocIcon = symbol(
  "M320-240h320v-80H320v80Zm0-160h320v-80H320v80ZM240-80q-33 0-56.5-23.5T160-160v-640q0-33 23.5-56.5T240-880h320l240 240v480q0 33-23.5 56.5T720-80H240Zm280-520v-200H240v640h480v-440H520ZM240-800v200-200 640-640Z",
);
export const BuildingIcon = symbol(
  "M120-120v-560h160v-160h400v320h160v400H520v-160h-80v160H120Zm80-80h80v-80h-80v80Zm0-160h80v-80h-80v80Zm0-160h80v-80h-80v80Zm160 160h80v-80h-80v80Zm0-160h80v-80h-80v80Zm0-160h80v-80h-80v80Zm160 320h80v-80h-80v80Zm0-160h80v-80h-80v80Zm0-160h80v-80h-80v80Zm160 480h80v-80h-80v80Zm0-160h80v-80h-80v80Z",
);
export const GearIcon = symbol(
  "m370-80-16-128q-13-5-24.5-12T307-235l-119 50L78-375l103-78q-1-7-1-13.5v-27q0-6.5 1-13.5L78-585l110-190 119 50q11-8 23-15t24-12l16-128h220l16 128q13 5 24.5 12t22.5 15l119-50 110 190-103 78q1 7 1 13.5v27q0 6.5-2 13.5l103 78-110 190-118-50q-11 8-23 15t-24 12L590-80H370Zm70-80h79l14-106q31-8 57.5-23.5T639-327l99 41 39-68-86-65q5-14 7-29.5t2-31.5q0-16-2-31.5t-7-29.5l86-65-39-68-99 42q-22-23-48.5-38.5T533-694l-13-106h-79l-14 106q-31 8-57.5 23.5T321-633l-99-41-39 68 86 64q-5 15-7 30t-2 32q0 16 2 31t7 30l-86 65 39 68 99-42q22 23 48.5 38.5T427-266l13 106Zm42-180q58 0 99-41t41-99q0-58-41-99t-99-41q-59 0-99.5 41T342-480q0 58 40.5 99t99.5 41Zm-2-140Z",
);
export const TrashIcon = symbol(
  "M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z",
);
export const EditIcon = symbol(
  "M200-200h57l391-391-57-57-391 391v57Zm-80 80v-170l528-527q12-11 26.5-17t30.5-6q16 0 31 6t26 18l55 56q12 11 17.5 26t5.5 30q0 16-5.5 30.5T817-647L290-120H120Zm640-584-56-56 56 56Zm-141 85-28-29 57 57-29-28Z",
);
export const BookmarkIcon = symbol(
  "M200-120v-640q0-33 23.5-56.5T280-840h400q33 0 56.5 23.5T760-760v640L480-240 200-120Zm80-122 200-86 200 86v-518H280v518Zm0-518h400-400Z",
);
export const CopyIcon = symbol(
  "M360-240q-33 0-56.5-23.5T280-320v-480q0-33 23.5-56.5T360-880h360q33 0 56.5 23.5T800-800v480q0 33-23.5 56.5T720-240H360Zm0-80h360v-480H360v480ZM200-80q-33 0-56.5-23.5T120-160v-560h80v560h440v80H200Zm160-240v-480 480Z",
);
export const SparkIcon = symbol(
  "m520-120 40-280H319l321-440h40l-40 280h241L560-120h-40ZM120-240v-80h348l-12 80H120ZM80-440v-80h228l-58 80H80Zm80-200v-80h294l-58 80H160Z",
);
/**
 * A Material navigation badge: the count of something waiting, sitting on the
 * icon it belongs to. Absolute, so whatever holds it needs `relative`.
 *
 * Hidden from assistive technology because the number alone says nothing. The
 * navigation item labels itself instead, which is why every caller passes a
 * label naming what is unread.
 */
export function NavBadge({ count, label }: { count: number; label: string }) {
  if (count <= 0) return null;
  return (
    <>
      <span
        aria-hidden
        className={cx(
          "absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full px-1",
          "bg-error text-on-error text-[0.625rem] font-semibold leading-none",
        )}
      >
        {count > 99 ? "99+" : count}
      </span>
      <span className="sr-only">{label}</span>
    </>
  );
}

export const BookIcon = symbol(
  "M300-80q-58 0-99-41t-41-99v-520q0-58 41-99t99-41h500v600q-25 0-42.5 17.5T740-220q0 25 17.5 42.5T800-160v80H300Zm-60-267q14-7 29-10t31-3h20v-440h-20q-25 0-42.5 17.5T240-740v393Zm160-13h320v-440H400v440Zm-160 13v-453 453Zm60 187h373q-6-14-9.5-28.5T660-220q0-16 3-31t10-29H300q-26 0-43 17.5T240-220q0 26 17 43t43 17Z",
);
export const ShieldIcon = symbol(
  "M722.5-297.5Q740-315 740-340t-17.5-42.5Q705-400 680-400t-42.5 17.5Q620-365 620-340t17.5 42.5Q655-280 680-280t42.5-17.5ZM680-160q31 0 57-14.5t42-38.5q-22-13-47-20t-52-7q-27 0-52 7t-47 20q16 24 42 38.5t57 14.5ZM480-80q-139-35-229.5-159.5T160-516v-244l320-120 320 120v227q-19-8-39-14.5t-41-9.5v-147l-240-90-240 90v188q0 47 12.5 94t35 89.5Q310-290 342-254t71 60q11 32 29 61t41 52q-1 0-1.5.5t-1.5.5Zm200 0q-83 0-141.5-58.5T480-280q0-83 58.5-141.5T680-480q83 0 141.5 58.5T880-280q0 83-58.5 141.5T680-80ZM480-494Z",
);
export const MailIcon = symbol(
  "M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-120H640q-30 38-71.5 59T480-240q-47 0-88.5-21T320-320H200v120Zm349-142q31-22 43-58h168v-360H200v360h168q12 36 43 58t69 22q38 0 69-22ZM200-200h560-560Z",
);
export const FolderIcon = symbol(
  "M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h240l80 80h320q33 0 56.5 23.5T880-640v400q0 33-23.5 56.5T800-160H160Zm0-80h640v-400H447l-80-80H160v480Zm0 0v-480 480Z",
);
export const ChevronIcon = symbol(
  "M504-480 320-664l56-56 240 240-240 240-56-56 184-184Z",
);
export const PersonIcon = symbol(
  "M367-527q-47-47-47-113t47-113q47-47 113-47t113 47q47 47 47 113t-47 113q-47 47-113 47t-113-47ZM160-160v-112q0-34 17.5-62.5T224-378q62-31 126-46.5T480-440q66 0 130 15.5T736-378q29 15 46.5 43.5T800-272v112H160Zm80-80h480v-32q0-11-5.5-20T700-306q-54-27-109-40.5T480-360q-56 0-111 13.5T260-306q-9 5-14.5 14t-5.5 20v32Zm296.5-343.5Q560-607 560-640t-23.5-56.5Q513-720 480-720t-56.5 23.5Q400-673 400-640t23.5 56.5Q447-560 480-560t56.5-23.5ZM480-640Zm0 400Z",
);
export const UsersIcon = symbol(
  "M40-160v-112q0-34 17.5-62.5T104-378q62-31 126-46.5T360-440q66 0 130 15.5T616-378q29 15 46.5 43.5T680-272v112H40Zm720 0v-120q0-44-24.5-84.5T666-434q51 6 96 20.5t84 35.5q36 20 55 44.5t19 53.5v120H760ZM247-527q-47-47-47-113t47-113q47-47 113-47t113 47q47 47 47 113t-47 113q-47 47-113 47t-113-47Zm466 0q-47 47-113 47-11 0-28-2.5t-28-5.5q27-32 41.5-71t14.5-81q0-42-14.5-81T544-792q14-5 28-6.5t28-1.5q66 0 113 47t47 113q0 66-47 113ZM120-240h480v-32q0-11-5.5-20T580-306q-54-27-109-40.5T360-360q-56 0-111 13.5T140-306q-9 5-14.5 14t-5.5 20v32Zm296.5-343.5Q440-607 440-640t-23.5-56.5Q393-720 360-720t-56.5 23.5Q280-673 280-640t23.5 56.5Q327-560 360-560t56.5-23.5ZM360-240Zm0-400Z",
);
export const CheckIcon = symbol(
  "M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z",
);
export const UploadIcon = symbol(
  "M440-320v-326L336-542l-56-58 200-200 200 200-56 58-104-104v326h-80ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z",
);
export const DownloadIcon = symbol(
  "M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z",
);
export const ReportIcon = symbol(
  "M480-280q17 0 28.5-11.5T520-320q0-17-11.5-28.5T480-360q-17 0-28.5 11.5T440-320q0 17 11.5 28.5T480-280Zm-40-160h80v-240h-80v240ZM330-120 120-330v-300l210-210h300l210 210v300L630-120H330Zm34-80h232l164-164v-232L596-760H364L200-596v232l164 164Zm116-280Z",
);
/** Ticked lines: a list of things to do, rather than one done thing. */
export const ChecklistIcon = symbol(
  "M222-200 80-342l56-56 85 85 170-170 56 57-225 226Zm0-320L80-662l56-56 85 85 170-170 56 57-225 226Zm298 240v-80h360v80H520Zm0-320v-80h360v80H520Z",
);
/** A clock face: something that happens on a rhythm. */
export const ScheduleIcon = symbol(
  "m612-292 56-56-148-148v-184h-80v216l172 172ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-400Zm0 320q133 0 226.5-93.5T800-480q0-133-93.5-226.5T480-800q-133 0-226.5 93.5T160-480q0 133 93.5 226.5T480-160Z",
);
/** A speech bubble with a mark: what somebody wrote to us. */
export const FeedbackIcon = symbol(
  "M480-360q17 0 28.5-11.5T520-400q0-17-11.5-28.5T480-440q-17 0-28.5 11.5T440-400q0 17 11.5 28.5T480-360Zm-40-160h80v-240h-80v240ZM80-80v-720q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v480q0 33-23.5 56.5T800-240H240L80-80Zm126-240h594v-480H160v525l46-45Zm-46 0v-480 480Z",
);
/** A heartbeat: whether the deployment is well. */
export const PulseIcon = symbol(
  "M80-600v-120q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720v120h-80v-120H160v120H80Zm80 440q-33 0-56.5-23.5T80-240v-120h80v120h640v-120h80v120q0 33-23.5 56.5T800-160H160Zm261-125.5q10-5.5 15-16.5l124-248 44 88q5 11 15 16.5t21 5.5h240v-80H665l-69-138q-5-11-15-15.5t-21-4.5q-11 0-21 4.5T524-658L400-410l-44-88q-5-11-15-16.5t-21-5.5H80v80h215l69 138q5 11 15 16.5t21 5.5q11 0 21-5.5ZM480-480Z",
);
/** A line going up: how much a business is using this. */
export const TrendIcon = symbol(
  "m136-240-56-56 296-298 160 160 208-206H640v-80h240v240h-80v-104L536-320 376-480 136-240Z",
);
/** A shield with a mark: conduct raised for a person to look at. */
export const PolicyIcon = symbol(
  "M480-80q-139-35-229.5-159.5T160-516v-244l320-120 320 120v200h-80v-145l-240-90-240 90v189q0 121 68 220t172 132q26-8 49.5-20.5T576-214l56 56q-33 27-71.5 47T480-80Zm331.5-11.5Q800-103 800-120t11.5-28.5Q823-160 840-160t28.5 11.5Q880-137 880-120t-11.5 28.5Q857-80 840-80t-28.5-11.5ZM800-240v-240h80v240h-80ZM480-480Zm56.5 56.5Q560-447 560-480t-23.5-56.5Q513-560 480-560t-56.5 23.5Q400-513 400-480t23.5 56.5Q447-400 480-400t56.5-23.5ZM480-320q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 22-5.5 42.5T618-398l119 118-57 57-120-119q-18 11-38.5 16.5T480-320Z",
);
/** A chain link, for anything about an address rather than a document. */
export const LinkIcon = symbol(
  "M440-280H280q-83 0-141.5-58.5T80-480q0-83 58.5-141.5T280-680h160v80H280q-50 0-85 35t-35 85q0 50 35 85t85 35h160v80ZM320-440v-80h320v80H320Zm200 160v-80h160q50 0 85-35t35-85q0-50-35-85t-85-35H520v-80h160q83 0 141.5 58.5T880-480q0 83-58.5 141.5T680-280H520Z",
);

/** Into the box: kept, and out of the way. */
export const ArchiveIcon = symbol(
  "m480-240 160-160-56-56-64 64v-168h-80v168l-64-64-56 56 160 160ZM200-640v440h560v-440H200Zm0 520q-33 0-56.5-23.5T120-200v-499q0-14 4.5-27t13.5-24l50-61q11-14 27.5-21.5T250-840h460q18 0 34.5 7.5T772-811l50 61q9 11 13.5 24t4.5 27v499q0 33-23.5 56.5T760-120H200Zm16-600h528l-34-40H250l-34 40Zm264 300Z",
);
/** Back out of the box. */
export const UnarchiveIcon = symbol(
  "M480-560 320-400l56 56 64-64v168h80v-168l64 64 56-56-160-160Zm-280-80v440h560v-440H200Zm0 520q-33 0-56.5-23.5T120-200v-499q0-14 4.5-27t13.5-24l50-61q11-14 27.5-21.5T250-840h460q18 0 34.5 7.5T772-811l50 61q9 11 13.5 24t4.5 27v499q0 33-23.5 56.5T760-120H200Zm16-600h528l-34-40H250l-34 40Zm264 300Z",
);
/** An open eye: the other person has opened the thread and read it. */
export const EyeIcon = symbol(
  "M607.5-372.5Q660-425 660-500t-52.5-127.5Q555-680 480-680t-127.5 52.5Q300-575 300-500t52.5 127.5Q405-320 480-320t127.5-52.5Zm-204-51Q372-455 372-500t31.5-76.5Q435-608 480-608t76.5 31.5Q588-545 588-500t-31.5 76.5Q525-392 480-392t-76.5-31.5ZM214-281.5Q94-363 40-500q54-137 174-218.5T480-800q146 0 266 81.5T920-500q-54 137-174 218.5T480-200q-146 0-266-81.5ZM480-500Zm207.5 160.5Q782-399 832-500q-50-101-144.5-160.5T480-720q-113 0-207.5 59.5T128-500q50 101 144.5 160.5T480-280q113 0 207.5-59.5Z",
);
/** The same eye struck through: it arrived, and nobody has looked yet. */
export const EyeOffIcon = symbol(
  "m644-428-58-58q9-47-27-88t-93-32l-58-58q17-8 34.5-12t37.5-4q75 0 127.5 52.5T660-500q0 20-4 37.5T644-428Zm128 126-58-56q38-29 67.5-63.5T832-500q-50-101-143.5-160.5T480-720q-29 0-57 4t-55 12l-62-62q41-17 84-25.5t90-8.5q151 0 269 83.5T920-500q-23 59-60.5 109.5T772-302Zm20 246L624-222q-35 11-70.5 16.5T480-200q-151 0-269-83.5T40-500q21-53 53-98.5t73-81.5L56-792l56-56 736 736-56 56ZM222-624q-29 26-53 57t-41 67q50 101 143.5 160.5T480-280q20 0 39-2.5t39-5.5l-36-38q-11 3-21 4.5t-21 1.5q-75 0-127.5-52.5T300-500q0-11 1.5-21t4.5-21l-84-82Zm319 93Zm-151 75Z",
);
/** Two blocks joining: an addon plugged into the panel. */
export const PuzzleIcon = symbol(
  "M352-120H200q-33 0-56.5-23.5T120-200v-152q48 0 84-30.5t36-77.5q0-47-36-77.5T120-568v-152q0-33 23.5-56.5T200-800h160q0-42 29-71t71-29q42 0 71 29t29 71h160q33 0 56.5 23.5T800-720v160q42 0 71 29t29 71q0 42-29 71t-71 29v160q0 33-23.5 56.5T720-120H568q0-50-31.5-85T460-240q-45 0-76.5 35T352-120Zm-152-80h85q22-60 66.5-90t108.5-30q64 0 108.5 30t66.5 90h85v-240h56q17 0 28.5-11.5T816-480q0-17-11.5-28.5T776-520h-56v-200H480v-56q0-17-11.5-28.5T440-816q-17 0-28.5 11.5T400-776v56H200v88q54 20 87 67t33 105q0 57-33 104t-87 68v88Zm300-280Z",
);
