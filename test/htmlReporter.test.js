import { outputResults } from "../dist/utils.js";
import { buildHtml } from "../dist/reporters/htmlReporter.js";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import vm from "node:vm";

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

// Runs the copy of headerFacts that ships in the page, so the test can't drift from
// what browsers get. The header itself needs a DOM, and the suite has none.
function headerFactsFor(results) {
  const html = buildHtml(results);
  const pick = (name, param) =>
    html.match(new RegExp(`function ${name}\\(${param}\\) \\{[\\s\\S]*?\\n\\}`))?.[0];
  const source = `${pick("fmtDuration", "ms")}\n${pick("headerFacts", "report")}`;
  return JSON.parse(
    vm.runInNewContext(`${source}\nJSON.stringify(headerFacts(${JSON.stringify(results)}))`)
  );
}

describe("HTML Reporter header", function () {
  const summary = sampleResults.summary;

  it("describes the run from startedAt, runId, durationMs, and environment", function () {
    const startedAt = "2026-11-06T02:33:28.631Z";
    const facts = headerFactsFor({
      runId: "2026-11-06T02-33-28-631Z",
      startedAt,
      durationMs: 14200,
      environment: {
        platform: "linux",
        arch: "x64",
        docDetectiveVersion: "5.0.0",
        nodeVersion: "24.15.0",
        osRelease: "6.8.0-1017-azure",
      },
      summary,
      specs: [],
    });
    expect(facts).to.deep.equal({
      eyebrow: "2026-11-06T02-33-28-631Z",
      started: new Date(startedAt).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
      fields: [
        ["Doc Detective", "5.0.0"],
        ["Node.js", "24.15.0"],
        ["OS", "linux 6.8.0-1017-azure (x64)"],
        ["duration", "14.2 s"],
      ],
      download: "testResults-2026-11-06T02-33-28-631Z.json",
    });
  });

  it("leaves out what the report doesn't have, rather than showing a dash", function () {
    const facts = headerFactsFor({ summary, specs: [] });
    expect(facts).to.deep.equal({
      eyebrow: "Report",
      started: "",
      fields: [],
      download: "testResults.json",
    });
  });

  it("shows the environment fields it has", function () {
    const facts = headerFactsFor({
      environment: { platform: "linux", nodeVersion: "24.15.0" },
      summary,
      specs: [],
    });
    expect(facts.fields).to.deep.equal([
      ["Node.js", "24.15.0"],
      ["OS", "linux"],
    ]);
  });

  it("no longer reads fields the runner never writes", function () {
    const html = buildHtml({ summary, specs: [] });
    expect(html).to.not.include("report.meta");
    expect(html).to.not.include("report.reportId");
  });
});

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

  it("overwrites a report path you name", async function () {
    const outputFile = path.join(tmpDir, "report.html");
    fs.writeFileSync(outputFile, "<html></html>");
    const results = await outputResults({}, outputFile, sampleResults, {
      reporters: ["html"],
    });
    expect(results[0]).to.equal(outputFile);
    expect(fs.readFileSync(outputFile, "utf-8")).to.include("window.REPORT_DATA");
    expect(fs.readdirSync(tmpDir)).to.deep.equal(["report.html"]);
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

// Automatic screenshots and recordings in the report (ADR 01177), and the page's
// own links (ADR 01180). The page's functions are pulled from its script, with
// `VIEW` supplied: it's what buildHtml puts in dd-report-view.
describe("HTML Reporter media and view", function () {
  let tmpDir;
  beforeEach(function () {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-html-auto-"));
  });
  afterEach(function () {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function pageFunctions(hrefs = {}, { esc = String, escAttr = String } = {}) {
    const outputFile = path.join(tmpDir, "fns.html");
    await outputResults({ logLevel: "silent" }, outputFile, sampleResults, { reporters: ["html"] });
    const html = fs.readFileSync(outputFile, "utf-8");
    // Each function ends at the first `}` in column 0, so these functions must
    // keep their closing brace there and no other line may start with `}`.
    const fn = (name) => new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`).exec(html)?.[0];
    const source = ["mediaHref", "collectMedia", "autoRecordingPanel", "contextLabel", "resultNote"].map(fn);
    expect(source.every(Boolean), "the page defines the media functions").to.equal(true);
    return new Function(
      "VIEW",
      "badge",
      "esc",
      "escAttr",
      "statusIcon",
      `${source.join("\n")}; return { collectMedia, autoRecordingPanel, contextLabel, resultNote };`
    )({ hrefs }, (status) => `<badge ${status}>`, esc, escAttr, () => "<icon>");
  }

  const viewOf = (html) =>
    JSON.parse(/<script id="dd-report-view" type="application\/json">(.*?)<\/script>/s.exec(html)[1]);
  const shot = "specs/s/tests/t/contexts/c/screenshots/01-goTo-open.png";

  describe("the page's functions", function () {
    it("adds a step's automatic screenshot after its authored one, labeled Automatic, through its href", async function () {
      const { collectMedia } = await pageFunctions({ "/x/authored.png": "../x/authored.png", [shot]: `r1/${shot}` });
      const media = collectMedia({ screenshot: { path: "/x/authored.png" }, autoScreenshot: shot });
      expect(media).to.deep.equal([
        { kind: "image", path: "../x/authored.png", changed: undefined },
        { kind: "image", path: `r1/${shot}`, label: "Automatic" },
      ]);
    });

    it("reads the field's future name, and prefers it", async function () {
      const { collectMedia } = await pageFunctions({ [shot]: `r1/${shot}` });
      expect(collectMedia({ autoScreenshotPath: shot })[0].path).to.equal(`r1/${shot}`);
    });

    it("looks up outputs and recordings too, and doesn't repeat a screenshot", async function () {
      const hrefs = { "/a.png": "h/a.png", "/a.mp4": "h/a.mp4" };
      const { collectMedia } = await pageFunctions(hrefs);
      expect(collectMedia({ screenshot: { path: "/a.png" }, outputs: { screenshotPath: "/a.png" } })).to.have.lengthOf(1);
      expect(collectMedia({ outputs: { screenshotPath: "/a.png" } })[0].path).to.equal("h/a.png");
      expect(collectMedia({ record: { path: "/a.mp4" } })[0].path).to.equal("h/a.mp4");
      expect(collectMedia({ stopRecord: null, outputs: { recordingPath: "/a.mp4" } })[0].path).to.equal("h/a.mp4");
    });

    it("keeps a path with no href, such as a screenshot URL", async function () {
      const { collectMedia } = await pageFunctions({});
      expect(collectMedia({ screenshot: { path: "https://example.com/a.png" } })[0].path).to.equal("https://example.com/a.png");
    });

    // The context's automatic recording plays once, in a panel above its steps
    // (ADR 01179). A result that isn't PASS shows its badge and its reason there.
    describe("the automatic recording's panel", function () {
      const video = "specs/s/tests/t/contexts/c/recordings/c.mp4";
      const panelFor = async (autoRecording, hrefs = {}) => {
        const { autoRecordingPanel } = await pageFunctions(hrefs);
        return autoRecordingPanel({ autoRecording, steps: [] });
      };

      it("plays a saved recording through its href, with no badge when it passed", async function () {
        const panel = await panelFor({ result: "PASS", recordingPath: video }, { [video]: `r1/${video}` });
        expect(panel).to.include("Automatic recording");
        expect(panel).to.include(`<video src="r1/${video}"`);
        expect(panel).to.not.include("<badge");
      });

      it("plays a WARNING recording and shows why", async function () {
        const panel = await panelFor({ result: "WARNING", resultDescription: "It may be stale.", recordingPath: video });
        expect(panel).to.include("<video");
        expect(panel).to.include("<badge WARNING>");
        expect(panel).to.include("It may be stale.");
      });

      for (const result of ["SKIPPED", "FAIL"]) {
        it(`shows why a ${result} recording didn't save, with no video`, async function () {
          const panel = await panelFor({ result, resultDescription: "Skipped: no display." });
          expect(panel).to.not.include("<video");
          expect(panel).to.include(`<badge ${result}>`);
          expect(panel).to.include("Skipped: no display.");
        });
      }

      // `esc` needs a DOM, which the suite doesn't have, so these mark what goes through them.
      it("escapes the reason and the recording's path", async function () {
        const { autoRecordingPanel } = await pageFunctions({}, {
          esc: (text) => `esc(${text})`,
          escAttr: (text) => `escAttr(${text})`,
        });
        const panel = autoRecordingPanel({
          autoRecording: { result: "WARNING", resultDescription: "<b>stale</b>", recordingPath: `a&b/${video}` },
        });
        expect(panel).to.include(">esc(<b>stale</b>)<");
        expect(panel).to.include(`<video src="escAttr(a&b/${video})"`);
      });

      for (const result of ["SKIPPED", "WARNING", "FAIL"]) {
        it(`shows a ${result} recording's badge even with no reason`, async function () {
          for (const panel of [await panelFor({ result }), await panelFor({ result, recordingPath: video })]) {
            expect(panel).to.include(`<badge ${result}>`);
            expect(panel).to.not.include("auto-recording-reason");
          }
        });
      }

      it("is empty with nothing to show", async function () {
        expect(await panelFor(undefined)).to.equal("");
        expect(await panelFor({ result: "PASS" })).to.equal("");
      });
    });

    it("adds the browser version and driver to the context label", async function () {
      const { contextLabel } = await pageFunctions();
      expect(
        contextLabel({
          platform: "linux",
          browser: { name: "chrome", version: "131.0.6778.85", headless: true, viewport: { width: 1280, height: 720 } },
          driver: { name: "chromedriver", version: "131.0.6778.85" },
        })
      ).to.equal("chrome 131.0.6778.85 (chromedriver 131.0.6778.85) / linux · headless · 1280×720");
      expect(contextLabel({ platform: "linux", browser: { name: "firefox" } })).to.equal("firefox / linux");
      expect(contextLabel({ platform: "mac", browser: { name: "safari", version: "17" }, driver: { name: "safaridriver" } })).to.equal(
        "safari 17 (safaridriver) / mac"
      );
      expect(contextLabel({ platform: "windows" })).to.equal("windows");
      expect(contextLabel({})).to.equal("shell");
    });

    it("shows the hint and the code in a step's note when present", async function () {
      const { resultNote } = await pageFunctions();
      const note = resultNote({ resultDescription: "Couldn't find it.", resultHint: "Check it.", resultCode: "not_found" }, "fail");
      expect(note).to.include("Couldn't find it.");
      expect(note).to.include("Hint: Check it.");
      expect(note).to.include("not_found");
      const plain = resultNote({ resultDescription: "Couldn't find it." }, "fail");
      expect(plain).to.not.include("Hint:");
      expect(plain).to.not.include("<code");
      expect(resultNote({}, "pass")).to.equal("");
    });
  });

  it("keeps hints and codes out of the step's input panel", async function () {
    const outputFile = path.join(tmpDir, "panel.html");
    await outputResults({ logLevel: "silent" }, outputFile, sampleResults, { reporters: ["html"] });
    const html = fs.readFileSync(outputFile, "utf-8");
    expect(html).to.include("delete rest.resultHint;");
    expect(html).to.include("delete rest.resultCode;");
  });

  it("doesn't read the runner's recording markers", async function () {
    const outputFile = path.join(tmpDir, "markers.html");
    await outputResults({ logLevel: "silent" }, outputFile, sampleResults, { reporters: ["html"] });
    expect(fs.readFileSync(outputFile, "utf-8")).to.not.match(/__autoRecord/);
  });

  // The "Automatic recording" label is a panel head like the step panels',
  // in both themes, not plain text.
  it("styles the automatic recording's head like a panel head", async function () {
    const outputFile = path.join(tmpDir, "css.html");
    await outputResults({ logLevel: "silent" }, outputFile, sampleResults, { reporters: ["html"] });
    const html = fs.readFileSync(outputFile, "utf-8");
    expect(html).to.match(/\.detail-panel \.dp-head,\s*\.auto-recording \.dp-head \{/);
    expect(html).to.match(/body\.dark \.detail-panel \.dp-head,\s*body\.dark \.auto-recording \.dp-head \{/);
  });

  it("renders a run with no automatic media as before", async function () {
    const { collectMedia, autoRecordingPanel } = await pageFunctions();
    const step = { stepId: "s", goTo: { url: "http://x" } };
    expect(collectMedia(step)).to.deep.equal([]);
    expect(autoRecordingPanel({ steps: [step] })).to.equal("");
  });

  describe("the two copies", function () {
    const video = "specs/s/my recordings/a#1.mp4";
    const runId = "20260612-130000";
    async function bothCopies() {
      const run = path.join(tmpDir, ".doc-detective", "runs", runId);
      fs.mkdirSync(run, { recursive: true });
      const authored = path.join(tmpDir, "shots", "my shot.png");
      const results = {
        ...sampleResults,
        runId,
        runDir: run,
        specs: [
          {
            specId: "s",
            result: "PASS",
            tests: [
              {
                testId: "t",
                result: "PASS",
                // eslint-disable-next-line no-sparse-arrays
                contexts: [
                  ,
                  {
                    contextId: "c",
                    result: "PASS",
                    autoRecording: { result: "PASS", recordingPath: video },
                    steps: [
                      null,
                      { stepId: "a", result: "PASS", autoScreenshot: shot, screenshot: { path: authored }, outputs: { screenshotPath: authored } },
                      { stepId: "url", result: "PASS", screenshot: { path: "https://example.com/a.png" } },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };
      const written = await outputResults({ outputDir: tmpDir, logLevel: "silent" }, tmpDir, results, {
        reporters: ["html", "runFolder"],
        command: "runTests",
      });
      return {
        authored,
        flat: fs.readFileSync(written.find((file) => String(file).endsWith(".html")), "utf-8"),
        inRunFolder: fs.readFileSync(path.join(run, "testResults.html"), "utf-8"),
      };
    }

    it("links each stored path from where the file sits, URL-encoded per segment", async function () {
      const { flat, inRunFolder, authored } = await bothCopies();
      const base = `.doc-detective/runs/${runId}`;
      expect(viewOf(flat).hrefs).to.deep.equal({
        [video]: `${base}/specs/s/my%20recordings/a%231.mp4`,
        [shot]: `${base}/${shot}`,
        [authored]: "shots/my%20shot.png",
      });
      expect(viewOf(inRunFolder).hrefs).to.deep.equal({
        [video]: "specs/s/my%20recordings/a%231.mp4",
        [shot]: shot,
        [authored]: "../../../shots/my%20shot.png",
      });
    });

    it("differ only in their hrefs", async function () {
      const { flat, inRunFolder } = await bothCopies();
      const without = (html) => html.replace(/"hrefs":\{.*?\}\}<\/script>/s, "");
      expect(without(flat)).to.equal(without(inRunFolder));
      expect(viewOf(flat).verdict).to.deep.equal(viewOf(inRunFolder).verdict);
    });

    it("keep the report untouched, so Download JSON stays clean", async function () {
      const { flat } = await bothCopies();
      const data = JSON.parse(/<script id="dd-report-data" type="application\/json">(.*?)<\/script>/s.exec(flat)[1]);
      expect(data.hrefs).to.equal(undefined);
      expect(data.verdict).to.equal(undefined);
      expect(flat).to.not.include("REPORT_MEDIA_BASE");
    });
  });

  describe("buildHtml()", function () {
    const counts = (pass, fail, warning, skipped) => ({ pass, fail, warning, skipped });

    it("reads the verdict at the test level", function () {
      const view = viewOf(
        buildHtml({
          summary: { specs: counts(0, 1, 0, 0), tests: counts(3, 1, 0, 0) },
          specs: [],
        })
      );
      expect(view.verdict).to.deep.equal({ status: "fail", label: "Failed", text: "1 of 4 tests failed." });
    });

    it("works with one argument, with no hrefs", function () {
      const view = viewOf(
        buildHtml({ runDir: "/r", specs: [{ tests: [{ contexts: [{ autoRecording: { recordingPath: "a.mp4" } }] }] }] })
      );
      expect(view.hrefs).to.deep.equal({});
      expect(view.verdict.status).to.equal("none");
    });

    it("doesn't throw on a report with nothing in it", function () {
      for (const results of [undefined, null, {}, { specs: [null] }, { specs: [{ tests: [null] }] }]) {
        expect(() => buildHtml(results, path.join(tmpDir, "x.html"))).to.not.throw();
      }
    });

    it("escapes the view's JSON against script breakout", function () {
      const html = buildHtml(
        { specs: [{ tests: [{ contexts: [{ autoRecording: { recordingPath: "</script><script>alert(1).mp4" } }] }] }] },
        path.join(tmpDir, "x.html")
      );
      expect(html).to.not.include("</script><script>alert(1)");
    });

    it("gives a path on another Windows drive a file:/// URL", function () {
      if (process.platform !== "win32") this.skip();
      const view = viewOf(
        buildHtml(
          { runDir: "C:\\out", specs: [{ tests: [{ contexts: [{ autoRecording: { recordingPath: "D:\\a b\\c.mp4" } }] }] }] },
          "C:\\out\\r.html"
        )
      );
      expect(view.hrefs["D:\\a b\\c.mp4"]).to.equal("file:///D:/a%20b/c.mp4");
    });
  });
});
