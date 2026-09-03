"use client";

import { PageHeader } from "@/components/PageHeader";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { LibraryTabs } from "@/components/LibraryTabs";
import {
  Button,
  Card,
  Chip,
  Dialog,
  DownloadIcon,
  EmptyState,
  Field,
  PlusIcon,
  Select,
  TextInput,
  TrashIcon,
  cx,
} from "@/components/ui";
import { createRipple } from "@/components/ui/ripple";
import { Lightbox } from "@/components/Lightbox";
import {
  LIBRARY_VIEWS,
  setLibraryView,
  useLibraryView,
  type LibraryView,
} from "@/lib/libraryView";
import { newId } from "@/lib/ids";
import {
  ACCEPTED_FILE_TYPES,
  FILE_ICON,
  estimateAttachmentTokens,
  fileToAttachmentAny,
  formatBytes,
} from "@/lib/files";
import { AttachmentError, attachmentSrc } from "@/lib/images";
import { departmentHrefById, formatRelativeTime } from "@/lib/routes";
import { COMPANY_ID } from "@/lib/seed";
import { useStore } from "@/lib/store";
import { report } from "@/lib/telemetryClient";
import type { AttachmentKind, Department, LibraryFile } from "@/lib/types";

const KIND_LABEL: Record<AttachmentKind, string> = {
  image: "Images",
  pdf: "PDFs",
  document: "Documents",
};

export default function LibraryPage() {
  const router = useRouter();
  const {
    files,
    allDepartments,
    addFile,
    updateFile,
    deleteFile,
    createConversation,
  } = useStore();

  const [filter, setFilter] = useState<"all" | AttachmentKind>("all");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [preview, setPreview] = useState<LibraryFile | null>(null);
  /** The image being looked at full screen, which any view can open. */
  const [zoomed, setZoomed] = useState<LibraryFile | null>(null);
  const [dragging, setDragging] = useState(false);
  const view = useLibraryView();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const visible = useMemo(
    () => (filter === "all" ? files : files.filter((file) => file.kind === filter)),
    [files, filter],
  );

  const countFor = (kind: AttachmentKind) => files.filter((f) => f.kind === kind).length;
  const totalBytes = files.reduce((sum, file) => sum + (file.size ?? 0), 0);

  const ingest = async (list: FileList | File[]) => {
    setBusy(true);
    setNotice(null);
    let added = 0;
    let failure = "";

    for (const file of Array.from(list)) {
      try {
        const attachment = await fileToAttachmentAny(file);
        const now = Date.now();
        await addFile({ ...attachment, id: newId("file"), createdAt: now, updatedAt: now });
        added += 1;
      } catch (error) {
        failure =
          error instanceof AttachmentError ? error.message : `${file.name} could not be read.`;
        /*
         * Recorded, because this was invisible.
         *
         * The catch here is why: a failed upload never reaches the window, so
         * the browser error handler never sees it, and it never reaches the
         * server, so nothing there sees it either. Somebody could fail to add a
         * file every day for a month and the only trace would be their memory
         * of it. The type is included because that is almost always the answer.
         */
        report({
          operation: "client.write",
          ok: false,
          errorKind: error instanceof AttachmentError ? "Rejected" : "Unreadable",
          errorNote: `library upload, ${file.type || "unknown type"}, ${file.size} bytes: ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
      }
    }

    setBusy(false);
    setNotice(
      failure || (added ? `Added ${added} file${added === 1 ? "" : "s"}.` : "Nothing added."),
    );
  };

  /**
   * Saves the file to disk. A document has no stored bytes, only the text that
   * was pulled out of it on the way in, so that is what comes back out.
   */
  const download = (file: LibraryFile) => {
    const href =
      file.kind === "document"
        ? URL.createObjectURL(new Blob([file.text ?? ""], { type: "text/plain" }))
        : attachmentSrc(file);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = file.name;
    anchor.click();
    if (file.kind === "document") URL.revokeObjectURL(href);
  };

  /** Opens a fresh conversation with this file already attached. */
  const sendTo = async (file: LibraryFile, departmentId: string) => {
    const conversation = await createConversation(departmentId);
    sessionStorage.setItem(`prefill:${conversation.id}`, JSON.stringify([file]));
    router.push(`${departmentHrefById(departmentId)}?c=${encodeURIComponent(conversation.id)}`);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        eyebrow="Library"
        title="Files"
        actions={
          <Button
            icon={<PlusIcon className="h-4 w-4" />}
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? "Reading…" : "Add files"}
          </Button>
        }
      />

      <LibraryTabs />

      {/* The kinds scroll on a narrow screen; the layout switch does not. Left
          inside the scroller it was off the right edge of a phone, which is a
          poor place for the control that decides what the page looks like. */}
      <div className="flex flex-none items-center gap-2 border-b border-outline-variant px-4 py-3 medium:px-6 expanded:px-8">
        <div className="filter-row min-w-0 flex-1">
          <Chip selected={filter === "all"} onClick={() => setFilter("all")}>
            All · {files.length}
          </Chip>
          {(["image", "pdf", "document"] as AttachmentKind[]).map((kind) => (
            <Chip key={kind} selected={filter === kind} onClick={() => setFilter(kind)}>
              {FILE_ICON[kind]} {KIND_LABEL[kind]} · {countFor(kind)}
            </Chip>
          ))}
          {files.length > 0 ? (
            <span className="md-label-sm whitespace-nowrap pl-1 text-on-variant/75">
              {formatBytes(totalBytes)} stored
            </span>
          ) : null}
        </div>

        {/* A segmented button, which is the Material control for picking one of
            a few views of the same thing. */}
        <div
          role="group"
          aria-label="Layout"
          className="flex flex-none overflow-hidden rounded-full border border-outline-variant"
        >
          {LIBRARY_VIEWS.map((option) => (
            <button
              key={option.id}
              onClick={(event) => {
                createRipple(event);
                setLibraryView(option.id);
              }}
              aria-pressed={view === option.id}
              className={cx(
                "md-state md-chip px-3 py-1 md-label-sm transition-colors",
                view === option.id
                  ? "bg-secondary-container text-on-secondary-container"
                  : "text-on-variant",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes("Files")) {
            event.preventDefault();
            setDragging(true);
          }
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          if (!event.dataTransfer.files.length) return;
          event.preventDefault();
          setDragging(false);
          void ingest(event.dataTransfer.files);
        }}
        className={cx(
          "min-h-0 flex-1 overflow-y-auto px-4 py-6 transition-colors medium:px-6 expanded:px-8",
          dragging && "bg-primary-container/10",
        )}
      >
        <div className="measure">
          {notice ? (
            <p className="md-label mb-4 inline-block rounded-full bg-low px-4 py-2 text-on-variant">
              {notice}
            </p>
          ) : null}

          {visible.length === 0 ? (
            <EmptyState
              icon={<span className="text-3xl">📁</span>}
              title={files.length === 0 ? "Nothing in the Library" : "Nothing of that kind"}
              description="Drop files anywhere on this page. Images and PDFs are read directly; Word and text files are converted on the way in."
              action={
                <Button onClick={() => inputRef.current?.click()}>Add files</Button>
              }
            />
          ) : (
            <FileList
              view={view}
              files={visible}
              departments={allDepartments}
              onOpen={setPreview}
              onZoom={setZoomed}
              onDownload={download}
              onDelete={(file) => void deleteFile(file.id)}
              onScope={(file, departmentId) =>
                void updateFile(file.id, { departmentId: departmentId || undefined })
              }
              onSend={(file, departmentId) => void sendTo(file, departmentId)}
            />
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_FILE_TYPES.join(",")}
        multiple
        className="hidden"
        onChange={(event) => {
          // Copied before the input is cleared. `files` is a live view of the
          // input, so resetting the value empties the very list being passed
          // on, and the picker silently did nothing at all.
          const list = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (list.length) void ingest(list);
        }}
      />

      <Dialog
        open={Boolean(preview)}
        title={preview?.name ?? ""}
        onClose={() => setPreview(null)}
        width="max-w-3xl"
      >
        {preview ? (
          <div className="space-y-4">
            <Field label="Note" hint="Only for you. Never sent.">
              <TextInput
                value={preview.note ?? ""}
                placeholder="What this is, or which client it belongs to"
                onChange={(event) => {
                  setPreview({ ...preview, note: event.target.value });
                  void updateFile(preview.id, { note: event.target.value });
                }}
              />
            </Field>

            {/* The two controls the card view has on its face. Compact and
                list do not have room for them, and this is the one screen
                every view can reach. */}
            <div className="grid grid-cols-1 gap-4 medium:grid-cols-2">
              <Field label="Who can use it">
                <Select
                  value={preview.departmentId ?? ""}
                  onChange={(event) => {
                    const departmentId = event.target.value || undefined;
                    setPreview({ ...preview, departmentId });
                    void updateFile(preview.id, { departmentId });
                  }}
                >
                  <option value="">Private to you</option>
                  <option value={COMPANY_ID}>Every department</option>
                  {allDepartments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Send to">
                <Select
                  value=""
                  onChange={(event) => {
                    if (event.target.value) void sendTo(preview, event.target.value);
                  }}
                >
                  <option value="">Pick a department…</option>
                  {allDepartments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.personaName || department.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {preview.kind === "image" ? (
              // Half the viewport is enough to recognise a screenshot and not
              // enough to read one, so the image is a way into the full size.
              <button
                type="button"
                onClick={() => setZoomed(preview)}
                aria-label={`Open ${preview.name} full screen`}
                className="mx-auto block cursor-zoom-in"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={attachmentSrc(preview)}
                  alt={preview.name}
                  className="mx-auto max-h-[50vh] rounded-2xl object-contain"
                />
              </button>
            ) : preview.kind === "pdf" ? (
              <object
                data={attachmentSrc(preview)}
                type="application/pdf"
                className="h-[50vh] w-full rounded-2xl border border-outline-variant"
              >
                <p className="md-body p-4 text-on-variant">
                  This browser will not preview the PDF inline. The heads can still read it.
                </p>
              </object>
            ) : (
              <pre className="md-body max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-2xl bg-low p-4 font-mono text-[0.8125rem] text-on-variant">
                {preview.text}
              </pre>
            )}
          </div>
        ) : null}
      </Dialog>

      {zoomed ? (
        <Lightbox
          src={attachmentSrc(zoomed)}
          alt={zoomed.name}
          onClose={() => setZoomed(null)}
        />
      ) : null}
    </div>
  );
}

function IconAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={(event) => {
        createRipple(event);
        onClick();
      }}
      title={label}
      aria-label={label}
      className="md-state md-target grid h-9 w-9 flex-none place-items-center rounded-full text-on-variant"
    >
      {children}
    </button>
  );
}

/**
 * The files, laid out three ways.
 *
 * Cards are the browsing view: a large thumbnail and the two controls that
 * decide who can reach the file. Compact is the same idea at a third of the
 * height, for when you know roughly what you are looking for. List is the file
 * explorer, with the columns lined up so sizes and dates can be compared down
 * a column rather than read one card at a time.
 *
 * Scope and Send to appear on the card view only. Squeezing two selects into a
 * list row is how a list stops being a list, and both are in the file's own
 * dialog, which every view opens.
 */
function FileList({
  view,
  files,
  departments,
  onOpen,
  onZoom,
  onDownload,
  onDelete,
  onScope,
  onSend,
}: {
  view: LibraryView;
  files: LibraryFile[];
  departments: Department[];
  onOpen: (file: LibraryFile) => void;
  onZoom: (file: LibraryFile) => void;
  onDownload: (file: LibraryFile) => void;
  onDelete: (file: LibraryFile) => void;
  onScope: (file: LibraryFile, departmentId: string) => void;
  onSend: (file: LibraryFile, departmentId: string) => void;
}) {
  if (view === "list") {
    return (
      <div className="overflow-x-auto rounded-2xl border border-outline-variant">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-outline-variant bg-low">
              <th scope="col" className="md-label-sm px-3 py-2 font-medium text-on-variant">
                Name
              </th>
              <th
                scope="col"
                className="md-label-sm hidden px-3 py-2 font-medium text-on-variant medium:table-cell"
              >
                Kind
              </th>
              <th
                scope="col"
                className="md-label-sm px-3 py-2 text-right font-medium text-on-variant"
              >
                Size
              </th>
              <th
                scope="col"
                className="md-label-sm hidden px-3 py-2 font-medium text-on-variant expanded:table-cell"
              >
                Modified
              </th>
              <th scope="col" className="px-3 py-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {files.map((file) => (
              <tr
                key={file.id}
                className="border-b border-outline-variant last:border-b-0 hover:bg-low"
              >
                {/* width:100% with max-width:0 is what lets a table cell give
                    its space back: the name truncates and the fixed columns
                    keep their width, instead of the longest filename widening
                    the whole table past the screen. */}
                <td className="w-full max-w-0 px-3 py-1.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Thumb file={file} size={28} onZoom={onZoom} />
                    <button
                      onClick={() => onOpen(file)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="md-body block truncate">{file.name}</span>
                      {file.note ? (
                        <span className="md-label-sm block truncate text-on-variant/75">
                          {file.note}
                        </span>
                      ) : null}
                    </button>
                  </div>
                </td>
                <td className="md-label-sm hidden whitespace-nowrap px-3 py-1.5 text-on-variant medium:table-cell">
                  {KIND_ONE[file.kind]}
                </td>
                {/* Tabular figures, so the digits line up down the column. */}
                <td className="md-label-sm whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-on-variant">
                  {formatBytes(file.size ?? 0)}
                </td>
                <td className="md-label-sm hidden whitespace-nowrap px-3 py-1.5 text-on-variant expanded:table-cell">
                  {formatRelativeTime(file.updatedAt)}
                </td>
                <td className="px-3 py-1.5">
                  <div className="flex justify-end gap-0.5">
                    <IconAction label="Download" onClick={() => onDownload(file)}>
                      <DownloadIcon className="h-4 w-4" />
                    </IconAction>
                    <IconAction label="Delete" onClick={() => onDelete(file)}>
                      <TrashIcon className="h-4 w-4" />
                    </IconAction>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (view === "compact") {
    return (
      <ul className="grid grid-cols-1 gap-2 medium:grid-cols-2 expanded:grid-cols-3 large:grid-cols-4">
        {files.map((file) => (
          <li key={file.id}>
            <div className="flex items-center gap-2.5 rounded-xl bg-container p-2.5 shadow-e1">
              <Thumb file={file} size={40} onZoom={onZoom} />
              <button onClick={() => onOpen(file)} className="min-w-0 flex-1 text-left">
                <span className="md-body block truncate">{file.name}</span>
                <span className="md-label-sm block truncate text-on-variant/75">
                  {formatBytes(file.size ?? 0)} · {formatRelativeTime(file.updatedAt)}
                </span>
              </button>
              <IconAction label="Download" onClick={() => onDownload(file)}>
                <DownloadIcon className="h-4 w-4" />
              </IconAction>
            </div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    // A card holds two selects, so it needs more room than a compact row: two
    // across from medium, and only past 1200 is there space for a third.
    <ul className="grid grid-cols-1 gap-3 medium:grid-cols-2 large:grid-cols-3">
      {files.map((file) => (
        <li key={file.id}>
          <FileCard
            file={file}
            departments={departments}
            onOpen={onOpen}
            onZoom={onZoom}
            onDownload={onDownload}
            onDelete={onDelete}
            onScope={onScope}
            onSend={onSend}
          />
        </li>
      ))}
    </ul>
  );
}

const KIND_ONE: Record<AttachmentKind, string> = {
  image: "Image",
  pdf: "PDF",
  document: "Document",
};

/**
 * The thumbnail, at whichever size the view asks for.
 *
 * An image is its own button: clicking it opens the full screen viewer rather
 * than the file's dialog, because at 28 or 40 pixels the one thing you cannot
 * do is see it. Everything else falls back to the kind's glyph and opens the
 * dialog like the rest of the row.
 */
function Thumb({
  file,
  size,
  onZoom,
}: {
  file: LibraryFile;
  size: number;
  onZoom: (file: LibraryFile) => void;
}) {
  const style = { width: size, height: size };

  if (file.kind === "image") {
    return (
      <button
        type="button"
        onClick={() => onZoom(file)}
        title={`Open ${file.name}`}
        aria-label={`Open ${file.name} full screen`}
        className="flex-none cursor-zoom-in rounded-lg"
        style={style}
      >
        {/* Stored bytes or an API URL, so next/image has nothing to add. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={attachmentSrc(file)}
          alt={file.name}
          className="h-full w-full rounded-lg border border-outline-variant object-cover"
        />
      </button>
    );
  }

  return (
    <span
      aria-hidden
      className="grid flex-none place-items-center rounded-lg bg-high"
      style={style}
    >
      {FILE_ICON[file.kind]}
    </span>
  );
}

/**
 * One file, at browsing size.
 *
 * Scope leads and Send to follows, because scope decides who can reach the
 * file at all, which matters more often than where to send it once.
 */
function FileCard({
  file,
  departments,
  onOpen,
  onZoom,
  onDownload,
  onDelete,
  onScope,
  onSend,
}: {
  file: LibraryFile;
  departments: Department[];
  onOpen: (file: LibraryFile) => void;
  onZoom: (file: LibraryFile) => void;
  onDownload: (file: LibraryFile) => void;
  onDelete: (file: LibraryFile) => void;
  onScope: (file: LibraryFile, departmentId: string) => void;
  onSend: (file: LibraryFile, departmentId: string) => void;
}) {
  return (
    <Card className="flex h-full flex-col gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <Thumb file={file} size={56} onZoom={onZoom} />
        <button onClick={() => onOpen(file)} className="min-w-0 flex-1 text-left">
          <span className="md-title block truncate">{file.name}</span>
          <span className="md-label-sm mt-0.5 block text-on-variant/75">
            {formatBytes(file.size ?? 0)} ·{" "}
            {estimateAttachmentTokens(file).toLocaleString()} tokens ·{" "}
            {formatRelativeTime(file.updatedAt)}
          </span>
          {file.note ? (
            <span className="md-label-sm mt-1 block truncate text-on-variant">
              {file.note}
            </span>
          ) : null}
        </button>
      </div>

      <Select
        aria-label={`Who can use ${file.name}`}
        size="sm"
        value={file.departmentId ?? ""}
        onChange={(event) => onScope(file, event.target.value)}
        className="mt-auto"
      >
        <option value="">Private to you</option>
        <option value={COMPANY_ID}>Every department</option>
        {departments.map((department) => (
          <option key={department.id} value={department.id}>
            {department.name}
          </option>
        ))}
      </Select>

      <div className="flex flex-wrap items-center gap-1.5">
        <Select
          aria-label={`Send ${file.name} to a department`}
          size="sm"
          value=""
          onChange={(event) => {
            if (event.target.value) onSend(file, event.target.value);
          }}
          className="flex-1"
        >
          <option value="">Send to…</option>
          {departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.personaName || department.name}
            </option>
          ))}
        </Select>

        <IconAction label="Download" onClick={() => onDownload(file)}>
          <DownloadIcon className="h-4 w-4" />
        </IconAction>
        <IconAction label="Delete" onClick={() => onDelete(file)}>
          <TrashIcon className="h-4 w-4" />
        </IconAction>
      </div>
    </Card>
  );
}
