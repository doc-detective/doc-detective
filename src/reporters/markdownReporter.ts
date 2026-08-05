import fs from "node:fs";
import path from "node:path";

import { reportOutputDir } from "./outputDir.js";

export { markdownReporter, buildMarkdown };

const LEVELS = ["specs", "tests", "contexts", "steps"];
// GitHub rejects a job step summary larger than 1 MiB outright rather than
// truncating it. Bounding the row count is not enough on its own: a single
// `resultDescription` carries captured output (a failed `runShell` step embeds
// its stdout), so cell length has to be bounded too.
const MAX_FAILURES = 100;
const MAX_CELL = 300;
// One context can fail an unbounded number of steps, so the row count and the
// cell clamp together still leave `detail` unbounded without this.
const MAX_STEPS_PER_FAILURE = 5;

// A `|` splits a table cell and a newline ends a row, and the same
// resultDescription is rendered in both places. A raw `<` is also load-bearing:
// a description naming an element (`Couldn't find '<button>'`) would otherwise
// swallow the rest of the cell as an unknown HTML tag.
function cell(value: any): string {
  const text = String(value ?? "")
    .replace(/</g, "&lt;")
    // Backslash first: escaping `|` inserts one, and a backslash already in
    // the text would otherwise consume the escape and let the pipe split the
    // cell anyway (`a\|b` -> `a\\|b`, which renders as a literal `\` and a
    // cell break).
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .trim();
  const clamped = text.length > MAX_CELL ? `${text.slice(0, MAX_CELL)}…` : text;
  // A bare `\r` counts too: captured stdout from a progress bar is full of
  // them, and one would end the table row just as a newline does.
  return clamped.replace(/\r\n|\r|\n/g, "<br>");
}

// Turn the results object into a run summary for a CI job summary
// ($GITHUB_STEP_SUMMARY) or a merge request comment.
function buildMarkdown(results: any): string {
  const summary = results?.summary || {};
  const rows = LEVELS.map((level) => {
    const c = summary[level] || {};
    const [pass, fail, warn, skip] = [c.pass || 0, c.fail || 0, c.warning || 0, c.skipped || 0];
    const label = level[0].toUpperCase() + level.slice(1);
    return `| ${label} | ${pass} | ${fail} | ${warn} | ${skip} | ${pass + fail + warn + skip} |`;
  });

  const failed = (summary.specs?.fail || 0) > 0;
  const total =
    (summary.specs?.pass || 0) +
    (summary.specs?.fail || 0) +
    (summary.specs?.warning || 0) +
    (summary.specs?.skipped || 0);

  const lines = [
    "# Doc Detective results",
    "",
    total === 0
      ? "**No tests ran.**"
      : failed
      ? `**Failed** — ${summary.specs.fail} of ${total} ${total === 1 ? "spec" : "specs"} failed.`
      : `**Passed** — ${total} ${total === 1 ? "spec" : "specs"}.`,
    "",
    "| Level | Pass | Fail | Warning | Skipped | Total |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    ...rows,
  ];

  // Failures get named; passes and skips stay as counts, so the summary stays
  // skimmable.
  // Count every failure but only build rows for the ones that get printed —
  // a 5,000-failure run would otherwise allocate every row just to slice them
  // away. `totalFailures` keeps the footer count honest.
  const failures: string[] = [];
  let totalFailures = 0;
  for (const spec of (results?.specs || []).filter(Boolean)) {
    for (const test of (spec.tests || []).filter(Boolean)) {
      // `contexts` is pre-allocated and filled as contexts finish.
      for (const ctx of (test.contexts || []).filter(Boolean)) {
        if (ctx.result !== "FAIL") continue;
        totalFailures++;
        if (failures.length >= MAX_FAILURES) continue;
        const steps = (ctx.steps || []).filter((s: any) => s && s.result === "FAIL");
        const shown = steps
          .slice(0, MAX_STEPS_PER_FAILURE)
          .map((s: any) => `${cell(s.stepId || "step")} — ${cell(s.resultDescription)}`);
        if (steps.length > MAX_STEPS_PER_FAILURE) {
          shown.push(`…and ${steps.length - MAX_STEPS_PER_FAILURE} more failed steps`);
        }
        const detail = shown.length
          ? shown.join("<br>")
          : cell(ctx.resultDescription || "Context failed");
        failures.push(
          `| ${cell(spec.description || spec.specId)} | ${cell(
            test.description || test.testId
          )} | ${detail} |`
        );
      }
    }
  }

  if (failures.length) {
    lines.push("", "## Failures", "", "| Spec | Test | Details |", "| --- | --- | --- |");
    lines.push(...failures);
    if (totalFailures > failures.length) {
      lines.push(
        "",
        `_… and ${totalFailures - failures.length} more failures. See the JSON report for the full list._`
      );
    }
  }

  if (results?.runDir) lines.push("", `Run artifacts: \`${cell(results.runDir)}\``);
  return lines.join("\n") + "\n";
}

async function markdownReporter(
  config: any = {},
  outputPath: any,
  results: any,
  options: any = {}
): Promise<string | null> {
  // Namespaced rather than `summary.md`: `output` defaults to `"."`, so a bare
  // `--reporters markdown` writes into the repo root.
  const dir = reportOutputDir(outputPath);
  const outputFile = path.resolve(dir, "doc-detective-summary.md");

  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(outputFile, buildMarkdown(results));
    // Not "results at": the GitHub Action splits stdout on that substring.
    console.log(`See Markdown summary at ${outputFile}\n`);
    return outputFile;
  } catch (err) {
    // Reporters run under Promise.all; throwing would skip the CLI's exit-code
    // gate and telemetry flush.
    console.error(`Error writing Markdown summary to ${outputFile}. ${err}`);
    return null;
  }
}
