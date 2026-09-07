"use client";

import { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/*
 * Hoisted, so they are the same objects on every render.
 *
 * Written inline inside the component they were rebuilt each time, which hands
 * ReactMarkdown props it has to treat as new even when nothing about them is.
 * Nothing is gained by having them in there and it defeats every comparison
 * further down.
 */
const PLUGINS = [remarkGfm];

const COMPONENTS: Components = {
  /**
   * A table gets its own scrolling wrapper.
   *
   * Making the table itself `display: block` to let it scroll is the usual
   * shortcut, and it is why these read as cramped: a block box stops laying out
   * as a table, so the columns collapse to their content instead of sharing the
   * width.
   */
  table: ({ node: _node, ...props }) => (
    <div className="prose-scroll">
      <table {...props} />
    </div>
  ),
  /** Anything a department links to is external and opens elsewhere. */
  a: ({ node: _node, ...props }) => (
    <a {...props} target="_blank" rel="noreferrer noopener" />
  ),
};

/**
 * Markdown, rendered the one way this app renders it.
 *
 * Its own module rather than a named export from ChatView, so a screen that
 * wants a bullet list does not pull the whole chat view, its providers and its
 * upload handling into that page.
 *
 * Memoised, which matters more here than almost anywhere else in the app.
 * Parsing markdown is not cheap: a reply of the length the heads actually write
 * costs about a third of a millisecond, and a thread of forty of them is
 * fourteen milliseconds of parsing for one render.
 *
 * A streaming reply re-renders the chat on every chunk. Without this, all forty
 * messages were parsed again on each one, so an eight second reply spent
 * roughly three seconds of the main thread re-deriving text that had not
 * changed since it arrived. The cost lands exactly when the interface most
 * needs to stay smooth, which is why it was hard to attribute.
 *
 * The prop is a string, so the default comparison is the right one.
 */
export const Markdown = memo(function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-md3">
      <ReactMarkdown remarkPlugins={PLUGINS} components={COMPONENTS}>
        {children}
      </ReactMarkdown>
    </div>
  );
});
