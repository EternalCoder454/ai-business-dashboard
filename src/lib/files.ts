import JSZip from "jszip";
import { AttachmentError, fileToAttachment } from "./images";
import { COMPANY_ID } from "./seed";
import type { Attachment, AttachmentKind, LibraryFile } from "./types";

export const ACCEPTED_FILE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "text/csv",
];

/** The API caps a request at 32MB, and base64 adds a third on top of the bytes. */
const MAX_PDF_BYTES = 15 * 1024 * 1024;
const MAX_DOC_BYTES = 10 * 1024 * 1024;

const DOCX_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function newFileId(): string {
  return `att_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function toBase64(file: Blob): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  // Chunked, because String.fromCharCode blows the stack on a large spread.
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Pulls readable text out of a .docx.
 *
 * Anthropic reads PDFs natively but not Word files, so the choice is to convert
 * or to refuse. A .docx is a zip whose word/document.xml holds the body, and
 * the text lives in w:t nodes. Paragraph and row boundaries are reconstructed
 * from w:p and w:tr so a table does not collapse into one run-on line.
 */
export async function extractDocxText(file: Blob): Promise<string> {
  const zip = await JSZip.loadAsync(file);
  const entry = zip.file("word/document.xml");
  if (!entry) {
    throw new AttachmentError(
      "That .docx has no readable document body. It may be corrupt, or a .doc renamed.",
    );
  }

  const xml = await entry.async("string");
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new AttachmentError("That .docx could not be parsed.");
  }

  const lines: string[] = [];
  const paragraphs = doc.getElementsByTagName("w:p");

  for (let i = 0; i < paragraphs.length; i += 1) {
    const runs = paragraphs[i].getElementsByTagName("w:t");
    let line = "";
    for (let j = 0; j < runs.length; j += 1) line += runs[j].textContent ?? "";
    lines.push(line.trim());
  }

  const text = lines
    .join("\n")
    // Collapse runs of blank lines left by empty paragraphs.
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!text) {
    throw new AttachmentError(
      "That .docx has no text in it. Images inside a Word file cannot be read.",
    );
  }

  return text;
}

export function kindForType(mediaType: string): AttachmentKind | null {
  if (mediaType.startsWith("image/")) return "image";
  if (mediaType === "application/pdf") return "pdf";
  if (mediaType === DOCX_TYPE || mediaType.startsWith("text/")) return "document";
  return null;
}

/**
 * One entry point for anything dropped, pasted, picked, or pulled out of the
 * Library. Images are downscaled, PDFs are kept as bytes for the API to read,
 * and Word or text files are converted to text here because the API will not
 * do it for us.
 */
export async function fileToAttachmentAny(file: File): Promise<Attachment> {
  const kind = kindForType(file.type);

  if (kind === "image") return fileToAttachment(file);

  if (kind === "pdf") {
    if (file.size > MAX_PDF_BYTES) {
      throw new AttachmentError(
        `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)}MB. Keep PDFs under 15MB.`,
      );
    }
    return {
      id: newFileId(),
      kind: "pdf",
      mediaType: "application/pdf",
      name: file.name || "document.pdf",
      data: await toBase64(file),
      width: 0,
      height: 0,
      size: file.size,
    };
  }

  if (kind === "document") {
    if (file.size > MAX_DOC_BYTES) {
      throw new AttachmentError(`${file.name} is too large. Keep documents under 10MB.`);
    }
    const text =
      file.type === DOCX_TYPE ? await extractDocxText(file) : (await file.text()).trim();

    if (!text) throw new AttachmentError(`${file.name} is empty.`);

    return {
      id: newFileId(),
      kind: "document",
      mediaType: file.type || "text/plain",
      name: file.name || "document.txt",
      data: "",
      text,
      width: 0,
      height: 0,
      size: file.size,
    };
  }

  throw new AttachmentError(
    `${file.name || "That file"} is a ${file.type || "unknown type"}. Images, PDFs, Word documents, and plain text are supported.`,
  );
}

/** Rough token cost, so the cost of attaching something is visible up front. */
export function estimateAttachmentTokens(attachment: Attachment): number {
  if (attachment.kind === "image") {
    if (!attachment.width || !attachment.height) return 1600;
    return Math.round((attachment.width * attachment.height) / 750);
  }
  if (attachment.kind === "document") {
    return Math.round((attachment.text?.length ?? 0) / 3.7);
  }
  // A PDF page is roughly a page image plus its text. This is deliberately a
  // high estimate, because being surprised by a bill is worse than being early.
  const pages = Math.max(1, Math.round((attachment.size ?? 0) / 45_000));
  return pages * 2200;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export const FILE_ICON: Record<AttachmentKind, string> = {
  image: "🖼",
  pdf: "📕",
  document: "📝",
};

/**
 * The files one department may attach: its own, plus everything shared with
 * the whole company. Untagged files stay out, since a file nobody has scoped
 * has not been offered to anyone yet.
 */
export function filesForDepartment(
  files: LibraryFile[],
  departmentId: string,
): LibraryFile[] {
  return files.filter(
    (file) => file.departmentId === departmentId || file.departmentId === COMPANY_ID,
  );
}
