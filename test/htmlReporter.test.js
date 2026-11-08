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

  it("keeps report-only timing fields out of the step input panel", async function () {
    const outputFile = path.join(tmpDir, "report.html");
    await outputResults({}, outputFile, sampleResults, {
      reporters: ["html"],
    });
    const html = fs.readFileSync(outputFile, "utf-8");
    expect(html).to.include("delete rest.durationMs;");
    expect(html).to.include("delete rest.startedAt;");
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

  // Reports carry the effective step (ADR 01167): goTo is an object and the
  // method is lowercase. The label function is pulled from the page's script.
  it("labels effective goTo and httpRequest steps", async function () {
    const outputFile = path.join(tmpDir, "report.html");
    await outputResults({}, outputFile, sampleResults, { reporters: ["html"] });
    const source = /function stepLabel\(step\) \{[\s\S]*?\n\}/.exec(fs.readFileSync(outputFile, "utf-8"))?.[0];
    expect(source, "stepLabel in the report script").to.be.a("string");
    const stepLabel = new Function(`${source}; return stepLabel;`)();
    expect(stepLabel({ goTo: { url: "https://example.com" } })).to.equal("Go to https://example.com");
    expect(stepLabel({ httpRequest: { url: "https://api.example.com", method: "get" } })).to.equal(
      "GET https://api.example.com"
    );
    // A step that never ran keeps a whole-variable value as authored, and an
    // OpenAPI request gets its method from the operation, so neither is assumed.
    expect(stepLabel({ goTo: "$URL" })).to.equal("Go to $URL");
    expect(stepLabel({ httpRequest: "$REQ" })).to.equal("GET ");
    expect(stepLabel({ httpRequest: { openApi: { operationId: "getUsers" } } })).to.equal("GET ");
  });

  it("embeds the canonical logo paths", async function () {
    const outputFile = path.join(tmpDir, "report.html");
    await outputResults({}, outputFile, sampleResults, {
      reporters: ["html"],
    });
    const html = fs.readFileSync(outputFile, "utf-8");
    const logo = fs.readFileSync(
      new URL("../docs/fern/assets/logo/doc-detective.svg", import.meta.url),
      "utf-8"
    );
    const paths = [...logo.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]);
    expect(paths).to.have.length(3);
    for (const d of paths) expect(html).to.include(d);
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

// Automatic screenshots and recordings in the report (ADR 01177). The page's
// own functions are pulled from its script, with `report` and `MEDIA_BASE`
// supplied: MEDIA_BASE is the path from the HTML file to the run folder.
describe("HTML Reporter automatic media", function () {
  let tmpDir;
  beforeEach(function () {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-html-auto-"));
  });
  afterEach(function () {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function pageFunctions(report, mediaBase) {
    const outputFile = path.join(tmpDir, "fns.html");
    await outputResults({ autoScreenshot: false, autoRecord: false }, outputFile, sampleResults, { reporters: ["html"] });
    const html = fs.readFileSync(outputFile, "utf-8");
    // Each function ends at the first `}` in column 0, so these functions must
    // keep their closing brace there and no other line may start with `}`.
    const fn = (name) => new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`).exec(html)?.[0];
    const source = ["runFolderSrc", "collectMedia", "autoRecording"].map(fn);
    expect(source.every(Boolean), "the page defines the media functions").to.equal(true);
    return new Function("report", "MEDIA_BASE", `${source.join("\n")}; return { collectMedia, autoRecording };`)(
      report,
      mediaBase
    );
  }

  const runDir = "/out/.doc-detective/runs/r1";
  const shot = "specs/s/tests/t/contexts/c/screenshots/01-goTo-open.png";

  it("adds a step's automatic screenshot after its authored one, labeled Automatic", async function () {
    const { collectMedia } = await pageFunctions({ runDir }, ".doc-detective/runs/r1");
    const media = collectMedia({ screenshot: { path: "/x/authored.png" }, autoScreenshot: shot });
    expect(media).to.deep.equal([
      { kind: "image", path: "/x/authored.png", changed: undefined },
      { kind: "image", path: `.doc-detective/runs/r1/${shot}`, label: "Automatic" },
    ]);
    // The field's future name reads the same way.
    expect(collectMedia({ autoScreenshotPath: shot })[0].path).to.equal(`.doc-detective/runs/r1/${shot}`);
  });

  it("loads an absolute automatic screenshot through the media base only inside the run folder", async function () {
    const { collectMedia } = await pageFunctions({ runDir }, ".doc-detective/runs/r1");
    expect(collectMedia({ autoScreenshot: `${runDir}/${shot}` })[0].path).to.equal(`.doc-detective/runs/r1/${shot}`);
    for (const outside of ["/unrelated/absolute/path.png", "C:\\elsewhere\\shot.png"]) {
      expect(collectMedia({ autoScreenshot: outside })[0].path).to.equal(outside);
    }
  });

  it("shows the context's automatic recording once and leaves its synthetic steps out", async function () {
    const { autoRecording } = await pageFunctions({ runDir }, "");
    const video = `${runDir}/specs/s/tests/t/contexts/c/recordings/c.mp4`;
    const start = { stepId: "t~autorecord", record: { path: video }, result: "PASS", __autoRecord: true };
    const open = { stepId: "open", goTo: { url: "http://x" }, result: "PASS" };
    const stop = {
      stepId: "t~autorecord~stop",
      stopRecord: true,
      outputs: { recordingPath: video },
      result: "PASS",
      __autoRecordStop: true,
    };
    const auto = autoRecording({ steps: [start, open, stop] });
    expect(auto.video).to.equal("specs/s/tests/t/contexts/c/recordings/c.mp4");
    expect(auto.steps.map((item) => item.step)).to.deep.equal([open]);
    expect(auto.steps[0].origIdx).to.equal(1);
  });

  // The runner's markers name the synthetic steps, as in the summary: a stop
  // that reports another path still hides, and an authored step named like the
  // start is an ordinary step.
  it("finds the synthetic steps by their markers", async function () {
    const { autoRecording } = await pageFunctions({ runDir }, "");
    const start = { stepId: "t~autorecord", record: { path: `${runDir}/c.mp4` }, result: "PASS", __autoRecord: true };
    const stop = { stepId: "t~autorecord~stop", stopRecord: true, result: "PASS", __autoRecordStop: true };
    const authored = { stepId: "login~autorecord", record: { path: `${runDir}/mine.mp4` }, result: "PASS" };
    const auto = autoRecording({ steps: [start, authored, stop] });
    expect(auto.video).to.equal("c.mp4");
    expect(auto.steps.map((item) => item.step)).to.deep.equal([authored]);
    expect(autoRecording({ steps: [authored] }).video).to.equal(null);
  });

  it("keeps a recording that didn't save in the step list", async function () {
    const { autoRecording } = await pageFunctions({ runDir }, "");
    const start = { stepId: "t~autorecord", record: { path: `${runDir}/c.mp4` }, result: "SKIPPED", __autoRecord: true };
    const auto = autoRecording({ steps: [start] });
    expect(auto.video).to.equal(null);
    expect(auto.steps.map((item) => item.step)).to.deep.equal([start]);
  });

  it("renders a run with no automatic media as before", async function () {
    const { collectMedia, autoRecording } = await pageFunctions({ runDir }, "x");
    const step = { stepId: "s", goTo: { url: "http://x" } };
    expect(collectMedia(step)).to.deep.equal([]);
    const auto = autoRecording({ steps: [step] });
    expect(auto.video).to.equal(null);
    expect(auto.steps).to.deep.equal([{ step, origIdx: 0 }]);
  });

  it("points both HTML copies at the run folder", async function () {
    const run = path.join(tmpDir, ".doc-detective", "runs", "20260612-130000");
    fs.mkdirSync(run, { recursive: true });
    const results = { ...sampleResults, runId: "20260612-130000", runDir: run };
    const written = await outputResults({ outputDir: tmpDir }, tmpDir, results, {
      reporters: ["html", "runFolder"],
      command: "runTests",
    });
    const flat = fs.readFileSync(written.find((f) => String(f).endsWith(".html")), "utf-8");
    expect(flat).to.include('window.REPORT_MEDIA_BASE = ".doc-detective/runs/20260612-130000";');
    const inRunFolder = fs.readFileSync(path.join(run, "testResults.html"), "utf-8");
    expect(inRunFolder).to.include('window.REPORT_MEDIA_BASE = "";');
  });
});
