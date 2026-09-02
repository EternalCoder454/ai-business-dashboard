/**
 * A spreadsheet of something, for the half of business life that lives in one.
 *
 * Two things this gets right that a join on commas does not.
 *
 * Quoting: a value containing a comma, a quote, or a newline has to be wrapped
 * and its quotes doubled, or the row silently becomes several columns and
 * somebody's figures land under the wrong headings.
 *
 * Formula injection: a cell beginning `=`, `+`, `-`, or `@` is executed by
 * Excel and Sheets when the file is opened. A task somebody typed called
 * `=cmd|' /c calc'!A1` is a working attack on whoever opens the export, and the
 * person who typed it need not have had an account here at all: it could have
 * arrived through the API. Prefixing an apostrophe makes the cell text, which
 * is what it always was.
 */

const RISKY = /^[=+\-@\t\r]/;

function cell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  const safe = RISKY.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  // A BOM, because Excel on Windows reads a file without one as the local
  // codepage and turns every accented name into mojibake.
  return (
    "﻿" +
    [header, ...rows].map((row) => row.map(cell).join(",")).join("\r\n") +
    "\r\n"
  );
}
