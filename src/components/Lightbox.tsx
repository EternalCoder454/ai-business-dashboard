"use client";

import { useEffect, useState } from "react";
import { CloseIcon, cx } from "./ui";
import { createRipple } from "./ui/ripple";

/**
 * One image, as large as the screen allows.
 *
 * A thumbnail in the Library is 56 pixels and the preview dialog caps at half
 * the viewport, which is enough to recognise a file and not enough to read
 * anything in it. This is the step after that: fitted to the window, and
 * clicking again takes it to full size with the overflow scrollable, which is
 * what a screenshot of a spreadsheet actually needs.
 *
 * Rendered above everything and closed by Escape, the backdrop, or the button,
 * because a viewer that traps you is worse than no viewer.
 */
export function Lightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  const [actualSize, setActualSize] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // Nothing behind it should scroll while it is open.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      // Only a click that lands on the backdrop closes. A click that started on
      // the image and drifted while panning is not a click on the backdrop.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className={cx(
        "fixed inset-0 z-[60] bg-black/85 backdrop-blur-sm",
        actualSize ? "overflow-auto" : "grid place-items-center overflow-hidden",
      )}
    >
      <button
        onClick={(event) => {
          createRipple(event);
          onClose();
        }}
        aria-label="Close"
        className={cx(
          "md-state md-target safe-top fixed right-3 top-3 z-10 grid place-items-center",
          "rounded-full bg-black/50 text-white",
        )}
      >
        <CloseIcon className="h-5 w-5" />
      </button>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onClick={() => setActualSize((value) => !value)}
        className={cx(
          actualSize
            ? "max-w-none cursor-zoom-out"
            : "max-h-[92vh] max-w-[92vw] cursor-zoom-in object-contain",
        )}
      />

      <p
        className={cx(
          "safe-bottom pointer-events-none fixed inset-x-0 bottom-3 text-center",
          "md-label-sm text-white/70",
        )}
      >
        {actualSize ? "Tap the image to fit it" : "Tap the image for full size"}
      </p>
    </div>
  );
}
