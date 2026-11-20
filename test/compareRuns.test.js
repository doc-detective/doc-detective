// Compare a run with an earlier one (ADR 01216): each failing context reads as
// new or already failing, and each pass that failed before reads as fixed.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { compareRuns, loadPreviousResults, compareWithEarlierRun } from "../dist/core/compareRuns.js";
import { captureConsoleError } from "./capture-errors.js";

// A report from `{ specId: { testId: { contextId: result } } }`.
function reportOf(tree, version = "5.4.0") {
  return {
    runId: "2026-11-19T00-00-00-000Z",
    startedAt: "2026-11-19T00:00:00.000Z",
    environment: { docDetectiveVersion: version },
    specs: Object.entries(tree).map(([specId, tests]) => ({
      specId,
      tests: Object.entries(tests).map(([testId, contexts]) => ({
        testId,
        contexts: Object.entries(contexts).map(([contextId, result]) => ({ contextId, result })),
      })),
    })),
  };
}
const statusOf = (report, s, t, c) =>
  report.specs[s].tests[t].contexts[c].failureStatus;

describe("compareRuns", function () {
  it("marks new, existing, and fixed contexts, and counts them", function () {
    const previous = reportOf({ s: { t: { a: "FAIL", b: "PASS", c: "FAIL" } } });
    const report = reportOf({ s: { t: { a: "FAIL", b: "FAIL", c: "PASS" } } });
    compareRuns(report, previous, "/old/testResults.json");
    assert.equal(statusOf(report, 0, 0, 0), "existing");
    assert.equal(statusOf(report, 0, 0, 1), "new");
    assert.equal(statusOf(report, 0, 0, 2), "fixed");
    assert.deepEqual(report.comparison, {
      previous: {
        runId: previous.runId,
        startedAt: previous.startedAt,
        docDetectiveVersion: "5.4.0",
        path: "/old/testResults.json",
      },
      summary: { new: 1, existing: 1, fixed: 1 },
    });
  });

  it("leaves passes that never failed, warnings, and skips unmarked", function () {
    const previous = reportOf({ s: { t: { a: "FAIL", b: "FAIL", c: "PASS" } } });
    const report = reportOf({ s: { t: { a: "WARNING", b: "SKIPPED", c: "PASS" } } });
    compareRuns(report, previous, "p");
    for (const c of [0, 1, 2]) assert.equal(statusOf(report, 0, 0, c), undefined);
    assert.deepEqual(report.comparison.summary, { new: 0, existing: 0, fixed: 0 });
  });

  it("doesn't count a previous failure whose key is gone as fixed", function () {
    const previous = reportOf({ s: { gone: { a: "FAIL" } } });
    const report = reportOf({ s: { t: { a: "PASS" } } });
    compareRuns(report, previous, "p");
    assert.deepEqual(report.comparison.summary, { new: 0, existing: 0, fixed: 0 });
  });

  it("matches on spec, test, and context ID together", function () {
    const previous = reportOf({ s1: { t: { a: "FAIL" } } });
    const report = reportOf({ s2: { t: { a: "FAIL" } } });
    compareRuns(report, previous, "p");
    assert.equal(statusOf(report, 0, 0, 0), "new");
  });

  it("counts a key as failed when any visit of the test failed", function () {
    const previous = reportOf({ s: { t: { a: "PASS" } } });
    previous.specs[0].tests.push({ testId: "t", visit: 2, contexts: [{ contextId: "a", result: "FAIL" }] });
    const report = reportOf({ s: { t: { a: "FAIL" } } });
    report.specs[0].tests.push({ testId: "t", visit: 2, contexts: [{ contextId: "a", result: "FAIL" }] });
    compareRuns(report, previous, "p");
    assert.equal(statusOf(report, 0, 0, 0), "existing");
    assert.equal(statusOf(report, 0, 1, 0), "existing");
  });

  it("walks sparse contexts arrays", function () {
    const previous = reportOf({ s: { t: { a: "FAIL" } } });
    previous.specs[0].tests[0].contexts = [undefined, ...previous.specs[0].tests[0].contexts];
    const report = reportOf({ s: { t: { a: "PASS" } } });
    report.specs[0].tests[0].contexts = [null, ...report.specs[0].tests[0].contexts];
    compareRuns(report, previous, "p");
    assert.equal(statusOf(report, 0, 0, 1), "fixed");
  });
});

describe("loadPreviousResults", function () {
  let tmp;
  const runsDir = () => path.join(tmp, ".doc-detective", "runs");
  const writeRun = (runId, contents) => {
    const dir = path.join(runsDir(), runId);
    fs.mkdirSync(dir, { recursive: true });
    if (contents !== undefined) {
      fs.writeFileSync(path.join(dir, "testResults.json"), typeof contents === "string" ? contents : JSON.stringify(contents));
    }
    return dir;
  };
  const ok = (runId) => ({ ...reportOf({ s: { t: { a: "FAIL" } } }), runId });

  beforeEach(function () {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-compare-"));
  });
  afterEach(function () {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("picks the newest other run folder that has testResults.json", function () {
    writeRun("2026-01-01T00-00-00-000Z", ok("old"));
    writeRun("2026-02-01T00-00-00-000Z", ok("newest"));
    writeRun("2026-03-01T00-00-00-000Z"); // no results file
    writeRun("2026-04-01T00-00-00-000Z", ok("current"));
    const loaded = loadPreviousResults({ outputDir: tmp, compareTo: "previous" }, "2026-04-01T00-00-00-000Z", "5.4.0");
    assert.equal(loaded.previous.runId, "newest");
    assert.equal(loaded.path, path.join(runsDir(), "2026-02-01T00-00-00-000Z", "testResults.json"));
  });

  it("treats an unset compareTo as previous", function () {
    writeRun("2026-01-01T00-00-00-000Z", ok("old"));
    const loaded = loadPreviousResults({ outputDir: tmp }, "2026-04-01T00-00-00-000Z", "5.4.0");
    assert.equal(loaded.previous.runId, "old");
  });

  it("reports no earlier run", function () {
    writeRun("2026-04-01T00-00-00-000Z", ok("current"));
    const loaded = loadPreviousResults({ outputDir: tmp }, "2026-04-01T00-00-00-000Z", "5.4.0");
    assert.equal(
      loaded.reason,
      `Couldn't compare with an earlier run: no earlier run in \`${runsDir()}\`.`
    );
  });

  it("reads an explicit file and an explicit run folder", function () {
    const dir = writeRun("2026-01-01T00-00-00-000Z", ok("old"));
    const file = path.join(dir, "testResults.json");
    assert.equal(loadPreviousResults({ outputDir: tmp, compareTo: file }, "x", "5.4.0").path, file);
    assert.equal(loadPreviousResults({ outputDir: tmp, compareTo: dir }, "x", "5.4.0").path, file);
  });

  for (const [name, setup, reason] of [
    ["a missing path", (t) => path.join(t, "nope.json"), (p) => `\`${p}\` doesn't exist.`],
    [
      "a folder without testResults.json",
      (t) => (fs.mkdirSync(path.join(t, "empty")), path.join(t, "empty")),
      (p) => `\`${p}\` has no \`testResults.json\`.`,
    ],
    [
      "a file that isn't JSON",
      (t) => (fs.writeFileSync(path.join(t, "bad.json"), "{nope"), path.join(t, "bad.json")),
      (p) => `\`${p}\` isn't valid JSON.`,
    ],
    [
      "JSON with no specs list",
      (t) => (fs.writeFileSync(path.join(t, "other.json"), "{}"), path.join(t, "other.json")),
      (p) => `\`${p}\` has no \`specs\` list, so it isn't Doc Detective results.`,
    ],
    [
      "results from another major version",
      (t) => (fs.writeFileSync(path.join(t, "v4.json"), JSON.stringify(reportOf({}, "4.9.0"))), path.join(t, "v4.json")),
      (p) => `\`${p}\` is from Doc Detective 4.9.0, and test IDs match only within version 5.`,
    ],
    [
      "results with no version",
      (t) => (fs.writeFileSync(path.join(t, "nov.json"), JSON.stringify({ specs: [] })), path.join(t, "nov.json")),
      (p) => `\`${p}\` is from Doc Detective an unknown version, and test IDs match only within version 5.`,
    ],
  ]) {
    it(`reports ${name}`, function () {
      const target = setup(tmp);
      const loaded = loadPreviousResults({ outputDir: tmp, compareTo: target }, "x", "5.4.0");
      assert.equal(loaded.reason, `Couldn't compare with an earlier run: ${reason(target)}`);
    });
  }
});

describe("compareWithEarlierRun", function () {
  let tmp;
  beforeEach(function () {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-compare-"));
  });
  afterEach(function () {
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  const current = () => reportOf({ s: { t: { a: "FAIL" } } });

  it("logs a missing earlier run as a warning when compareTo was set", async function () {
    const report = current();
    const { lines } = await captureConsoleError(() =>
      compareWithEarlierRun({ outputDir: tmp, compareTo: "previous", logLevel: "info" }, report)
    );
    assert.equal(report.comparison, undefined);
    assert.deepEqual(lines, [
      `Warning: Couldn't compare with an earlier run: no earlier run in \`${path.join(tmp, ".doc-detective", "runs")}\`.`,
    ]);
  });

  it("logs a missing earlier run at debug only when compareTo is the default", async function () {
    const quiet = await captureConsoleError(() => compareWithEarlierRun({ outputDir: tmp, logLevel: "info" }, current()));
    assert.deepEqual(quiet.lines, []);
    const loud = await captureConsoleError(() => compareWithEarlierRun({ outputDir: tmp, logLevel: "debug" }, current()));
    assert.equal(loud.lines.length, 1);
    assert.match(loud.lines[0], /\(DEBUG\) Couldn't compare with an earlier run: no earlier run/);
  });

  it("does nothing when compareTo is false", async function () {
    const report = current();
    const { lines } = await captureConsoleError(() =>
      compareWithEarlierRun({ outputDir: tmp, compareTo: false, logLevel: "debug" }, report)
    );
    assert.equal(report.comparison, undefined);
    assert.deepEqual(lines, []);
  });

  it("compares and logs the counts", async function () {
    const dir = path.join(tmp, ".doc-detective", "runs", "2026-01-01T00-00-00-000Z");
    fs.mkdirSync(dir, { recursive: true });
    const previous = { ...reportOf({ s: { t: { a: "FAIL" } } }), runId: "2026-01-01T00-00-00-000Z" };
    fs.writeFileSync(path.join(dir, "testResults.json"), JSON.stringify(previous));
    const report = current();
    const { lines } = await captureConsoleError(() => compareWithEarlierRun({ outputDir: tmp, logLevel: "info" }, report));
    assert.deepEqual(report.comparison.summary, { new: 0, existing: 1, fixed: 0 });
    assert.deepEqual(lines, ["Compared with run `2026-01-01T00-00-00-000Z`: 0 new, 1 already failing, 0 fixed."]);
  });
});
