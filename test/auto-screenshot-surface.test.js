// UI auto screenshots (ADR 01177, DA1b): a shot after every step that drives a
// browser, native app, or device, taken from the surface that step drove.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  autoScreenshotSurface,
  installAutoScreenshotPackages,
  autoScreenshotsOn,
} from "../dist/core/tests.js";
import { runTests } from "../dist/core/index.js";

const appSession = (...names) => ({
  surfaces: new Map(names.map((n) => [n, { name: n, driver: { app: n } }])),
});
const tracker = (...mru) => ({ mru });

describe("autoScreenshotSurface", function () {
  it("captures the app a step targets, not the browser", function () {
    const step = { find: { elementText: "1", surface: { app: "calc" } } };
    assert.deepEqual(
      autoScreenshotSurface({ step, driver: {}, appSession: appSession("calc") }),
      { kind: "app", surface: { app: "calc" } }
    );
  });

  it("captures the active app in an app-only context", function () {
    for (const step of [{ click: "1" }, { type: { keys: "2" } }, { startSurface: { app: "calc" } }]) {
      assert.deepEqual(
        autoScreenshotSurface({
          step,
          appSession: appSession("calc"),
          surfaceTracker: tracker({ kind: "app", name: "calc" }),
        }),
        { kind: "app", surface: undefined },
        JSON.stringify(step)
      );
    }
  });

  it("captures the browser for a browser step", function () {
    assert.deepEqual(
      autoScreenshotSurface({ step: { goTo: "https://example.com" }, driver: {} }),
      { kind: "browser", surface: undefined }
    );
  });

  // goTo, runBrowserScript, and the other browser-only actions don't resolve
  // surfaces: they always drive the browser, so that's what they capture,
  // even when the active surface is a process or an app.
  it("captures the browser for a browser-only step whatever surface is active", function () {
    const processRegistry = new Map([["server", {}]]);
    for (const step of [{ goTo: "https://example.com" }, { runBrowserScript: "return 1" }]) {
      assert.deepEqual(
        autoScreenshotSurface({
          step,
          driver: {},
          processRegistry,
          appSession: appSession("calc"),
          surfaceTracker: tracker({ kind: "process", name: "server" }, { kind: "app", name: "calc" }),
        }),
        { kind: "browser", surface: undefined },
        JSON.stringify(step)
      );
    }
    // With no browser, a browser-only step has nothing to capture.
    assert.equal(
      autoScreenshotSurface({ step: { goTo: "https://example.com" }, appSession: appSession("calc") }),
      null
    );
  });

  it("takes no shot for a step that drives no UI", function () {
    for (const step of [
      { runShell: "echo hi" },
      { httpRequest: { url: "https://example.com" } },
      { wait: 100 },
      { startSurface: { process: "server", command: "node s.js" } },
    ]) {
      assert.equal(autoScreenshotSurface({ step, driver: {} }), null, JSON.stringify(step));
    }
  });

  it("takes no shot for a background process surface or an unresolved one", function () {
    const processRegistry = new Map([["server", {}]]);
    assert.equal(
      autoScreenshotSurface({ step: { type: { keys: "x", surface: { process: "server" } } }, processRegistry }),
      null
    );
    assert.equal(autoScreenshotSurface({ step: { click: "x" } }), null);
  });

  it("takes no shot for the synthetic autoRecord step or an authored screenshot", function () {
    assert.equal(
      autoScreenshotSurface({ step: { record: { path: "x.mp4" }, __autoRecord: true }, driver: {} }),
      null
    );
    assert.equal(autoScreenshotSurface({ step: { screenshot: true }, driver: {} }), null);
  });
});

// When sharp can't install, automatic screenshots are off for the run, with
// one warning (ADR 01177). The flag has to land on the config the runner
// reads, not the caller's copy.
describe("automatic screenshots when the image packages can't install", function () {
  this.timeout(180000);
  let tmpDir;
  let written;
  let realWrite;
  beforeEach(function () {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-no-sharp-"));
    written = "";
    realWrite = process.stderr.write;
    process.stderr.write = function (chunk, ...rest) {
      written += String(chunk);
      return realWrite.call(process.stderr, chunk, ...rest);
    };
  });
  afterEach(function () {
    process.stderr.write = realWrite;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("installAutoScreenshotPackages turns them off on the config it's given, once", async function () {
    const config = {};
    await installAutoScreenshotPackages({
      config,
      packages: ["sharp", "pngjs", "pixelmatch"],
      install: async () => {
        throw new Error("no network");
      },
    });
    assert.equal(config._autoScreenshotsUnavailable, true);
    assert.equal(autoScreenshotsOn({ config, spec: {}, test: { autoScreenshot: true } }), false);
    assert.equal(written.split("Not taking automatic screenshots").length - 1, 1);
    assert.ok(
      written.includes(
        "couldn't install sharp (no network). Run `doc-detective install runtime sharp pngjs pixelmatch`, or set `autoScreenshot: false`."
      ),
      written
    );

    const fine = {};
    let installed = 0;
    await installAutoScreenshotPackages({ config: fine, packages: ["sharp"], install: async () => installed++ });
    await installAutoScreenshotPackages({ config: fine, packages: [], install: async () => installed++ });
    assert.equal(installed, 1);
    assert.equal(fine._autoScreenshotsUnavailable, undefined);
    assert.equal(autoScreenshotsOn({ config: fine, spec: {}, test: {} }), true);
  });

  it("a run whose sharp install fails takes no automatic screenshots", async function () {
    const specPath = path.join(tmpDir, "shots.spec.json");
    fs.writeFileSync(
      specPath,
      JSON.stringify({
        tests: [
          {
            runOn: [{ platforms: ["windows", "mac", "linux"], browsers: { name: "chrome", headless: true } }],
            steps: [{ goTo: "http://localhost:8092" }, { find: { selector: "body", timeout: 5000 } }],
          },
        ],
      })
    );
    const result = await runTests(
      { input: specPath, logLevel: "warning", autoRecord: false, outputDir: tmpDir },
      {
        installRuntime: async (packages) => {
          if (packages.includes("sharp")) throw new Error("no network");
        },
      }
    );
    const ran = result.specs[0].tests[0].contexts.filter((c) => c.result !== "SKIPPED");
    assert.equal(ran.length, 1);
    assert.equal(ran[0].result, "PASS");
    assert.ok(ran[0].steps.every((s) => !s.autoScreenshot), "no step has an automatic screenshot");
    assert.equal(written.split("Not taking automatic screenshots").length - 1, 1);
  });
});
