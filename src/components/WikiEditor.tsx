"use client";

import { useState } from "react";
import {
  Button,
  Card,
  ChevronIcon,
  Dialog,
  Field,
  PlusIcon,
  Select,
  TextArea,
  TextInput,
  TrashIcon,
  cx,
} from "./ui";
import { createRipple } from "./ui/ripple";
import { blocksOf } from "@/lib/seedWiki";
import { useStore } from "@/lib/store";
import type { WikiBlock, WikiBlockTone, WikiPage } from "@/lib/types";

const TONE_LABEL: Record<WikiBlockTone, string> = {
  default: "Card",
  note: "Outlined",
  warning: "Warning",
};

/**
 * The wiki, edited.
 *
 * Pages are stored rather than compiled in, so an installation writes its own
 * and nothing shipped names whoever built the panel. Admin is the right place
 * for it: everyone reads the wiki, and one person writes it.
 *
 * A page is a list of cards rather than one body. That is how the wiki reads,
 * and an editor that hid it behind a single markdown box meant anyone adding a
 * page produced a wall of text next to pages that had sections.
 */
export function WikiEditor() {
  const { settings, wikiPages, saveWikiPage, updateWikiPage, deleteWikiPage, updateSettings } =
    useStore();

  const [openId, setOpenId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<WikiPage | null>(null);
  const [title, setTitle] = useState(settings.wikiTitle);
  const [subtitle, setSubtitle] = useState(settings.wikiSubtitle);

  const ordered = [...wikiPages].sort((a, b) => a.order - b.order);
  const open = ordered.find((page) => page.id === openId) ?? null;

  /** Swaps a page with its neighbour, which is the whole of reordering here. */
  const movePage = async (page: WikiPage, delta: number) => {
    const index = ordered.findIndex((p) => p.id === page.id);
    const other = ordered[index + delta];
    if (!other) return;
    await updateWikiPage(page.id, { order: other.order });
    await updateWikiPage(other.id, { order: page.order });
  };

  /**
   * Cards are rewritten as a whole list rather than one at a time.
   *
   * They live in a single json column, so there is nothing to address one by
   * id, and writing the list back is both simpler and atomic.
   */
  const setBlocks = (page: WikiPage, blocks: WikiBlock[]) =>
    updateWikiPage(page.id, { blocks, body: undefined });

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
          <h2 className="md-title-lg">Pages · {ordered.length}</h2>
          <Button
            size="sm"
            icon={<PlusIcon className="h-4 w-4" />}
            onClick={async () => {
              const page = await saveWikiPage({ title: "New page", blurb: "", blocks: [] });
              setOpenId(page.id);
            }}
          >
            New page
          </Button>
        </div>

        {ordered.length === 0 ? (
          <p className="md-body text-on-variant">No pages.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {ordered.map((page, index) => {
              const blocks = blocksOf(page);
              const isOpen = open?.id === page.id;
              return (
                <li
                  key={page.id}
                  className={cx(
                    "rounded-xl border border-outline-variant",
                    !page.enabled && "opacity-60",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2 p-3">
                    <button
                      onClick={(event) => {
                        createRipple(event);
                        setOpenId(isOpen ? null : page.id);
                      }}
                      className="md-state flex min-w-0 flex-1 items-center gap-2 rounded-lg text-left"
                    >
                      <ChevronIcon
                        className={cx(
                          "h-4 w-4 flex-none text-on-variant transition-transform",
                          isOpen && "rotate-90",
                        )}
                      />
                      <span className="min-w-0">
                        <span
                          className={cx(
                            "md-label block truncate",
                            !page.enabled && "line-through",
                          )}
                        >
                          {page.title}
                        </span>
                        <span className="md-label-sm block truncate text-on-variant/75">
                          {blocks.length} card{blocks.length === 1 ? "" : "s"}
                          {page.blurb ? ` · ${page.blurb}` : ""}
                        </span>
                      </span>
                    </button>

                    <div className="flex flex-none items-center gap-0.5">
                      <button
                        onClick={() => void movePage(page, -1)}
                        disabled={index === 0}
                        aria-label={`Move ${page.title} up`}
                        className="md-state grid h-8 w-8 place-items-center rounded-full text-on-variant disabled:opacity-30"
                      >
                        <ChevronIcon className="h-4 w-4 -rotate-90" />
                      </button>
                      <button
                        onClick={() => void movePage(page, 1)}
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
                  </div>

                  {isOpen ? (
                    <PageEditor
                      page={page}
                      blocks={blocks}
                      onPage={(patch) => updateWikiPage(page.id, patch)}
                      onBlocks={(next) => setBlocks(page, next)}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

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
          “{removing?.title}” and every card on it. This cannot be undone. Hide it instead to
          take it out of the wiki and keep what it says.
        </p>
      </Dialog>
    </div>
  );
}

/** One page, opened: its title and subtitle, then its cards in order. */
function PageEditor({
  page,
  blocks,
  onPage,
  onBlocks,
}: {
  page: WikiPage;
  blocks: WikiBlock[];
  onPage: (patch: Partial<WikiPage>) => Promise<void>;
  onBlocks: (blocks: WikiBlock[]) => Promise<void>;
}) {
  const [title, setTitle] = useState(page.title);
  const [blurb, setBlurb] = useState(page.blurb);

  const addBlock = () =>
    onBlocks([
      ...blocks,
      {
        // Unique without a counter that could collide after a delete.
        id: `blk_${Math.random().toString(36).slice(2, 10)}`,
        title: "",
        body: "",
        tone: "default",
      },
    ]);

  const editBlock = (id: string, patch: Partial<WikiBlock>) =>
    onBlocks(blocks.map((block) => (block.id === id ? { ...block, ...patch } : block)));

  const moveBlock = (index: number, delta: number) => {
    const next = [...blocks];
    const [moved] = next.splice(index, 1);
    next.splice(index + delta, 0, moved);
    return onBlocks(next);
  };

  return (
    <div className="border-t border-outline-variant p-3">
      <div className="mb-4 grid gap-4 medium:grid-cols-2">
        <Field label="Page title">
          <TextInput
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => {
              if (title.trim() && title !== page.title) void onPage({ title: title.trim() });
            }}
          />
        </Field>
        <Field label="Page subtitle">
          <TextInput
            value={blurb}
            placeholder="Shown under the title in the contents"
            onChange={(event) => setBlurb(event.target.value)}
            onBlur={() => {
              if (blurb !== page.blurb) void onPage({ blurb });
            }}
          />
        </Field>
      </div>

      <ul className="flex flex-col gap-3">
        {blocks.map((block, index) => (
          <li key={block.id}>
            <BlockEditor
              block={block}
              first={index === 0}
              last={index === blocks.length - 1}
              onChange={(patch) => editBlock(block.id, patch)}
              onMove={(delta) => moveBlock(index, delta)}
              onDelete={() => onBlocks(blocks.filter((b) => b.id !== block.id))}
            />
          </li>
        ))}
      </ul>

      <Button
        size="sm"
        variant="outlined"
        className="mt-3"
        icon={<PlusIcon className="h-4 w-4" />}
        onClick={() => void addBlock()}
      >
        Add card
      </Button>
    </div>
  );
}

/**
 * One card.
 *
 * Text is held locally and written on blur. Writing on every keystroke meant a
 * database round trip per character typed, which on a hosted workspace is a
 * request per character.
 */
function BlockEditor({
  block,
  first,
  last,
  onChange,
  onMove,
  onDelete,
}: {
  block: WikiBlock;
  first: boolean;
  last: boolean;
  onChange: (patch: Partial<WikiBlock>) => Promise<void>;
  onMove: (delta: number) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [title, setTitle] = useState(block.title);
  const [body, setBody] = useState(block.body);

  return (
    <div className="rounded-xl bg-low p-3">
      <div className="mb-2 flex flex-wrap items-end gap-2">
        <Field label="Card heading" className="min-w-0 flex-1">
          <TextInput
            value={title}
            placeholder="Optional"
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => {
              if (title !== block.title) void onChange({ title });
            }}
          />
        </Field>
        <Field label="Style" className="flex-none">
          <Select
            value={block.tone}
            onChange={(event) => void onChange({ tone: event.target.value as WikiBlockTone })}
          >
            {(Object.keys(TONE_LABEL) as WikiBlockTone[]).map((tone) => (
              <option key={tone} value={tone}>
                {TONE_LABEL[tone]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex flex-none items-center gap-0.5 pb-1">
          <button
            onClick={() => void onMove(-1)}
            disabled={first}
            aria-label="Move card up"
            className="md-state grid h-8 w-8 place-items-center rounded-full text-on-variant disabled:opacity-30"
          >
            <ChevronIcon className="h-4 w-4 -rotate-90" />
          </button>
          <button
            onClick={() => void onMove(1)}
            disabled={last}
            aria-label="Move card down"
            className="md-state grid h-8 w-8 place-items-center rounded-full text-on-variant disabled:opacity-30"
          >
            <ChevronIcon className="h-4 w-4 rotate-90" />
          </button>
          <button
            onClick={() => void onDelete()}
            aria-label="Delete card"
            className="md-state grid h-8 w-8 place-items-center rounded-full text-on-variant"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      <TextArea
        rows={8}
        value={body}
        placeholder="Markdown. Headings, lists, bold, links and tables all render."
        className="font-mono text-[0.8125rem]"
        onChange={(event) => setBody(event.target.value)}
        onBlur={() => {
          if (body !== block.body) void onChange({ body });
        }}
      />
    </div>
  );
}
