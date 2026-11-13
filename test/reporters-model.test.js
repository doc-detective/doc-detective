// The internal model every reporter builds on (ADR 01180).

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sinon from "sinon";

import { environmentLine, mediaPath, nonPassItems, verdict, writeReport } from "../dist/reporters/model.js";
import { reportOutputDir } from "../dist/core/utils.js";
import { outputResults } from "../dist/utils.js";

const tests = (pass, fail, warning, skipped) => ({ tests: { pass, fail, warning, skipped } });
// A report with one context of the given steps, plus its other fields.
const report = (steps, context = {}, extra = {}) => ({
  ...extra,
  specs: [
    { specId: "sp", tests: [{ testId: "te", contexts: [{ contextId: "co", result: "PASS", steps, ...context }] }] },
  ],
});

describe("reporters/model", function () {
  let dir;
  beforeEach(function () {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-model-"));
  });
  afterEach(function () {
    sinon.restore();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  describe("verdict()", function () {
    const cases = [
      [tests(0, 0, 0, 0), "none", "No tests ran", "No tests ran."],
      [tests(9, 1, 2, 3), "fail", "Failed", "1 of 15 tests failed (2 with warnings, 3 skipped)."],
      [tests(1, 1, 0, 0), "fail", "Failed", "1 of 2 tests failed."],
      [tests(0, 1, 0, 0), "fail", "Failed", "1 of 1 test failed."],
      [tests(0, 0, 0, 12), "skipped", "Skipped", "All 12 tests skipped."],
      [tests(0, 0, 0, 1), "skipped", "Skipped", "All 1 test skipped."],
      [tests(7, 0, 2, 3), "warning", "Passed with warnings", "9 of 12 tests passed (2 with warnings, 3 skipped)."],
      [tests(0, 0, 1, 0), "warning", "Passed with warnings", "1 of 1 test passed (1 with warnings)."],
      [tests(12, 0, 0, 0), "pass", "Passed", "12 of 12 tests passed."],
      [tests(9, 0, 0, 3), "pass", "Passed", "9 of 12 tests passed (3 skipped)."],
    ];
    for (const [summary, status, label, text] of cases) {
      it(`${status}: ${text}`, function () {
        assert.deepEqual(verdict(summary), { status, label, text });
      });
    }

    it("treats a missing summary or missing counts as no tests", function () {
      assert.equal(verdict(undefined).status, "none");
      assert.equal(verdict({}).status, "none");
      assert.equal(verdict({ tests: { fail: 1 } }).text, "1 of 1 test failed.");
    });
  });

  describe("nonPassItems()", function () {
    it("makes a non-PASS step an item, with its ID path, description, reason, hint, and code", function () {
      const items = nonPassItems(
        report(
          [
            { stepId: "ok", result: "PASS" },
            {
              stepId: "click-save",
              description: "Click Save",
              result: "FAIL",
              resultDescription: "Couldn't find element `#save`.",
              resultHint: "Check the selector.",
              resultCode: "element_not_found",
            },
          ],
          { result: "FAIL" }
        )
      );
      assert.equal(items.length, 1);
      const { owner, ...item } = items[0];
      assert.deepEqual(item, {
        status: "FAIL",
        idPath: "sp › te › co › click-save",
        description: "Click Save",
        reason: "Couldn't find element `#save`.",
        hint: "Check the selector.",
        code: "element_not_found",
        skippedAfter: 0,
      });
    });

    it("skips holes in contexts, tests, specs, and steps, and numbers fallbacks by position", function () {
      const items = nonPassItems({
        specs: [
          null,
          {
            tests: [
              undefined,
              {
                // A sparse array is what an aborted run leaves behind.
                // eslint-disable-next-line no-sparse-arrays
                contexts: [, { result: "FAIL", steps: [null, { result: "FAIL", resultDescription: "Boom." }] }],
              },
            ],
          },
        ],
      });
      assert.deepEqual(
        items.map((i) => i.idPath),
        ["spec 2 › test 2 › context 2 › step 2"]
      );
    });

    it("folds SKIPPED steps after a FAIL into that item", function () {
      const items = nonPassItems(
        report(
          [
            { stepId: "a", result: "SKIPPED", resultDescription: "Skipped: guard." },
            { stepId: "b", result: "FAIL", resultDescription: "Boom." },
            { stepId: "c", result: "SKIPPED" },
            { stepId: "d", result: "SKIPPED" },
          ],
          { result: "FAIL" }
        )
      );
      assert.deepEqual(
        items.map((i) => [i.status, i.idPath, i.skippedAfter]),
        [
          ["FAIL", "sp › te › co › b", 2],
          ["SKIPPED", "sp › te › co › a", 0],
        ]
      );
    });

    it("says how many steps it folded, in the singular and the plural", function () {
      const note = (count) =>
        nonPassItems(
          report(
            [{ stepId: "f", result: "FAIL" }, ...Array.from({ length: count }, () => ({ result: "SKIPPED" }))],
            { result: "FAIL" }
          )
        )[0].skippedNote;
      assert.equal(note(0), undefined);
      assert.equal(note(1), "1 more step skipped after the failure.");
      assert.equal(note(4), "4 more steps skipped after the failure.");
    });

    it("folds every SKIPPED step into a failed automatic recording, which comes first", function () {
      const items = nonPassItems(
        report([{ stepId: "s", result: "SKIPPED" }], {
          result: "FAIL",
          autoRecording: { result: "FAIL", resultDescription: "Couldn't start recording." },
        })
      );
      assert.equal(items.length, 1);
      assert.equal(items[0].idPath, "sp › te › co › autoRecording");
      assert.equal(items[0].reason, "Couldn't start recording.");
      assert.equal(items[0].skippedAfter, 1);
    });

    it("lists a context whose only failure is its automatic recording, with no steps failing", function () {
      const items = nonPassItems(
        report([{ stepId: "s", result: "PASS" }], {
          result: "FAIL",
          autoRecording: { result: "FAIL", resultDescription: "Couldn't stop recording." },
        })
      );
      assert.deepEqual(
        items.map((i) => [i.status, i.idPath, i.reason]),
        [["FAIL", "sp › te › co › autoRecording", "Couldn't stop recording."]]
      );
    });

    it("lists a WARNING or SKIPPED recording, and leaves a PASS one out", function () {
      const of = (autoRecording) =>
        nonPassItems(report([], { result: "PASS", autoRecording })).map((i) => [i.status, i.idPath]);
      assert.deepEqual(of({ result: "WARNING" }), [["WARNING", "sp › te › co › autoRecording"]]);
      assert.deepEqual(of({ result: "SKIPPED" }), [["SKIPPED", "sp › te › co › autoRecording"]]);
      assert.deepEqual(of({ result: "PASS" }), []);
    });

    it("makes a non-PASS context with no items an item, with the test's description", function () {
      const items = nonPassItems({
        specs: [
          {
            specId: "sp",
            tests: [
              {
                testId: "te",
                description: "Set up a Mac",
                contexts: [{ contextId: "mac", result: "SKIPPED", resultDescription: "Skipped: not on a Mac.", steps: [] }],
              },
            ],
          },
        ],
      });
      assert.deepEqual(
        items.map((i) => [i.status, i.idPath, i.description, i.reason]),
        [["SKIPPED", "sp › te › mac", "Set up a Mac", "Skipped: not on a Mac."]]
      );
    });

    it("lists a context whose own result no item carries, such as a fallback warning with a skipped step", function () {
      const items = nonPassItems(
        report([{ stepId: "s", result: "SKIPPED", resultDescription: "Skipped: guard." }], {
          result: "WARNING",
          resultDescription: "Ran on firefox instead.",
        })
      );
      assert.deepEqual(
        items.map((i) => [i.status, i.idPath, i.reason]),
        [
          ["WARNING", "sp › te › co", "Ran on firefox instead."],
          ["SKIPPED", "sp › te › co › s", "Skipped: guard."],
        ]
      );
    });

    it("makes a non-PASS test with no contexts and a non-PASS spec with no tests items", function () {
      const items = nonPassItems({
        specs: [
          { specId: "empty", description: "No tests", result: "SKIPPED", resultDescription: "Skipped: empty." },
          { specId: "sp", tests: [{ testId: "te", description: "No contexts", result: "FAIL", contexts: [null] }] },
          { specId: "ok", result: "PASS" },
          { specId: "ok2", tests: [{ testId: "t", result: "PASS", contexts: [] }] },
          { specId: "unknown", tests: [{ testId: "t" }] },
        ],
      });
      assert.deepEqual(
        items.map((i) => [i.status, i.idPath, i.description]),
        [
          ["FAIL", "sp › te", "No contexts"],
          ["SKIPPED", "empty", "No tests"],
        ]
      );
    });

    it("groups items as FAIL, WARNING, then SKIPPED, in report order", function () {
      const items = nonPassItems(
        report(
          [
            { stepId: "s1", result: "SKIPPED" },
            { stepId: "w1", result: "WARNING" },
            { stepId: "w2", result: "WARNING" },
            { stepId: "f1", result: "FAIL" },
          ],
          { result: "FAIL" }
        )
      );
      assert.deepEqual(
        items.map((i) => i.idPath.split(" › ").pop()),
        ["f1", "w1", "w2", "s1"]
      );
    });

    it("keeps the node an item came from, so a reporter can group items by context", function () {
      const results = report([{ stepId: "f", result: "FAIL" }], { result: "FAIL" });
      assert.equal(nonPassItems(results)[0].owner, results.specs[0].tests[0].contexts[0]);
    });

    it("resolves evidence against runDir, prefers the automatic screenshot, and leaves out a missing file", function () {
      const auto = path.join("specs", "shots", "01.png");
      const authored = path.join(dir, "authored.png");
      const video = "specs/recordings/co.mp4";
      fs.mkdirSync(path.join(dir, "specs", "shots"), { recursive: true });
      fs.mkdirSync(path.join(dir, "specs", "recordings"), { recursive: true });
      fs.writeFileSync(path.join(dir, auto), "x");
      fs.writeFileSync(authored, "x");
      fs.writeFileSync(path.join(dir, video), "x");
      const items = nonPassItems(
        report(
          [
            { stepId: "both", result: "FAIL", autoScreenshotPath: auto, outputs: { screenshotPath: authored } },
            { stepId: "authored", result: "FAIL", autoScreenshotPath: "gone.png", outputs: { screenshotPath: authored } },
            { stepId: "gone", result: "FAIL", autoScreenshotPath: "gone.png" },
            // The pre-5.0 field name isn't read (ADR 01184).
            { stepId: "old", result: "FAIL", autoScreenshot: auto },
          ],
          { result: "FAIL", autoRecording: { result: "PASS", recordingPath: video } },
          { runDir: dir }
        )
      );
      assert.deepEqual(
        items.map((i) => i.screenshot),
        [path.join(dir, auto), authored, undefined, undefined]
      );
      assert.ok(!("screenshot" in items[2]));
      assert.ok(!("screenshot" in items[3]));
      assert.ok(items.every((i) => i.recording === path.join(dir, video)));
    });

    it("leaves out a recording whose file is gone", function () {
      const [item] = nonPassItems(
        report([{ stepId: "f", result: "FAIL" }], {
          result: "FAIL",
          autoRecording: { result: "PASS", recordingPath: "gone.mp4" },
        }, { runDir: dir })
      );
      assert.ok(!("recording" in item));
    });

    it("copes with a run that has no runId or runDir, and with a report with nothing in it", function () {
      assert.deepEqual(nonPassItems(undefined), []);
      assert.deepEqual(nonPassItems({}), []);
      assert.deepEqual(nonPassItems({ specs: [] }), []);
      const [item] = nonPassItems(report([{ stepId: "f", result: "FAIL", autoScreenshotPath: "gone.png" }], { result: "FAIL" }));
      assert.equal(item.idPath, "sp › te › co › f");
      assert.equal(item.reason, "");
    });
  });

  describe("mediaPath()", function () {
    const runDir = path.join(path.sep === "/" ? "/out" : "C:\\out", ".doc-detective", "runs", "r1");
    const out = path.dirname(path.dirname(path.dirname(runDir)));

    it("resolves a relative path against runDir, then makes it relative to fromDir", function () {
      assert.equal(mediaPath("specs/s/a.png", runDir, out), ".doc-detective/runs/r1/specs/s/a.png");
      assert.equal(mediaPath("specs/s/a.png", runDir, runDir), "specs/s/a.png");
    });

    it("makes an absolute path relative to fromDir", function () {
      assert.equal(mediaPath(path.join(out, "shots", "a.png"), runDir, runDir), "../../../shots/a.png");
    });

    it("uses forward slashes on every platform and keeps spaces", function () {
      assert.equal(mediaPath(path.join("my shots", "a b.png"), runDir, runDir), "my shots/a b.png");
    });

    it("copes with a missing runDir", function () {
      const fromDir = process.cwd();
      assert.equal(mediaPath("a.png", undefined, fromDir), "a.png");
    });

    it("stays absolute on another Windows drive", function () {
      if (process.platform !== "win32") this.skip();
      assert.equal(mediaPath("D:\\shots\\a.png", "C:\\out", "C:\\out"), "D:/shots/a.png");
    });
  });

  describe("environmentLine()", function () {
    const environment = {
      platform: "linux",
      arch: "x64",
      osRelease: "6.8.0-1017-azure",
      docDetectiveVersion: "5.0.0",
      nodeVersion: "24.15.0",
    };

    it("prints the versions, platform, start, and duration on one line", function () {
      assert.equal(
        environmentLine({ environment, startedAt: "2026-11-06T02:33:28.631Z", durationMs: 14200 }),
        "Doc Detective 5.0.0 · Node.js 24.15.0 · linux 6.8.0-1017-azure (x64) · Started 2026-11-06T02:33:28.631Z · Took 14.2 s"
      );
    });

    it("leaves out a missing field", function () {
      assert.equal(environmentLine({ environment: { nodeVersion: "24.15.0" } }), "Node.js 24.15.0");
      assert.equal(environmentLine({ environment: { platform: "mac" } }), "mac");
    });

    it("starts the host with the architecture when it's the only host field", function () {
      assert.equal(environmentLine({ environment: { arch: "arm64", nodeVersion: "24.15.0" } }), "Node.js 24.15.0 · (arm64)");
    });

    it("returns null when environment is missing or empty", function () {
      assert.equal(environmentLine({}), null);
      assert.equal(environmentLine(undefined), null);
      assert.equal(environmentLine({ environment: {} }), null);
    });
  });

  describe("writeReport()", function () {
    it("makes the folder, writes, announces at info on stderr, and returns the path", function () {
      const out = sinon.stub(console, "log");
      const err = sinon.stub(console, "error");
      const file = path.join(dir, "deep", "er", "junit.xml");
      assert.equal(writeReport("JUnit report", file, () => "<x/>", {}), file);
      assert.equal(fs.readFileSync(file, "utf8"), "<x/>");
      assert.deepEqual(err.firstCall.args, [`JUnit report: ${file}`]);
      assert.equal(out.called, false);
    });

    it("logs a report that can't be built, instead of throwing", function () {
      const err = sinon.stub(console, "error");
      const file = path.join(dir, "h");
      const render = () => {
        throw new Error("nope");
      };
      assert.equal(writeReport("JUnit report", file, render, {}), null);
      assert.equal(err.firstCall.args[0], "Error: Couldn't build the JUnit report: nope.");
      assert.equal(fs.existsSync(file), false);
    });

    for (const [kind, noun] of [
      ["Results", "results"],
      ["Run report", "run report"],
      ["Markdown summary", "Markdown summary"],
    ]) {
      it(`names the ${noun} when it can't be built, without a write cause`, function () {
        const err = sinon.stub(console, "error");
        const render = () => {
          throw Object.assign(new Error("bad input."), { code: "EACCES" });
        };
        assert.equal(writeReport(kind, path.join(dir, "b"), render, {}), null);
        assert.equal(err.firstCall.args[0], `Error: Couldn't build the ${noun}: bad input.`);
      });
    }

    it("keeps a report that can't be built from rejecting outputResults", async function () {
      sinon.stub(console, "error");
      const written = await outputResults({}, dir, { summary: {}, specs: 5 }, { reporters: ["html", "junit"] });
      assert.deepEqual(written, [null, null]);
    });

    it("overwrites an existing file", function () {
      sinon.stub(console, "error");
      const file = path.join(dir, "a.json");
      fs.writeFileSync(file, "old");
      writeReport("Results", file, () => "new", {});
      assert.equal(fs.readFileSync(file, "utf8"), "new");
    });

    it("follows the log level", function () {
      const err = sinon.stub(console, "error");
      for (const logLevel of ["warning", "error", "silent"]) {
        writeReport("Results", path.join(dir, "q.json"), () => "x", { logLevel });
      }
      assert.equal(err.called, false);
    });

    it("masks the announcement like other log lines", async function () {
      const { registerEnvValue, resetMasking } = await import("../dist/core/masking.js");
      const err = sinon.stub(console, "error");
      process.env.DD_MODEL_SECRET_TOKEN = "folder-value";
      try {
        registerEnvValue("DD_MODEL_SECRET_TOKEN", "folder-value");
        writeReport("Results", path.join(dir, "folder-value", "m.json"), () => "x", {});
        assert.ok(!err.firstCall.args[0].includes("folder-value"));
        assert.ok(err.firstCall.args[0].includes("***DD_MODEL_SECRET_TOKEN***"));
      } finally {
        delete process.env.DD_MODEL_SECRET_TOKEN;
        resetMasking();
      }
    });

    const nouns = [
      ["Results", "results"],
      ["Run results", "run results"],
      ["Run report", "run report"],
      ["HTML report", "HTML report"],
      ["JUnit report", "JUnit report"],
      ["Markdown summary", "Markdown summary"],
    ];
    for (const [kind, noun] of nouns) {
      it(`names the ${noun} when a write fails`, function () {
        const err = sinon.stub(console, "error");
        sinon.stub(fs, "writeFileSync").throws(Object.assign(new Error("x"), { code: "EACCES" }));
        const file = path.join(dir, "f");
        assert.equal(writeReport(kind, file, () => "x", {}), null);
        assert.equal(err.firstCall.args[0], `Error: Couldn't write the ${noun} to ${file}: permission denied.`);
      });
    }

    const causes = [
      ["EACCES", "permission denied"],
      ["EPERM", "permission denied"],
      ["ENOSPC", "the disk is full"],
      ["EROFS", "the file system is read-only"],
      ["ENOTDIR", "a folder in that path is a file"],
      ["EISDIR", "that path is a folder"],
      ["EOTHER", "something else broke"],
    ];
    for (const [code, cause] of causes) {
      it(`explains ${code}`, function () {
        const err = sinon.stub(console, "error");
        sinon.stub(fs, "mkdirSync").throws(Object.assign(new Error("something else broke."), { code }));
        const file = path.join(dir, "g", "f");
        assert.equal(writeReport("Results", file, () => "x", {}), null);
        assert.equal(err.firstCall.args[0], `Error: Couldn't write the results to ${file}: ${cause}.`);
      });
    }

    it("prints an error at error level, and stays quiet at silent", function () {
      const err = sinon.stub(console, "error");
      sinon.stub(fs, "writeFileSync").throws(new Error("nope"));
      assert.equal(writeReport("Results", path.join(dir, "e"), () => "x", { logLevel: "error" }), null);
      assert.equal(err.callCount, 1);
      assert.equal(writeReport("Results", path.join(dir, "e"), () => "x", { logLevel: "silent" }), null);
      assert.equal(err.callCount, 1);
    });
  });

  describe("reportOutputDir()", function () {
    it("uses the folder of a path with a report extension, even when it doesn't exist", function () {
      for (const ext of ["json", "html", "htm", "xml", "md", "JSON"]) {
        assert.equal(reportOutputDir(path.join(dir, `a.${ext}`)), dir);
      }
    });

    it("checks anything else on disk: a folder as is, a file's folder, and a missing path as a folder", function () {
      const dotted = path.join(dir, "reports.v1");
      fs.mkdirSync(dotted);
      const plain = path.join(dir, "notes");
      fs.writeFileSync(plain, "x");
      assert.equal(reportOutputDir(dotted), dotted);
      assert.equal(reportOutputDir(plain), dir);
      assert.equal(reportOutputDir(path.join(dir, "new")), path.join(dir, "new"));
    });

    it("is always absolute, and defaults to the working directory", function () {
      assert.equal(reportOutputDir(undefined), process.cwd());
      assert.equal(reportOutputDir(""), process.cwd());
      assert.equal(reportOutputDir("some-folder"), path.resolve("some-folder"));
    });
  });
});
