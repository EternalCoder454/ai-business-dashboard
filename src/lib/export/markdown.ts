/**
 * Enough of Markdown to carry a deliverable into a document.
 *
 * Not a general parser, and deliberately not a dependency. What comes out of a
 * head is headings, paragraphs, lists, the occasional table, and bold text: the
 * shape of a brief or a memo. Everything here exists because that shape needs
 * it, and the exotic parts of the syntax are left as the literal characters
 * somebody typed rather than half-supported.
 *
 * The output is a block list rather than HTML, because the two things that read
 * it want different endings. A .docx wants runs inside paragraphs with style
 * names; a print page wants elements. Going through HTML first would mean
 * parsing it again on the other side.
 */

export type Inline =
  | { type: "text"; text: string }
  | { type: "bold"; text: string }
  | { type: "italic"; text: string }
  | { type: "code"; text: string }
  | { type: "link"; text: string; href: string };

export type Block =
  | { type: "heading"; level: 1 | 2 | 3 | 4; content: Inline[] }
  | { type: "paragraph"; content: Inline[] }
  | { type: "bullet"; content: Inline[]; depth: number }
  | { type: "number"; content: Inline[]; depth: number }
  | { type: "quote"; content: Inline[] }
  | { type: "code"; text: string }
  | { type: "rule" }
  | { type: "table"; header: Inline[][]; rows: Inline[][][] };

/**
 * Splits one line into runs.
 *
 * One pass, longest marker first, so `**bold**` is not read as two italics. An
 * unmatched marker stays as text: somebody writing "5 * 3" should see "5 * 3".
 */
export function parseInline(line: string): Inline[] {
  const out: Inline[] = [];
  let plain = "";

  const flush = () => {
    if (plain) out.push({ type: "text", text: plain });
    plain = "";
  };

  let i = 0;
  while (i < line.length) {
    const rest = line.slice(i);

    const link = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(rest);
    if (link) {
      flush();
      out.push({ type: "link", text: link[1], href: link[2] });
      i += link[0].length;
      continue;
    }

    const code = /^`([^`]+)`/.exec(rest);
    if (code) {
      flush();
      out.push({ type: "code", text: code[1] });
      i += code[0].length;
      continue;
    }

    const bold = /^\*\*([^*]+)\*\*/.exec(rest) ?? /^__([^_]+)__/.exec(rest);
    if (bold) {
      flush();
      out.push({ type: "bold", text: bold[1] });
      i += bold[0].length;
      continue;
    }

    const italic = /^\*([^*\s][^*]*)\*/.exec(rest) ?? /^_([^_\s][^_]*)_/.exec(rest);
    if (italic) {
      flush();
      out.push({ type: "italic", text: italic[1] });
      i += italic[0].length;
      continue;
    }

    plain += line[i];
    i += 1;
  }

  flush();
  return out.length ? out : [{ type: "text", text: "" }];
}

/** Splits a table row on unescaped pipes, dropping the empty edges. */
function cells(line: string): string[] {
  return line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

const isDivider = (line: string) => /^\s*\|?[\s:-]*-[\s:|-]*\|?\s*$/.test(line) && line.includes("-");

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];

  // Paragraph lines are gathered until something ends them, so a wrapped
  // sentence stays one paragraph rather than becoming three.
  let paragraph: string[] = [];
  const endParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({ type: "paragraph", content: parseInline(paragraph.join(" ")) });
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    if (!line.trim()) {
      endParagraph();
      continue;
    }

    // Fenced code, kept verbatim to its closing fence or the end.
    if (/^\s*```/.test(line)) {
      endParagraph();
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !/^\s*```/.test(lines[i])) {
        body.push(lines[i]);
        i += 1;
      }
      blocks.push({ type: "code", text: body.join("\n") });
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      endParagraph();
      blocks.push({
        type: "heading",
        level: heading[1].length as 1 | 2 | 3 | 4,
        content: parseInline(heading[2].trim()),
      });
      continue;
    }

    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {
      endParagraph();
      blocks.push({ type: "rule" });
      continue;
    }

    // A table is a header row, a divider, then rows. Without the divider it is
    // just a line with pipes in it, which is somebody's prose.
    if (line.includes("|") && i + 1 < lines.length && isDivider(lines[i + 1])) {
      endParagraph();
      const header = cells(line).map(parseInline);
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
        rows.push(cells(lines[i]).map(parseInline));
        i += 1;
      }
      i -= 1;
      blocks.push({ type: "table", header, rows });
      continue;
    }

    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (quote) {
      endParagraph();
      blocks.push({ type: "quote", content: parseInline(quote[1]) });
      continue;
    }

    const bullet = /^(\s*)[-*+]\s+(.*)$/.exec(line);
    if (bullet) {
      endParagraph();
      blocks.push({
        type: "bullet",
        depth: Math.min(Math.floor(bullet[1].length / 2), 3),
        content: parseInline(bullet[2]),
      });
      continue;
    }

    const numbered = /^(\s*)\d+[.)]\s+(.*)$/.exec(line);
    if (numbered) {
      endParagraph();
      blocks.push({
        type: "number",
        depth: Math.min(Math.floor(numbered[1].length / 2), 3),
        content: parseInline(numbered[2]),
      });
      continue;
    }

    paragraph.push(line.trim());
  }

  endParagraph();
  return blocks;
}

/** The plain reading of a run list, for a filename or a preview. */
export function inlineText(content: Inline[]): string {
  return content.map((run) => run.text).join("");
}
