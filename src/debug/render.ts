// Plaintext sectioned renderer for the debug dump.
//
// No ANSI colors — output is meant to be pasted into a GitHub issue, so
// we keep it grep-friendly and copyable. Each section is a header line
// followed by `key: value` lines or a free-form text block.

export interface Section {
  title: string;
  body: string;
}

export function renderSection(title: string, lines: string[]): Section {
  return { title, body: lines.join("\n") };
}

export function renderKeyValues(rows: Array<[string, unknown]>): string[] {
  const maxKey = rows.reduce((m, [k]) => Math.max(m, k.length), 0);
  return rows.map(([k, v]) => `  ${k.padEnd(maxKey, " ")}  ${formatValue(v)}`);
}

function formatValue(value: unknown): string {
  if (value === undefined) return "<unset>";
  if (value === null) return "<null>";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function renderDocument(sections: Section[]): string {
  const out: string[] = [];
  out.push("=".repeat(72));
  out.push("Doc Detective diagnostic dump");
  out.push("=".repeat(72));
  for (const s of sections) {
    out.push("");
    out.push(`-- ${s.title} `.padEnd(72, "-"));
    out.push(s.body);
  }
  out.push("");
  out.push("=".repeat(72));
  return out.join("\n");
}
