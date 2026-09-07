import { COMPANY_ID } from "./seed";
import type { LibraryFile } from "./types";

/**
 * The business's own documents, and how a head gets at them.
 *
 * The panel had a Library and a head that could not see it. Persona, company
 * profile, memory, tasks and calendar all reached the prompt; the documents the
 * business actually uploaded did not, so Finance answered from general
 * knowledge while the real numbers sat one screen away. That is the difference
 * between advice and advice about this business, which is the thing being paid
 * for.
 *
 * The fix is deliberately not "put the documents in the prompt". A single
 * scanned return is more tokens than a whole conversation, and it would be sent
 * on every message whether or not it mattered. Instead a head is given the
 * catalogue, which is small, stable and cacheable, and reads a document only
 * when it decides one is worth reading.
 */

export const LIBRARY_LIMITS = {
  /** Documents named in the catalogue. Beyond this the newest are listed. */
  catalogue: 40,
  /** How much of one document comes back from a read. */
  excerpt: 12_000,
} as const;

/**
 * The files one department may reach: its own, plus everything shared with the
 * whole company.
 *
 * Three rules, and the third is the one that matters. A file assigned to a
 * department is that department's. A file assigned to the whole company is
 * everyone's. A file assigned to neither is private to whoever uploaded it and
 * reaches nobody: that is the documented meaning of an absent departmentId, and
 * it is the only way to put a document in the panel without offering it to
 * anyone.
 *
 * This lives here rather than in files.ts, which is where it used to be,
 * because it now answers two questions instead of one: which files a person may
 * attach, and which documents a head may read. Two copies of that rule is two
 * chances to widen one of them by accident. files.ts re-exports this, and this
 * module imports nothing that a server cannot load.
 */
export function filesForDepartment(
  files: LibraryFile[],
  departmentId: string,
): LibraryFile[] {
  return files.filter(
    (file) => file.departmentId === departmentId || file.departmentId === COMPANY_ID,
  );
}

/**
 * What one head can actually read: the files it may reach, that have text.
 *
 * The text requirement is not a second permission, it is what makes a file
 * useful here. Reading is the only thing a head can do with a document, so
 * listing a photograph it cannot open would be an invitation to try.
 */
export function libraryFor(files: LibraryFile[], departmentId: string): LibraryFile[] {
  return filesForDepartment(files, departmentId)
    .filter((file) => typeof file.text === "string" && file.text.trim().length > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Roughly how long a document is, in the unit a person would use. */
function lengthOf(file: LibraryFile): string {
  const words = (file.text ?? "").trim().split(/\s+/).length;
  if (words < 1_000) return `${words} words`;
  return `${(words / 1_000).toFixed(1)}k words`;
}

/**
 * The catalogue, which is what actually goes in the prompt.
 *
 * Titles, lengths and notes. Never contents, and there is no opening excerpt
 * either: a preview long enough to be useful is the whole of a short document,
 * so a five word fee schedule would have sat in the cached prefix of every
 * message while this block promised it carried only titles. A block that
 * misstates what it holds is worse than one that holds slightly less.
 *
 * This belongs in the stable half
 * of the prompt: it changes only when somebody uploads or removes a document,
 * which is rare, so it is written into the cache once and read back at a tenth
 * of the price on every message after.
 */
export function buildLibraryBlock(
  files: LibraryFile[],
  departmentId: string,
  /*
   * Projects, so the catalogue can be grouped by one.
   *
   * Optional and last, because every existing caller passes positionally and a
   * business with no projects gets exactly the flat list it had before.
   */
  projects: { id: string; name: string }[] = [],
): string {
  const mine = libraryFor(files, departmentId);
  if (mine.length === 0) return "";

  const listed = mine.slice(0, LIBRARY_LIMITS.catalogue);
  const describe = (file: LibraryFile) => {
    const note = file.note?.trim();
    return `- "${file.name}" (${lengthOf(file)})${note ? `\n  About: ${note}` : ""}`;
  };

  /*
   * Grouped by project, where the business has any.
   *
   * A flat list of forty titles is a list somebody has to read all of to find
   * the two that belong to the job in front of them. The names alone do not
   * carry it: "Terms.pdf" and "Terms (2).pdf" are the same document to a
   * reader and different contracts to a business.
   *
   * Only projects that actually hold a document this head can reach appear. A
   * heading with nothing under it is a claim that there is something there.
   */
  const named = projects.filter((project) =>
    listed.some((file) => file.projectId === project.id),
  );

  let body: string;
  if (named.length === 0) {
    body = listed.map(describe).join("\n");
  } else {
    const loose = listed.filter(
      (file) => !file.projectId || !named.some((project) => project.id === file.projectId),
    );
    const sections = named.map((project) => {
      const belonging = listed.filter((file) => file.projectId === project.id);
      return `${project.name}:\n${belonging.map(describe).join("\n")}`;
    });
    // Last, because a document that belongs to no project is the residue rather
    // than the point, and putting it first buries the grouping under it.
    if (loose.length) sections.push(`Not part of a project:\n${loose.map(describe).join("\n")}`);
    body = sections.join("\n\n");
  }

  const more =
    mine.length > listed.length
      ? `\n\n${mine.length - listed.length} older documents are not listed. Ask for one by name and it will be found.`
      : "";

  return `=== THE LIBRARY ===
This business has ${mine.length} document${mine.length === 1 ? "" : "s"} you can read. You have their titles below, not their contents.

Use read_document with the exact title when a document would settle the question, and prefer it over answering from general knowledge: these are this business's real terms, prices and numbers, and what you remember about how such things usually work is not a substitute. Say which document you read. If nothing here covers the question, answer normally and do not guess at what a document might say.

${body}${more}
=== END LIBRARY ===`;
}

/**
 * Finds the document a head asked for.
 *
 * Exact title first, then case insensitively, then a unique partial match. An
 * ambiguous name returns nothing rather than a guess, because handing back the
 * wrong contract and citing it confidently is worse than saying it could not be
 * found.
 */
export function findDocument(
  files: LibraryFile[],
  departmentId: string,
  title: string,
): LibraryFile | undefined {
  const mine = libraryFor(files, departmentId);
  const wanted = title.trim().toLowerCase();
  if (!wanted) return undefined;

  const exact = mine.find((file) => file.name === title.trim());
  if (exact) return exact;

  const insensitive = mine.filter((file) => file.name.toLowerCase() === wanted);
  if (insensitive.length === 1) return insensitive[0];

  const partial = mine.filter((file) => file.name.toLowerCase().includes(wanted));
  return partial.length === 1 ? partial[0] : undefined;
}

/** A document's text, capped, with the cap declared rather than silent. */
export function excerptOf(file: LibraryFile): string {
  const text = (file.text ?? "").trim();
  if (text.length <= LIBRARY_LIMITS.excerpt) return text;
  return (
    `${text.slice(0, LIBRARY_LIMITS.excerpt)}\n\n` +
    `[This document continues. You have read the first ${LIBRARY_LIMITS.excerpt.toLocaleString()} ` +
    `characters of ${text.length.toLocaleString()}. Say so if the answer might be further in.]`
  );
}
