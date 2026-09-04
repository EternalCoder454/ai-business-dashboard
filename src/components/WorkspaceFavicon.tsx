"use client";

import { useEffect } from "react";
import { logoOrNothing } from "@/lib/settingsWrite";
import { useStore } from "@/lib/store";

/**
 * Puts this workspace's own mark in the browser tab.
 *
 * The icon route serves the deployment's branding, which is the right answer
 * for the sign-in page and for a link card somebody shares: those belong to
 * whoever runs the panel, not to whichever business happens to be looking. It
 * is the wrong answer once you are inside, where the workspace is yours and the
 * tab should say so, especially for anybody with two of them open.
 *
 * Done from the browser rather than by making the icon route per viewer, for
 * two reasons. A favicon is cached hard and its URL never changes between
 * deploys, so a dynamic route can be perfectly correct and still never be
 * fetched again. And the logo is already a data URL in settings, so there is
 * nothing to fetch: the href changes the moment the logo does.
 */
export function WorkspaceFavicon() {
  const { settings, ready } = useStore();

  useEffect(() => {
    // Before the workspace has loaded, the deployment's icon is the honest
    // thing to show rather than a mark built from a default.
    if (!ready) return;

    const href = logoOrNothing(settings.companyLogoUrl) || letterIcon(settings);
    if (!href) return;

    const link =
      document.querySelector<HTMLLinkElement>('link[rel="icon"][data-workspace]') ??
      createLink();
    if (link.href !== href) link.href = href;
  }, [ready, settings]);

  return null;
}

/**
 * A new link rather than editing the one Next rendered.
 *
 * Its href carries a build hash and is what the deployment's icon is served
 * from, so overwriting it would lose the fallback the moment anybody signs out.
 * A later icon element wins, which is all this needs to do.
 */
function createLink(): HTMLLinkElement {
  const link = document.createElement("link");
  link.rel = "icon";
  link.dataset.workspace = "true";
  document.head.appendChild(link);
  return link;
}

/** The size a browser actually asks for, drawn once and cached by the URL. */
const EDGE = 64;

/**
 * Up to two letters on the workspace's own colour, as a data URL.
 *
 * The same two letters and the same colours the sidebar mark uses, so the tab
 * and the top of the screen agree. Drawn rather than rendered as SVG text
 * because a font in an SVG favicon is not guaranteed to load before the icon
 * is rasterised, and a blank square is worse than no change at all.
 */
function letterIcon(settings: { companyMark?: string; companyName?: string }): string {
  const letters = (settings.companyMark || settings.companyName || "?")
    .trim()
    .slice(0, 2)
    .toUpperCase();

  try {
    const canvas = document.createElement("canvas");
    canvas.width = EDGE;
    canvas.height = EDGE;
    const context = canvas.getContext("2d");
    if (!context) return "";

    // The primary container pair, matching app/icon.tsx so a signed-in tab and
    // a shared link card are recognisably the same product.
    context.fillStyle = "#1d525d";
    roundedSquare(context, EDGE, EDGE * 0.22);
    context.fill();

    context.fillStyle = "#c2ecf5";
    context.font = `600 ${Math.round(EDGE * 0.42)}px system-ui, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    // Nudged down a little: a cap-height string sits optically high when it is
    // centred on the box rather than on its own baseline.
    context.fillText(letters, EDGE / 2, EDGE / 2 + EDGE * 0.03);

    return canvas.toDataURL("image/png");
  } catch {
    // A browser that will not give up a canvas keeps the deployment's icon,
    // which is a worse tab and not a broken one.
    return "";
  }
}

function roundedSquare(context: CanvasRenderingContext2D, edge: number, radius: number) {
  context.beginPath();
  context.moveTo(radius, 0);
  context.lineTo(edge - radius, 0);
  context.quadraticCurveTo(edge, 0, edge, radius);
  context.lineTo(edge, edge - radius);
  context.quadraticCurveTo(edge, edge, edge - radius, edge);
  context.lineTo(radius, edge);
  context.quadraticCurveTo(0, edge, 0, edge - radius);
  context.lineTo(0, radius);
  context.quadraticCurveTo(0, 0, radius, 0);
  context.closePath();
}
