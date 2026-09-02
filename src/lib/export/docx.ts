import JSZip from "jszip";
import { parseMarkdown, type Block, type Inline } from "./markdown";

/**
 * A Word document, built by hand.
 *
 * A .docx is a zip of XML with a rigid set of parts, which is a fair amount of
 * ceremony but not much cleverness. Writing it directly is a few hundred lines;
 * the libraries that do it are megabytes, ship their own opinions about layout,
 * and would sit in the bundle of an app that produces one of these occasionally.
 *
 * The parts, and why each is here:
 *
 * - `[Content_Types].xml` says what every file in the zip is. Word refuses to
 *   open the document without it, and says only that the file is corrupt.
 * - `_rels/.rels` points at the main document. Also required.
 * - `word/styles.xml` defines Heading1 through Heading4, Quote, and the code
 *   style. Without it Word still opens the file, but every heading renders as
 *   body text, because a style has to be declared before it can be referenced.
 * - `word/numbering.xml` defines the bullet and the numbered list. Same again:
 *   a list without it is a paragraph with no marker.
 * - `word/document.xml` is the content.
 */

/** XML text nodes and attribute values, escaped. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Word rejects the whole file on a control character rather than skipping
    // it, and text pasted out of a terminal or a PDF is full of them.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

/** One run of text, carrying whatever marks it had. */
function run(piece: Inline): string {
  const props: string[] = [];
  if (piece.type === "bold") props.push("<w:b/>");
  if (piece.type === "italic") props.push("<w:i/>");
  if (piece.type === "code") props.push('<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>');
  if (piece.type === "link") props.push('<w:color w:val="156D7F"/><w:u w:val="single"/>');

  const text =
    piece.type === "link" && piece.href !== piece.text
      ? `${piece.text} (${piece.href})`
      : piece.text;

  // xml:space preserve, or Word eats the spaces between runs and the sentence
  // comes out withoutgaps.
  return (
    `<w:r>${props.length ? `<w:rPr>${props.join("")}</w:rPr>` : ""}` +
    `<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`
  );
}

function paragraph(content: Inline[], style?: string, extra = ""): string {
  const props = [style ? `<w:pStyle w:val="${style}"/>` : "", extra].join("");
  return (
    `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ""}` +
    `${content.map(run).join("")}</w:p>`
  );
}

/** A list paragraph, pointing at one of the two numbering definitions. */
function listParagraph(content: Inline[], numId: number, depth: number): string {
  return paragraph(
    content,
    "ListParagraph",
    `<w:numPr><w:ilvl w:val="${depth}"/><w:numId w:val="${numId}"/></w:numPr>`,
  );
}

function tableXml(header: Inline[][], rows: Inline[][][]): string {
  const cell = (content: Inline[], bold: boolean) =>
    `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>` +
    paragraph(bold ? content.map((c) => ({ ...c, type: "bold" as const })) : content) +
    `</w:tc>`;

  const line = (cells: Inline[][], bold: boolean) =>
    `<w:tr>${cells.map((c) => cell(c, bold)).join("")}</w:tr>`;

  return (
    `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/>` +
    `<w:tblW w:w="0" w:type="auto"/>` +
    `<w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"]
      .map((side) => `<w:${side} w:val="single" w:sz="4" w:color="D0D5D8"/>`)
      .join("")}</w:tblBorders></w:tblPr>` +
    line(header, true) +
    rows.map((r) => line(r, false)).join("") +
    `</w:tbl>` +
    // Word merges two tables that touch, so an empty paragraph keeps them apart.
    `<w:p/>`
  );
}

function blockXml(block: Block): string {
  switch (block.type) {
    case "heading":
      return paragraph(block.content, `Heading${block.level}`);
    case "paragraph":
      return paragraph(block.content);
    case "bullet":
      return listParagraph(block.content, 1, block.depth);
    case "number":
      return listParagraph(block.content, 2, block.depth);
    case "quote":
      return paragraph(block.content, "Quote");
    case "code":
      // One paragraph per line: a single paragraph with newlines in it renders
      // as one long line, because a newline is not a break in this format.
      return block.text
        .split("\n")
        .map((line) => paragraph([{ type: "text", text: line }], "CodeBlock"))
        .join("");
    case "rule":
      return `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:color="D0D5D8"/></w:pBdr></w:pPr></w:p>`;
    case "table":
      return tableXml(block.header, block.rows);
  }
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>`;

/** Half-points for sizes, twentieths of a point for spacing. Word's units. */
function headingStyle(level: number, size: number, before: number): string {
  return `<w:style w:type="paragraph" w:styleId="Heading${level}">
<w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/>
<w:pPr><w:keepNext/><w:spacing w:before="${before}" w:after="120"/><w:outlineLvl w:val="${level - 1}"/></w:pPr>
<w:rPr><w:b/><w:sz w:val="${size}"/><w:color w:val="1C1F22"/></w:rPr></w:style>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr>
<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault>
</w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
${headingStyle(1, 40, 0)}${headingStyle(2, 30, 320)}${headingStyle(3, 26, 280)}${headingStyle(4, 22, 240)}
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/>
<w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="60"/><w:contextualSpacing/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/>
<w:pPr><w:ind w:left="480"/><w:pBdr><w:left w:val="single" w:sz="12" w:space="8" w:color="C9CFD3"/></w:pBdr></w:pPr>
<w:rPr><w:i/><w:color w:val="5B6167"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="CodeBlock"><w:name w:val="Code Block"/><w:basedOn w:val="Normal"/>
<w:pPr><w:spacing w:after="0"/><w:shd w:val="clear" w:fill="F4F5F6"/><w:ind w:left="240"/></w:pPr>
<w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="19"/></w:rPr></w:style>
<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/>
<w:rPr><w:color w:val="5B6167"/><w:sz w:val="20"/></w:rPr></w:style>
</w:styles>`;

/** Four indent levels each, which is as deep as a brief ever goes. */
function levels(format: string, text: string): string {
  return [0, 1, 2, 3]
    .map(
      (i) =>
        `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="${format}"/>` +
        `<w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/>` +
        `<w:pPr><w:ind w:left="${(i + 1) * 360}" w:hanging="360"/></w:pPr></w:lvl>`,
    )
    .join("");
}

const NUMBERING = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>
${levels("bullet", "•")}</w:abstractNum>
<w:abstractNum w:abstractNumId="2"><w:multiLevelType w:val="hybridMultilevel"/>
${levels("decimal", "%1.")}</w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num>
<w:num w:numId="2"><w:abstractNumId w:val="2"/></w:num>
</w:numbering>`;

export interface DocxInput {
  title: string;
  /** Who it is from and when, printed under the title. */
  subtitle?: string;
  /** Markdown. */
  body: string;
}

/** Builds the file. Returns bytes, so both a browser and a route can send it. */
export async function buildDocx(input: DocxInput): Promise<Uint8Array> {
  const blocks = parseMarkdown(input.body);

  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
${paragraph([{ type: "text", text: input.title }], "Heading1")}
${input.subtitle ? paragraph([{ type: "text", text: input.subtitle }], "Subtitle") : ""}
${blocks.map(blockXml).join("\n")}
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>
<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr>
</w:body></w:document>`;

  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES);
  zip.file("_rels/.rels", RELS);
  zip.file("word/document.xml", document);
  zip.file("word/_rels/document.xml.rels", DOC_RELS);
  zip.file("word/styles.xml", STYLES);
  zip.file("word/numbering.xml", NUMBERING);

  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
