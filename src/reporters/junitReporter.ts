import fs from "node:fs";
import path from "node:path";

import { reportOutputDir } from "./outputDir.js";

export { junitReporter, buildJunitXml };

// Escape the XML entities and drop characters that are illegal in XML 1.0 even
// when escaped: C0 controls (driver errors carry ANSI escapes, \x1B), DEL, the
// noncharacters U+FFFE/U+FFFF, and unpaired surrogates. One of them makes the
// whole file unparseable — which CI reports as "no tests found", and that looks
// the same as a green run.
function esc(value: any): string {
  return String(value ?? "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\uFFFE\uFFFF]/g, "")
    .replace(
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
      ""
    )
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function secs(ms: any): string {
  return ((typeof ms === "number" && ms > 0 ? ms : 0) / 1000).toFixed(3);
}

// Turn the results object into JUnit XML — the format GitLab's merge request
// test widget, GitHub, Jenkins and CircleCI all read.
function buildJunitXml(results: any): string {
  const specs = (results?.specs || []).filter(Boolean);
  let tests = 0;
  let failures = 0;
  let skipped = 0;
  const suites: string[] = [];

  for (const spec of specs) {
    const cases: string[] = [];
    for (const test of (spec.tests || []).filter(Boolean)) {
      // `contexts` is pre-allocated and filled as contexts finish, so an
      // aborted run leaves holes.
      for (const ctx of (test.contexts || []).filter(Boolean)) {
        const where = [ctx.browser?.name, ctx.platform].filter(Boolean).join(" / ");
        const name = test.description || test.testId || "test";
        const steps = (ctx.steps || []).filter(Boolean);
        tests++;

        let body = "";
        if (ctx.result === "FAIL") {
          failures++;
          const failed = steps.filter((s: any) => s.result === "FAIL");
          const message = failed[0]?.resultDescription || ctx.resultDescription || "Test failed";
          const detail = failed
            .map((s: any) => `${s.stepId || "step"}: ${s.resultDescription || ""}`)
            .join("\n");
          body = `<failure message="${esc(message)}">${esc(detail || message)}</failure>`;
        } else if (ctx.result === "SKIPPED") {
          skipped++;
          body = `<skipped message="${esc(ctx.resultDescription || "")}"/>`;
        }

        const attrs =
          `name="${esc(where ? `${name} [${where}]` : name)}"` +
          ` classname="${esc(spec.description || spec.specId || "spec")}"` +
          ` time="${secs(ctx.durationMs)}"`;
        cases.push(body ? `    <testcase ${attrs}>${body}</testcase>` : `    <testcase ${attrs}/>`);
      }
    }
    suites.push(
      `  <testsuite name="${esc(spec.description || spec.specId || "spec")}" tests="${cases.length}">\n` +
        `${cases.join("\n")}${cases.length ? "\n" : ""}  </testsuite>`
    );
  }

  // An empty run still emits a valid document: CI rejects a zero-byte file and
  // reports it as "no tests found", which looks the same as a green run.
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<testsuites tests="${tests}" failures="${failures}" skipped="${skipped}" time="${secs(results?.durationMs)}">\n` +
    `${suites.join("\n")}${suites.length ? "\n" : ""}</testsuites>\n`
  );
}

async function junitReporter(
  config: any = {},
  outputPath: any,
  results: any,
  options: any = {}
): Promise<string | null> {
  // `output` may be a directory or a file path meant for another reporter.
  // Either way JUnit writes a conventional `junit.xml` so a CI artifact glob
  // has a stable path to point at.
  const dir = reportOutputDir(outputPath);
  const outputFile = path.resolve(dir, "junit.xml");

  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(outputFile, buildJunitXml(results));
    // Not "results at": the GitHub Action splits stdout on that substring and
    // require()s the trailing path.
    console.log(`See JUnit report at ${outputFile}\n`);
    return outputFile;
  } catch (err) {
    // Reporters run under Promise.all; throwing would skip the CLI's exit-code
    // gate and telemetry flush.
    console.error(`Error writing JUnit report to ${outputFile}. ${err}`);
    return null;
  }
}
