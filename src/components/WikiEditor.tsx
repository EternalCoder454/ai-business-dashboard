"use client";

import { useState } from "react";
import {
  Button,
  Card,
  ChevronIcon,
  Dialog,
  Field,
  PlusIcon,
  TextArea,
  TextInput,
  TrashIcon,
  cx,
} from "./ui";
import { createRipple } from "./ui/ripple";
import { useStore } from "@/lib/store";
import type { WikiPage } from "@/lib/types";

interface Draft {
  id?: string;
  title: string;
  blurb: string;
  body: string;
}

/**
 * The wiki, edited.
 *
 * Pages are stored rather than compiled in, so an installation writes its own
 * and nothing in the shipped ones names whoever built the panel. Admin is the
 * right place for it: everyone reads the wiki, and one person writes it.
 */
export function WikiEditor() {
  const { settings, wikiPages, saveWikiPage, updateWikiPage, deleteWikiPage, updateSettings } =
    useStore();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [removing, setRemoving] = useState<WikiPage | null>(null);
  const [title, setTitle] = useState(settings.wikiTitle);
  const [subtitle, setSubtitle] = useState(settings.wikiSubtitle);

  const ordered = [...wikiPages].sort((a, b) => a.order - b.order);

  /** Swaps a page with its neighbour, which is the whole of reordering here. */
  const move = async (page: WikiPage, delta: number) => {
    const index = ordered.findIndex((p) => p.id === page.id);
    const other = ordered[index + delta];
    if (!other) return;
    await updateWikiPage(page.id, { order: other.order });
    await updateWikiPage(other.id, { order: page.order });
  };

  const save = async () => {
    if (!draft?.title.trim()) return;
    const fields = { title: draft.title, blurb: draft.blurb, body: draft.body };
    if (draft.id) await updateWikiPage(draft.id, fields);
    else await saveWikiPage(fields);
    setDraft(null);
  };

  return (
    <div className="measure flex flex-col gap-5">
      <Card>
        <h2 className="md-title-lg mb-4">Heading</h2>
        <div className="grid gap-4 medium:grid-cols-2">
          <Field label="Name">
            <TextInput
              value={title}
              placeholder="Internal Wiki"
              onChange={(event) => setTitle(event.target.value)}
              onBlur={() => {
                if (title !== settings.wikiTitle) void updateSettings({ wikiTitle: title });
              }}
            />
          </Field>
          <Field label="Subtitle">
            <TextInput
              value={subtitle}
              placeholder="2 minute read"
              onChange={(event) => setSubtitle(event.target.value)}
              onBlur={() => {
                if (subtitle !== settings.wikiSubtitle) {
                  void updateSettings({ wikiSubtitle: subtitle });
                }
              }}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="md-title-lg">
            Pages · {ordered.length}
          </h2>
          <Button
            size="sm"
            icon={<PlusIcon className="h-4 w-4" />}
            onClick={() => setDraft({ title: "", blurb: "", body: "" })}
          >
            New page
          </Button>
        </div>

        {ordered.length === 0 ? (
          <p className="md-body text-on-variant">No pages.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {ordered.map((page, index) => (
              <li
                key={page.id}
                className={cx(
                  "flex flex-wrap items-center gap-2 rounded-xl border border-outline-variant p-3",
                  !page.enabled && "opacity-60",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className={cx("md-label truncate", !page.enabled && "line-through")}>
                    {page.title}
                  </p>
                  <p className="md-label-sm truncate text-on-variant/75">
                    {page.blurb || `${page.body.length.toLocaleString()} characters`}
                  </p>
                </div>

                <div className="flex flex-none items-center gap-0.5">
                  <button
                    onClick={() => void move(page, -1)}
                    disabled={index === 0}
                    aria-label={`Move ${page.title} up`}
                    className="md-state grid h-8 w-8 place-items-center rounded-full text-on-variant disabled:opacity-30"
                  >
                    <ChevronIcon className="h-4 w-4 -rotate-90" />
                  </button>
                  <button
                    onClick={() => void move(page, 1)}
                    disabled={index === ordered.length - 1}
                    aria-label={`Move ${page.title} down`}
                    className="md-state grid h-8 w-8 place-items-center rounded-full text-on-variant disabled:opacity-30"
                  >
                    <ChevronIcon className="h-4 w-4 rotate-90" />
                  </button>
                  <Button
                    size="sm"
                    variant="text"
                    onClick={() => void updateWikiPage(page.id, { enabled: !page.enabled })}
                  >
                    {page.enabled ? "Hide" : "Show"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outlined"
                    onClick={() =>
                      setDraft({
                        id: page.id,
                        title: page.title,
                        blurb: page.blurb,
                        body: page.body,
                      })
                    }
                  >
                    Edit
                  </Button>
                  <button
                    onClick={(event) => {
                      createRipple(event);
                      setRemoving(page);
                    }}
                    aria-label={`Delete ${page.title}`}
                    className="md-state grid h-8 w-8 place-items-center rounded-full text-on-variant"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Dialog
        open={Boolean(draft)}
        title={draft?.id ? "Edit page" : "New page"}
        width="max-w-3xl"
        onClose={() => setDraft(null)}
        footer={
          <>
            <Button variant="text" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={!draft?.title.trim()}>
              Save
            </Button>
          </>
        }
      >
        {draft ? (
          <div className="space-y-4">
            <div className="grid gap-4 medium:grid-cols-2">
              <Field label="Title">
                <TextInput
                  autoFocus
                  value={draft.title}
                  onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                />
              </Field>
              <Field label="Subtitle">
                <TextInput
                  value={draft.blurb}
                  placeholder="Shown under the title in the contents"
                  onChange={(event) => setDraft({ ...draft, blurb: event.target.value })}
                />
              </Field>
            </div>
            <Field label="Body" hint="Markdown. Headings, lists, bold, links and tables all render.">
              <TextArea
                rows={18}
                value={draft.body}
                className="font-mono text-[0.8125rem]"
                onChange={(event) => setDraft({ ...draft, body: event.target.value })}
              />
            </Field>
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={Boolean(removing)}
        title="Delete this page?"
        onClose={() => setRemoving(null)}
        footer={
          <>
            <Button variant="text" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (removing) await deleteWikiPage(removing.id);
                setRemoving(null);
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="md-body text-on-variant">
          “{removing?.title}” and everything written on it. This cannot be undone. Hide it
          instead to take it out of the wiki and keep the text.
        </p>
      </Dialog>
    </div>
  );
}
