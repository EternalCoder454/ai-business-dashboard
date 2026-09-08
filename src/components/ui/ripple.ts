"use client";

import type { MouseEvent } from "react";

/**
 * The press feedback: a flash across the control, not a ripple from the finger.
 *
 * Material's ripple is a circle that starts where you touched and travels out
 * across the control over 450ms. It is drawn for a touchscreen, where the point
 * of contact is under your finger and the spreading circle is what tells you
 * the machine saw it. With a mouse the pointer is already visible, the hover
 * state has already answered the question, and what is left is an ink drop
 * crossing a button on a desktop: the single clearest signal in this interface
 * that it was designed for a phone.
 *
 * So the whole control flashes and fades in 150ms instead. Same job, no travel,
 * and no geometry to measure on every click.
 *
 * Kept as an element rather than a class on the host because a press can land
 * while the last one is still fading, and two overlapping flashes on one
 * element cannot be expressed with a single class.
 */
export function createRipple(event: MouseEvent<HTMLElement>) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const host = event.currentTarget;
  const flash = document.createElement("span");
  flash.className = "md-ripple-dot";
  host.appendChild(flash);

  const remove = () => flash.remove();
  flash.addEventListener("animationend", remove, { once: true });
  // Animations are throttled or disabled in background tabs, and the event may
  // never arrive. The timeout is the guarantee; the event is the precision.
  window.setTimeout(remove, 1000);
}
