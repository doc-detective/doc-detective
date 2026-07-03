// Coverage-closing tests for src/core/tests/closeSurface.ts (measured against
// compiled dist/core/tests/closeSurface.js).
//
// Fully HERMETIC and OFFLINE:
//   - The BROWSER branch is driven by the same stateful `stubDriver` used in
//     test/browserSurface.test.js: a W3C flat-handle model (open/close handles,
//     per-handle focus) with no webdriverio. The real browserSurface helpers
//     (resolveCloseTargets / syncHandles / closeHandle) run against it and
//     produce real results, so closeSurface's own labeling / preflight / error
//     branches execute for real.
//   - The PROCESS branch is driven with a plain Map processRegistry and fake
//     entries. The `bg.kill` handle is a no-op async fn; the `bg.pid` tree-kill
//     path targets a real, short-lived detached child so the terminate branch
//     runs deterministically and self-cleans. Temp scripts are real files in a
//     temp dir, removed in afterEach.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  closeSurface,
  resolveSurfaceNames,
} from "../dist/core/tests/closeSurface.js";

const config = { logLevel: "silent" };

// Stateful stub driver: models the W3C flat-handle surface (handles, focus)
// without webdriverio. Mirrors test/browserSurface.test.js's stubDriver.
function stubDriver({ engine = "chrome", handles = ["h0"] } = {}) {
  let counter = 100;
  return {
    state: { engine },
    _handles: [...handles],
    _current: handles[0],
    _pages: {},
    _switches: [],
    async getWindowHandles() {
      return [...this._handles];
    },
    async getWindowHandle() {
      if (!this._handles.includes(this._current))
        throw new Error("no such window");
      return this._current;
    },
    async switchToWindow(handle) {
      if (!this._handles.includes(handle))
        throw new Error(`no such window: ${handle}`);
      this._current = handle;
      this._switches.push(handle);
    },
    async closeWindow() {
      this._handles = this._handles.filter((h) => h !== this._current);
    },
    async createWindow(type) {
      const handle = `h${counter++}`;
      this._handles.push(handle);
      return { handle, type };
    },
    async getTitle() {
      return this._pages[this._current]?.title ?? "";
    },
    async getUrl() {
      return this._pages[this._current]?.url ?? "";
    },
  };
}

describe("closeSurface coverage: resolveSurfaceNames", function () {
  it("returns the name for a bare non-engine string", function () {
    assert.deepEqual(resolveSurfaceNames("db"), ["db"]);
  });
  it("returns the name for a { process } object", function () {
    assert.deepEqual(resolveSurfaceNames({ process: " api " }), ["api"]);
  });
  it("collects only process names from a mixed array (browser refs excluded)", function () {
    const names = resolveSurfaceNames(["db", "chrome", { process: "api" }]);
    assert.deepEqual(names, ["db", "api"]);
  });
  it("returns nothing for an engine-keyword string (browser, not process)", function () {
    assert.deepEqual(resolveSurfaceNames("chrome"), []);
  });
});

describe("closeSurface coverage: validation", function () {
  it("FAILs an invalid step definition", async function () {
    // An empty array violates the closeSurface schema's `minItems: 1` and is
    // not a bare surface, so it fails step_v3 validation (a number would just
    // coerce to a string surface name and pass).
    const result = await closeSurface({
      config,
      step: { closeSurface: [] },
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /Invalid step definition/);
  });
});

describe("closeSurface coverage: process branch", function () {
  let tmp;
  beforeEach(function () {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-closesurface-"));
  });
  afterEach(function () {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("treats an absent process name as an idempotent no-op (PASS)", async function () {
    const result = await closeSurface({
      config,
      step: { closeSurface: "db" },
      processRegistry: new Map(),
    });
    assert.equal(result.status, "PASS");
    assert.deepEqual(result.outputs.absent, ["db"]);
    assert.equal(result.outputs.closedCount, 0);
    assert.match(result.description, /not open; nothing to close/);
  });

  it("terminates a bg.kill-backed process, deregisters it, and unlinks its temp script", async function () {
    let killed = false;
    const tempPath = path.join(tmp, "script.js");
    fs.writeFileSync(tempPath, "// deferred background script");
    const registry = new Map();
    registry.set("worker", { bg: { kill: async () => { killed = true; } }, tempPath });
    const result = await closeSurface({
      config,
      step: { closeSurface: { process: "worker" } },
      processRegistry: registry,
    });
    assert.equal(result.status, "PASS");
    assert.equal(killed, true, "bg.kill was invoked");
    assert.equal(registry.has("worker"), false, "deregistered");
    assert.equal(fs.existsSync(tempPath), false, "temp script unlinked");
    assert.deepEqual(result.outputs.closed, ["worker"]);
  });

  it("tolerates an already-gone temp script (best-effort unlink)", async function () {
    const registry = new Map();
    registry.set("worker", {
      bg: { kill: async () => {} },
      tempPath: path.join(tmp, "never-existed.js"),
    });
    const result = await closeSurface({
      config,
      step: { closeSurface: { process: "worker" } },
      processRegistry: registry,
    });
    assert.equal(result.status, "PASS");
    assert.deepEqual(result.outputs.closed, ["worker"]);
  });

  it("tree-kills a pid-backed process (real short-lived child)", async function () {
    this.timeout(10000);
    const child = spawn(
      process.execPath,
      ["-e", "setTimeout(() => {}, 9000)"],
      { stdio: "ignore" }
    );
    // Give the child a beat to be schedulable.
    await new Promise((r) => setTimeout(r, 100));
    const registry = new Map();
    registry.set("proc", { bg: { pid: child.pid } });
    const exited = new Promise((resolve) => child.on("exit", () => resolve(true)));
    const result = await closeSurface({
      config,
      step: { closeSurface: { process: "proc" } },
      processRegistry: registry,
    });
    assert.equal(result.status, "PASS");
    assert.deepEqual(result.outputs.closed, ["proc"]);
    assert.equal(await exited, true, "child was terminated");
  });

  it("reports both closed and absent surfaces in one call", async function () {
    const registry = new Map();
    registry.set("alive", { bg: { kill: async () => {} } });
    const result = await closeSurface({
      config,
      step: { closeSurface: [{ process: "alive" }, { process: "ghost" }] },
      processRegistry: registry,
    });
    assert.equal(result.status, "PASS");
    assert.deepEqual(result.outputs.closed, ["alive"]);
    assert.deepEqual(result.outputs.absent, ["ghost"]);
    assert.match(result.description, /Closed surface "alive"\./);
    assert.match(result.description, /"ghost" not open/);
  });

  it("pluralizes the description for multiple closed and absent surfaces", async function () {
    const registry = new Map();
    registry.set("a", { bg: { kill: async () => {} } });
    registry.set("b", { bg: { kill: async () => {} } });
    const result = await closeSurface({
      config,
      step: {
        closeSurface: [
          { process: "a" },
          { process: "b" },
          { process: "x" },
          { process: "y" },
        ],
      },
      processRegistry: registry,
    });
    assert.deepEqual(result.outputs.closed, ["a", "b"]);
    assert.deepEqual(result.outputs.absent, ["x", "y"]);
    assert.match(result.description, /Closed surfaces "a", "b"\./);
    assert.match(result.description, /Surfaces "x", "y" not open/);
  });
});

describe("closeSurface coverage: browser branch", function () {
  it("FAILs a browser reference when no driver is running", async function () {
    const result = await closeSurface({
      config,
      step: { closeSurface: { browser: "chrome", tab: 0 } },
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /No browser is running/);
  });

  it("FAILs a whole-browser reference (no window/tab selector)", async function () {
    const driver = stubDriver({ handles: ["h0", "h1"] });
    const result = await closeSurface({
      config,
      step: { closeSurface: { browser: "chrome" } },
      driver,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /whole browser surface|later phase/i);
  });

  it("treats a selector matching no tab as an idempotent no-op (PASS/absent)", async function () {
    // A non-matching selector is bounded-retried (DEFAULT_MAX_WAIT_MS = 2000ms)
    // before resolving to "nothing matched", so allow headroom past mocha's
    // default 2s timeout.
    this.timeout(8000);
    const driver = stubDriver({ handles: ["h0", "h1"] });
    const result = await closeSurface({
      config,
      step: { closeSurface: { browser: "chrome", tab: "does-not-exist" } },
      driver,
    });
    assert.equal(result.status, "PASS");
    assert.equal(result.outputs.closedCount, 0);
    assert.equal(result.outputs.absentCount, 1);
  });

  it("refuses to close the last open tab (session-ending preflight)", async function () {
    const driver = stubDriver({ handles: ["h0"] });
    const result = await closeSurface({
      config,
      step: { closeSurface: { browser: "chrome", tab: 0 } },
      driver,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /Refusing to close the last open tab/);
  });

  it("closes a selected tab when survivors remain (PASS)", async function () {
    const driver = stubDriver({ handles: ["h0", "h1"] });
    const result = await closeSurface({
      config,
      step: { closeSurface: { browser: "chrome", tab: 1 } },
      driver,
    });
    assert.equal(result.status, "PASS");
    assert.equal(result.outputs.closedCount, 1);
    // h1 is gone; h0 survives.
    assert.deepEqual(driver._handles, ["h0"]);
  });

  it("closes a whole window (its lead) when another window survives (PASS)", async function () {
    const driver = stubDriver({ handles: ["h0", "h1"] });
    // Seed two registered window leads so `window: 1` resolves to h1 (a whole-
    // window close, no `tab` selector) while h0 survives the preflight.
    driver.state.surfaces = {
      windows: [
        { handle: "h0", order: 0, isWindowLead: true },
        { handle: "h1", order: 1, isWindowLead: true },
      ],
      nextOrder: 2,
    };
    const result = await closeSurface({
      config,
      step: { closeSurface: { browser: "chrome", window: 1 } },
      driver,
    });
    assert.equal(result.status, "PASS");
    assert.equal(result.outputs.closedCount, 1);
    assert.deepEqual(driver._handles, ["h0"]);
    // Labeled by the window selector, not a tab.
    assert.match(result.description, /chrome window 1/);
  });
});
