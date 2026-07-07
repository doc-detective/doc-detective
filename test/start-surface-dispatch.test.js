// Multi-surface Phase 6: the startSurface dispatch — kind classification,
// duplicate-name pre-FAIL, three concurrent lanes (app serial + device
// pre-acquire; browser/process parallel), allSettled gathering, roll-up
// (FAIL > SKIPPED > PASS), single-object byte-compat, authored-order
// activation, and outputs.surfaces. Stub lanes only — no Appium, no browser.
import assert from "node:assert/strict";
import { startSurfaceStep } from "../dist/core/tests/startSurface.js";
import {
  createSessionRegistry,
  registerSession,
} from "../dist/core/tests/browserSessions.js";
import { createAppSessionState } from "../dist/core/tests/appSurface.js";

const config = { logLevel: "silent" };

function stubBrowserDriver(engine = "chrome") {
  return {
    state: { engine },
    _viewportCalls: [],
    async execute() {
      return { width: 1000, height: 700 };
    },
    async getWindowSize() {
      return { width: 1024, height: 800 };
    },
    async setWindowSize(w, h) {
      this._viewportCalls.push({ w, h });
    },
    async deleteSession() {},
  };
}

// A context driver whose registry can open additional stub sessions.
function driverWithRegistry() {
  const launches = [];
  const registry = createSessionRegistry({
    open: async (engine, overrides) => {
      launches.push({ engine, overrides });
      return stubBrowserDriver(engine);
    },
  });
  const driver = stubBrowserDriver("chrome");
  registerSession(registry, { name: "chrome", engine: "chrome", driver });
  return { driver, registry, launches };
}

// Deps stubs: recorded call log lets tests assert ordering and inputs.
function stubDeps({ appResult, processResult } = {}) {
  const calls = [];
  return {
    calls,
    deps: {
      startAppSurface: async ({ step }) => {
        calls.push({ kind: "app", descriptor: step.startSurface });
        return (
          appResult ?? {
            status: "PASS",
            description: `Started app surface.`,
            outputs: { name: step.startSurface.name ?? "app" },
          }
        );
      },
      startBackgroundProcessSurface: async ({ descriptor }) => {
        calls.push({ kind: "process", descriptor });
        return (
          processResult ?? {
            status: "PASS",
            description: `Started background process "${descriptor.name}".`,
            outputs: { pid: "1", name: descriptor.name, ready: "true" },
          }
        );
      },
    },
  };
}

describe("startSurfaceStep: single-object forms", function () {
  it("delegates a single app descriptor verbatim (byte-compat)", async function () {
    const marker = {
      status: "PASS",
      description: "marker",
      outputs: { name: "calc", extra: 42 },
    };
    const { deps, calls } = stubDeps({ appResult: marker });
    const result = await startSurfaceStep({
      config,
      step: { startSurface: { app: "C:\\x\\calc.exe", name: "calc" } },
      platform: "windows",
      appSession: createAppSessionState(),
      serverDeps: {},
      deps,
    });
    // The single-object app form returns the handler result unchanged.
    assert.deepEqual(result, marker);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].descriptor.app, "C:\\x\\calc.exe");
  });

  it("FAILs a single app descriptor without an app session", async function () {
    const { deps } = stubDeps();
    const result = await startSurfaceStep({
      config,
      step: { startSurface: { app: "notepad.exe" } },
      platform: "windows",
      serverDeps: {},
      deps,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /app session/);
  });

  it("opens a single browser descriptor through the registry with overrides and viewport", async function () {
    const { driver, registry, launches } = driverWithRegistry();
    const { deps } = stubDeps();
    const result = await startSurfaceStep({
      config,
      step: {
        startSurface: {
          browser: "firefox",
          name: "admin",
          headless: true,
          size: { width: 800, height: 600 },
          viewport: { width: 900, height: 500 },
        },
      },
      platform: "windows",
      driver,
      deps,
    });
    assert.equal(result.status, "PASS", result.description);
    assert.match(result.description, /admin/);
    assert.equal(launches.length, 1);
    assert.equal(launches[0].engine, "firefox");
    assert.equal(launches[0].overrides.headless, true);
    assert.deepEqual(launches[0].overrides.size, { width: 800, height: 600 });
    // The new session (not the default chrome) got the viewport resize.
    const admin = registry.sessions.get("admin").driver;
    assert.equal(admin._viewportCalls.length, 1);
    // Registered + activated.
    assert.equal(registry.activeName, "admin");
    assert.equal(result.outputs.name, "admin");
  });

  it("FAILs a browser descriptor when the context has no browser registry", async function () {
    const { deps } = stubDeps();
    const result = await startSurfaceStep({
      config,
      step: { startSurface: { browser: "chrome" } },
      platform: "windows",
      driver: null,
      deps,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /browser/i);
  });

  it("delegates a single process descriptor to the shared launcher", async function () {
    const { deps, calls } = stubDeps();
    const registry = new Map();
    const result = await startSurfaceStep({
      config,
      step: {
        startSurface: {
          process: "node server.js",
          name: "web",
          waitUntil: { port: 8080 },
          timeout: 5000,
        },
      },
      platform: "windows",
      processRegistry: registry,
      deps,
    });
    assert.equal(result.status, "PASS");
    assert.equal(calls[0].kind, "process");
    assert.equal(calls[0].descriptor.command, "node server.js");
    assert.equal(calls[0].descriptor.name, "web");
    assert.deepEqual(calls[0].descriptor.waitUntil, { port: 8080 });
    assert.equal(result.outputs.name, "web");
  });

  it("FAILs an invalid step shape through schema validation", async function () {
    const { deps } = stubDeps();
    const result = await startSurfaceStep({
      config,
      step: { startSurface: { browser: "opera" } },
      platform: "windows",
      deps,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /Invalid step definition/);
  });
});

describe("startSurfaceStep: parallel array form", function () {
  it("pre-FAILs duplicate intended names before launching anything", async function () {
    const { deps, calls } = stubDeps();
    const result = await startSurfaceStep({
      config,
      step: {
        startSurface: [
          { process: "node a.js", name: "web" },
          { browser: "chrome", name: "web" },
        ],
      },
      platform: "windows",
      processRegistry: new Map(),
      driver: driverWithRegistry().driver,
      deps,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /duplicate/i);
    assert.match(result.description, /"web"/);
    assert.equal(calls.length, 0);
  });

  it("pre-FAILs an unnamed edge + unnamed chrome collision (both normalize to chrome)", async function () {
    // edge is Chromium, so an unnamed edge descriptor's intended name is
    // "chrome" — the same as an unnamed chrome descriptor. The pre-launch
    // duplicate check must catch that even though the raw engine strings differ.
    const { deps } = stubDeps();
    const result = await startSurfaceStep({
      config,
      step: { startSurface: [{ browser: "edge" }, { browser: "chrome" }] },
      platform: "windows",
      driver: driverWithRegistry().driver,
      deps,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /duplicate/i);
    assert.match(result.description, /"chrome"/);
  });

  it("launches mixed kinds, gathers with allSettled, and rolls up FAIL > PASS", async function () {
    const { driver } = driverWithRegistry();
    const { deps, calls } = stubDeps({
      processResult: {
        status: "FAIL",
        description: 'Background process "web" failed to become ready: nope.',
      },
    });
    const appSession = createAppSessionState();
    const result = await startSurfaceStep({
      config,
      step: {
        startSurface: [
          { app: "notepad.exe", name: "pad" },
          { browser: "firefox", name: "admin" },
          { process: "node server.js", name: "web" },
        ],
      },
      platform: "windows",
      driver,
      processRegistry: new Map(),
      appSession,
      serverDeps: {},
      deps,
    });
    // One descriptor failed -> the step FAILs, but the others still ran.
    assert.equal(result.status, "FAIL");
    assert.equal(calls.filter((c) => c.kind === "app").length, 1);
    assert.equal(calls.filter((c) => c.kind === "process").length, 1);
    // Per-descriptor detail lands in outputs.surfaces, authored order.
    assert.equal(result.outputs.surfaces.length, 3);
    assert.deepEqual(
      result.outputs.surfaces.map((s) => s.name),
      ["pad", "admin", "web"]
    );
    assert.deepEqual(
      result.outputs.surfaces.map((s) => s.kind),
      ["app", "browser", "process"]
    );
    assert.deepEqual(
      result.outputs.surfaces.map((s) => s.status),
      ["PASS", "PASS", "FAIL"]
    );
    // The failure's wording surfaces in the step description.
    assert.match(result.description, /failed to become ready/);
  });

  it("rolls up SKIPPED over PASS (no FAILs)", async function () {
    const { deps } = stubDeps({
      processResult: {
        status: "SKIPPED",
        description: "PTY background requires the optional `node-pty` dependency.",
      },
    });
    const result = await startSurfaceStep({
      config,
      step: {
        startSurface: [
          { process: "top", name: "tui", tty: true },
          { browser: "firefox", name: "admin" },
        ],
      },
      platform: "windows",
      driver: driverWithRegistry().driver,
      processRegistry: new Map(),
      deps,
    });
    assert.equal(result.status, "SKIPPED");
    assert.deepEqual(
      result.outputs.surfaces.map((s) => s.status),
      ["SKIPPED", "PASS"]
    );
  });

  it("runs app descriptors serially in authored order with devices pre-acquired in parallel", async function () {
    const order = [];
    const acquired = [];
    // The app lane awaits each startAppSurface before the next, so ordering is
    // structural — no timing needed. Each call records its entry and its exit
    // (a yielded microtask boundary between them); a serial lane must produce
    // start-a → end-a → start-b → end-b, never interleaved.
    const deps = {
      startAppSurface: async ({ step }) => {
        const name = step.startSurface.name;
        order.push(`start:${name}`);
        await Promise.resolve(); // yield: a parallel lane would interleave here
        order.push(`end:${name}`);
        return { status: "PASS", description: "ok", outputs: {} };
      },
      startBackgroundProcessSurface: async () => ({
        status: "PASS",
        description: "ok",
        outputs: {},
      }),
    };
    const serverDeps = {
      acquireDevice: async (desc) => {
        acquired.push(desc);
        return { entry: { name: String(desc), udid: "u" } };
      },
    };
    const result = await startSurfaceStep({
      config,
      step: {
        startSurface: [
          { app: "com.example.a", name: "a", device: "d1" },
          { app: "com.example.b", name: "b", device: "d2" },
        ],
      },
      platform: "android",
      appSession: createAppSessionState(),
      serverDeps,
      deps,
    });
    assert.equal(result.status, "PASS");
    // Serial, authored order: a fully finishes before b starts (no interleave).
    assert.deepEqual(order, ["start:a", "end:a", "start:b", "end:b"]);
    // Both devices were pre-acquired (fired before/while apps started).
    assert.deepEqual(acquired.sort(), ["d1", "d2"]);
  });

  it("re-asserts authored-order activation: the last authored browser descriptor is active", async function () {
    const { driver, registry } = driverWithRegistry();
    const { deps } = stubDeps();
    const result = await startSurfaceStep({
      config,
      step: {
        startSurface: [
          { browser: "firefox", name: "beta" },
          { browser: "firefox", name: "alpha" },
        ],
      },
      platform: "windows",
      driver,
      deps,
    });
    assert.equal(result.status, "PASS", result.description);
    // Parallel opens may activate in completion order; the dispatch re-asserts
    // the authored order afterwards.
    assert.equal(registry.activeName, "alpha");
  });

  it("a one-element array behaves like the object form for roll-up but keeps outputs.surfaces", async function () {
    const { deps } = stubDeps();
    const result = await startSurfaceStep({
      config,
      step: { startSurface: [{ process: "node x.js", name: "solo" }] },
      platform: "windows",
      processRegistry: new Map(),
      deps,
    });
    assert.equal(result.status, "PASS");
    assert.equal(result.outputs.surfaces.length, 1);
    assert.equal(result.outputs.surfaces[0].name, "solo");
  });
});
