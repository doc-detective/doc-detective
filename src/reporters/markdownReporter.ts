import fs from "node:fs";

import { resolveReportOutput, writeFileAtomic } from "./outputPath.js";

export { markdownReporter, buildMarkdown, MAX_SUMMARY_BYTES, OWN_EXTENSIONS };

// Namespaced rather than `summary.md`: `config.output` defaults to `"."`, so
// a bare `--reporters markdown` writes into the repo root and must not
// clobber a file the user owns. See ADR 01092.
const FIXED_NAME = "doc-detective-summary.md";
// Must stay a subset of REPORT_FILE_EXTENSIONS, so that every path this
// reporter claims as its own is also one the run-folder resolver treats as a
// file. `test/reporter-output-path.test.js` asserts that invariant.
const OWN_EXTENSIONS = [".md"];

// GitHub caps a job step summary at 1 MiB and fails the whole upload past it,
// so a 5,000-step run has to truncate rather than blow the limit.
const MAX_SUMMARY_BYTES = 1024 * 1024;

const LEVELS = ["specs", "tests", "contexts", "steps"] as const;
const LEVEL_LABELS: Record<string, string> = {
  specs: "Specs",
  tests: "Tests",
  contexts: "Contexts",
  steps: "Steps",
};
const SLOWEST_COUNT = 5;

function bytes(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

// Escape unconditionally rather than per-context: a `|` splits a table cell
// and a newline ends a row or a list item, and the same `resultDescription`
// gets rendered in both places.
function inline(value: any): string {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, "<br>")
    .trim();
}

function duration(durationMs: any): string {
  const ms = typeof durationMs === "number" && durationMs > 0 ? durationMs : 0;
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function label(node: any, idKey: string, fallback: string): string {
  return node?.description || node?.[idKey] || fallback;
}

function contextLabel(test: any, context: any, fallback: string): string {
  const descriptor = [context?.browser?.name, context?.platform]
    .filter(Boolean)
    .join(" / ");
  const base = label(test, "testId", fallback);
  return descriptor ? `${base} [${descriptor}]` : base;
}

function counts(summary: any, level: string) {
  const raw = summary?.[level] || {};
  const pass = Number(raw.pass) || 0;
  const fail = Number(raw.fail) || 0;
  const warning = Number(raw.warning) || 0;
  const skipped = Number(raw.skipped) || 0;
  return { pass, fail, warning, skipped, total: pass + fail + warning + skipped };
}

interface Failure {
  spec: any;
  specIndex: number;
  test: any;
  testIndex: number;
  context: any;
}

interface Slow {
  label: string;
  durationMs: number;
}

// Single walk of the tree: the failure list drives the detail section and the
// duration list drives the slowest-contexts section.
function walk(results: any): { failures: Failure[]; slow: Slow[] } {
  const failures: Failure[] = [];
  const slow: Slow[] = [];
  const specs = Array.isArray(results?.specs) ? results.specs.filter(Boolean) : [];

  specs.forEach((spec: any, specIndex: number) => {
    const tests = Array.isArray(spec?.tests) ? spec.tests.filter(Boolean) : [];
    tests.forEach((test: any, testIndex: number) => {
      // `contexts` is allocated with `new Array(n)`, so an aborted run leaves
      // holes.
      const contexts = Array.isArray(test?.contexts)
        ? test.contexts.filter(Boolean)
        : [];
      contexts.forEach((context: any) => {
        if (typeof context.durationMs === "number" && context.durationMs > 0) {
          slow.push({
            label: contextLabel(test, context, `Test ${testIndex + 1}`),
            durationMs: context.durationMs,
          });
        }
        if (context.result === "FAIL") {
          failures.push({ spec, specIndex, test, testIndex, context });
        }
      });
    });
  });

  slow.sort((a, b) => b.durationMs - a.durationMs);
  return { failures, slow };
}

function buildSummaryTable(summary: any): string {
  const rows = LEVELS.map((level) => {
    const c = counts(summary, level);
    return `| ${LEVEL_LABELS[level]} | ${c.pass} | ${c.fail} | ${c.warning} | ${c.skipped} | ${c.total} |`;
  });
  return [
    "| Level | Pass | Fail | Warning | Skipped | Total |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    ...rows,
  ].join("\n");
}

function buildFailureBlock(failure: Failure): string {
  const { test, context, testIndex } = failure;
  const steps = Array.isArray(context.steps) ? context.steps.filter(Boolean) : [];
  const failingSteps = steps.filter((step: any) => step.result === "FAIL");

  const items = failingSteps.length
    ? failingSteps.map((step: any) => {
        const id = inline(step.stepId || "step");
        const reason = inline(step.resultDescription);
        return reason ? `- \`${id}\` — ${reason}` : `- \`${id}\``;
      })
    : [`- ${inline(context.resultDescription || "Context failed")}`];

  return [
    "<details>",
    `<summary>${inline(
      contextLabel(test, context, `Test ${testIndex + 1}`)
    )}</summary>`,
    "",
    ...items,
    "",
    "</details>",
    "",
  ].join("\n");
}

function buildSpecOpen(failure: Failure): string {
  const name = inline(label(failure.spec, "specId", `Spec ${failure.specIndex + 1}`));
  const source = failure.spec?.contentPath
    ? ` — \`${inline(failure.spec.contentPath)}\``
    : "";
  return ["<details open>", `<summary><strong>${name}</strong>${source}</summary>`, "", ""].join(
    "\n"
  );
}

const SPEC_CLOSE = "</details>\n\n";
// Joins the failures body to the tail sections in the rendered summary. Named
// so the byte budget can account for it.
const BODY_TAIL_SEPARATOR = "\n";

function buildSlowest(slow: Slow[]): string {
  if (!slow.length) return "";
  const rows = slow
    .slice(0, SLOWEST_COUNT)
    .map((entry) => `| ${inline(entry.label)} | ${duration(entry.durationMs)} |`);
  return [
    "<details>",
    "<summary>Slowest contexts</summary>",
    "",
    "| Context | Duration |",
    "| --- | ---: |",
    ...rows,
    "",
    "</details>",
    "",
  ].join("\n");
}

// Pure renderer — no filesystem access, so it is cheap to test and reusable.
function buildMarkdown(results: any): string {
  const summary = results?.summary || {};
  const specCounts = counts(summary, "specs");
  const contextCounts = counts(summary, "contexts");
  const hasFailures = LEVELS.some((level) => counts(summary, level).fail > 0);
  const { failures, slow } = walk(results);

  let verdict: string;
  if (specCounts.total === 0) {
    verdict = "**No tests ran.**";
  } else if (hasFailures) {
    verdict = `**Failed** — ${specCounts.fail} of ${specCounts.total} specs failed in ${duration(
      results?.durationMs
    )}.`;
  } else {
    verdict = `**Passed** — ${specCounts.total} specs in ${duration(
      results?.durationMs
    )}.`;
  }

  const header = [
    "# Doc Detective results",
    "",
    verdict,
    "",
    buildSummaryTable(summary),
    "",
    `${contextCounts.pass} passed · ${contextCounts.warning} warning · ${contextCounts.skipped} skipped (contexts).`,
    "",
  ].join("\n");

  // The tail is reserved up front so truncation never eats the sections a
  // reviewer reads after the failures.
  const tailParts = [buildSlowest(slow)];
  if (results?.runDir) {
    tailParts.push(`Run artifacts: \`${inline(results.runDir)}\`\n`);
  }
  const tail = tailParts.filter(Boolean).join("\n");

  if (!failures.length) return `${header}${BODY_TAIL_SEPARATOR}${tail}`;

  const footer = (remaining: number) =>
    `\n_… and ${remaining} more failures. See the JSON report for the full list._\n`;
  // Reserved up front so truncation can never eat the tail sections or the
  // footer. Worst case: every failure ends up in the footer count. At most one
  // spec block is open at a time, so one closing tag is always affordable, and
  // the final `\n` joining body to tail has to be counted too — without it the
  // summary can land at exactly MAX + 1 bytes, and GitHub rejects the whole
  // upload past the cap rather than truncating it.
  const reserved =
    bytes(tail) +
    bytes(footer(failures.length)) +
    bytes(SPEC_CLOSE) +
    bytes(BODY_TAIL_SEPARATOR);

  let body = "\n## Failures\n\n";
  let used = bytes(header) + bytes(body) + reserved;
  let emitted = 0;
  let currentSpec: any = null;

  for (const failure of failures) {
    const open = failure.spec === currentSpec ? "" : buildSpecOpen(failure);
    // Opening a new spec first closes the previous one.
    const close = currentSpec !== null && open ? SPEC_CLOSE : "";
    const block = buildFailureBlock(failure);
    const cost = bytes(close) + bytes(open) + bytes(block);
    if (used + cost > MAX_SUMMARY_BYTES) break;

    body += close + open + block;
    used += cost;
    if (open) currentSpec = failure.spec;
    emitted++;
  }

  if (currentSpec !== null) body += SPEC_CLOSE;
  const remaining = failures.length - emitted;
  if (remaining > 0) body += footer(remaining);

  return `${header}${body}${BODY_TAIL_SEPARATOR}${tail}`;
}

async function markdownReporter(
  config: any = {},
  outputPath: any,
  results: any,
  options: any = {}
): Promise<string | null> {
  const { outputDir, outputFile } = resolveReportOutput({
    outputPath,
    ownExtensions: OWN_EXTENSIONS,
    fixedName: FIXED_NAME,
  });

  try {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    writeFileAtomic(outputFile, buildMarkdown(results));
    // Deliberately not "results at": the doc-detective GitHub Action splits
    // stdout on that substring and require()s the trailing path.
    console.log(`See Markdown summary at ${outputFile}\n`);
    return outputFile;
  } catch (err) {
    // Reporters run under Promise.all — a rejection here would skip the CLI's
    // hint, exit-code gate and telemetry flush.
    console.error(`Error writing Markdown summary to ${outputFile}. ${err}`);
    return null;
  }
}
