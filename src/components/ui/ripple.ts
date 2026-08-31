"use client";

import type { MouseEvent } from "react";

/**
 * Material-style ripple. Appends a short-lived span to the pressed element,
 * which must carry the `md-state` class (it supplies position + overflow).
 */
export function createRipple(event: MouseEvent<HTMLElement>) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const host = event.currentTarget;
  const rect = host.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);

  const dot = document.createElement("span");
  dot.className = "md-ripple-dot";
  dot.style.width = `${size}px`;
  dot.style.height = `${size}px`;
  dot.style.left = `${event.clientX - rect.left - size / 2}px`;
  dot.style.top = `${event.clientY - rect.top - size / 2}px`;

  host.appendChild(dot);

  const remove = () => dot.remove();
  dot.addEventListener("animationend", remove, { once: true });
  // Animations are throttled or disabled in background tabs, and the event may
  // never arrive. The timeout is the guarantee; the event is the precision.
  window.setTimeout(remove, 1000);
}
