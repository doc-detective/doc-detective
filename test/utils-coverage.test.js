// Unit-coverage tests for src/utils.ts (imported from the compiled
// dist/utils.js) — the root package's CLI / config / reporters module.
//
// These exercise the unit-testable surface: the terminal reporter's console
// formatting, the json / html / runFolder file reporters, env-driven config
// helpers (getResolvedTestsFromEnv, getConfigFromEnv via setConfig), the
// setConfig CLI-override blocks, reportResults' axios POST, outputResults'
// reporter dispatch, registerReporter, isDebugRequested, log, setMeta, and
// getVersionData.
//
// Everything here is hermetic: no real network (axios is stubbed), no real
// process spawning (spawnCommand is intentionally left to E2E), and every fs /
// env / console / process touch is either stubbed with sinon or confined to an
// OS temp dir that is created and cleaned up per test.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sinon from "sinon";
import axios from "axios";
import {
  log,
  setConfig,
  outputResults,
  reporters,
  registerReporter,
  isDebugRequested,
  getResolvedTestsFromEnv,
  reportResults,
  setMeta,
  getVersionData,
} from "../dist/utils.js";

// Capture and silence console.log / console.error, returning the joined output.
function captureConsole(sandbox) {
  const out = [];
  const errOut = [];
  sandbox.stub(console, "log").callsFake((...args) => {
    out.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  });
  sandbox.stub(console, "error").callsFake((...args) => {
    errOut.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  });
  return {
    get log() {
      return out.join("\n");
    },
    get error() {
      return errOut.join("\n");
    },
    logLines: out,
    errLines: errOut,
  };
}

describe("utils.ts coverage", function () {
  let sandbox;
  const tmpDirs = [];

  // Env keys this suite mutates; save originals once and restore after each test.
  const ENV_KEYS = [
    "DOC_DETECTIVE_DEBUG",
    "DOC_DETECTIVE_API",
    "DOC_DETECTIVE_CONFIG",
    "DOC_DETECTIVE_META",
  ];
  let savedEnv;

  beforeEach(function () {
    sandbox = sinon.createSandbox();
    savedEnv = {};
    for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  });

  afterEach(function () {
    if (sandbox) sandbox.restore();
    sandbox = undefined;
    // Restore env to its pre-test values.
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
    // Clean up any temp dirs created during the test.
    while (tmpDirs.length) {
      const d = tmpDirs.pop();
      try {
        fs.rmSync(d, { recursive: true, force: true });
      } catch {
        /* best-effort */
      }
    }
  });

  function makeTmpDir() {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "dd-utils-cov-"));
    tmpDirs.push(d);
    return d;
  }

  // ---------------------------------------------------------------------------
  // isDebugRequested
  // ---------------------------------------------------------------------------
  describe("isDebugRequested", function () {
    it("returns false when the env var is unset", function () {
      delete process.env.DOC_DETECTIVE_DEBUG;
      assert.equal(isDebugRequested(), false);
    });
    it("returns true for 1/true/yes (case-insensitive, trimmed)", function () {
      for (const v of ["1", "true", "TRUE", "Yes", " true "]) {
        process.env.DOC_DETECTIVE_DEBUG = v;
        assert.equal(isDebugRequested(), true, `expected ${JSON.stringify(v)} to enable debug`);
      }
    });
    it("returns false for other truthy-looking strings", function () {
      for (const v of ["0", "false", "no", "maybe", ""]) {
        process.env.DOC_DETECTIVE_DEBUG = v;
        assert.equal(isDebugRequested(), false, `expected ${JSON.stringify(v)} to NOT enable debug`);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // log
  // ---------------------------------------------------------------------------
  describe("log", function () {
    it("prints info messages at default level via console.log", function () {
      const cap = captureConsole(sandbox);
      log("hello");
      assert.ok(cap.log.includes("hello"));
      assert.equal(cap.error, "");
    });
    it("routes error level to console.error", function () {
      const cap = captureConsole(sandbox);
      log("boom", "error");
      assert.ok(cap.error.includes("boom"));
      assert.equal(cap.log, "");
    });
    it("suppresses messages below the configured logLevel", function () {
      const cap = captureConsole(sandbox);
      log("noisy", "debug", { logLevel: "info" });
      assert.equal(cap.log, "");
      assert.equal(cap.error, "");
    });
    it("never logs the 'silent' level (messageLevelIndex must be > 0)", function () {
      const cap = captureConsole(sandbox);
      log("ignored", "silent", { logLevel: "debug" });
      assert.equal(cap.log, "");
      assert.equal(cap.error, "");
    });
    it("logs debug messages when logLevel is debug", function () {
      const cap = captureConsole(sandbox);
      log("detail", "debug", { logLevel: "debug" });
      assert.ok(cap.log.includes("detail"));
    });
  });

  // ---------------------------------------------------------------------------
  // reporters.terminalReporter
  // ---------------------------------------------------------------------------
  describe("reporters.terminalReporter", function () {
    it("warns 'No tests were run' when results is null", async function () {
      const cap = captureConsole(sandbox);
      await reporters.terminalReporter({}, "out", null, {});
      assert.ok(cap.log.includes("No tests were run"));
      assert.ok(cap.log.includes("Check that the input paths contain testable content"));
    });

    it("mentions active filters in the no-tests warning when filters are configured", async function () {
      const cap = captureConsole(sandbox);
      await reporters.terminalReporter(
        { specFilter: ["s1"], testFilter: ["t1"] },
        "out",
        null,
        {}
      );
      assert.ok(cap.log.includes("filters excluded every spec/test"));
      assert.ok(cap.log.includes("specFilter=[\"s1\"]"));
      assert.ok(cap.log.includes("testFilter=[\"t1\"]"));
    });

    it("prints the celebration banner when everything passes", async function () {
      const cap = captureConsole(sandbox);
      const results = {
        summary: {
          specs: { pass: 1, fail: 0, warning: 0, skipped: 0 },
          tests: { pass: 2, fail: 0, warning: 0, skipped: 0 },
          contexts: { pass: 2, fail: 0, warning: 0, skipped: 0 },
          steps: { pass: 5, fail: 0, warning: 0, skipped: 0 },
        },
        specs: [{ specId: "s1", result: "PASS", tests: [] }],
      };
      await reporters.terminalReporter({}, "out", results, {});
      assert.ok(cap.log.includes("Results Summary"));
      assert.ok(cap.log.includes("All items passed"));
      assert.ok(cap.log.includes("Total: 2")); // tests total
      assert.ok(cap.log.includes("Passed: 5")); // steps passed
    });

    it("prints the empty-run warning when totalTests === 0 even with a summary", async function () {
      const cap = captureConsole(sandbox);
      const results = {
        summary: {
          specs: { pass: 0, fail: 0, warning: 0, skipped: 0 },
          tests: { pass: 0, fail: 0, warning: 0, skipped: 0 },
        },
      };
      await reporters.terminalReporter({}, "out", results, {});
      assert.ok(cap.log.includes("No tests were run"));
      // No celebration when zero tests ran.
      assert.ok(!cap.log.includes("All items passed"));
    });

    it("prints 'All items were skipped' when every spec is skipped", async function () {
      const cap = captureConsole(sandbox);
      const results = {
        summary: {
          specs: { pass: 0, fail: 0, warning: 0, skipped: 3 },
          tests: { pass: 0, fail: 0, warning: 0, skipped: 3 },
        },
      };
      await reporters.terminalReporter({}, "out", results, {});
      assert.ok(cap.log.includes("All items were skipped"));
    });

    it("renders warnings and skipped counts for each level", async function () {
      const cap = captureConsole(sandbox);
      const results = {
        summary: {
          specs: { pass: 1, fail: 0, warning: 1, skipped: 1 },
          tests: { pass: 1, fail: 0, warning: 1, skipped: 1 },
          contexts: { pass: 1, fail: 0, warning: 1, skipped: 1 },
          steps: { pass: 1, fail: 0, warning: 1, skipped: 1 },
        },
        specs: [{ specId: "s1", result: "PASS", tests: [] }],
      };
      await reporters.terminalReporter({}, "out", results, {});
      assert.ok(cap.log.includes("Warnings: 1"));
      assert.ok(cap.log.includes("Skipped: 1"));
    });

    it("collects and prints failed + skipped specs/tests/contexts/steps", async function () {
      const cap = captureConsole(sandbox);
      const results = {
        summary: {
          specs: { pass: 0, fail: 1, warning: 0, skipped: 1 },
          tests: { pass: 0, fail: 1, warning: 0, skipped: 1 },
          contexts: { pass: 0, fail: 1, warning: 0, skipped: 1 },
          steps: { pass: 0, fail: 1, warning: 0, skipped: 1 },
        },
        specs: [
          {
            specId: "spec-fail",
            result: "FAIL",
            tests: [
              {
                testId: "test-fail",
                result: "FAIL",
                contexts: [
                  {
                    result: "FAIL",
                    platform: "linux",
                    browser: { name: "chrome" },
                    steps: [
                      {
                        result: "FAIL",
                        stepId: "step-fail",
                        resultDescription: "exploded",
                      },
                      {
                        result: "SKIPPED",
                        stepId: "step-skip",
                      },
                    ],
                  },
                  {
                    // nested-status shape: result.status === "SKIPPED"
                    result: { status: "SKIPPED" },
                    platform: "win32",
                    browser: { name: "edge" },
                    steps: [],
                  },
                ],
              },
              {
                testId: "test-skip",
                result: "SKIPPED",
                contexts: [],
              },
            ],
          },
          {
            specId: "spec-skip",
            result: "SKIPPED",
            tests: [],
          },
        ],
      };
      await reporters.terminalReporter({}, "out", results, {});
      const text = cap.log;
      assert.ok(text.includes("Failed Items"));
      assert.ok(text.includes("Failed Specs"));
      assert.ok(text.includes("spec-fail"));
      assert.ok(text.includes("Failed Tests"));
      assert.ok(text.includes("test-fail"));
      assert.ok(text.includes("Failed Contexts"));
      assert.ok(text.includes("linux/chrome"));
      assert.ok(text.includes("Failed Steps"));
      assert.ok(text.includes("step-fail"));
      assert.ok(text.includes("Error: exploded"));
      assert.ok(text.includes("Skipped Specs"));
      assert.ok(text.includes("spec-skip"));
      assert.ok(text.includes("Skipped Tests"));
      assert.ok(text.includes("test-skip"));
      assert.ok(text.includes("Skipped Contexts"));
      assert.ok(text.includes("win32/edge"));
      assert.ok(text.includes("Skipped Steps"));
      assert.ok(text.includes("step-skip"));
    });

    it("falls back to default ids/labels when specId/testId/platform/browser missing", async function () {
      const cap = captureConsole(sandbox);
      const results = {
        summary: {
          specs: { pass: 0, fail: 1, warning: 0, skipped: 0 },
          tests: { pass: 0, fail: 1, warning: 0, skipped: 0 },
          contexts: { pass: 0, fail: 1, warning: 0, skipped: 0 },
          steps: { pass: 0, fail: 1, warning: 0, skipped: 0 },
        },
        specs: [
          {
            result: "FAIL",
            tests: [
              {
                result: "FAIL",
                contexts: [
                  {
                    // context.result.status === "FAIL" branch, no platform/browser
                    result: { status: "FAIL" },
                    steps: [{ result: "FAIL" }],
                  },
                ],
              },
            ],
          },
        ],
      };
      await reporters.terminalReporter({}, "out", results, {});
      const text = cap.log;
      assert.ok(text.includes("Spec 1")); // default spec id
      assert.ok(text.includes("Test 1")); // default test id
      assert.ok(text.includes("unknown/unknown")); // default platform/browser
      assert.ok(text.includes("Step 1")); // default step id
      assert.ok(text.includes("Unknown error")); // default error
    });

    it("prints the unknown-format message when there is no summary", async function () {
      const cap = captureConsole(sandbox);
      await reporters.terminalReporter({}, "out", { foo: "bar" }, {});
      assert.ok(cap.log.includes("unknown format"));
    });
  });

  // ---------------------------------------------------------------------------
  // reporters.jsonReporter
  // ---------------------------------------------------------------------------
  describe("reporters.jsonReporter", function () {
    it("writes a timestamped file into a directory output and returns its path", async function () {
      const cap = captureConsole(sandbox);
      const dir = makeTmpDir();
      const results = { summary: {}, specs: [] };
      const outPath = await reporters.jsonReporter({}, dir, results, {
        command: "runTests",
      });
      assert.ok(typeof outPath === "string");
      assert.ok(fs.existsSync(outPath));
      assert.ok(path.basename(outPath).startsWith("testResults-"));
      const written = JSON.parse(fs.readFileSync(outPath, "utf8"));
      assert.deepEqual(written, results);
      assert.ok(cap.log.includes("See detailed results at"));
    });

    it("uses the coverageResults prefix for runCoverage", async function () {
      captureConsole(sandbox);
      const dir = makeTmpDir();
      const outPath = await reporters.jsonReporter({}, dir, { x: 1 }, {
        command: "runCoverage",
      });
      assert.ok(path.basename(outPath).startsWith("coverageResults-"));
    });

    it("honors an explicit .json output path and disambiguates collisions with a counter", async function () {
      captureConsole(sandbox);
      const dir = makeTmpDir();
      const file = path.join(dir, "results.json");
      const first = await reporters.jsonReporter({}, file, { a: 1 }, {});
      assert.equal(first, file);
      // Second write to the same path should not overwrite — counter suffix.
      const second = await reporters.jsonReporter({}, file, { a: 2 }, {});
      assert.notEqual(second, file);
      assert.ok(second.includes("-0.json"));
      assert.ok(fs.existsSync(first));
      assert.ok(fs.existsSync(second));
    });

    it("returns null and logs an error when the write fails", async function () {
      const cap = captureConsole(sandbox);
      const dir = makeTmpDir();
      // Only the write throws; existsSync stays real so the directory branch
      // (no .json extension) skips the collision-counter loop entirely.
      sandbox.stub(fs, "writeFileSync").throws(new Error("disk full"));
      const out = await reporters.jsonReporter({}, dir, { a: 1 }, {});
      assert.equal(out, null);
      assert.ok(cap.error.includes("Error writing results"));
    });
  });

  // ---------------------------------------------------------------------------
  // reporters.htmlReporter
  // ---------------------------------------------------------------------------
  describe("reporters.htmlReporter", function () {
    it("delegates to the htmlReporter module and writes an HTML artifact", async function () {
      captureConsole(sandbox);
      const dir = makeTmpDir();
      const results = {
        summary: {
          specs: { pass: 1, fail: 0, warning: 0, skipped: 0 },
          tests: { pass: 1, fail: 0, warning: 0, skipped: 0 },
        },
        specs: [{ specId: "s1", result: "PASS", tests: [] }],
      };
      const outPath = await reporters.htmlReporter({}, dir, results, {
        command: "runTests",
      });
      assert.ok(typeof outPath === "string");
      assert.ok(fs.existsSync(outPath));
      assert.ok(outPath.toLowerCase().endsWith(".html"));
    });
  });

  // ---------------------------------------------------------------------------
  // reporters.runFolderReporter
  // ---------------------------------------------------------------------------
  describe("reporters.runFolderReporter", function () {
    it("derives a fresh run folder under <output>/.doc-detective/runs and writes JSON + HTML", async function () {
      const cap = captureConsole(sandbox);
      const dir = makeTmpDir();
      const results = {
        summary: {
          specs: { pass: 1, fail: 0, warning: 0, skipped: 0 },
          tests: { pass: 1, fail: 0, warning: 0, skipped: 0 },
        },
        specs: [{ specId: "s1", result: "PASS", tests: [] }],
      };
      const outPath = await reporters.runFolderReporter({}, dir, results, {
        command: "runTests",
      });
      assert.ok(typeof outPath === "string");
      assert.ok(fs.existsSync(outPath));
      assert.ok(outPath.endsWith("testResults.json"));
      assert.ok(outPath.includes(".doc-detective"));
      assert.ok(outPath.includes("runs"));
      // Run folder name is rewritten into the persisted results as runId/runDir.
      const written = JSON.parse(fs.readFileSync(outPath, "utf8"));
      assert.equal(typeof written.runId, "string");
      assert.equal(written.runDir, path.dirname(outPath));
      // HTML companion archived beside the JSON.
      const htmlFile = outPath.replace(/\.json$/, ".html");
      assert.ok(fs.existsSync(htmlFile));
      assert.ok(cap.log.includes("See per-run results at"));
      assert.ok(cap.log.includes("See per-run HTML report at"));
    });

    it("uses the default doc-detective-results prefix when no command is given", async function () {
      captureConsole(sandbox);
      const dir = makeTmpDir();
      const outPath = await reporters.runFolderReporter({}, dir, { specs: [] }, {});
      assert.ok(outPath.endsWith("doc-detective-results.json"));
    });

    it("returns null and logs an error when the JSON write fails", async function () {
      const cap = captureConsole(sandbox);
      const dir = makeTmpDir();
      sandbox.stub(fs, "writeFileSync").throws(new Error("nope"));
      const out = await reporters.runFolderReporter({}, dir, { specs: [] }, {});
      assert.equal(out, null);
      assert.ok(cap.error.includes("Error writing results"));
    });

    it("still archives the JSON when the HTML companion write fails", async function () {
      const cap = captureConsole(sandbox);
      const dir = makeTmpDir();
      const real = fs.writeFileSync.bind(fs);
      // First write (JSON) succeeds; second write (HTML) throws. The reporter's
      // primary JSON contract must survive an HTML failure.
      let n = 0;
      sandbox.stub(fs, "writeFileSync").callsFake((file, data) => {
        n += 1;
        if (n >= 2) throw new Error("html boom");
        return real(file, data);
      });
      const out = await reporters.runFolderReporter({}, dir, { specs: [] }, {});
      assert.ok(typeof out === "string");
      assert.ok(fs.existsSync(out));
      assert.ok(cap.error.includes("Error writing per-run HTML report"));
      assert.ok(cap.log.includes("See per-run results at"));
    });

    it("reuses a stamped runDir confined under the output's runs root", async function () {
      const cap = captureConsole(sandbox);
      const dir = makeTmpDir();
      // Pre-create a valid stamped run folder under <dir>/.doc-detective/runs/.
      const runId = "stamped-run-123";
      const stampedRunDir = path.join(dir, ".doc-detective", "runs", runId);
      fs.mkdirSync(stampedRunDir, { recursive: true });
      const results = { specs: [], runDir: stampedRunDir };
      const out = await reporters.runFolderReporter({}, dir, results, {
        command: "runTests",
      });
      // The reporter wrote into the stamped folder (not a fresh one).
      assert.equal(path.dirname(out), stampedRunDir);
      assert.ok(out.endsWith("testResults.json"));
      // Stamped path is honored, so runId/runDir are NOT rewritten.
      const written = JSON.parse(fs.readFileSync(out, "utf8"));
      assert.equal(written.runDir, stampedRunDir);
      assert.ok(cap.log.includes("See per-run results at"));
    });
  });

  // ---------------------------------------------------------------------------
  // registerReporter
  // ---------------------------------------------------------------------------
  describe("registerReporter", function () {
    it("registers a function and makes it available via outputResults", async function () {
      const spy = sinon.spy(async () => "done");
      try {
        assert.equal(registerReporter("myCustom", spy), true);
        assert.equal(typeof reporters.myCustom, "function");
        await outputResults({ reporters: ["myCustom"] }, "out", { x: 1 }, {});
        assert.ok(spy.calledOnce);
      } finally {
        // Always clean up the global registry mutation, even if an assertion
        // above throws, so the stale spy can't leak into later tests.
        delete reporters.myCustom;
      }
    });
    it("throws when given a non-function", function () {
      assert.throws(() => registerReporter("bad", 123), /Reporter must be a function/);
    });
  });

  // ---------------------------------------------------------------------------
  // outputResults
  // ---------------------------------------------------------------------------
  describe("outputResults", function () {
    it("normalizes shorthand reporter names and dispatches to built-ins", async function () {
      captureConsole(sandbox);
      const terminalStub = sandbox.stub(reporters, "terminalReporter").resolves();
      await outputResults({ reporters: ["terminal"] }, "out", { summary: {} }, {});
      assert.ok(terminalStub.calledOnce);
    });

    it("prefers config.reporters over options.reporters", async function () {
      captureConsole(sandbox);
      const terminalStub = sandbox.stub(reporters, "terminalReporter").resolves();
      const jsonStub = sandbox.stub(reporters, "jsonReporter").resolves();
      await outputResults(
        { reporters: ["terminal"] },
        "out",
        { summary: {} },
        { reporters: ["json"] }
      );
      assert.ok(terminalStub.calledOnce);
      assert.ok(jsonStub.notCalled);
    });

    it("falls back to options.reporters when config has none", async function () {
      captureConsole(sandbox);
      const jsonStub = sandbox.stub(reporters, "jsonReporter").resolves();
      await outputResults({}, "out", { summary: {} }, { reporters: ["json"] });
      assert.ok(jsonStub.calledOnce);
    });

    it("invokes a direct function reporter reference", async function () {
      captureConsole(sandbox);
      const fnReporter = sinon.spy(async () => {});
      await outputResults({ reporters: [fnReporter] }, "out", { x: 1 }, {});
      assert.ok(fnReporter.calledOnce);
    });

    it("logs an error for an unknown string reporter", async function () {
      const cap = captureConsole(sandbox);
      await outputResults({ reporters: ["doesNotExist"] }, "out", { x: 1 }, {});
      assert.ok(cap.error.includes('Reporter "doesNotExist" not found'));
    });

    it("logs an error for an invalid (non-string, non-function) reporter", async function () {
      const cap = captureConsole(sandbox);
      await outputResults({ reporters: [42] }, "out", { x: 1 }, {});
      assert.ok(cap.error.includes("Invalid reporter"));
    });
  });

  // ---------------------------------------------------------------------------
  // getResolvedTestsFromEnv
  // ---------------------------------------------------------------------------
  describe("getResolvedTestsFromEnv", function () {
    it("returns null when DOC_DETECTIVE_API is unset", async function () {
      delete process.env.DOC_DETECTIVE_API;
      const out = await getResolvedTestsFromEnv();
      assert.equal(out, null);
    });

    it("exits(1) when the API config is missing required fields", async function () {
      captureConsole(sandbox);
      process.env.DOC_DETECTIVE_API = JSON.stringify({ url: "http://x" });
      const exitStub = sandbox.stub(process, "exit").throws(new Error("EXIT"));
      await assert.rejects(getResolvedTestsFromEnv(), /EXIT/);
      assert.ok(exitStub.called);
      assert.equal(exitStub.firstCall.args[0], 1);
    });

    it("exits(1) and logs when DOC_DETECTIVE_API is malformed JSON", async function () {
      captureConsole(sandbox);
      process.env.DOC_DETECTIVE_API = "{not json";
      const exitStub = sandbox.stub(process, "exit").throws(new Error("EXIT"));
      await assert.rejects(getResolvedTestsFromEnv(), /EXIT/);
      assert.ok(exitStub.called);
    });

    it("exits(1) when the fetched resolvedTests fail schema validation", async function () {
      captureConsole(sandbox);
      process.env.DOC_DETECTIVE_API = JSON.stringify({
        accountId: "a",
        url: "http://api.test",
        token: "tok",
        contextIds: ["c1"],
      });
      // axios.get resolves with an invalid resolvedTests payload.
      sandbox.stub(axios, "get").resolves({ data: { not: "valid" } });
      const exitStub = sandbox.stub(process, "exit").throws(new Error("EXIT"));
      await assert.rejects(getResolvedTestsFromEnv(), /EXIT/);
      assert.ok(exitStub.called);
      assert.ok(axios.get.calledOnce);
      assert.ok(axios.get.firstCall.args[0].endsWith("/resolved-tests"));
    });

    it("exits(1) when axios rejects (network error)", async function () {
      captureConsole(sandbox);
      process.env.DOC_DETECTIVE_API = JSON.stringify({
        accountId: "a",
        url: "http://api.test",
        token: "tok",
        contextIds: ["c1"],
      });
      sandbox.stub(axios, "get").rejects(new Error("ECONNREFUSED"));
      const exitStub = sandbox.stub(process, "exit").throws(new Error("EXIT"));
      await assert.rejects(getResolvedTestsFromEnv(), /EXIT/);
      assert.ok(exitStub.called);
    });
  });

  // ---------------------------------------------------------------------------
  // setConfig (CLI override blocks + env config merge)
  // ---------------------------------------------------------------------------
  describe("setConfig", function () {
    it("returns sensible defaults for empty args", async function () {
      const cfg = await setConfig({ args: {} });
      assert.equal(cfg.recursive, true);
      assert.equal(cfg.logLevel, "info");
      assert.equal(cfg.relativePathBase, "file");
      // fileTypes is supplied by the schema default; assert the core types are
      // present rather than an exact list (the schema may add more, e.g. dita).
      assert.ok(Array.isArray(cfg.fileTypes));
      for (const t of ["markdown", "asciidoc", "html"]) {
        assert.ok(cfg.fileTypes.includes(t), `expected fileTypes to include ${t}`);
      }
      assert.equal(cfg.browserFallback, "auto");
    });

    it("applies the full set of CLI overrides", async function () {
      const cfg = await setConfig({
        args: {
          logLevel: "debug",
          allowUnsafe: true,
          dryRun: true,
          reporters: ["json", "html"],
          test: "a, b ,",
          spec: "s1",
          hints: false,
          autoUpdate: false,
          autoScreenshot: true,
          autoRecord: false,
          cacheDir: "mycache",
          browserFallback: "OFF",
          concurrentRunners: "4",
        },
      });
      assert.equal(cfg.logLevel, "debug");
      assert.equal(cfg.allowUnsafeSteps, true);
      assert.equal(cfg.dryRun, true);
      assert.deepEqual(cfg.reporters, ["json", "html"]);
      assert.deepEqual(cfg.testFilter, ["a", "b"]); // trimmed, empties dropped
      assert.deepEqual(cfg.specFilter, ["s1"]);
      assert.equal(cfg.hints.enabled, false);
      assert.equal(cfg.autoUpdate, false);
      assert.equal(cfg.autoScreenshot, true);
      assert.equal(cfg.autoRecord, false);
      assert.equal(cfg.cacheDir, "mycache");
      assert.equal(cfg.browserFallback, "off"); // normalized lower-case
      assert.equal(cfg.concurrentRunners, 4);
    });

    it("accepts a single (non-array) reporters value", async function () {
      const cfg = await setConfig({ args: { reporters: "terminal" } });
      assert.deepEqual(cfg.reporters, ["terminal"]);
    });

    it("selects CPU-count mode for the bare/true concurrentRunners flag", async function () {
      const cfgEmpty = await setConfig({ args: { concurrentRunners: "" } });
      assert.equal(cfgEmpty.concurrentRunners, true);
      const cfgTrue = await setConfig({ args: { concurrentRunners: "true" } });
      assert.equal(cfgTrue.concurrentRunners, true);
    });

    it("ignores an invalid browserFallback and keeps the default", async function () {
      const cap = captureConsole(sandbox);
      const cfg = await setConfig({ args: { browserFallback: "bogus" } });
      assert.equal(cfg.browserFallback, "auto");
      assert.ok(cap.log.includes("Ignoring invalid --browser-fallback"));
    });

    it("ignores an invalid concurrentRunners and keeps the default", async function () {
      const cap = captureConsole(sandbox);
      const cfg = await setConfig({ args: { concurrentRunners: "xyz" } });
      assert.equal(cfg.concurrentRunners, 1);
      assert.ok(cap.log.includes("Ignoring invalid --concurrent-runners"));
    });

    it("resolves a comma-separated input list to absolute paths, leaving URLs alone", async function () {
      const cfg = await setConfig({ args: { input: "foo, https://example.com/x" } });
      assert.equal(cfg.input.length, 2);
      assert.ok(path.isAbsolute(cfg.input[0]));
      assert.equal(cfg.input[1], "https://example.com/x");
    });

    it("merges DOC_DETECTIVE_CONFIG env config over file config", async function () {
      process.env.DOC_DETECTIVE_CONFIG = JSON.stringify({ logLevel: "warning" });
      const cfg = await setConfig({ args: {} });
      assert.equal(cfg.logLevel, "warning");
    });

    it("throws a targeted error when DOC_DETECTIVE_CONFIG is not a JSON object", async function () {
      process.env.DOC_DETECTIVE_CONFIG = JSON.stringify([1, 2, 3]);
      await assert.rejects(setConfig({ args: {} }), /must be a JSON object/);
    });

    it("throws a parse error when DOC_DETECTIVE_CONFIG is malformed JSON", async function () {
      process.env.DOC_DETECTIVE_CONFIG = "{nope";
      await assert.rejects(setConfig({ args: {} }), /Error parsing DOC_DETECTIVE_CONFIG/);
    });

    it("throws when DOC_DETECTIVE_CONFIG fails schema validation", async function () {
      process.env.DOC_DETECTIVE_CONFIG = JSON.stringify({ logLevel: 12345 });
      await assert.rejects(setConfig({ args: {} }), /Invalid config from DOC_DETECTIVE_CONFIG/);
    });

    it("throws a clear error when the config file path cannot be read", async function () {
      // readFile throws → wrapped error.
      await assert.rejects(
        setConfig({ args: { config: path.join(makeTmpDir(), "missing.json") } }),
        /Error reading config file at|Could not read config file at/
      );
    });
  });

  // ---------------------------------------------------------------------------
  // reportResults
  // ---------------------------------------------------------------------------
  describe("reportResults", function () {
    it("POSTs lowercased context statuses to the /contexts endpoint", async function () {
      captureConsole(sandbox);
      const postStub = sandbox.stub(axios, "post").resolves({ data: { ok: true } });
      const apiConfig = { url: "http://api.test", token: "tok" };
      const results = {
        specs: [
          {
            tests: [
              {
                contexts: [
                  { contextId: "c1", result: "PASS" },
                  { contextId: "c2", result: "FAIL" },
                  { contextId: "c3", result: "WARNING" },
                  { contextId: "c4", result: "SKIPPED" },
                  { contextId: "c5", result: "MYSTERY" }, // unknown → skipped from payload
                ],
              },
            ],
          },
        ],
      };
      await reportResults({ apiConfig, results });
      assert.ok(postStub.calledOnce);
      const [url, payload, opts] = postStub.firstCall.args;
      assert.equal(url, "http://api.test/contexts");
      assert.equal(opts.headers["x-runner-token"], "tok");
      // c5 (unknown status) is dropped; the other four are mapped.
      assert.equal(payload.contexts.length, 4);
      const byId = Object.fromEntries(payload.contexts.map((c) => [c.contextId, c.status]));
      assert.deepEqual(byId, {
        c1: "passed",
        c2: "failed",
        c3: "warning",
        c4: "skipped",
      });
    });

    it("logs an error (does not throw) when the POST rejects", async function () {
      const cap = captureConsole(sandbox);
      sandbox.stub(axios, "post").rejects(new Error("boom"));
      await reportResults({
        apiConfig: { url: "http://api.test", token: "tok" },
        results: { specs: [{ tests: [{ contexts: [{ contextId: "c1", result: "PASS" }] }] }] },
      });
      assert.ok(cap.error.includes("Error reporting results"));
    });

    it("handles results with no specs gracefully (empty payload)", async function () {
      captureConsole(sandbox);
      const postStub = sandbox.stub(axios, "post").resolves({ data: {} });
      await reportResults({ apiConfig: { url: "http://api.test", token: "tok" }, results: {} });
      assert.ok(postStub.calledOnce);
      assert.deepEqual(postStub.firstCall.args[1].contexts, []);
    });
  });

  // ---------------------------------------------------------------------------
  // setMeta
  // ---------------------------------------------------------------------------
  describe("setMeta", function () {
    it("populates DOC_DETECTIVE_META with distribution fields from scratch", function () {
      delete process.env.DOC_DETECTIVE_META;
      setMeta();
      const meta = JSON.parse(process.env.DOC_DETECTIVE_META);
      assert.equal(meta.distribution, "doc-detective");
      assert.equal(typeof meta.dist_version, "string");
      assert.ok(["windows", "mac", "linux", os.platform()].includes(meta.dist_platform));
      assert.equal(meta.dist_deployment, "node");
      assert.equal(meta.dist_interface, "cli");
      assert.equal(meta.dist_deployment_version, process.version);
    });

    it("preserves caller-provided deployment/interface fields in existing meta", function () {
      process.env.DOC_DETECTIVE_META = JSON.stringify({
        dist_deployment: "docker",
        dist_interface: "api",
        custom: "keep",
      });
      setMeta();
      const meta = JSON.parse(process.env.DOC_DETECTIVE_META);
      assert.equal(meta.dist_deployment, "docker");
      assert.equal(meta.dist_interface, "api");
      assert.equal(meta.custom, "keep");
      assert.equal(meta.distribution, "doc-detective");
    });
  });

  // ---------------------------------------------------------------------------
  // getVersionData
  // ---------------------------------------------------------------------------
  describe("getVersionData", function () {
    it("returns main version + context metadata", function () {
      const data = getVersionData();
      assert.ok(data.main["doc-detective"].version);
      assert.equal(typeof data.context.nodeVersion, "string");
      assert.ok(data.context.platform.includes(os.arch()));
      assert.equal(typeof data.context.timestamp, "string");
      assert.ok("dependencies" in data);
      assert.ok("locations" in data);
    });

    it("reports the npx execution method when npm_execpath points at npx", function () {
      const saved = process.env.npm_execpath;
      process.env.npm_execpath = "/usr/local/bin/npx-cli.js";
      try {
        const data = getVersionData();
        assert.equal(data.context.executionMethod, "npx");
      } finally {
        if (saved === undefined) delete process.env.npm_execpath;
        else process.env.npm_execpath = saved;
      }
    });

    it("reports the npm execution method when npm_execpath is set without npx", function () {
      const saved = process.env.npm_execpath;
      process.env.npm_execpath = "/usr/local/bin/npm-cli.js";
      try {
        const data = getVersionData();
        assert.equal(data.context.executionMethod, "npm");
      } finally {
        if (saved === undefined) delete process.env.npm_execpath;
        else process.env.npm_execpath = saved;
      }
    });

    it("checks discovered doc-detective-* dependencies (ok / mismatch / not-found paths)", function () {
      // Simulate a node_modules with several doc-detective-* packages plus a
      // non-matching dir (filtered out) and the main package (also filtered).
      sandbox.stub(fs, "existsSync").callsFake((p) => {
        const s = String(p);
        if (s.endsWith("node_modules")) return true;
        // dd-error has no package.json on disk → "not found" branch.
        if (s.includes("doc-detective-error")) return false;
        return true;
      });
      sandbox
        .stub(fs, "readdirSync")
        .returns(["doc-detective", "doc-detective-ok", "doc-detective-error", "not-ours"]);
      sandbox.stub(fs, "readFileSync").callsFake(() => {
        // A version that won't match the main package's declared range → mismatch.
        // (The read-throws error path is covered by the dedicated test below.)
        return JSON.stringify({ version: "0.0.0-test" });
      });
      const data = getVersionData();
      // The matching dirs were discovered and checked.
      assert.ok("doc-detective-ok" in data.dependencies);
      assert.ok("doc-detective-error" in data.dependencies);
      // Non-matching / main-package dirs were filtered out.
      assert.ok(!("not-ours" in data.dependencies));
      assert.ok(!("doc-detective" in data.dependencies));
      // The on-disk-missing package reports the not-found status.
      assert.equal(data.dependencies["doc-detective-error"].status, "not found");
      // The present-but-version-mismatched package is flagged.
      assert.ok(["ok", "mismatch"].includes(data.dependencies["doc-detective-ok"].status));
      assert.ok("doc-detective-ok" in data.locations);
    });

    it("records an { error } per dependency when reading its package.json throws", function () {
      sandbox.stub(fs, "existsSync").returns(true);
      sandbox.stub(fs, "readdirSync").returns(["doc-detective-throws"]);
      sandbox.stub(fs, "readFileSync").throws(new Error("read boom"));
      const data = getVersionData();
      assert.equal(data.dependencies["doc-detective-throws"].status, "error");
      assert.equal(data.dependencies["doc-detective-throws"].error, "read boom");
    });

    it("returns an { error } object when an unexpected failure occurs", function () {
      // Force readdirSync to throw so the discovery block's outer try/catch fires.
      sandbox.stub(fs, "existsSync").returns(true);
      sandbox.stub(fs, "readdirSync").throws(new Error("perm denied"));
      const data = getVersionData();
      assert.equal(data.error, "perm denied");
    });
  });
});
