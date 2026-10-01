// Phase 16 coverage: direct, hermetic tests for dist/reporters/**.
// Imports the reporter modules directly (not via utils) and exercises the
// Node-executable code paths: htmlReporter() file writing + buildHtml()
// string rendering. The bulk of htmlReporter.ts is inert CSS_CONTENT /
// JS_CONTENT string literals that only run in a browser, so they are not
// reachable from Node; these tests focus on the reachable branches.

import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import sinon from "sinon";

import { htmlReporter, buildHtml } from "../dist/reporters/htmlReporter.js";

function makeResults(overrides = {}) {
  return {
    reportId: "cov-report-abcdef01",
    meta: { startedAt: "2020-01-01T00:00:00.000Z" },
    summary: {
      specs: { pass: 1, fail: 0, warning: 0, skipped: 0 },
      tests: { pass: 1, fail: 0, warning: 0, skipped: 0 },
      contexts: { pass: 1, fail: 0, warning: 0, skipped: 0 },
      steps: { pass: 1, fail: 0, warning: 0, skipped: 0 },
    },
    specs: [
      {
        result: "PASS",
        specId: "spec-1",
        description: "A spec",
        specPath: "a.spec.json",
        tests: [
          {
            result: "PASS",
            testId: "test-1",
            description: "A test",
            contexts: [
              {
                result: "PASS",
                contextId: "ctx-1",
                platform: "linux",
                steps: [
                  {
                    result: "PASS",
                    resultDescription: "ok",
                    stepId: "s-1",
                    description: "Do a thing",
                    goTo: "https://example.com",
                    duration: 10,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe("reporters/htmlReporter — direct coverage", function () {
  let tmpDir;

  beforeEach(function () {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-reporters-cov-"));
  });

  afterEach(function () {
    sinon.restore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("buildHtml()", function () {
    it("returns a full HTML document with embedded, escaped report JSON", function () {
      const html = buildHtml(makeResults());
      assert.match(html, /^<!DOCTYPE html>/i);
      assert.ok(html.includes('<div id="root"></div>'));
      assert.ok(html.includes("window.REPORT_DATA"));
      assert.ok(html.includes("cov-report-abcdef01"));
    });

    it("escapes < and > in the embedded JSON to prevent script breakout", function () {
      // A value containing a </script> sequence must be neutralized so the
      // embedded JSON block cannot terminate the surrounding <script> tag.
      const html = buildHtml(
        makeResults({ reportId: "x</script><script>alert(1)</script>" })
      );
      // The raw closing tag must not survive inside the JSON payload.
      assert.ok(!html.includes("</script><script>alert(1)"));
      // It is encoded as < / > instead.
      assert.ok(html.includes("\\u003c/script\\u003e"));
    });

    it("escapes U+2028 and U+2029 line separators", function () {
      const html = buildHtml(makeResults({ reportId: "line sep end" }));
      assert.ok(html.includes("\\u2028"));
      assert.ok(html.includes("\\u2029"));
      // The raw separator chars must not appear inside the embedded payload.
      assert.ok(!html.includes("line sep"));
    });

    it("renders an empty specs report without throwing", function () {
      const html = buildHtml({
        reportId: "empty",
        summary: {
          specs: { pass: 0, fail: 0, warning: 0, skipped: 0 },
          tests: { pass: 0, fail: 0, warning: 0, skipped: 0 },
          contexts: { pass: 0, fail: 0, warning: 0, skipped: 0 },
          steps: { pass: 0, fail: 0, warning: 0, skipped: 0 },
        },
        specs: [],
      });
      assert.ok(html.includes("window.REPORT_DATA"));
    });
  });

  describe("htmlReporter() — output path resolution", function () {
    it("writes to an explicit .html file and returns its resolved path", async function () {
      const outputFile = path.join(tmpDir, "report.html");
      const result = await htmlReporter({}, outputFile, makeResults());
      assert.equal(result, path.resolve(outputFile));
      assert.ok(fs.existsSync(result));
      assert.match(fs.readFileSync(result, "utf-8"), /^<!DOCTYPE html>/i);
    });

    it("writes to an explicit .htm file (alternate extension)", async function () {
      const outputFile = path.join(tmpDir, "report.htm");
      const result = await htmlReporter({}, outputFile, makeResults());
      assert.equal(result, path.resolve(outputFile));
      assert.ok(fs.existsSync(result));
    });

    it("treats a non-.html path as a directory and generates a timestamped name", async function () {
      const result = await htmlReporter({}, tmpDir, makeResults());
      // Structure, not exact timestamp: doc-detective-results-<digits>.html
      assert.match(path.basename(result), /^doc-detective-results-\d+\.html$/);
      assert.equal(path.dirname(result), path.resolve(tmpDir));
      assert.ok(fs.existsSync(result));
    });

    it("uses testResults-* naming for the runTests command", async function () {
      const result = await htmlReporter({}, tmpDir, makeResults(), {
        command: "runTests",
      });
      assert.match(path.basename(result), /^testResults-\d+\.html$/);
    });

    it("uses coverageResults-* naming for the runCoverage command (line 19 branch)", async function () {
      const result = await htmlReporter({}, tmpDir, makeResults(), {
        command: "runCoverage",
      });
      assert.match(path.basename(result), /^coverageResults-\d+\.html$/);
    });

    it("falls back to the default report type for an unknown command", async function () {
      const result = await htmlReporter({}, tmpDir, makeResults(), {
        command: "somethingElse",
      });
      assert.match(path.basename(result), /^doc-detective-results-\d+\.html$/);
    });
  });

  describe("htmlReporter() — collision-avoiding counter naming", function () {
    it("appends -0 when the target file already exists", async function () {
      const outputFile = path.join(tmpDir, "report.html");
      fs.writeFileSync(outputFile, "existing");
      const result = await htmlReporter({}, outputFile, makeResults());
      assert.equal(path.basename(result), "report-0.html");
      assert.ok(fs.existsSync(result));
    });

    it("increments the counter past existing -0/-1 files (lines 33-34)", async function () {
      // Pre-create report.html, report-0.html, report-1.html so the while
      // loop must advance the counter to 2 before finding a free slot.
      const base = path.join(tmpDir, "report");
      fs.writeFileSync(`${base}.html`, "x");
      fs.writeFileSync(`${base}-0.html`, "x");
      fs.writeFileSync(`${base}-1.html`, "x");
      const result = await htmlReporter({}, `${base}.html`, makeResults());
      assert.equal(path.basename(result), "report-2.html");
      assert.ok(fs.existsSync(result));
    });
  });

  describe("htmlReporter() — directory creation", function () {
    it("creates a missing nested output directory recursively", async function () {
      const nested = path.join(tmpDir, "deep", "nested", "dir");
      const outputFile = path.join(nested, "report.html");
      const result = await htmlReporter({}, outputFile, makeResults());
      assert.equal(result, path.resolve(outputFile));
      assert.ok(fs.existsSync(result));
    });
  });

  describe("htmlReporter() — write-failure guard (lines 52-54)", function () {
    it("returns null and logs when writeFileSync throws", async function () {
      const outputFile = path.join(tmpDir, "report.html");
      const writeStub = sinon
        .stub(fs, "writeFileSync")
        .throws(new Error("disk full"));
      const errStub = sinon.stub(console, "error");
      try {
        const result = await htmlReporter({}, outputFile, makeResults());
        assert.equal(result, null);
        assert.ok(writeStub.called);
        assert.ok(errStub.called);
        // The error message references the target file and the underlying error.
        const logged = errStub.getCall(0).args.join(" ");
        assert.ok(logged.includes("Error writing HTML report"));
        assert.ok(logged.includes("disk full"));
      } finally {
        writeStub.restore();
        errStub.restore();
      }
    });

    it("returns null when mkdirSync throws (directory-creation failure)", async function () {
      const outputFile = path.join(tmpDir, "sub", "report.html");
      const mkdirStub = sinon
        .stub(fs, "mkdirSync")
        .throws(new Error("permission denied"));
      const errStub = sinon.stub(console, "error");
      try {
        const result = await htmlReporter({}, outputFile, makeResults());
        assert.equal(result, null);
        assert.ok(mkdirStub.called);
        assert.ok(errStub.called);
      } finally {
        mkdirStub.restore();
        errStub.restore();
      }
    });
  });

  describe("htmlReporter() — success logging", function () {
    it("logs the report location on success", async function () {
      const outputFile = path.join(tmpDir, "report.html");
      const logStub = sinon.stub(console, "log");
      try {
        const result = await htmlReporter({}, outputFile, makeResults());
        assert.ok(logStub.called);
        const logged = logStub.getCall(0).args.join(" ");
        assert.ok(logged.includes("See HTML report at"));
        assert.ok(logged.includes(result));
      } finally {
        logStub.restore();
      }
    });
  });
});
