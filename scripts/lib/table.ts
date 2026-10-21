// Plain text tables for script output. Pure.

/** Columns padded to their widest cell; numbers right aligned. */
export function formatTable(header: string[], rows: (string | number)[][]): string {
  const cells = [header, ...rows.map((r) => r.map(String))];
  const widths = header.map((_, i) => Math.max(...cells.map((r) => (r[i] ?? "").length)));
  const numeric = header.map((_, i) => rows.length > 0 && rows.every((r) => typeof r[i] === "number"));
  const line = (r: string[]) =>
    r.map((cell, i) => (numeric[i] ? cell.padStart(widths[i] ?? 0) : cell.padEnd(widths[i] ?? 0))).join("  ").trimEnd();
  const rule = widths.map((w) => "-".repeat(w)).join("  ");
  return [line(cells[0] ?? []), rule, ...cells.slice(1).map(line)].join("\n");
}
