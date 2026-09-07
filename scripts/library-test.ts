/**
 * Whether a head can read the business's own documents, and only the right ones.
 *
 * The Library existed for months while no head could see it: the prompt carried
 * persona, profile, memory, tasks and calendar, and never the documents anybody
 * had uploaded. This covers the fix, and most of it is about the half that is
 * not the feature. A document assigned to nobody is private, a document
 * assigned to Finance is not Marketing's, and a title a head was never shown
 * must not be readable by naming it.
 *
 *   npm run library-test
 */
import {
  LIBRARY_LIMITS,
  buildLibraryBlock,
  excerptOf,
  filesForDepartment,
  findDocument,
  libraryFor,
} from "../src/lib/library";
import { buildSystemPrompt } from "../src/lib/prompts";
import { toolsFor } from "../src/lib/tools";
import { COMPANY_ID, seedDepartments } from "../src/lib/seed";
import type { CompanyProfile, Department, LibraryFile } from "../src/lib/types";

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures += 1;
}

const T0 = 1_770_000_000_000;

function doc(over: Partial<LibraryFile> & Pick<LibraryFile, "name">): LibraryFile {
  return {
    id: over.name,
    kind: "document",
    mediaType: "text/plain",
    createdAt: T0,
    updatedAt: T0,
    ...over,
  } as LibraryFile;
}

const departments = seedDepartments();
const finance = departments.find((d) => d.name === "Finance") as Department;
const marketing = departments.find((d) => d.name === "Marketing") as Department;

const SECRET = "Fee schedule: 4,200 per engagement.";

const FILES: LibraryFile[] = [
  doc({ name: "Engagement Letter.docx", departmentId: COMPANY_ID, text: "Standard terms for new clients." }),
  doc({ name: "Fee Schedule 2026.docx", departmentId: finance.id, text: SECRET, note: "Current pricing" }),
  doc({ name: "Brand Guide.docx", departmentId: marketing.id, text: "Use the wordmark on white." }),
  doc({ name: "Personal Notes.docx", text: "My own scratch file." }),
  doc({ name: "Office Photo.png", kind: "image", departmentId: COMPANY_ID }),
  doc({ name: "Empty Draft.docx", departmentId: COMPANY_ID, text: "   " }),
];

const EMPTY_PROFILE: CompanyProfile = {
  mission: "", audience: "", brandVoice: "", keyFacts: "",
  products: "", stage: "", competitors: "", constraints: "", goals: "",
  businessNotes: "", marketNotes: "", directionNotes: "", factsNotes: "",
};

console.log("a head sees its own documents and the company's, and nothing else");
{
  const mine = libraryFor(FILES, finance.id).map((f) => f.name);
  check("its own department's document is readable", mine.includes("Fee Schedule 2026.docx"));
  check("a company-wide document is readable", mine.includes("Engagement Letter.docx"));
  check("another department's is not", !mine.includes("Brand Guide.docx"), mine.join());
  /*
   * The one that matters most. An absent departmentId is documented as private
   * to whoever uploaded it, and it is the only way to keep a document in the
   * panel without handing it to a model.
   */
  check("an unassigned document is private and never readable", !mine.includes("Personal Notes.docx"));
  check("an image is not offered, since reading is all a head can do", !mine.includes("Office Photo.png"));
  check("a document with only whitespace is not offered", !mine.includes("Empty Draft.docx"));
  check("Marketing sees its own instead", libraryFor(FILES, marketing.id).map((f) => f.name).includes("Brand Guide.docx"));
}

console.log("\nthe two scoping rules are the same rule");
{
  /*
   * filesForDepartment used to live in files.ts and answer only "what may a
   * person attach". It now answers "what may a head read" as well. If those
   * ever come apart, one of them is wider than anybody decided.
   */
  for (const department of [finance.id, marketing.id, COMPANY_ID]) {
    const attachable = new Set(filesForDepartment(FILES, department).map((f) => f.name));
    const readable = libraryFor(FILES, department).map((f) => f.name);
    check(
      `nothing readable by ${department} is outside what it may attach`,
      readable.every((name) => attachable.has(name)),
      readable.filter((n) => !attachable.has(n)).join(),
    );
  }
}

console.log("\nthe catalogue names documents and never carries them");
{
  const block = buildLibraryBlock(FILES, finance.id);
  check("it names a readable document", block.includes("Fee Schedule 2026.docx"));
  check("it carries the note", block.includes("Current pricing"));
  check("it tells the head how to read one", block.includes("read_document"));
  check("it counts only what is readable", block.includes("2 documents"), block.slice(0, 80));

  /*
   * The cost property, and the honesty one. Contents in the prompt would be
   * sent on every message whether or not they mattered, and the block tells the
   * head it carries titles rather than contents, so that has to be true even
   * for a document short enough to fit in a preview.
   */
  check("it does not carry the whole document", !block.includes("per engagement"), "contents leaked");
  check("another department's document is absent", !block.includes("Brand Guide"));
  check("a private document is absent", !block.includes("Personal Notes"));
  check("no documents means no block at all", buildLibraryBlock([], finance.id) === "");
  check(
    "a head with nothing readable gets no block",
    buildLibraryBlock([doc({ name: "x.docx", text: "hi" })], finance.id) === "",
  );
}

console.log("\nthe catalogue is cached rather than resent");
{
  const { stable, volatile } = buildSystemPrompt(
    finance, EMPTY_PROFILE, "Skorheim", [], "rules", undefined, [], [], [], [], "not-connected", FILES,
  );
  /*
   * It belongs in the half that sits above the cache breakpoint. In the
   * volatile half it would be rewritten on every message, which for a business
   * with forty documents is the whole saving gone.
   */
  check("it is in the stable half", stable.includes("THE LIBRARY"));
  check("and not in the volatile half", !volatile.includes("THE LIBRARY"));
  check("writing rules still come last", volatile.trim().endsWith("rules"));

  const without = buildSystemPrompt(finance, EMPTY_PROFILE, "Skorheim", [], "rules");
  check("a caller that passes no files gets the prompt it always got", !without.stable.includes("THE LIBRARY"));
}

console.log("\nreading one, by the name the head was given");
{
  check("an exact title finds it", findDocument(FILES, finance.id, "Fee Schedule 2026.docx")?.name === "Fee Schedule 2026.docx");
  check("case does not matter", findDocument(FILES, finance.id, "fee schedule 2026.docx")?.name === "Fee Schedule 2026.docx");
  check("a unique partial finds it", findDocument(FILES, finance.id, "Fee Schedule")?.name === "Fee Schedule 2026.docx");
  check("an empty title finds nothing", findDocument(FILES, finance.id, "  ") === undefined);

  /*
   * The security property, said as a test rather than as a comment. Scoping
   * that only applies to the listing is not scoping: a head that guessed or was
   * told a title must still not be able to open it.
   */
  check(
    "naming another department's document does not open it",
    findDocument(FILES, finance.id, "Brand Guide.docx") === undefined,
  );
  check(
    "naming a private document does not open it",
    findDocument(FILES, finance.id, "Personal Notes.docx") === undefined,
  );

  // Two documents matching one partial is a wrong answer waiting to be cited
  // confidently, so it is refused rather than guessed.
  const twins = [
    doc({ name: "Contract A.docx", departmentId: COMPANY_ID, text: "one" }),
    doc({ name: "Contract B.docx", departmentId: COMPANY_ID, text: "two" }),
  ];
  check("an ambiguous partial finds nothing", findDocument(twins, finance.id, "Contract") === undefined);
  check("but the exact one still works", findDocument(twins, finance.id, "Contract B.docx")?.name === "Contract B.docx");
}

console.log("\na long document comes back capped, and says so");
{
  const long = doc({ name: "Long.docx", departmentId: COMPANY_ID, text: "x".repeat(LIBRARY_LIMITS.excerpt + 5_000) });
  const excerpt = excerptOf(long);
  check("it is capped", excerpt.length < LIBRARY_LIMITS.excerpt + 500, String(excerpt.length));
  check("and the truncation is declared", excerpt.includes("This document continues"));

  const short = doc({ name: "Short.docx", departmentId: COMPANY_ID, text: "All of it." });
  check("a short document comes back whole", excerptOf(short) === "All of it.");
  check("and says nothing about continuing", !excerptOf(short).includes("continues"));
}

console.log("\nthe tool is offered only when there is something to read");
{
  const named = (options: Parameters<typeof toolsFor>[1]) =>
    toolsFor(finance.id, options).map((t) => t.name);
  check("no documents, no tool", !named({ documents: 0 }).includes("read_document"));
  check("nothing said at all, no tool", !named({}).includes("read_document"));
  check("documents, tool", named({ documents: 2 }).includes("read_document"));
  check(
    "and it never asks for confirmation, since it only reads",
    toolsFor(finance.id, { documents: 1 }).find((t) => t.name === "read_document")?.writes === false,
  );
}

console.log("\nthe catalogue groups by project, when there are any");
{
  const now = Date.now();
  const file = (name: string, projectId?: string): LibraryFile => ({
    id: name,
    name,
    kind: "document",
    mediaType: "text/plain",
    size: 100,
    text: "some contents",
    departmentId: COMPANY_ID,
    projectId,
    width: 0,
    height: 0,
    createdAt: now,
    updatedAt: now,
  });

  const files = [
    file("Acme terms.pdf", "proj_acme"),
    file("Acme quote.pdf", "proj_acme"),
    file("Beta scope.pdf", "proj_beta"),
    file("Insurance.pdf"),
  ];
  const projects = [
    { id: "proj_acme", name: "Acme rebuild" },
    { id: "proj_beta", name: "Beta pilot" },
    // A project with nothing in it. A heading over an empty list is a claim
    // that there is something there.
    { id: "proj_empty", name: "Nothing here" },
  ];

  const grouped = buildLibraryBlock(files, "finance", projects);
  check("names a project that holds something", grouped.includes("Acme rebuild:"));
  check("names the second one too", grouped.includes("Beta pilot:"));
  check("and not one that holds nothing", !grouped.includes("Nothing here"));
  check("the leftovers get their own heading", grouped.includes("Not part of a project:"));
  check(
    "which comes last, since it is the residue rather than the point",
    grouped.indexOf("Not part of a project:") > grouped.indexOf("Acme rebuild:"),
  );
  check(
    "every document still appears exactly once",
    files.every((one) => grouped.split(`"${one.name}"`).length === 2),
  );
  check(
    "a document sits under its own project",
    grouped
      .slice(grouped.indexOf("Beta pilot:"), grouped.indexOf("Not part of a project:"))
      .includes("Beta scope.pdf"),
  );

  // The old shape, unchanged, for a business that has never made a project.
  const flat = buildLibraryBlock(files, "finance", []);
  check("no projects means no headings", !flat.includes("Not part of a project:"));
  check("and every document is still listed", flat.includes("Insurance.pdf"));
  check(
    "a project nobody filed anything under changes nothing",
    buildLibraryBlock(files, "finance", [{ id: "proj_empty", name: "Nothing here" }]) === flat,
  );
}

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
