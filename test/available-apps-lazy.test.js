// Browser/driver detection (getAvailableApps) runs only for runs that can use
// it (ADR 01133). A shell/HTTP-only run skips the @puppeteer/browsers load,
// the browser-cache scan, and the `chromedriver`/`geckodriver --version` spawns.
//
// Hermetic: the available-apps cache is seeded with a sentinel app through
// patchAppCache (injected verify/detect), so "detection ran" is observable as
// the sentinel coming back, without probing any real browser.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sinon from "sinon";
import { runNeedsAvailableApps, runSpecs } from "../dist/core/tests.js";
import {
  setConfig,
  patchAppCache,
  clearAppCache,
  getEnvironment,
} from "../dist/core/config.js";
import { detectAndResolveTests, runTests } from "../dist/core/index.js";

const spec = (contexts, testSteps) => [
  { specId: "s", tests: [{ testId: "t", ...(testSteps ? { steps: testSteps } : {}), contexts }] },
];

describe("runNeedsAvailableApps", function () {
  it("is false for shell, HTTP, code, wait, and variable steps only", function () {
    const steps = [
      { runShell: "echo hi" },
      { httpRequest: { url: "http://localhost" } },
      { runCode: { language: "javascript", code: "1" } },
      { wait: 10 },
      { loadVariables: ".env" },
      { checkLink: "http://localhost" },
    ];
    assert.equal(runNeedsAvailableApps(spec([{ platform: "linux", steps }])), false);
  });

  it("is false for no specs, no tests, and no contexts", function () {
    assert.equal(runNeedsAvailableApps([]), false);
    assert.equal(runNeedsAvailableApps(undefined), false);
    assert.equal(runNeedsAvailableApps([{ tests: [{ contexts: [] }] }]), false);
  });

  for (const key of ["goTo", "find", "click", "type", "screenshot", "record", "stopRecord", "runBrowserScript", "startSurface", "closeSurface", "swipe"]) {
    it(`is true for a context with a '${key}' step`, function () {
      const step = { [key]: key === "startSurface" ? { app: "x" } : "x" };
      assert.equal(runNeedsAvailableApps(spec([{ steps: [{ runShell: "a" }, step] }])), true);
    });
  }

  it("is true for a context that names a browser, even with shell-only steps", function () {
    assert.equal(
      runNeedsAvailableApps(spec([{ browser: { name: "chrome" }, steps: [{ runShell: "a" }] }])),
      true
    );
  });

  it("is true for a mobile-platform context", function () {
    for (const platform of ["android", "ios"]) {
      assert.equal(runNeedsAvailableApps(spec([{ platform, steps: [{ runShell: "a" }] }])), true);
    }
  });

  it("falls back to the test's steps when a context carries none", function () {
    assert.equal(runNeedsAvailableApps(spec([{}], [{ goTo: "http://x" }])), true);
    assert.equal(runNeedsAvailableApps(spec([{}], [{ runShell: "a" }])), false);
  });
});

describe("lazy available-apps detection", function () {
  this.timeout(60000);
  let cacheDir;
  const sentinel = { name: "chrome", version: "0-sentinel", path: "sentinel-chrome", driverPath: "sentinel-driver" };

  beforeEach(async function () {
    cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-apps-lazy-"));
    clearAppCache();
    await patchAppCache({ cacheDir }, [sentinel], {
      verify: async () => ({ ok: true }),
      detectDrivers: () => ({ chromium: true, gecko: true, safari: true }),
    });
  });
  afterEach(function () {
    sinon.restore();
    clearAppCache();
    fs.rmSync(cacheDir, { recursive: true, force: true });
  });

  const names = (apps) => apps.map((a) => a.version);

  it("setConfig still detects apps by default", async function () {
    const config = await setConfig({ config: { logLevel: "silent", input: ["./README.md"], cacheDir } });
    assert.deepEqual(names(config.environment.apps), ["0-sentinel"]);
  });

  it("setConfig with detectApps: false leaves environment.apps empty", async function () {
    const config = await setConfig({
      config: { logLevel: "silent", input: ["./README.md"], cacheDir },
      detectApps: false,
    });
    assert.deepEqual(config.environment.apps, []);
  });

  it("detectAndResolveTests (public API) still populates environment.apps", async function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-apps-lazy-spec-"));
    try {
      const input = path.join(dir, "shell.spec.json");
      fs.writeFileSync(input, JSON.stringify({ tests: [{ steps: [{ runShell: "echo hi" }] }] }));
      const resolved = await detectAndResolveTests({
        config: { logLevel: "silent", input: [input], cacheDir, telemetry: { send: false } },
      });
      assert.deepEqual(names(resolved.config.environment.apps), ["0-sentinel"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  function capturedLogs() {
    const lines = [];
    sinon.stub(console, "log").callsFake((...a) => lines.push(a.join(" ")));
    return lines;
  }
  const SKIP = /No context in this run uses a browser/;

  it("runSpecs skips detection for a shell-only run", async function () {
    const lines = capturedLogs();
    const platform = getEnvironment().platform;
    const report = await runSpecs({
      resolvedTests: {
        config: { logLevel: "debug", telemetry: { send: false }, environment: getEnvironment(), cacheDir },
        specs: spec([{ platform, steps: [{ runShell: "echo hi" }] }]),
      },
    });
    sinon.restore();
    assert.equal(report.summary.steps.pass, 1);
    assert.ok(lines.some((l) => SKIP.test(l)), "expected the skip debug line");
  });

  it("runSpecs still detects when a context names a browser", async function () {
    const lines = capturedLogs();
    // Another platform, so the context is skipped without launching anything;
    // detection still has to run because the context names a browser.
    const other = getEnvironment().platform === "linux" ? "windows" : "linux";
    const report = await runSpecs({
      resolvedTests: {
        config: { logLevel: "debug", telemetry: { send: false }, environment: getEnvironment(), cacheDir },
        specs: spec([{ platform: other, browser: { name: "chrome" }, steps: [{ runShell: "echo hi" }] }]),
      },
    });
    sinon.restore();
    assert.equal(report.summary.contexts.skipped, 1);
    assert.ok(!lines.some((l) => SKIP.test(l)), "detection was skipped for a browser context");
  });

  it("runTests runs a shell-only spec end to end without detection", async function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-apps-lazy-run-"));
    try {
      const input = path.join(dir, "shell.spec.json");
      fs.writeFileSync(input, JSON.stringify({ tests: [{ steps: [{ runShell: "echo hi" }] }] }));
      const lines = capturedLogs();
      const results = await runTests({
        input: [input],
        output: path.join(dir, "out"),
        logLevel: "debug",
        cacheDir,
        telemetry: { send: false },
      });
      sinon.restore();
      assert.equal(results.summary.steps.pass, 1);
      assert.ok(lines.some((l) => SKIP.test(l)), "expected the skip debug line");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
