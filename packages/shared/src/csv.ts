/** Leading characters that make a spreadsheet evaluate a cell as a formula. */
const FORMULA_PREFIX = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]/;
const LINE_END = "\r\n";

export type CsvCell = string | number | null;

/**
 * One RFC 4180 cell. Text that would start a formula gets a leading apostrophe,
 * so a franchise named "=HYPERLINK(...)" opens as text. Null is an empty cell.
 */
export function csvCell(value: CsvCell): string {
  if (value === null) return "";
  if (typeof value === "number") return String(value);
  const guarded = FORMULA_PREFIX.test(value) ? `'${value}` : value;
  return NEEDS_QUOTES.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

export function toCsv(header: string[], rows: CsvCell[][]): string {
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join(LINE_END) + LINE_END;
}
