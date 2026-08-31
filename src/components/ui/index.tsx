"use client";

import Link from "next/link";
import {
  forwardRef,
  useEffect,
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
      className={cx(base, "md-state transition-colors")}
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
      className={animate && status === "online" ? "status-dot" : "status-dot [&::after]:hidden"}
      style={{ background: STATUS_COLOR[status] }}
    />
  );
}

/*
 * Form fields
 */

const FIELD_BASE =
  "w-full rounded-xl border border-outline-variant bg-lowest px-3.5 py-2.5 md-body " +
  "text-on-surface placeholder:text-on-variant/70 transition-colors " +
  "focus:border-primary focus:outline-none";

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

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function TextInput({ className, ...rest }, ref) {
    return <input ref={ref} className={cx(FIELD_BASE, className)} {...rest} />;
  },
);

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function TextArea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={cx(FIELD_BASE, "resize-y", className)} {...rest} />;
  },
);

export function Select({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(FIELD_BASE, "cursor-pointer appearance-none pr-9", className)} {...rest}>
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
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center medium:items-center medium:p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      {/* A sheet on compact, rising from the edge the thumb is already near.
          A centred dialog from medium up, where there is room for one. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          "animate-sheet safe-bottom relative flex w-full flex-col overflow-hidden",
          "max-h-[92dvh] rounded-t-3xl bg-high shadow-e3",
          "medium:max-h-[86vh] medium:rounded-3xl",
          width,
        )}
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
      </div>
    </div>
  );
}

/*
 * Page scaffolding
 */

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-outline-variant px-4 py-4 medium:px-6 medium:py-6 expanded:px-8">
      <div className="min-w-0">
        {/* The top app bar already names the section on compact, so repeating
            it here is a line of screen spent saying nothing. */}
        {eyebrow ? (
          <p className="md-label-sm mb-1 hidden text-primary medium:block">{eyebrow}</p>
        ) : null}
        <h1 className="md-headline">{title}</h1>
        {description ? (
          <p className="md-body mt-1.5 max-w-2xl text-on-variant">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}

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

function icon(path: ReactNode) {
  return function Icon({ className }: IconProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className={className}
      >
        {path}
      </svg>
    );
  };
}

export const PlusIcon = icon(<path d="M12 5v14M5 12h14" />);
export const CloseIcon = icon(<path d="M18 6 6 18M6 6l12 12" />);
export const SendIcon = icon(<path d="M4.5 12h15m0 0-6-6m6 6-6 6" />);
export const OrgIcon = icon(
  <>
    <rect x="9" y="3" width="6" height="5" rx="1.5" />
    <rect x="3" y="16" width="6" height="5" rx="1.5" />
    <rect x="15" y="16" width="6" height="5" rx="1.5" />
    <path d="M12 8v4M6 16v-2h12v2" />
  </>,
);
export const BriefcaseIcon = icon(
  <>
    <rect x="3" y="7" width="18" height="13" rx="2.5" />
    <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 12h18" />
  </>,
);
export const DocIcon = icon(
  <>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5M9 13h6M9 17h4" />
  </>,
);
export const BuildingIcon = icon(
  <>
    <rect x="4" y="3" width="16" height="18" rx="2" />
    <path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h6" />
  </>,
);
export const GearIcon = icon(
  <>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-2.87 1.2V21a2 2 0 1 1-4 0v-.07A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 3 15H3a2 2 0 1 1 0-4h.07A1.7 1.7 0 0 0 4.6 7a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 2.6h.09A1.7 1.7 0 0 0 10 1V1a2 2 0 1 1 4 0v.07a1.7 1.7 0 0 0 1 1.53 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 21.4 9v.09A1.7 1.7 0 0 0 23 10h-.07" />
  </>,
);
export const TrashIcon = icon(
  <>
    <path d="M4 7h16M10 11v6M14 11v6" />
    <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7" />
  </>,
);
export const EditIcon = icon(
  <>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </>,
);
export const BookmarkIcon = icon(<path d="M19 21 12 16l-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />);
export const CopyIcon = icon(
  <>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </>,
);
export const SparkIcon = icon(
  <path d="m12 3 2.2 5.4L20 10.5l-5.8 2.1L12 18l-2.2-5.4L4 10.5l5.8-2.1Z" />,
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

export const MailIcon = icon(
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3.5 7 8.5 6 8.5-6" />
  </>,
);
export const FolderIcon = icon(
  <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
);
export const ChevronIcon = icon(<path d="m9 6 6 6-6 6" />);
export const PersonIcon = icon(
  <>
    <circle cx="12" cy="8" r="3.6" />
    <path d="M5 20v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1" />
  </>,
);
export const UsersIcon = icon(
  <>
    <path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20" />
    <circle cx="10" cy="8" r="3.2" />
    <path d="M20 20v-1.5a3.5 3.5 0 0 0-2.6-3.4M15.5 5.2a3.2 3.2 0 0 1 0 5.6" />
  </>,
);
export const CheckIcon = icon(<path d="m5 13 4 4L19 7" />);
export const DownloadIcon = icon(
  <>
    <path d="M12 3v12M7 11l5 5 5-5" />
    <path d="M4 20h16" />
  </>,
);
