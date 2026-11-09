import fs from "node:fs";
import path from "node:path";

import { reportOutputDir } from "../core/utils.js";
import { mediaPath, nonPassItems, writeReport } from "./model.js";

export { junitReporter, buildJunitXml };

// Escape the XML entities and drop characters that are illegal in XML 1.0 even
// when escaped: C0 controls (driver errors carry ANSI escapes, \x1B), DEL, the
// noncharacters U+FFFE/U+FFFF, and unpaired surrogates. One of them makes the
// whole file unparseable — which CI reports as "no tests found", and that looks
// the same as a green run.
function esc(value: any): string {
  return String(value ?? "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F￾￿]/g, "")
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
// test widget, GitHub, Jenkins and CircleCI all read. `outputFile` is where the
// XML lands, since attachments are relative to it (ADR 01180).
function buildJunitXml(results: any, outputFile?: string): string {
  const fromDir = outputFile ? path.dirname(outputFile) : process.cwd();
  const runDir = results?.runDir;
  const items = nonPassItems(results);
  const env = results?.environment ?? {};
  const properties = Object.entries({
    runId: results?.runId,
    docDetectiveVersion: env.docDetectiveVersion,
    nodeVersion: env.nodeVersion,
    platform: env.platform,
    arch: env.arch,
    osRelease: env.osRelease,
  })
    .filter(([, value]) => value)
    .map(([name, value]) => `      <property name="${esc(name)}" value="${esc(value)}"/>`);
  const suiteHead =
    properties.length > 0 ? `    <properties>\n${properties.join("\n")}\n    </properties>\n` : "";
  const timestamp = results?.startedAt ? ` timestamp="${esc(results.startedAt)}"` : "";
  let [tests, failures, skipped] = [0, 0, 0];
  const suites: string[] = [];

  (results?.specs ?? []).forEach((spec: any, specIndex: number) => {
    if (!spec) return;
    const specId = spec.specId || `spec ${specIndex + 1}`;
    const cases: string[] = [];
    // Per-suite counters as well as the run totals: GitLab's test-summary
    // widget reads `failures`/`errors` straight off `<testsuite>` to build the
    // suite rollup, and shows 0 per suite without them even when the
    // `<testcase>` children carry `<failure>`.
    let suiteFailures = 0;
    let suiteSkipped = 0;

    const addCase = (owner: any, name: string, description: any, result: any, durationMs: any, recording?: any) => {
      const own = items.filter((item) => item.owner === owner);
      const ofStatus = (status: string) => own.filter((item) => item.status === status);
      const [failed, warned, stepSkips] = [ofStatus("FAIL"), ofStatus("WARNING"), ofStatus("SKIPPED")];
      const body: string[] = [];
      const out: string[] = [];
      tests++;
      if (result === "FAIL") {
        failures++;
        suiteFailures++;
        const detail = failed.map((item) =>
          [
            `${item.idPath}${item.description ? ` — ${item.description}` : ""}`,
            item.reason,
            item.hint && `Hint: ${item.hint}`,
            item.skippedNote,
          ]
            .filter(Boolean)
            .join("\n")
        );
        const type = failed[0].code ? ` type="${esc(failed[0].code)}"` : "";
        body.push(`<failure${type} message="${esc(failed[0].reason || failed[0].idPath)}">${esc(detail.join("\n"))}</failure>`);
      } else if (result === "SKIPPED") {
        skipped++;
        suiteSkipped++;
        const reason = esc(stepSkips.shift()?.reason);
        body.push(`<skipped message="${reason}">${reason}</skipped>`);
      }
      if (result !== "SKIPPED") {
        // Attachments first: GitLab reads only the first marker.
        const shot = own.find((item) => item.screenshot)?.screenshot;
        const video = recording && path.resolve(typeof runDir === "string" ? runDir : "", recording);
        for (const file of [shot, video]) {
          if (file && fs.existsSync(file)) out.push(`[[ATTACHMENT|${mediaPath(file, runDir, fromDir)}]]`);
        }
      }
      const line = (prefix: string, item: any) => {
        const reason = String(item.reason).replace(/^Skipped:\s*/, "");
        return `${prefix}: ${item.idPath}${reason ? ` — ${reason}` : ""}`;
      };
      out.push(...stepSkips.map((item) => line("Skipped", item)));
      if (out.length > 0) body.push(`<system-out>${esc(out.join("\n"))}</system-out>`);
      if (warned.length > 0) {
        body.push(`<system-err>${esc(warned.map((item) => line("Warning", item)).join("\n"))}</system-err>`);
      }
      const attrs =
        `classname="${esc(specId)}" name="${esc(`${name}${description ? ` — ${description}` : ""}`)}"` +
        ` time="${secs(durationMs)}"`;
      cases.push(
        body.length > 0
          ? `    <testcase ${attrs}>\n${body.map((part) => `      ${part}`).join("\n")}\n    </testcase>`
          : `    <testcase ${attrs}/>`
      );
    };

    // A non-PASS spec with no tests, or test with no contexts, is an item of its
    // own, so it gets a case. Numbers count holes: `contexts` is pre-allocated and
    // filled as contexts finish, so an aborted run leaves them.
    if (items.some((item) => item.owner === spec)) addCase(spec, specId, spec.description, spec.result, spec.durationMs);
    (spec.tests ?? []).forEach((test: any, testIndex: number) => {
      if (!test) return;
      const testId = test.testId || `test ${testIndex + 1}`;
      if (items.some((item) => item.owner === test)) addCase(test, testId, test.description, test.result, test.durationMs);
      (test.contexts ?? []).forEach((ctx: any, contextIndex: number) => {
        if (!ctx) return;
        const name = `${testId} › ${ctx.contextId || `context ${contextIndex + 1}`}`;
        addCase(ctx, name, test.description, ctx.result, ctx.durationMs, ctx.autoRecording?.recordingPath);
      });
    });
    suites.push(
      `  <testsuite name="${esc(specId)}"` +
        ` tests="${cases.length}" failures="${suiteFailures}" errors="0"` +
        ` skipped="${suiteSkipped}" time="${secs(spec.durationMs)}"${timestamp}>\n` +
        (cases.length > 0 ? suiteHead : "") +
        `${cases.join("\n")}${cases.length ? "\n" : ""}  </testsuite>`
    );
  });

  // An empty run still emits a valid document: CI rejects a zero-byte file and
  // reports it as "no tests found", which looks the same as a green run.
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<testsuites name="Doc Detective" tests="${tests}" failures="${failures}" errors="0" skipped="${skipped}" time="${secs(results?.durationMs)}">\n` +
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
  const outputFile = path.resolve(reportOutputDir(outputPath), "junit.xml");
  return writeReport("JUnit report", outputFile, () => buildJunitXml(results, outputFile), config);
}
