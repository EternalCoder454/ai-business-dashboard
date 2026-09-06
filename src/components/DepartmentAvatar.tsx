import type { Department, DepartmentStatus } from "@/lib/types";
import { departmentAccent } from "@/lib/seed";
import { cx } from "./ui";

const PRESENCE: Record<DepartmentStatus, string> = {
  online: "var(--md-success)",
  busy: "var(--md-warning)",
  offline: "var(--md-outline)",
};

/**
 * How a department head is shown, everywhere.
 *
 * An uploaded picture when there is one, otherwise the head's initial on a disc
 * in their own colour. This replaced an emoji repeated across seventeen files,
 * which is why it is a component rather than a string on the record.
 *
 * The disc used to be secondary-container for every head, so eight of them were
 * eight identical pale circles and the only thing telling them apart was the
 * letter. Which would be fine if the letter were readable: it scales at 0.4 of
 * the disc, and the drawer, the tasks filters, the library and the settings
 * list all draw this at 16 to 20px, which put the initial at six to eight
 * pixels. So on a phone the heads were, in practice, unlabelled.
 *
 * Each head already has a colour. departmentAccent assigns one per head and
 * keeps neighbouring hues apart in the org order, and it was being used in two
 * files. Using it here puts it everywhere at once, and colour survives being
 * shrunk to sixteen pixels in a way a glyph does not.
 */
export function DepartmentAvatar({
  department,
  size = 40,
  status,
  title,
  ringColor,
  className,
}: {
  department: Pick<Department, "name" | "personaName" | "avatarUrl"> & { id?: string };
  size?: number;
  /** Draws a presence dot on the corner, which saves a line of text per row. */
  status?: DepartmentStatus;
  title?: string;
  /** A coloured ring, used where several avatars need telling apart at a glance. */
  ringColor?: string;
  className?: string;
}) {
  const initial = (department.personaName || department.name || "?").trim().charAt(0).toUpperCase();
  /*
   * No id means no head: the settings editor and the empty chat build this from
   * loose fields for something that does not exist yet, and a colour picked for
   * a draft would change the moment it was saved under a real id.
   */
  const accent = department.id ? departmentAccent(department.id) : null;

  const shared = cx("flex-none rounded-full object-cover", className);
  const style = {
    width: size,
    height: size,
    ...(ringColor ? { boxShadow: `0 0 0 2px ${ringColor}` } : {}),
  };

  const face = department.avatarUrl ? (
    // A stored data URL, so next/image would have nothing to optimise.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={department.avatarUrl} alt="" title={title} style={style} className={shared} />
  ) : (
    <span
      aria-hidden
      title={title}
      style={{
        ...style,
        /*
         * A floor, not a ratio. Below about ten pixels a letter stops being
         * read and starts being a smudge, and 0.4 of a 16px disc is six.
         */
        fontSize: Math.max(10, Math.round(size * 0.4)),
        ...(accent
          ? {
              /*
               * The letter is surface rather than a fixed white or black, which
               * is what makes one rule work in both themes. The accents are
               * tuned dark on a light theme and light on a dark one, and
               * surface is the opposite in each, so they never collide.
               * Measured: the worst pair is 4.86:1 on light and 5.39:1 on dark,
               * and the disc itself clears 4.44:1 against the card behind it.
               */
              background: accent.dot,
              color: "var(--md-surface)",
            }
          : {}),
      }}
      className={cx(
        shared,
        "grid place-items-center font-medium",
        accent ? null : "bg-secondary-container text-on-secondary-container",
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
