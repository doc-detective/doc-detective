import fs from "node:fs";
import path from "node:path";

export { markdownReporter, buildMarkdown };

const LEVELS = ["specs", "tests", "contexts", "steps"];
// GitHub rejects a job step summary larger than 1 MiB outright rather than
// truncating it, so cap the number of failures listed.
const MAX_FAILURES = 100;

// A `|` splits a table cell and a newline ends a row or a list item, and the
// same resultDescription is rendered in both places.
function cell(value: any): string {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>").trim();
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
  const failures: string[] = [];
  for (const spec of (results?.specs || []).filter(Boolean)) {
    for (const test of (spec.tests || []).filter(Boolean)) {
      // `contexts` is pre-allocated and filled as contexts finish.
      for (const ctx of (test.contexts || []).filter(Boolean)) {
        if (ctx.result !== "FAIL") continue;
        const steps = (ctx.steps || []).filter((s: any) => s && s.result === "FAIL");
        const detail = steps.length
          ? steps
              .map((s: any) => `${cell(s.stepId || "step")} — ${cell(s.resultDescription)}`)
              .join("<br>")
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
    lines.push(...failures.slice(0, MAX_FAILURES));
    if (failures.length > MAX_FAILURES) {
      lines.push(
        "",
        `_… and ${failures.length - MAX_FAILURES} more failures. See the JSON report for the full list._`
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
  const resolved = path.resolve(String(outputPath ?? "."));
  const dir = path.extname(resolved) ? path.dirname(resolved) : resolved;
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
