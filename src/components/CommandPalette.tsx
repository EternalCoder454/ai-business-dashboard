"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { KIND_LABEL, groupResults, search, type SearchResult } from "@/lib/search";
import { useStore } from "@/lib/store";
import { CloseIcon, cx } from "./ui";

/**
 * One search box over everything: heads, conversations, individual messages,
 * skills, deliverables, All Hands threads, and the pages themselves.
 *
 * A palette rather than a search page, because the useful moment is always
 * "I am somewhere else and I need that thing", and a page would mean navigating
 * away from what you were doing to go and look for it.
 */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { departments, conversations, skills, deliverables, allHandsRuns } = useStore();

  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const results = useMemo(
    () =>
      search(query, { departments, conversations, skills, deliverables, allHandsRuns }),
    [query, departments, conversations, skills, deliverables, allHandsRuns],
  );

  const grouped = useMemo(() => groupResults(results), [results]);
  // Flattened in display order, so the arrow keys walk what the eye sees.
  const flat = useMemo(() => grouped.flatMap(([, items]) => items), [grouped]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      // The input mounts with the dialog, so focus after paint.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const go = (result: SearchResult) => {
    router.push(result.href);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-[8vh]">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} aria-hidden />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className="animate-rise relative flex max-h-[80dvh] w-full max-w-[40rem] flex-col overflow-hidden rounded-3xl bg-high shadow-e3"
      >
        <div className="flex flex-none items-center gap-2 border-b border-outline-variant px-4">
          <SearchIcon className="h-5 w-5 flex-none text-on-variant" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((index) => Math.min(index + 1, flat.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((index) => Math.max(index - 1, 0));
              } else if (event.key === "Enter" && flat[active]) {
                event.preventDefault();
                go(flat[active]);
              } else if (event.key === "Escape") {
                onClose();
              }
            }}
            placeholder="Search heads, conversations, skills, deliverables…"
            aria-label="Search"
            className="md-body h-14 w-full bg-transparent text-on-surface placeholder:text-on-variant/70 focus:outline-none"
          />
          <button
            onClick={onClose}
            aria-label="Close search"
            className="md-state md-target grid h-9 w-9 flex-none place-items-center rounded-full text-on-variant"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-2">
          {query.trim().length < 2 ? (
            <p className="md-label px-3 py-6 text-center text-on-variant/75">
              Type at least two characters. Messages inside conversations are searched too.
            </p>
          ) : flat.length === 0 ? (
            <p className="md-label px-3 py-6 text-center text-on-variant/75">
              Nothing matches “{query.trim()}”.
            </p>
          ) : (
            grouped.map(([kind, items]) => (
              <section key={kind} className="mb-1">
                <h2 className="md-label-sm px-3 pb-1 pt-2 text-on-variant/75">
                  {KIND_LABEL[kind]}
                </h2>
                <ul>
                  {items.map((result) => {
                    const index = flat.indexOf(result);
                    const isActive = index === active;
                    return (
                      <li key={result.id}>
                        <button
                          data-active={isActive}
                          onMouseEnter={() => setActive(index)}
                          onClick={() => go(result)}
                          className={cx(
                            "flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left transition-colors",
                            isActive ? "bg-secondary-container text-on-secondary-container" : "",
                          )}
                        >
                          <span aria-hidden className="mt-0.5 w-5 flex-none text-center">
                            {result.icon}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="md-body block truncate">{result.title}</span>
                            <span
                              className={cx(
                                "md-label-sm block truncate",
                                isActive ? "opacity-80" : "text-on-variant/75",
                              )}
                            >
                              {result.subtitle}
                            </span>
                            {result.snippet ? (
                              <span
                                className={cx(
                                  "md-label-sm mt-0.5 block truncate",
                                  isActive ? "opacity-70" : "text-on-variant/75",
                                )}
                              >
                                {result.snippet}
                              </span>
                            ) : null}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </div>

        <div className="md-label-sm hidden flex-none items-center gap-4 border-t border-outline-variant px-4 py-2 text-on-variant/75 medium:flex">
          <span>↑ ↓ to move</span>
          <span>Enter to open</span>
          <span>Esc to close</span>
          <span className="ml-auto">{flat.length} results</span>
        </div>
      </div>
    </div>
  );
}

export function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden
      className={className}
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
