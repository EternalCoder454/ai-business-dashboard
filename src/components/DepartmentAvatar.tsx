import type { Department } from "@/lib/types";
import { cx } from "./ui";

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
  className,
}: {
  department: Pick<Department, "name" | "personaName" | "avatarUrl">;
  size?: number;
  className?: string;
}) {
  const initial = (department.personaName || department.name || "?").trim().charAt(0).toUpperCase();

  const shared = cx("flex-none rounded-full object-cover", className);
  const style = { width: size, height: size };

  if (department.avatarUrl) {
    return (
      // A stored data URL, so next/image would have nothing to optimise.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={department.avatarUrl} alt="" style={style} className={shared} />
    );
  }

  return (
    <span
      aria-hidden
      style={{ ...style, fontSize: Math.round(size * 0.4) }}
      className={cx(
        shared,
        "grid place-items-center bg-secondary-container font-medium text-on-secondary-container",
      )}
    >
      {initial}
    </span>
  );
}
