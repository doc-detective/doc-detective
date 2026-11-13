import fs from "node:fs";
import path from "node:path";

import { reportOutputDir } from "../core/utils.js";
import { environmentLine, mediaPath, nonPassItems, verdict, writeReport } from "./model.js";

export { markdownReporter, buildMarkdown };

const LEVELS = ["specs", "tests", "contexts", "steps"];
// Bounding the row count is not enough on its own: a single `resultDescription`
// carries captured output (a failed `runShell` step embeds its stdout), so each
// value's length has to be bounded too. Evidence paths aren't clamped: a clamp over
// the whole cell would cut off the screenshot the row exists to show.
const MAX_ROWS = 100;
const MAX_CELL = 300;
// GitHub rejects a job step summary larger than 1 MiB outright rather than
// truncating it, so the whole artifact is lost if we go over by a byte.
const MAX_SUMMARY_BYTES = 1024 * 1024;
const TRUNCATION_NOTE = "\n_… summary truncated to fit the 1 MiB limit._\n";

// A `|` splits a table cell and a newline ends a row, and the same
// resultDescription is rendered in both places. A raw `<` is also load-bearing:
// a description naming an element (`Couldn't find '<button>'`) would otherwise
// swallow the rest of the cell as an unknown HTML tag.
function cell(value: any): string {
  const text = String(value ?? "")
    // `&` before `<`, or the ampersand of the entity we just inserted would be
    // escaped again. Without this, a description that already contains an
    // entity (`expected a &lt; b`) renders as `a < b` — the renderer decodes
    // it and the original text is lost.
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    // Backslash first: escaping `|` inserts one, and a backslash already in
    // the text would otherwise consume the escape and let the pipe split the
    // cell anyway (`a\|b` -> `a\\|b`, which renders as a literal `\` and a
    // cell break).
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    // A bare `\r` counts too: captured stdout from a progress bar is full of
    // them, and one would end the table row just as a newline does.
    .replace(/\r\n|\r|\n/g, "<br>")
    .trim();
  if (text.length <= MAX_CELL) return text;
  // Clamp AFTER expanding breaks, so MAX_CELL bounds what is actually emitted.
  // Clamping first would let a break-dense value grow 4x past the limit once
  // expanded, which made the overall size guarantee depend on how many
  // newlines the input happened to contain.
  //
  // The cut can land inside an inserted `<br>`; drop that fragment rather than
  // emit `<b`.
  return `${text.slice(0, MAX_CELL).replace(/<b?r?$/, "")}…`;
}

// Inside an inline-code span Markdown processes no escapes, so `cell()`'s
// backslash doubling would render a Windows path as `C:\\Users\\…`. Only a
// backtick can break out of the span, and a newline would end the line. A table
// splits on a pipe even inside a span, unless it's escaped.
function codeSpan(value: any): string {
  const text = String(value)
    .replace(/`/g, "'")
    .replace(/\r\n|\r|\n/g, " ")
    .trim()
    .replace(/\|/g, "\\|");
  return `\`${text}\``;
}

// Last line of defence on size.
//
// MAX_ROWS and MAX_CELL count UTF-16 code units, but the limit GitHub enforces is
// UTF-8 bytes. A CJK character is one code unit and three bytes, so a run whose
// descriptions are Chinese, Japanese or Korean — entirely ordinary for a
// documentation tool — can clear every character clamp and still go over.
//
// Truncating on a byte offset can split a multi-byte character; Node decodes
// the remainder as U+FFFD, so strip any trailing replacement characters rather
// than emit them.
function capBytes(text: string): string {
  if (Buffer.byteLength(text, "utf8") <= MAX_SUMMARY_BYTES) return text;
  const budget = MAX_SUMMARY_BYTES - Buffer.byteLength(TRUNCATION_NOTE, "utf8");
  const truncated = Buffer.from(text, "utf8")
    .subarray(0, budget)
    .toString("utf8")
    .replace(/\uFFFD+$/, "");
  return truncated + TRUNCATION_NOTE;
}

// Turn the results object into a run summary for a CI job summary
// ($GITHUB_STEP_SUMMARY) or a merge request comment. `outputFile` is where the
// summary lands, since its paths are relative to it (ADR 01180).
function buildMarkdown(results: any, outputFile?: string): string {
  const fromDir = outputFile ? path.dirname(outputFile) : process.cwd();
  const runDir = results?.runDir;
  const summary = results?.summary || {};
  const rows = LEVELS.map((level) => {
    const c = summary[level] || {};
    const [pass, fail, warn, skip] = [c.pass || 0, c.fail || 0, c.warning || 0, c.skipped || 0];
    const label = level[0].toUpperCase() + level.slice(1);
    return `| ${label} | ${pass} | ${fail} | ${warn} | ${skip} | ${pass + fail + warn + skip} |`;
  });

  const { status, label, text } = verdict(summary);
  const footer = environmentLine(results);
  const head = [
    "# Doc Detective results",
    "",
    status === "none" ? `**${text}**` : `**${label}** — ${text}`,
    "",
    "| Level | Pass | Fail | Warning | Skipped | Total |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    ...rows,
    ...(footer ? ["", footer] : []),
  ];

  // One table per status. Only the rows that get printed are built: a 5,000-failure
  // run would otherwise allocate every row just to slice them away.
  const items = nonPassItems(results);
  const table = (status: string) => {
    const listed = items.filter((item) => item.status === status);
    if (listed.length === 0) return [];
    const lines = ["| Location | Details |", "|---|---|"];
    for (const item of listed.slice(0, MAX_ROWS)) {
      const details = [
        cell(item.reason),
        item.hint && `Hint: ${cell(item.hint)}`,
        item.screenshot && `Screenshot: ${codeSpan(mediaPath(item.screenshot, runDir, fromDir))}`,
        item.recording && `Recording: ${codeSpan(mediaPath(item.recording, runDir, fromDir))}`,
        item.skippedNote,
      ];
      const location = `${codeSpan(item.idPath.length > MAX_CELL ? `${item.idPath.slice(0, MAX_CELL)}…` : item.idPath)}${
        item.description ? ` ${cell(item.description)}` : ""
      }`;
      lines.push(`| ${location} | ${details.filter(Boolean).join("<br>")} |`);
    }
    if (listed.length > MAX_ROWS) lines.push("", `… and ${listed.length - MAX_ROWS} more`);
    return lines;
  };
  const details = (heading: string, status: string) => {
    const lines = table(status);
    if (lines.length === 0) return [];
    const count = items.filter((item) => item.status === status).length;
    return ["", `<details><summary>${heading} (${count})</summary>`, "", ...lines, "", "</details>"];
  };
  const failed = table("FAIL");
  const failures = failed.length > 0 ? ["", "## Failures", "", ...failed] : [];
  const warnings = details("Warnings", "WARNING");
  const skips = details("Skipped", "SKIPPED");

  const artifacts =
    typeof runDir === "string" && fs.existsSync(runDir)
      ? ["", `Run artifacts: ${codeSpan(mediaPath(runDir, runDir, fromDir) || ".")}`]
      : [];
  const render = (...sections: string[][]) => [...head, ...sections.flat(), ...artifacts].join("\n") + "\n";
  const cut = (...sections: string[][]) => render(...sections).replace(/\n$/, TRUNCATION_NOTE);
  const fits = (text: string) => Buffer.byteLength(text, "utf8") <= MAX_SUMMARY_BYTES;

  // Over the limit, cut Skipped, then Warnings, before touching Failures.
  const whole = render(failures, warnings, skips);
  if (fits(whole)) return whole;
  const withWarnings = cut(failures, warnings);
  return fits(withWarnings) ? withWarnings : capBytes(cut(failures));
}

async function markdownReporter(
  config: any = {},
  outputPath: any,
  results: any,
  options: any = {}
): Promise<string | null> {
  // Namespaced rather than `summary.md`: `output` defaults to `"."`, so a bare
  // `--reporters markdown` writes into the repo root.
  const outputFile = path.resolve(reportOutputDir(outputPath), "doc-detective-summary.md");
  return writeReport("Markdown summary", outputFile, () => buildMarkdown(results, outputFile), config);
}
