"use client";

import { useStore } from "@/lib/store";
import { cx } from "./ui";

/**
 * The workspace's own mark: an uploaded logo, or up to two letters.
 *
 * A component rather than two letters typed into the sidebar, because this is
 * the first thing anyone sees and it should not say HQ for a business that is
 * not called that.
 */
export function CompanyMark({ size = 40, className }: { size?: number; className?: string }) {
  const { settings } = useStore();
  const style = { width: size, height: size };

  if (settings.companyLogoUrl) {
    return (
      // A stored data URL, so next/image has nothing to optimise.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={settings.companyLogoUrl}
        alt=""
        style={style}
        className={cx("flex-none rounded-xl object-cover", className)}
      />
    );
  }

  const letters = (settings.companyMark || settings.companyName || "?")
    .trim()
    .slice(0, 2)
    .toUpperCase();

  return (
    <span
      aria-hidden
      style={{ ...style, fontSize: Math.round(size * 0.36) }}
      className={cx(
        "grid flex-none place-items-center rounded-xl font-semibold tracking-tight",
        "bg-primary-container text-on-primary-container shadow-e1",
        className,
      )}
    >
      {letters}
    </span>
  );
}
