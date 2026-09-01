"use client";

import { useEffect, useRef, useState } from "react";
import { Markdown } from "./ChatView";
import {
  Button,
  Card,
  CheckIcon,
  Chip,
  ChevronIcon,
  CopyIcon,
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

/** A card id that cannot collide with one already on the page. */
const blockId = () => `blk_${Math.random().toString(36).slice(2, 10)}`;

/**
 * The wiki, edited.
 *
 * Pages are stored rather than compiled in, so an installation writes its own
 * and nothing shipped names whoever built the panel. Admin is the right place
 * for it: everyone reads the wiki, and one person writes it.
 *
 * A page is a list of cards, each with its own heading, body and style, which
 * is how the wiki reads. Writing one long markdown box instead produced a wall
 * of text next to pages that had sections.
 */
export function WikiEditor() {
  const { settings, wikiPages, saveWikiPage, updateWikiPage, deleteWikiPage, updateSettings } =
    useStore();

  const [openId, setOpenId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<WikiPage | null>(null);
  const [undo, setUndo] = useState<{ page: WikiPage; label: string } | null>(null);
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

  /**
   * A deleted page is kept in memory until the next one is deleted.
   *
   * Deleting the page someone spent an afternoon on, with nothing but a
   * confirmation between them and losing it, is the one destructive thing
   * here worth being able to take back.
   */
  const remove = async (page: WikiPage) => {
    await deleteWikiPage(page.id);
    setUndo({ page, label: page.title });
    setRemoving(null);
    if (openId === page.id) setOpenId(null);
  };

  const restore = async () => {
    if (!undo) return;
    await saveWikiPage(undo.page);
    setUndo(null);
  };

  const duplicate = async (page: WikiPage) => {
    const copy = await saveWikiPage({
      title: `${page.title} copy`,
      blurb: page.blurb,
      // Fresh ids, so editing the copy never writes through to the original.
      blocks: blocksOf(page).map((block) => ({ ...block, id: blockId() })),
    });
    setOpenId(copy.id);
  };

  return (
    <div className="measure flex flex-col gap-5">
      {undo ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-outline-variant bg-container px-4 py-3">
          <span className="md-body flex-1">Deleted “{undo.label}”.</span>
          <Button size="sm" variant="outlined" onClick={() => void restore()}>
            Undo
          </Button>
          <Button size="sm" variant="text" onClick={() => setUndo(null)}>
            Dismiss
          </Button>
        </div>
      ) : null}

      <Card>
        <h2 className="md-title-lg mb-4">Heading</h2>
        <div className="grid grid-cols-1 gap-4 medium:grid-cols-2">
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
                    "rounded-xl border",
                    isOpen ? "border-primary/40" : "border-outline-variant",
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
                      <button
                        onClick={() => void duplicate(page)}
                        aria-label={`Duplicate ${page.title}`}
                        title="Duplicate"
                        className="md-state grid h-8 w-8 place-items-center rounded-full text-on-variant"
                      >
                        <CopyIcon className="h-4 w-4" />
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
            <Button onClick={() => removing && void remove(removing)}>Delete</Button>
          </>
        }
      >
        <p className="md-body text-on-variant">
          “{removing?.title}” and every card on it. Undo is offered afterwards, until the
          next page is deleted or the tab is closed. Hide it instead to take it out of the
          wiki and keep what it says.
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
  const [undo, setUndo] = useState<{ block: WikiBlock; index: number } | null>(null);

  const removeBlock = (index: number) => {
    setUndo({ block: blocks[index], index });
    return onBlocks(blocks.filter((_, i) => i !== index));
  };

  const restoreBlock = () => {
    if (!undo) return;
    const next = [...blocks];
    next.splice(Math.min(undo.index, next.length), 0, undo.block);
    setUndo(null);
    return onBlocks(next);
  };

  const insert = (index: number, block: WikiBlock) => {
    const next = [...blocks];
    next.splice(index, 0, block);
    return onBlocks(next);
  };

  return (
    <div className="border-t border-outline-variant p-3">
      <div className="mb-4 grid grid-cols-1 gap-4 medium:grid-cols-2">
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

      {undo ? (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-outline-variant px-3 py-2">
          <span className="md-label-sm flex-1">Card deleted.</span>
          <Button size="sm" variant="text" onClick={() => void restoreBlock()}>
            Undo
          </Button>
        </div>
      ) : null}

      {blocks.length === 0 ? (
        <p className="md-body px-1 py-3 text-on-variant/75">
          No cards. A page needs at least one to show anything.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {blocks.map((block, index) => (
            <li key={block.id}>
              <BlockEditor
                block={block}
                position={`${index + 1} of ${blocks.length}`}
                first={index === 0}
                last={index === blocks.length - 1}
                onChange={(patch) =>
                  onBlocks(blocks.map((b, i) => (i === index ? { ...b, ...patch } : b)))
                }
                onMove={(delta) => {
                  const next = [...blocks];
                  const [moved] = next.splice(index, 1);
                  next.splice(index + delta, 0, moved);
                  return onBlocks(next);
                }}
                onDuplicate={() => insert(index + 1, { ...block, id: blockId() })}
                onDelete={() => removeBlock(index)}
              />
            </li>
          ))}
        </ul>
      )}

      <Button
        size="sm"
        variant="outlined"
        className="mt-3"
        icon={<PlusIcon className="h-4 w-4" />}
        onClick={() =>
          void insert(blocks.length, { id: blockId(), title: "", body: "", tone: "default" })
        }
      >
        Add card
      </Button>
    </div>
  );
}

/**
 * One card.
 *
 * Text is held locally and written on blur. Writing through on every keystroke,
 * which is what the first version did, is a database round trip per character
 * typed. A saved marker appears afterwards, because a save with no feedback is
 * indistinguishable from one that did not happen.
 *
 * The body can be previewed as it will actually render, since markdown written
 * blind is markdown that turns out wrong on the page rather than in the box.
 */
function BlockEditor({
  block,
  position,
  first,
  last,
  onChange,
  onMove,
  onDuplicate,
  onDelete,
}: {
  block: WikiBlock;
  position: string;
  first: boolean;
  last: boolean;
  onChange: (patch: Partial<WikiBlock>) => Promise<void>;
  onMove: (delta: number) => Promise<void>;
  onDuplicate: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [title, setTitle] = useState(block.title);
  const [body, setBody] = useState(block.body);
  const [preview, setPreview] = useState(false);
  const [saved, setSaved] = useState(false);
  const area = useRef<HTMLTextAreaElement | null>(null);

  // Grow with the text rather than scrolling inside eight fixed rows, which
  // for a card of any length means editing through a letterbox.
  const grow = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 140)}px`;
  };

  useEffect(() => {
    if (!preview) grow(area.current);
  }, [preview, body]);

  const commit = async (patch: Partial<WikiBlock>) => {
    await onChange(patch);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  };

  const dirty = title !== block.title || body !== block.body;

  return (
    <div className="rounded-xl bg-low p-3">
      <div className="mb-2 flex flex-wrap items-end gap-2">
        <Field label="Card heading" className="min-w-0 flex-1">
          <TextInput
            value={title}
            placeholder="Optional"
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => {
              if (title !== block.title) void commit({ title });
            }}
          />
        </Field>
        <Field label="Style" className="flex-none">
          <Select
            value={block.tone}
            onChange={(event) => void commit({ tone: event.target.value as WikiBlockTone })}
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
            onClick={() => void onDuplicate()}
            aria-label="Duplicate card"
            title="Duplicate"
            className="md-state grid h-8 w-8 place-items-center rounded-full text-on-variant"
          >
            <CopyIcon className="h-4 w-4" />
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

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Chip selected={!preview} onClick={() => setPreview(false)}>
          Write
        </Chip>
        <Chip
          selected={preview}
          onClick={() => {
            // Commit before previewing, so what is shown is what is stored.
            if (body !== block.body) void commit({ body });
            setPreview(true);
          }}
        >
          Preview
        </Chip>
        <span className="flex-1" />
        <span className="md-label-sm text-on-variant/60">Card {position}</span>
        {saved ? (
          <span className="md-label-sm flex items-center gap-1 text-success">
            <CheckIcon className="h-3.5 w-3.5" />
            Saved
          </span>
        ) : dirty ? (
          <span className="md-label-sm text-on-variant/60">Unsaved</span>
        ) : null}
      </div>

      {preview ? (
        <div
          className={cx(
            "rounded-lg p-4",
            block.tone === "warning"
              ? "border border-warning/25 bg-warning/10"
              : block.tone === "note"
                ? "border border-outline-variant"
                : "bg-container",
          )}
        >
          {block.title ? (
            <h3
              className={cx("md-title mb-2", block.tone === "warning" && "text-warning")}
            >
              {block.title}
            </h3>
          ) : null}
          {block.body.trim() ? (
            <Markdown>{block.body}</Markdown>
          ) : (
            <p className="md-body text-on-variant/60">Nothing written yet.</p>
          )}
        </div>
      ) : (
        <TextArea
          ref={area}
          value={body}
          placeholder="Markdown. Headings, lists, bold, links and tables all render."
          className="min-h-[140px] resize-none font-mono text-[0.8125rem]"
          onChange={(event) => {
            setBody(event.target.value);
            grow(event.target);
          }}
          onBlur={() => {
            if (body !== block.body) void commit({ body });
          }}
          onKeyDown={(event) => {
            // Ctrl or Cmd with S, because the reflex is universal and the
            // browser's own save dialog is never what anyone wanted here.
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
              event.preventDefault();
              if (body !== block.body) void commit({ body });
            }
          }}
        />
      )}
    </div>
  );
}
