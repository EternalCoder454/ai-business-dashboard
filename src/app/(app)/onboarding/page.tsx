"use client";

import { PageHeader } from "@/components/PageHeader";
import { useEffect, useState } from "react";
import { Markdown } from "@/components/ChatView";
import { BookIcon, EmptyState, cx } from "@/components/ui";
import { createRipple } from "@/components/ui/ripple";
import { blocksOf } from "@/lib/seedWiki";
import { useStore } from "@/lib/store";

/**
 * The internal wiki.
 *
 * Pages rather than one long scroll, because this serves someone on their
 * first day and someone checking one thing eighteen months in, and a single
 * document serves the first and buries the second.
 *
 * Every page is stored rather than written into the app, so an installation
 * says what it needs to say and none of it is about whoever built the panel.
 * The first page is always where you land; a hash only takes over afterwards,
 * so a shared link works without a first visit arriving somewhere odd.
 */
export default function WikiPage() {
  const { ready, settings, wikiPages } = useStore();
  const pages = wikiPages.filter((page) => page.enabled);

  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const fromHash = window.location.hash.slice(1);
    if (fromHash) setOpenId(fromHash);
  }, []);

  const current = pages.find((page) => page.id === openId) ?? pages[0];

  const open = (id: string) => {
    setOpenId(id);
    history.replaceState(null, "", `#${id}`);
    document.getElementById("wiki-top")?.scrollIntoView({ block: "start" });
  };

  const index = current ? pages.findIndex((page) => page.id === current.id) : -1;
  const next = index >= 0 ? pages[index + 1] : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        eyebrow={settings.wikiTitle}
        title={settings.companyName}
        description={current === pages[0] ? settings.wikiSubtitle : (current?.blurb ?? "")}
      />

      <div className="min-h-0 flex-1 overflow-y-auto page-x py-6" id="wiki-top">
        {ready && pages.length === 0 ? (
          <EmptyState
            icon={<BookIcon className="h-6 w-6" />}
            title="No pages yet"
            description="Wiki pages are written in Admin."
          />
        ) : (
          // Contents beside the page on a wide screen, above it otherwise.
          // Sticky, so moving between pages never means scrolling back.
          <div className="grid grid-cols-1 gap-6 expanded:grid-cols-[15rem_minmax(0,1fr)]">
            <nav className="expanded:sticky expanded:top-0 expanded:self-start">
              <h2 className="md-label-sm mb-2 px-2 text-on-variant">Contents</h2>
              <ul className="flex gap-1.5 overflow-x-auto pb-1 expanded:flex-col expanded:overflow-visible expanded:pb-0">
                {pages.map((page) => (
                  <li key={page.id} className="flex-none expanded:flex-auto">
                    <button
                      onClick={(event) => {
                        createRipple(event);
                        open(page.id);
                      }}
                      aria-current={page.id === current?.id ? "page" : undefined}
                      className={cx(
                        "md-state w-full rounded-xl px-3 py-2 text-left transition-colors",
                        page.id === current?.id
                          ? "bg-primary-container text-on-primary-container"
                          : "text-on-variant",
                      )}
                    >
                      <span className="md-label block whitespace-nowrap">{page.title}</span>
                      {page.blurb ? (
                        <span className="md-label-sm hidden text-on-variant/70 expanded:block">
                          {page.blurb}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="measure-read flex flex-col gap-5 expanded:mx-0">
              {current
                ? blocksOf(current).map((block) => (
                    <article
                      key={block.id}
                      className={cx(
                        "rounded-2xl p-5",
                        block.tone === "warning"
                          ? "border border-warning/25 bg-warning/10"
                          : block.tone === "note"
                            ? "border border-outline-variant"
                            : "bg-container shadow-e1",
                      )}
                    >
                      {block.title ? (
                        <h2
                          className={cx(
                            "md-title-lg mb-3",
                            block.tone === "warning" && "text-warning",
                          )}
                        >
                          {block.title}
                        </h2>
                      ) : null}
                      <Markdown>{block.body}</Markdown>
                    </article>
                  ))
                : null}

              {next ? (
                <button
                  onClick={(event) => {
                    createRipple(event);
                    open(next.id);
                  }}
                  className="md-state rounded-2xl border border-outline-variant px-4 py-3 text-left"
                >
                  <span className="md-label-sm block text-on-variant">Next</span>
                  <span className="md-title block">{next.title}</span>
                  {next.blurb ? (
                    <span className="md-label-sm block text-on-variant/75">{next.blurb}</span>
                  ) : null}
                </button>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
