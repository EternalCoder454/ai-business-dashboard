"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Markdown } from "@/components/Markdown";
import { Card, EmptyState, TextInput, cx } from "@/components/ui";
import { createRipple } from "@/components/ui/ripple";
import { DOCUMENTATION, searchDocs } from "@/lib/documentation";

/**
 * The manual for the panel.
 *
 * One long page with a contents rail rather than a page per topic, which is
 * the opposite of the choice the Internal Wiki makes next door, for a reason.
 * The wiki serves somebody checking one thing they already know exists. This
 * serves somebody who does not yet know what exists, and a list of titles is
 * no help to them: they have to be able to read it straight through the first
 * time and jump to one heading forever after.
 *
 * The filter is the concession to the second case. It hides sections rather
 * than scrolling to them, so a search for "key" leaves three short sections on
 * screen instead of a highlighted word somewhere in a long document.
 */
export default function DocumentationPage() {
  const [query, setQuery] = useState("");
  /*
   * Which section is being read, so the contents rail can say so.
   *
   * An IntersectionObserver rather than a scroll handler: the browser works out
   * what is on screen, and a listener firing on every frame of a scroll to do
   * the same arithmetic is the version that makes a long page feel heavy.
   *
   * rootMargin pulls the bottom of the observed area up to a fifth from the
   * top, so a heading counts as "being read" once it reaches the upper part of
   * the screen rather than the moment it appears at the bottom. Without it,
   * every section three screens down is technically visible and the rail
   * highlights whatever is last in the document.
   */
  const [reading, setReading] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const chapters = useMemo(() => searchDocs(query), [query]);

  const sectionCount = chapters.reduce((n, chapter) => n + chapter.sections.length, 0);

  useEffect(() => {
    const root = scroller.current;
    if (!root) return;

    const headings = [...root.querySelectorAll<HTMLElement>("h3[id]")];
    if (headings.length === 0) return;

    /*
     * Whichever qualifying heading sits highest wins, rather than the last one
     * the observer happened to report. Entries arrive in whatever order the
     * browser noticed them, so picking from the callback's argument alone makes
     * the highlight jump about when several cross at once.
     */
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.id;
          if (entry.isIntersecting) visible.add(id);
          else visible.delete(id);
        }
        const first = headings.find((heading) => visible.has(heading.id));
        if (first) setReading(first.id);
      },
      { root, rootMargin: "0px 0px -80% 0px", threshold: 0 },
    );

    for (const heading of headings) observer.observe(heading);
    return () => observer.disconnect();
    // Re-observes when the filter changes which sections exist.
  }, [chapters]);
  const filtering = query.trim().length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        eyebrow="Reference"
        title="Documentation"
        actions={
          <TextInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            aria-label="Search the documentation"
            className="w-56"
          />
        }
      />

      <div
        ref={scroller}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-5 medium:px-6 expanded:px-8"
      >
        <div className="measure-wide flex flex-col gap-6 expanded:flex-row expanded:items-start expanded:gap-10">
          {/*
            Sticky on a wide window, and simply the first thing on the page on a
            narrow one. A contents list that scrolls away is no worse than no
            contents list, but one pinned over a phone screen costs a third of
            the reading area.
          */}
          <nav
            aria-label="Contents"
            className="flex-none expanded:sticky expanded:top-0 expanded:w-60"
          >
            <p className="md-label-sm mb-2 text-on-variant/75">Contents</p>
            <ul className="flex flex-col gap-3">
              {chapters.map((chapter) => (
                <li key={chapter.id}>
                  <p className="md-label mb-1">{chapter.title}</p>
                  <ul className="flex flex-col">
                    {chapter.sections.map((section) => (
                      <li key={section.id}>
                        <a
                          href={`#${section.id}`}
                          onClick={createRipple}
                          aria-current={reading === section.id ? "location" : undefined}
                          className={cx(
                            "md-state md-body block truncate rounded-lg px-2 py-1",
                            reading === section.id
                              ? "bg-primary-container text-on-primary-container"
                              : "text-on-variant",
                          )}
                        >
                          {section.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </nav>

          <div className="min-w-0 flex-1">
            {sectionCount === 0 ? (
              <EmptyState
                icon="📘"
                title="Nothing matches that"
                description="Try a shorter word, such as key, cost, file, or addon."
              />
            ) : (
              <div className="flex flex-col gap-8">
                {chapters.map((chapter) => (
                  <section key={chapter.id} className="flex flex-col gap-4">
                    <h2 className="md-label-sm text-primary">{chapter.title}</h2>

                    {chapter.sections.map((section) => (
                      <Card key={section.id}>
                        {/*
                          scroll-mt keeps a heading clear of the sticky header
                          when it is jumped to, rather than landing underneath
                          it, which reads as the link having done nothing.
                        */}
                        <h3
                          id={section.id}
                          className={cx("md-title-lg mb-3", "scroll-mt-6")}
                        >
                          {section.title}
                        </h3>
                        <Markdown>{section.body}</Markdown>
                      </Card>
                    ))}
                  </section>
                ))}
              </div>
            )}

            {filtering && sectionCount > 0 ? (
              <p className="md-label mt-6 text-on-variant/75">
                {sectionCount} of {DOCUMENTATION.reduce((n, c) => n + c.sections.length, 0)}{" "}
                sections
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
