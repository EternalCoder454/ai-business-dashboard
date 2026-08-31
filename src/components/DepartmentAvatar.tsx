import type { Department, DepartmentStatus } from "@/lib/types";
import { cx } from "./ui";

const PRESENCE: Record<DepartmentStatus, string> = {
  online: "var(--md-success)",
  busy: "var(--md-warning)",
  offline: "var(--md-outline)",
};

/**
 * How a department head is shown, everywhere.
 *
 * An uploaded picture when there is one, otherwise the head's initial on a
 * tinted disc. This replaced an emoji repeated across seventeen files, which is
 * why it is a component rather than a string on the record.
 */
export function DepartmentAvatar({
  department,
  size = 40,
  status,
  title,
  className,
}: {
  department: Pick<Department, "name" | "personaName" | "avatarUrl">;
  size?: number;
  /** Draws a presence dot on the corner, which saves a line of text per row. */
  status?: DepartmentStatus;
  title?: string;
  className?: string;
}) {
  const initial = (department.personaName || department.name || "?").trim().charAt(0).toUpperCase();

  const shared = cx("flex-none rounded-full object-cover", className);
  const style = { width: size, height: size };

  const face = department.avatarUrl ? (
    // A stored data URL, so next/image would have nothing to optimise.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={department.avatarUrl} alt="" title={title} style={style} className={shared} />
  ) : (
    <span
      aria-hidden
      title={title}
      style={{ ...style, fontSize: Math.round(size * 0.4) }}
      className={cx(
        shared,
        "grid place-items-center bg-secondary-container font-medium text-on-secondary-container",
      )}
    >
      {initial}
    </span>
  );

  if (!status) return face;

  return (
    <span className="relative inline-flex flex-none" style={style} title={title}>
      {face}
      <span
        aria-hidden
        style={{
          background: PRESENCE[status],
          width: Math.max(8, Math.round(size * 0.26)),
          height: Math.max(8, Math.round(size * 0.26)),
        }}
        className="absolute bottom-0 right-0 rounded-full ring-2 ring-[var(--md-surface)]"
      />
    </span>
  );
}
