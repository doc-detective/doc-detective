// Uniform active-surface routing (ADR 01081): one MRU tracker across surface
// kinds (browser / app / process) and one resolver that classifies every
// surface-sensitive step's target — explicit `surface` switches, omitted
// `surface` routes to the most recently active surface. Hermetic: stub
// registries only, no drivers, no Appium.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createActiveSurfaceTracker,
  activateSurface,
  currentSurface,
  resolveTargetSurface,
} from "../dist/core/tests/activeSurface.js";
import { findElement } from "../dist/core/tests/findElement.js";
import { typeKeys } from "../dist/core/tests/typeKeys.js";
import { saveScreenshot } from "../dist/core/tests/saveScreenshot.js";
import { swipeSurface } from "../dist/core/tests/swipe.js";
import {
  createSessionRegistry,
  registerSession,
  activateSession,
  closeSession,
} from "../dist/core/tests/browserSessions.js";
import {
  createAppSessionState,
  ensureAppForeground,
} from "../dist/core/tests/appSurface.js";

// --- Stub registry builders -------------------------------------------------

function browserRegistryWith(tracker, names = ["chrome"]) {
  const registry = createSessionRegistry({ tracker });
  for (const name of names) {
    registerSession(registry, {
      name,
      engine: "chrome",
      driver: { state: {} },
    });
  }
  return registry;
}

function appSessionWith(tracker, names = ["charmap"]) {
  const appSession = createAppSessionState();
  appSession.tracker = tracker;
  for (const name of names) {
    appSession.surfaces.set(name, {
      name,
      appId: `${name}.exe`,
      driver: {},
      launchedByUs: true,
      platform: "windows",
    });
    appSession.activeApp = name;
  }
  return appSession;
}

function processRegistryWith(names = ["server"]) {
  const registry = new Map();
  for (const name of names) {
    registry.set(name, { name, bg: { write() {}, getStdout: () => "", getStderr: () => "" } });
  }
  return registry;
}

// --- MRU tracker ------------------------------------------------------------

describe("active-surface tracker (MRU)", function () {
  it("activates move-to-front and dedupes by kind+name", function () {
    const tracker = createActiveSurfaceTracker();
    activateSurface(tracker, { kind: "browser", name: "chrome" });
    activateSurface(tracker, { kind: "app", name: "charmap" });
    activateSurface(tracker, { kind: "process", name: "server" });
    activateSurface(tracker, { kind: "browser", name: "chrome" });
    assert.deepEqual(tracker.mru, [
      { kind: "browser", name: "chrome" },
      { kind: "process", name: "server" },
      { kind: "app", name: "charmap" },
    ]);
  });

  it("tolerates an undefined tracker", function () {
    assert.doesNotThrow(() =>
      activateSurface(undefined, { kind: "browser", name: "chrome" })
    );
  });

  it("currentSurface returns the most recently activated live surface", function () {
    const tracker = createActiveSurfaceTracker();
    const browserRegistry = browserRegistryWith(tracker);
    const appSession = appSessionWith(tracker);
    activateSurface(tracker, { kind: "app", name: "charmap" });
    assert.deepEqual(currentSurface(tracker, { browserRegistry, appSession }), {
      kind: "app",
      name: "charmap",
    });
    activateSurface(tracker, { kind: "browser", name: "chrome" });
    assert.deepEqual(currentSurface(tracker, { browserRegistry, appSession }), {
      kind: "browser",
      name: "chrome",
    });
  });

  it("currentSurface skips and prunes dead entries (closed surfaces)", function () {
    const tracker = createActiveSurfaceTracker();
    const browserRegistry = browserRegistryWith(tracker);
    const appSession = appSessionWith(tracker);
    activateSurface(tracker, { kind: "browser", name: "chrome" });
    activateSurface(tracker, { kind: "app", name: "charmap" });
    // Close the app out from under the tracker — the next live entry (the
    // browser) becomes the active surface, with no kind-aware special cases.
    appSession.surfaces.delete("charmap");
    assert.deepEqual(currentSurface(tracker, { browserRegistry, appSession }), {
      kind: "browser",
      name: "chrome",
    });
    assert.deepEqual(tracker.mru, [{ kind: "browser", name: "chrome" }]);
  });

  it("currentSurface returns null when nothing is live", function () {
    const tracker = createActiveSurfaceTracker();
    activateSurface(tracker, { kind: "process", name: "gone" });
    assert.equal(
      currentSurface(tracker, { processRegistry: new Map() }),
      null
    );
  });
});

// --- Tracker write-sites ----------------------------------------------------

describe("active-surface tracker write-sites", function () {
  it("registerSession and activateSession mark the browser active", function () {
    const tracker = createActiveSurfaceTracker();
    const registry = createSessionRegistry({ tracker });
    registerSession(registry, {
      name: "chrome",
      engine: "chrome",
      driver: { state: {} },
    });
    assert.deepEqual(tracker.mru[0], { kind: "browser", name: "chrome" });
    registerSession(registry, {
      name: "second",
      engine: "chrome",
      driver: { state: {} },
    });
    assert.deepEqual(tracker.mru[0], { kind: "browser", name: "second" });
    activateSession(registry, "chrome");
    assert.deepEqual(tracker.mru[0], { kind: "browser", name: "chrome" });
  });

  it("closeSession keeps currentSurface consistent with the survivor", async function () {
    const tracker = createActiveSurfaceTracker();
    const registry = createSessionRegistry({ tracker });
    registerSession(registry, {
      name: "chrome",
      engine: "chrome",
      driver: { state: {}, async deleteSession() {} },
    });
    registerSession(registry, {
      name: "second",
      engine: "chrome",
      driver: { state: {}, async deleteSession() {} },
    });
    await closeSession(registry, "second");
    assert.deepEqual(currentSurface(tracker, { browserRegistry: registry }), {
      kind: "browser",
      name: "chrome",
    });
  });

  it("ensureAppForeground activates a DESKTOP app surface (mid-run switching)", async function () {
    // Red proof: today ensureAppForeground early-returns for desktop surfaces
    // (no deviceName) before its activeApp write, so an explicit desktop app
    // reference never becomes the active surface.
    const tracker = createActiveSurfaceTracker();
    const appSession = appSessionWith(tracker, ["charmap", "notepad"]);
    appSession.activeApp = "notepad";
    activateSurface(tracker, { kind: "app", name: "notepad" });
    const entry = appSession.surfaces.get("charmap");
    const result = await ensureAppForeground(entry, appSession);
    assert.equal(result.error, undefined);
    assert.equal(appSession.activeApp, "charmap");
    assert.deepEqual(tracker.mru[0], { kind: "app", name: "charmap" });
  });

  it("ensureAppForeground still activates mobile surfaces via activateApp", async function () {
    const tracker = createActiveSurfaceTracker();
    const appSession = appSessionWith(tracker, []);
    let activated = null;
    appSession.deviceSessions.set("emu-1", {
      driver: {
        async activateApp(appId) {
          activated = appId;
        },
      },
      udid: "emulator-5554",
      foregroundApp: "com.other.app",
    });
    const entry = {
      name: "myapp",
      appId: "com.example.myapp",
      driver: {},
      platform: "android",
      deviceName: "emu-1",
    };
    appSession.surfaces.set("myapp", entry);
    const result = await ensureAppForeground(entry, appSession);
    assert.equal(result.error, undefined);
    assert.equal(activated, "com.example.myapp");
    assert.equal(appSession.activeApp, "myapp");
    assert.deepEqual(tracker.mru[0], { kind: "app", name: "myapp" });
  });
});

// --- resolveTargetSurface: explicit references ------------------------------

describe("resolveTargetSurface — explicit references", function () {
  it("routes { app } to the registered app surface", function () {
    const tracker = createActiveSurfaceTracker();
    const appSession = appSessionWith(tracker);
    const target = resolveTargetSurface({
      surface: { app: "charmap", window: 0 },
      tracker,
      appSession,
    });
    assert.equal(target.kind, "app");
    assert.equal(target.entry.name, "charmap");
    assert.equal(target.window, 0);
  });

  it("errors on an { app } reference that names nothing", function () {
    const tracker = createActiveSurfaceTracker();
    const appSession = appSessionWith(tracker);
    const target = resolveTargetSurface({
      surface: { app: "ghost" },
      tracker,
      appSession,
    });
    assert.equal(target.kind, "error");
    assert.match(target.message, /No app surface named "ghost"/);
  });

  it("errors on an { app } reference with no app session", function () {
    const target = resolveTargetSurface({
      surface: { app: "charmap" },
      tracker: createActiveSurfaceTracker(),
      driver: { state: {} },
    });
    assert.equal(target.kind, "error");
    assert.match(target.message, /startSurface/);
  });

  it("routes { process } to the process kind, carrying the registry entry", function () {
    const processRegistry = processRegistryWith(["server"]);
    const target = resolveTargetSurface({
      surface: { process: "server" },
      tracker: createActiveSurfaceTracker(),
      processRegistry,
    });
    assert.equal(target.kind, "process");
    assert.equal(target.name, "server");
    assert.equal(target.entry, processRegistry.get("server"));
  });

  it("routes { browser } and engine keywords to the browser kind, preserving the reference", function () {
    const surface = { browser: "chrome", tab: 1 };
    const target = resolveTargetSurface({
      surface,
      tracker: createActiveSurfaceTracker(),
      driver: { state: {} },
    });
    assert.equal(target.kind, "browser");
    assert.equal(target.surface, surface);

    const engineTarget = resolveTargetSurface({
      surface: "firefox",
      tracker: createActiveSurfaceTracker(),
      driver: { state: {} },
    });
    assert.equal(engineTarget.kind, "browser");
    assert.equal(engineTarget.surface, "firefox");
  });

  it("resolves a bare string across registries: app, then browser, then process", function () {
    const tracker = createActiveSurfaceTracker();
    const appSession = appSessionWith(tracker, ["editor"]);
    const browserRegistry = browserRegistryWith(tracker, ["docs"]);
    const processRegistry = processRegistryWith(["server"]);
    const driver = browserRegistry.sessions.get("docs").driver;

    const appHit = resolveTargetSurface({
      surface: "editor",
      tracker,
      driver,
      appSession,
      processRegistry,
    });
    assert.equal(appHit.kind, "app");
    assert.equal(appHit.entry.name, "editor");

    const browserHit = resolveTargetSurface({
      surface: "docs",
      tracker,
      driver,
      appSession,
      processRegistry,
    });
    assert.equal(browserHit.kind, "browser");
    assert.equal(browserHit.surface, "docs");

    const processHit = resolveTargetSurface({
      surface: "server",
      tracker,
      driver,
      appSession,
      processRegistry,
    });
    assert.equal(processHit.kind, "process");
    assert.equal(processHit.name, "server");
  });

  it("errors on a bare string that names no open surface", function () {
    const tracker = createActiveSurfaceTracker();
    const target = resolveTargetSurface({
      surface: "ghost",
      tracker,
      appSession: appSessionWith(tracker, []),
      processRegistry: new Map(),
    });
    assert.equal(target.kind, "error");
    assert.match(target.message, /No surface named "ghost"/);
    assert.match(target.message, /startSurface/);
  });
});

// --- resolveTargetSurface: surface-less steps -------------------------------

describe("resolveTargetSurface — surface-less steps", function () {
  it("routes to the active app when the app is most recent", function () {
    const tracker = createActiveSurfaceTracker();
    const appSession = appSessionWith(tracker);
    const browserRegistry = browserRegistryWith(tracker);
    activateSurface(tracker, { kind: "app", name: "charmap" });
    const target = resolveTargetSurface({
      surface: undefined,
      tracker,
      driver: browserRegistry.sessions.get("chrome").driver,
      appSession,
    });
    assert.equal(target.kind, "app");
    assert.equal(target.entry.name, "charmap");
  });

  it("routes to the browser when the browser is most recent", function () {
    const tracker = createActiveSurfaceTracker();
    const appSession = appSessionWith(tracker);
    const browserRegistry = browserRegistryWith(tracker);
    activateSurface(tracker, { kind: "app", name: "charmap" });
    activateSurface(tracker, { kind: "browser", name: "chrome" });
    const target = resolveTargetSurface({
      surface: undefined,
      tracker,
      driver: browserRegistry.sessions.get("chrome").driver,
      appSession,
    });
    assert.equal(target.kind, "browser");
    assert.equal(target.surface, undefined);
  });

  it("routes to the active process when the process is most recent", function () {
    const tracker = createActiveSurfaceTracker();
    const processRegistry = processRegistryWith(["repl"]);
    activateSurface(tracker, { kind: "process", name: "repl" });
    const target = resolveTargetSurface({
      surface: undefined,
      tracker,
      processRegistry,
    });
    assert.equal(target.kind, "process");
    assert.equal(target.name, "repl");
    assert.equal(target.entry, processRegistry.get("repl"));
  });

  it("falls to the next live surface when the most recent closed", function () {
    const tracker = createActiveSurfaceTracker();
    const appSession = appSessionWith(tracker);
    const browserRegistry = browserRegistryWith(tracker);
    activateSurface(tracker, { kind: "browser", name: "chrome" });
    activateSurface(tracker, { kind: "app", name: "charmap" });
    appSession.surfaces.delete("charmap");
    appSession.activeApp = undefined;
    const target = resolveTargetSurface({
      surface: undefined,
      tracker,
      driver: browserRegistry.sessions.get("chrome").driver,
      appSession,
    });
    assert.equal(target.kind, "browser");
  });

  it("keeps legacy behavior without a tracker: driver first, then active app", function () {
    // Handlers invoked outside runContext (unit tests, embedders) get no
    // tracker; a live driver keeps the pre-ADR browser default, and an
    // app-only session still routes to its active app.
    const withDriver = resolveTargetSurface({
      surface: undefined,
      driver: { state: {} },
    });
    assert.equal(withDriver.kind, "browser");

    const appSession = appSessionWith(undefined);
    const appOnly = resolveTargetSurface({
      surface: undefined,
      appSession,
    });
    assert.equal(appOnly.kind, "app");
    assert.equal(appOnly.entry.name, "charmap");
  });

  it("errors with the unified message when no surface is active", function () {
    const target = resolveTargetSurface({
      surface: undefined,
      tracker: createActiveSurfaceTracker(),
    });
    assert.equal(target.kind, "error");
    assert.match(target.message, /No active surface to act on/);
    assert.match(target.message, /startSurface/);
  });
});

// --- Handler routing: surface-less steps act on the active surface ----------

// A 1x1 transparent PNG so saveScreenshot's post-capture handling reads a real
// image from the fake app driver's capture.
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

// App session with one Windows desktop surface whose fake driver supports
// find ($), screenshot capture, and the windows swipe gesture — enough for
// every handler's app execution path.
function routedAppSession(tracker, { element, name = "charmap" } = {}) {
  const appSession = createAppSessionState();
  appSession.tracker = tracker;
  const calls = { executed: [] };
  appSession.surfaces.set(name, {
    name,
    appId: "C:\\Windows\\System32\\charmap.exe",
    driver: {
      $: async () => element ?? { async waitForExist() {} },
      async saveScreenshot(p) {
        fs.writeFileSync(p, PNG_1X1);
      },
      async getWindowRect() {
        return { x: 0, y: 0, width: 100, height: 100 };
      },
      async execute(cmd, args) {
        calls.executed.push({ cmd, args });
      },
      async deleteSession() {},
    },
    launchedByUs: true,
    platform: "windows",
  });
  appSession.activeApp = name;
  activateSurface(tracker, { kind: "app", name });
  return { appSession, calls };
}

function routedProcess(tracker, name = "repl") {
  const writes = [];
  const processRegistry = new Map();
  processRegistry.set(name, {
    name,
    bg: {
      write(bytes) {
        writes.push(bytes);
      },
      getStdout: () => "ready",
      getStderr: () => "",
    },
  });
  activateSurface(tracker, { kind: "process", name });
  return { processRegistry, writes };
}

describe("handler routing — surface-less steps on an active app", function () {
  it("find (criteria object) locates on the active app driver", async function () {
    const tracker = createActiveSurfaceTracker();
    const element = {
      async waitForExist() {},
      async getText() {
        return "Select";
      },
    };
    const { appSession } = routedAppSession(tracker, { element });
    const result = await findElement({
      config: {},
      step: { find: { elementText: "Select" } },
      driver: undefined,
      appSession,
      surfaceTracker: tracker,
    });
    assert.equal(result.status, "PASS");
    assert.equal(result.outputs.found, true);
    assert.equal(result.outputs.element.text, "Select");
  });

  it("find (string shorthand) maps to elementText on the active app", async function () {
    const tracker = createActiveSurfaceTracker();
    const element = {
      async waitForExist() {},
      async getText() {
        return "Select";
      },
    };
    const { appSession } = routedAppSession(tracker, { element });
    const result = await findElement({
      config: {},
      step: { find: "Select" },
      driver: undefined,
      appSession,
      surfaceTracker: tracker,
    });
    assert.equal(result.status, "PASS");
    assert.equal(result.outputs.found, true);
  });

  it("type with element criteria types into the active app", async function () {
    const tracker = createActiveSurfaceTracker();
    const typed = [];
    const element = {
      async waitForExist() {},
      async click() {},
      async addValue(text) {
        typed.push(text);
      },
    };
    const { appSession } = routedAppSession(tracker, { element });
    const result = await typeKeys({
      config: {},
      step: { type: { keys: ["hi"], elementText: "Editor" } },
      driver: undefined,
      appSession,
      surfaceTracker: tracker,
    });
    assert.equal(result.status, "PASS");
    assert.deepEqual(typed, ["hi"]);
  });

  it("screenshot captures through the active app driver", async function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-active-shot-"));
    try {
      const tracker = createActiveSurfaceTracker();
      const { appSession } = routedAppSession(tracker);
      const target = path.join(dir, "active.png");
      const result = await saveScreenshot({
        config: {},
        step: { screenshot: { path: target, overwrite: "true" } },
        driver: undefined,
        appSession,
        surfaceTracker: tracker,
      });
      assert.equal(result.status, "PASS");
      assert.ok(fs.existsSync(target));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("swipe drives the active app's gesture adapter", async function () {
    const tracker = createActiveSurfaceTracker();
    const { appSession, calls } = routedAppSession(tracker);
    const result = await swipeSurface({
      config: {},
      step: { swipe: { from: { x: 1, y: 1 }, to: { x: 5, y: 5 } } },
      driver: undefined,
      appSession,
      surfaceTracker: tracker,
    });
    assert.equal(result.status, "PASS");
    assert.equal(calls.executed.length, 1);
    assert.equal(calls.executed[0].cmd, "windows: clickAndDrag");
  });

  it("an explicit app surface persists: the next surface-less step stays on the app", async function () {
    const tracker = createActiveSurfaceTracker();
    const element = {
      async waitForExist() {},
      async getText() {
        return "Select";
      },
    };
    const { appSession } = routedAppSession(tracker, { element });
    // Simulate an earlier browser focus, then an explicit app reference.
    activateSurface(tracker, { kind: "browser", name: "chrome" });
    const explicit = await findElement({
      config: {},
      step: { find: { elementText: "Select", surface: { app: "charmap" } } },
      driver: undefined,
      appSession,
      surfaceTracker: tracker,
    });
    assert.equal(explicit.status, "PASS");
    const followUp = await findElement({
      config: {},
      step: { find: { elementText: "Select" } },
      driver: undefined,
      appSession,
      surfaceTracker: tracker,
    });
    assert.equal(followUp.status, "PASS");
    assert.equal(followUp.outputs.found, true);
  });
});

describe("handler routing — surface-less steps on an active process", function () {
  it("type routes keystrokes to the active process's stdin", async function () {
    const tracker = createActiveSurfaceTracker();
    const { processRegistry, writes } = routedProcess(tracker);
    const result = await typeKeys({
      config: {},
      step: { type: { keys: ["hello"] } },
      driver: undefined,
      processRegistry,
      surfaceTracker: tracker,
    });
    assert.equal(result.status, "PASS");
    assert.ok(writes.length > 0);
    assert.equal(result.outputs.process, "repl");
  });

  it("find fails with a capability error on an active process", async function () {
    const tracker = createActiveSurfaceTracker();
    const { processRegistry } = routedProcess(tracker);
    const result = await findElement({
      config: {},
      step: { find: { elementText: "x" } },
      driver: undefined,
      processRegistry,
      surfaceTracker: tracker,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /background process "repl"/);
    assert.match(result.description, /doesn't support/);
  });

  it("screenshot fails with a capability error on an active process", async function () {
    const tracker = createActiveSurfaceTracker();
    const { processRegistry } = routedProcess(tracker);
    const result = await saveScreenshot({
      config: {},
      step: { screenshot: true, stepId: "s1" },
      driver: undefined,
      processRegistry,
      surfaceTracker: tracker,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /background process "repl"/);
    assert.match(result.description, /doesn't support/);
  });

  it("swipe fails with a capability error on an active process", async function () {
    const tracker = createActiveSurfaceTracker();
    const { processRegistry } = routedProcess(tracker);
    const result = await swipeSurface({
      config: {},
      step: { swipe: "up" },
      driver: undefined,
      processRegistry,
      surfaceTracker: tracker,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /background process "repl"/);
    assert.match(result.description, /doesn't support/);
  });
});

describe("handler routing — no active surface", function () {
  it("find fails with the unified no-active-surface error", async function () {
    const tracker = createActiveSurfaceTracker();
    const result = await findElement({
      config: {},
      step: { find: { elementText: "x" } },
      driver: undefined,
      surfaceTracker: tracker,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /No active surface to act on/);
  });

  it("screenshot fails with the unified no-active-surface error", async function () {
    const tracker = createActiveSurfaceTracker();
    const result = await saveScreenshot({
      config: {},
      step: { screenshot: true, stepId: "s2" },
      driver: undefined,
      surfaceTracker: tracker,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /No active surface to act on/);
  });
});
