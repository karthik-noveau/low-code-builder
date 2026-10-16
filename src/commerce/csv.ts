export function toCsv(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((value) => {
          const safe = /^[=+@\-\t\r]/.test(value) ? `'${value}` : value;
          return `"${safe.replaceAll('"', '""')}"`;
        })
        .join(","),
    )
    .join("\r\n");
}
export function parseCsv(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false,
    closed = false;
  source = source.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"' && source[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
        closed = true;
      } else field += c;
    } else if (c === '"') {
      if (field || closed) throw new Error("Invalid CSV quoting.");
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
      closed = false;
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && source[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
      field = "";
      closed = false;
    } else {
      if (closed) throw new Error("Unexpected text after a quoted CSV field.");
      field += c;
    }
  }
  if (quoted) throw new Error("Unclosed CSV field.");
  row.push(field);
  if (row.some((v) => v !== "")) rows.push(row);
  if (rows.some((r) => r.length !== rows[0].length))
    throw new Error("Every CSV row must have the same number of columns.");
  return rows;
}
