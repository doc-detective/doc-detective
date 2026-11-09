import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { runTests } from "../dist/core/index.js";
import { sessionVersions } from "../dist/core/utils.js";
import { validate } from "../dist/common/src/validate.js";

describe("sessionVersions", function () {
  it("reads Chrome and chromedriver from the session capabilities", () => {
    const capabilities = {
      browserName: "chrome",
      browserVersion: "150.0.7871.115",
      chrome: { chromedriverVersion: "150.0.7871.115 (25f5b661-refs/branch-heads/7871@{#2956})" },
    };
    assert.deepEqual(sessionVersions({ capabilities, app: { name: "chrome", version: "149.0.1" } }), {
      browserVersion: "150.0.7871.115",
      driver: { name: "chromedriver", version: "150.0.7871.115" },
    });
  });

  it("falls back to the detected Firefox build and the managed geckodriver's version", () => {
    // appium-geckodriver echoes the requested capabilities, not geckodriver's.
    const capabilities = { browserName: "MozillaFirefox", automationName: "Gecko" };
    const app = {
      name: "firefox",
      version: "nightly_161.0a1",
      driver: path.join("cache", "browsers", "geckodriver-0.37.1.exe"),
    };
    assert.deepEqual(sessionVersions({ capabilities, app }), {
      browserVersion: "161.0a1",
      driver: { name: "geckodriver", version: "0.37.1" },
    });
  });

  it("prefers versions geckodriver reports itself", () => {
    const capabilities = { browserVersion: "133.0", "moz:geckodriverVersion": "0.36.0" };
    const app = { name: "firefox", version: "stable_132.0", driver: "geckodriver-0.35.0" };
    assert.deepEqual(sessionVersions({ capabilities, app }), {
      browserVersion: "133.0",
      driver: { name: "geckodriver", version: "0.36.0" },
    });
  });

  it("names geckodriver without a version when its binary isn't version-suffixed", () => {
    const app = { name: "firefox", version: "stable_133.0", driver: "/usr/bin/geckodriver" };
    assert.deepEqual(sessionVersions({ capabilities: {}, app }).driver, { name: "geckodriver" });
  });

  it("names safaridriver, which reports no version", () => {
    assert.deepEqual(
      sessionVersions({ capabilities: { browserVersion: "18.1" }, app: { name: "safari" } }),
      { browserVersion: "18.1", driver: { name: "safaridriver" } }
    );
  });

  it("returns nothing when there's no session to read", () => {
    assert.deepEqual(sessionVersions({}), {});
    assert.deepEqual(sessionVersions({ capabilities: null }), {});
  });

  it("ignores non-string versions rather than throwing", () => {
    // It runs after the driver started, so an odd capability must never throw.
    assert.deepEqual(
      sessionVersions({
        capabilities: { browserVersion: 131, chrome: { chromedriverVersion: 42 } },
        app: { name: "chrome", version: 7 },
      }),
      {}
    );
    assert.deepEqual(
      sessionVersions({
        capabilities: { browserVersion: {}, chrome: 5, "moz:geckodriverVersion": {} },
        app: { name: "firefox", version: ["161"], driver: 5 },
      }),
      { driver: { name: "geckodriver" } }
    );
  });
});

// Run metadata on the report: the run environment and start times
// (adrs/01163-record-the-run-environment-in-reports.md). Report outputs can't
// be asserted through the fixture gate's own run, so these run the real
// pipeline over a hermetic shell-only spec and assert the emitted shape.
describe("Run metadata on reports", function () {
  this.timeout(300000);

  const ISO_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  const pkg = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));
  let report;

  before(async () => {
    fs.mkdirSync(path.resolve("./.tmp"), { recursive: true });
    const input = path.resolve("./.tmp/temp-run-metadata.json");
    fs.writeFileSync(
      input,
      JSON.stringify({
        tests: [
          {
            testId: "meta-a",
            steps: [{ runShell: "echo a1" }, { runShell: "echo a2" }],
          },
          { testId: "meta-b", steps: [{ runShell: "echo b1" }] },
        ],
      })
    );
    try {
      report = await runTests({ input });
    } finally {
      fs.unlinkSync(input);
    }
  });

  it("stamps the run's start time as ISO 8601 UTC with milliseconds", () => {
    assert.match(report.startedAt, ISO_MS);
    assert.ok(!isNaN(Date.parse(report.startedAt)));
  });

  it("records the host environment, without the working directory", () => {
    assert.deepEqual(report.environment, {
      platform: { darwin: "mac", linux: "linux", win32: "windows" }[process.platform],
      arch: os.arch(),
      docDetectiveVersion: pkg.version,
      nodeVersion: process.versions.node,
      osRelease: os.release(),
    });
  });

  it("stamps every context and step with a start time in run order", () => {
    const runStart = Date.parse(report.startedAt);
    const contexts = report.specs.flatMap((s) => s.tests.flatMap((t) => t.contexts));
    assert.ok(contexts.length > 0, "run produced no contexts");
    for (const context of contexts) {
      assert.match(context.startedAt, ISO_MS);
      const contextStart = Date.parse(context.startedAt);
      assert.ok(contextStart >= runStart, "context started before the run");
      assert.ok(context.steps.length > 0, "context ran no steps");
      for (const step of context.steps) {
        assert.match(step.startedAt, ISO_MS);
        assert.ok(
          Date.parse(step.startedAt) >= contextStart,
          `step ${step.startedAt} started before its context ${context.startedAt}`
        );
      }
    }
  });

  it("doesn't report an authored browser.version for a context that never started a browser", async () => {
    // `version` is readOnly but validates in runOn; resolution must drop it so
    // only the session sets it. A context on another platform skips before any
    // browser starts, so its report shows exactly what resolution handed on.
    const other = report.environment.platform === "linux" ? "windows" : "linux";
    const input = path.resolve("./.tmp/temp-run-metadata-authored.json");
    fs.writeFileSync(
      input,
      JSON.stringify({
        tests: [
          {
            testId: "authored-version",
            runOn: [{ platforms: other, browsers: { name: "chrome", version: "120" } }],
            steps: [{ goTo: "http://localhost:8092" }],
          },
        ],
      })
    );
    let skipped;
    try {
      skipped = await runTests({ input });
    } finally {
      fs.unlinkSync(input);
    }
    const context = skipped.specs[0].tests[0].contexts[0];
    assert.equal(context.result, "SKIPPED");
    assert.equal(context.browser?.name, "chrome");
    assert.equal(context.browser?.version, undefined);
  });

  it("omits browser and driver versions when no browser ran", () => {
    for (const context of report.specs[0].tests[0].contexts) {
      assert.equal(context.browser?.version, undefined);
      assert.equal(context.driver, undefined);
    }
  });

  it("emits metadata that validates against report_v3", () => {
    // Only the metadata fields, as emitted, on a minimal report skeleton. On
    // main a full report doesn't validate yet for unrelated reasons (an
    // undeclared test-level `result`, runShell's object `outputs.stdio`); the
    // v5 report contract (ADR 01149, on feat/v5-rc) closes those.
    assert.ok(report.startedAt && report.environment, "metadata missing");
    const object = {
      runId: report.runId,
      startedAt: report.startedAt,
      environment: report.environment,
      specs: report.specs.map((spec) => ({
        tests: spec.tests.map((test) => ({
          contexts: test.contexts.map((c) => ({
            contextId: c.contextId,
            startedAt: c.startedAt,
            ...(c.browser && { browser: c.browser }),
            ...(c.driver && { driver: c.driver }),
            steps: c.steps.map((s) => ({
              runShell: s.runShell,
              stepId: s.stepId,
              startedAt: s.startedAt,
              durationMs: s.durationMs,
            })),
          })),
        })),
      })),
    };
    const result = validate({ schemaKey: "report_v3", object });
    assert.ok(result.valid, result.errors);
    assert.deepEqual(result.object.environment, report.environment);
  });
});
