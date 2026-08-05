import fs from "node:fs";

import { resolveReportOutput, writeFileAtomic } from "./outputPath.js";

export { junitReporter, buildJunitXml, OWN_EXTENSIONS };

// A conventional, stable filename so a CI artifact glob
// (`artifacts:reports:junit: junit.xml`) keeps finding the current run's
// results. See ADR 01091 for why this overwrites rather than suffixing.
const FIXED_NAME = "junit.xml";
// Must stay a subset of REPORT_FILE_EXTENSIONS — see markdownReporter's note.
const OWN_EXTENSIONS = [".xml"];

// Characters that are illegal in XML 1.0 even when escaped. Driver errors and
// captured shell output routinely carry ANSI escapes (\x1B, inside the
// \x0E-\x1F range), and a single one makes the whole file unparseable — which
// GitLab reports as "no tests found", not as an error.
//
// Tab (\x09), newline (\x0A) and carriage return (\x0D) are legal and kept.
const ILLEGAL_XML_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
// Unpaired surrogates are equally fatal and can arrive through stdio capture.
const LONE_SURROGATES =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

function sanitize(value: any): string {
  return String(value ?? "")
    .replace(ILLEGAL_XML_CHARS, "")
    .replace(LONE_SURROGATES, "");
}

function escapeText(value: any): string {
  return sanitize(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(value: any): string {
  return escapeText(value)
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    // Whitespace in attributes is normalized to spaces by conforming parsers,
    // so encode it to survive the round trip.
    .replace(/\t/g, "&#9;")
    .replace(/\n/g, "&#10;")
    .replace(/\r/g, "&#13;");
}

// `attrs` entries whose value is undefined are dropped, so optional
// attributes (`file`, `line`, `timestamp`) simply don't appear.
function renderAttrs(attrs: Array<[string, any]>): string {
  return attrs
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([name, value]) => ` ${name}="${escapeAttr(value)}"`)
    .join("");
}

function seconds(durationMs: any): string {
  const ms = typeof durationMs === "number" && durationMs >= 0 ? durationMs : 0;
  return (ms / 1000).toFixed(3);
}

// `runId` is a filesystem-safe timestamp (`2026-07-26T13-24-05-334Z`), but
// getRunOutputDir appends `-2`, `-3` when two runs start in the same
// millisecond. Anchor the pattern and validate the result rather than
// reverse-transforming positionally — `timestamp` is optional in JUnit, so
// omitting it beats emitting garbage.
function junitTimestamp(runId: any): string | undefined {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/.exec(
    String(runId ?? "")
  );
  if (!match) return undefined;
  const [, date, hh, mm, ss, ms] = match;
  const iso = `${date}T${hh}:${mm}:${ss}.${ms}Z`;
  return Number.isNaN(Date.parse(iso)) ? undefined : iso;
}

// Prefer the human-authored description: `specId`/`testId` default to UUIDs,
// and a widget full of UUIDs tells a reviewer nothing.
function label(node: any, idKey: string, fallback: string): string {
  return node?.description || node?.[idKey] || fallback;
}

// `browser / platform`, so matrix legs are distinguishable in the test widget.
function contextDescriptor(context: any): string {
  return [context?.browser?.name, context?.platform].filter(Boolean).join(" / ");
}

function stepLines(steps: any[], result: string): string[] {
  return steps
    .filter((step) => step && step.result === result)
    .map((step) => {
      const id = step.stepId || "step";
      const description = step.resultDescription || "";
      return description ? `${id}: ${description}` : id;
    });
}

function buildTestcase(
  context: any,
  {
    name,
    classname,
    file,
  }: { name: string; classname: string; file: string | undefined }
): { xml: string; failed: boolean; skipped: boolean } {
  const steps = Array.isArray(context.steps) ? context.steps.filter(Boolean) : [];
  const failed = context.result === "FAIL";
  const skipped = context.result === "SKIPPED";

  // Point CI at the doc line that actually failed — the single most useful
  // attribute for a documentation test, since it makes the widget deep-link
  // into the source doc.
  const firstFailure = steps.find((step: any) => step.result === "FAIL");
  const line = failed ? firstFailure?.location?.line : undefined;

  const open = `  <testcase${renderAttrs([
    ["name", name],
    ["classname", classname],
    ["time", seconds(context.durationMs)],
    ["file", file],
    ["line", line],
  ])}`;

  let body = "";
  if (failed) {
    const details = stepLines(steps, "FAIL");
    const message =
      firstFailure?.resultDescription ||
      context.resultDescription ||
      "Test failed";
    body =
      `    <failure${renderAttrs([["message", message]])}>` +
      escapeText(details.join("\n") || message) +
      `</failure>\n`;
  } else if (skipped) {
    const message = context.resultDescription;
    body = `    <skipped${renderAttrs([["message", message]])}/>\n`;
  } else if (context.result === "WARNING") {
    // JUnit has no warning state. Keep the testcase passing — a warning must
    // not turn a CI build red — but carry the detail so it's still visible.
    const details = stepLines(steps, "WARNING");
    body =
      `    <system-out>` +
      escapeText(details.join("\n") || "Completed with warnings") +
      `</system-out>\n`;
  }

  const xml = body ? `${open}>\n${body}  </testcase>\n` : `${open}/>\n`;
  return { xml, failed, skipped };
}

function buildTestsuite(spec: any, index: number): {
  xml: string;
  tests: number;
  failures: number;
  skipped: number;
} {
  const suiteName = label(spec, "specId", `Spec ${index + 1}`);
  const tests = Array.isArray(spec?.tests) ? spec.tests.filter(Boolean) : [];

  const cases: string[] = [];
  // GitLab keys its test widget on classname + name, so duplicates collapse
  // into one row. Two contexts of the same test on the same browser/platform
  // are legal, so disambiguate rather than lose one.
  const usedNames = new Map<string, number>();
  let failures = 0;
  let skipped = 0;

  tests.forEach((test: any, testIndex: number) => {
    // `contexts` is allocated with `new Array(n)` and filled as contexts
    // finish, so an aborted run leaves holes.
    const contexts = Array.isArray(test?.contexts)
      ? test.contexts.filter(Boolean)
      : [];
    const testLabel = label(test, "testId", `Test ${testIndex + 1}`);

    contexts.forEach((context: any) => {
      const descriptor = contextDescriptor(context);
      const base = descriptor ? `${testLabel} [${descriptor}]` : testLabel;
      const seen = usedNames.get(base) || 0;
      usedNames.set(base, seen + 1);
      const name = seen === 0 ? base : `${base} #${seen + 1}`;

      const built = buildTestcase(context, {
        name,
        classname: suiteName,
        file: test?.contentPath || spec?.contentPath || undefined,
      });
      cases.push(built.xml);
      if (built.failed) failures++;
      if (built.skipped) skipped++;
    });
  });

  const attrs = renderAttrs([
    ["name", suiteName],
    ["tests", cases.length],
    ["failures", failures],
    ["errors", 0],
    ["skipped", skipped],
    ["time", seconds(spec?.durationMs)],
    ["file", spec?.contentPath || undefined],
  ]);

  const xml = cases.length
    ? `  <testsuite${attrs}>\n${cases.join("")}  </testsuite>\n`
    : `  <testsuite${attrs}/>\n`;
  return { xml, tests: cases.length, failures, skipped };
}

// Pure renderer — no filesystem access, so it is cheap to test and reusable.
function buildJunitXml(results: any): string {
  const specs = Array.isArray(results?.specs) ? results.specs.filter(Boolean) : [];

  const suites: string[] = [];
  let tests = 0;
  let failures = 0;
  let skipped = 0;

  specs.forEach((spec: any, index: number) => {
    const built = buildTestsuite(spec, index);
    suites.push(built.xml);
    tests += built.tests;
    failures += built.failures;
    skipped += built.skipped;
  });

  const attrs = renderAttrs([
    ["name", "doc-detective"],
    ["tests", tests],
    ["failures", failures],
    ["errors", 0],
    ["skipped", skipped],
    ["time", seconds(results?.durationMs)],
    ["timestamp", junitTimestamp(results?.runId)],
  ]);

  const prolog = '<?xml version="1.0" encoding="UTF-8"?>\n';
  // An empty run still emits a valid, non-empty document: GitLab's parser
  // rejects a zero-byte file, and a rejected file reads as "no tests ran"
  // rather than as an error.
  if (!suites.length) return `${prolog}<testsuites${attrs}/>\n`;
  return `${prolog}<testsuites${attrs}>\n${suites.join("")}</testsuites>\n`;
}

async function junitReporter(
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

    writeFileAtomic(outputFile, buildJunitXml(results));
    // Deliberately not "results at": the doc-detective GitHub Action splits
    // stdout on that substring and require()s the trailing path.
    console.log(`See JUnit report at ${outputFile}\n`);
    return outputFile;
  } catch (err) {
    // Reporters run under Promise.all — a rejection here would skip the CLI's
    // hint, exit-code gate and telemetry flush.
    console.error(`Error writing JUnit report to ${outputFile}. ${err}`);
    return null;
  }
}
