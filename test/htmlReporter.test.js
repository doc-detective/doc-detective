import { outputResults } from "../dist/utils.js";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

const sampleResults = {
  reportId: "test-report-001",
  summary: {
    specs: { pass: 1, fail: 1, warning: 0, skipped: 0 },
    tests: { pass: 1, fail: 1, warning: 0, skipped: 0 },
    contexts: { pass: 1, fail: 1, warning: 0, skipped: 0 },
    steps: { pass: 2, fail: 1, warning: 0, skipped: 0 },
  },
  specs: [
    {
      result: "PASS",
      specId: "spec-1",
      description: "Passing spec",
      specPath: "test.spec.json",
      tests: [
        {
          result: "PASS",
          testId: "test-1",
          description: "Passing test",
          contexts: [
            {
              result: "PASS",
              contextId: "ctx-1",
              platform: "linux",
              steps: [
                {
                  result: "PASS",
                  resultDescription: "Navigated successfully.",
                  stepId: "s-1",
                  description: "Go to example.com",
                  goTo: "https://example.com",
                  duration: 100,
                  outputs: { url: "https://example.com/", status: 200 },
                },
                {
                  result: "PASS",
                  resultDescription: "Found element.",
                  stepId: "s-2",
                  description: "Find heading",
                  find: { selector: "h1" },
                  duration: 50,
                },
              ],
            },
          ],
        },
      ],
    },
    {
      result: "FAIL",
      specId: "spec-2",
      description: "Failing spec",
      specPath: "fail.spec.json",
      tests: [
        {
          result: "FAIL",
          testId: "test-2",
          description: "Failing test",
          contexts: [
            {
              result: "FAIL",
              contextId: "ctx-2",
              platform: "linux",
              steps: [
                {
                  result: "FAIL",
                  resultDescription: "Expected 200 but got 404.",
                  stepId: "s-3",
                  description: "Check API endpoint",
                  httpRequest: { method: "GET", url: "https://api.example.com/missing" },
                  duration: 300,
                  outputs: { status: 404 },
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

describe("HTML Reporter", function () {
  let tmpDir;

  beforeEach(function () {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-html-test-"));
  });

  afterEach(function () {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("generates an HTML file via the html reporter shorthand", async function () {
    const outputFile = path.join(tmpDir, "report.html");
    const results = await outputResults({}, outputFile, sampleResults, {
      reporters: ["html"],
    });
    expect(results[0]).to.equal(outputFile);
  });

  it("creates a valid HTML file with report data embedded", async function () {
    const outputFile = path.join(tmpDir, "report.html");
    await outputResults({}, outputFile, sampleResults, {
      reporters: ["html"],
    });
    const html = fs.readFileSync(outputFile, "utf-8");
    expect(html).to.match(/^<!DOCTYPE html>/i);
    expect(html).to.include("window.REPORT_DATA");
    expect(html).to.include("test-report-001");
  });

  it("contains key CSS classes from the design", async function () {
    const outputFile = path.join(tmpDir, "report.html");
    await outputResults({}, outputFile, sampleResults, {
      reporters: ["html"],
    });
    const html = fs.readFileSync(outputFile, "utf-8");
    expect(html).to.include(".spec");
    expect(html).to.include(".step");
    expect(html).to.include(".badge");
    expect(html).to.include(".verdict-card");
    expect(html).to.include(".hdr");
  });

  it("contains spec and step data in the embedded JSON", async function () {
    const outputFile = path.join(tmpDir, "report.html");
    await outputResults({}, outputFile, sampleResults, {
      reporters: ["html"],
    });
    const html = fs.readFileSync(outputFile, "utf-8");
    expect(html).to.include("Passing spec");
    expect(html).to.include("Failing spec");
    expect(html).to.include("Go to example.com");
    expect(html).to.include("Expected 200 but got 404.");
  });

  it("handles output to a directory path (no .html extension)", async function () {
    const results = await outputResults({}, tmpDir, sampleResults, {
      reporters: ["html"],
    });
    const result = results[0];
    expect(result).to.match(/\.html$/);
    expect(fs.existsSync(result)).to.be.true;
  });

  it("avoids overwriting existing files with counter-based naming", async function () {
    const outputFile = path.join(tmpDir, "report.html");
    fs.writeFileSync(outputFile, "<html></html>");
    const results = await outputResults({}, outputFile, sampleResults, {
      reporters: ["html"],
    });
    const result = results[0];
    expect(result).to.include("report-0.html");
    expect(fs.existsSync(result)).to.be.true;
  });

  it("creates output directory if it does not exist", async function () {
    const nestedDir = path.join(tmpDir, "nested", "deep");
    const outputFile = path.join(nestedDir, "report.html");
    const result = await outputResults({}, outputFile, sampleResults, {
      reporters: ["html"],
    });
    expect(result).to.include(outputFile);
    expect(fs.existsSync(outputFile)).to.be.true;
  });

  it("handles empty specs array gracefully", async function () {
    const emptyResults = {
      reportId: "empty-report",
      summary: {
        specs: { pass: 0, fail: 0, warning: 0, skipped: 0 },
        tests: { pass: 0, fail: 0, warning: 0, skipped: 0 },
        contexts: { pass: 0, fail: 0, warning: 0, skipped: 0 },
        steps: { pass: 0, fail: 0, warning: 0, skipped: 0 },
      },
      specs: [],
    };
    const outputFile = path.join(tmpDir, "empty.html");
    const result = await outputResults({}, outputFile, emptyResults, {
      reporters: ["html"],
    });
    expect(result).to.include(outputFile);
    const html = fs.readFileSync(outputFile, "utf-8");
    expect(html).to.include("window.REPORT_DATA");
  });

  it("includes dark mode CSS", async function () {
    const outputFile = path.join(tmpDir, "report.html");
    await outputResults({}, outputFile, sampleResults, {
      reporters: ["html"],
    });
    const html = fs.readFileSync(outputFile, "utf-8");
    expect(html).to.include("body.dark");
  });

  it("uses the runTests command for naming when specified", async function () {
    const results = await outputResults({}, tmpDir, sampleResults, {
      reporters: ["html"],
      command: "runTests",
    });
    const result = results[0];
    expect(result).to.include("testResults-");
    expect(result).to.match(/\.html$/);
  });
});
