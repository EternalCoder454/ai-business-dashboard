"use client";

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
  PageHeader,
  PlusIcon,
  Select,
  TextInput,
  TrashIcon,
  cx,
} from "@/components/ui";
import { createRipple } from "@/components/ui/ripple";
import { newId } from "@/lib/db";
import {
  ACCEPTED_FILE_TYPES,
  FILE_ICON,
  estimateAttachmentTokens,
  fileToAttachmentAny,
  formatBytes,
} from "@/lib/files";
import { AttachmentError, attachmentSrc } from "@/lib/images";
import { departmentHrefById, formatRelativeTime } from "@/lib/routes";
import { useStore } from "@/lib/store";
import type { AttachmentKind, LibraryFile } from "@/lib/types";

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
  const [dragging, setDragging] = useState(false);
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
      }
    }

    setBusy(false);
    setNotice(
      failure || (added ? `Added ${added} file${added === 1 ? "" : "s"}.` : "Nothing added."),
    );
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
        description="Anything a head can read: images, PDFs, Word documents, and plain text. Kept once here and attached to any conversation, rather than re-uploaded every time."
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

      <div className="flex flex-none flex-wrap items-center gap-2 border-b border-outline-variant px-4 py-3 medium:px-6 expanded:px-8">
        <Chip selected={filter === "all"} onClick={() => setFilter("all")}>
          All · {files.length}
        </Chip>
        {(["image", "pdf", "document"] as AttachmentKind[]).map((kind) => (
          <Chip key={kind} selected={filter === kind} onClick={() => setFilter(kind)}>
            {FILE_ICON[kind]} {KIND_LABEL[kind]} · {countFor(kind)}
          </Chip>
        ))}
        {files.length > 0 ? (
          <span className="md-label-sm ml-auto text-on-variant/75">
            {formatBytes(totalBytes)} stored in this browser
          </span>
        ) : null}
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
        <div className="mx-auto max-w-4xl">
          {notice ? (
            <p className="md-label mb-4 rounded-xl bg-low px-4 py-2.5 text-on-variant">
              {notice}
            </p>
          ) : null}

          {visible.length === 0 ? (
            <EmptyState
              icon={<span className="text-3xl">📁</span>}
              title={files.length === 0 ? "Nothing in the Library" : "Nothing of that kind"}
              description="Drop files anywhere on this page. Images and PDFs are read directly by the heads; Word and text files are converted to text on the way in, because the API cannot read .docx itself."
              action={
                <Button onClick={() => inputRef.current?.click()}>Add files</Button>
              }
            />
          ) : (
            <ul className="grid gap-3 medium:grid-cols-2">
              {visible.map((file) => (
                <li key={file.id}>
                  <Card className="flex h-full flex-col gap-3">
                    <button
                      onClick={() => setPreview(file)}
                      className="flex min-w-0 items-start gap-3 text-left"
                    >
                      {file.kind === "image" ? (
                        <img
                          src={attachmentSrc(file)}
                          alt={file.name}
                          className="h-14 w-14 flex-none rounded-xl border border-outline-variant object-cover"
                        />
                      ) : (
                        <span
                          aria-hidden
                          className="grid h-14 w-14 flex-none place-items-center rounded-xl bg-high text-2xl"
                        >
                          {FILE_ICON[file.kind]}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
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
                      </span>
                    </button>

                    <div className="mt-auto flex flex-wrap items-center gap-1.5">
                      <Select
                        aria-label={`Send ${file.name} to a head`}
                        value=""
                        onChange={(event) => {
                          if (event.target.value) void sendTo(file, event.target.value);
                        }}
                        className="h-9 flex-1 py-0 text-[0.8125rem]"
                      >
                        <option value="">Send to…</option>
                        {allDepartments.map((department) => (
                          <option key={department.id} value={department.id}>
                            {department.emoji} {department.personaName || department.name}
                          </option>
                        ))}
                      </Select>

                      <IconAction
                        label="Download"
                        onClick={() => {
                          const href =
                            file.kind === "document"
                              ? URL.createObjectURL(
                                  new Blob([file.text ?? ""], { type: "text/plain" }),
                                )
                              : attachmentSrc(file);
                          const anchor = document.createElement("a");
                          anchor.href = href;
                          anchor.download = file.name;
                          anchor.click();
                          if (file.kind === "document") URL.revokeObjectURL(href);
                        }}
                      >
                        <DownloadIcon className="h-4 w-4" />
                      </IconAction>
                      <IconAction label="Delete" onClick={() => void deleteFile(file.id)}>
                        <TrashIcon className="h-4 w-4" />
                      </IconAction>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
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
          const list = event.target.files;
          event.target.value = "";
          if (list?.length) void ingest(list);
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
            <Field label="Note" hint="Only for you. It is not sent to the heads.">
              <TextInput
                value={preview.note ?? ""}
                placeholder="What this is, or which client it belongs to"
                onChange={(event) => {
                  setPreview({ ...preview, note: event.target.value });
                  void updateFile(preview.id, { note: event.target.value });
                }}
              />
            </Field>

            {preview.kind === "image" ? (
              <img
                src={attachmentSrc(preview)}
                alt={preview.name}
                className="mx-auto max-h-[50vh] rounded-2xl object-contain"
              />
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
