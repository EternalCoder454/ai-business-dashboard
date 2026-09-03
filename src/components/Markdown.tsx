"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Markdown, rendered the one way this app renders it.
 *
 * Its own module rather than a named export from ChatView, so a screen that
 * wants a bullet list does not pull the whole chat view, its providers and its
 * upload handling into that page.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-md3">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          /**
           * A table gets its own scrolling wrapper.
           *
           * Making the table itself `display: block` to let it scroll is the
           * usual shortcut, and it is why these read as cramped: a block box
           * stops laying out as a table, so the columns collapse to their
           * content instead of sharing the width.
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
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
