// Hermetic coverage for the APP-SURFACE BRANCHES inside the step handlers
// (findElement, typeKeys, saveScreenshot, closeSurface). The appSurface module
// itself is unit-tested in app-surface.test.js; these tests drive the branches
// the per-feature fixture matrix exercises out-of-process (so mocha coverage
// would otherwise report them unexecuted). Fake drivers/sessions only — no
// Appium, no Windows dependency.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findElement } from "../dist/core/tests/findElement.js";
import { typeKeys } from "../dist/core/tests/typeKeys.js";
import { saveScreenshot } from "../dist/core/tests/saveScreenshot.js";
import { closeSurface } from "../dist/core/tests/closeSurface.js";
import { createAppSessionState } from "../dist/core/tests/appSurface.js";

// A 1x1 transparent PNG so saveScreenshot's post-capture handling reads a real
// image from the fake driver's capture.
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

// Registered app session with a configurable fake element.
function fakeAppSession({ element, name = "charmap" } = {}) {
  const appSession = createAppSessionState();
  appSession.surfaces.set(name, {
    name,
    appId: "C:\\Windows\\System32\\charmap.exe",
    driver: {
      $: async () => element ?? { async waitForExist() {} },
      async saveScreenshot(p) {
        fs.writeFileSync(p, PNG_1X1);
      },
      async deleteSession() {},
    },
    launchedByUs: true,
  });
  return appSession;
}

describe("findElement app-surface branch", function () {
  it("finds, reads text, and clicks on the app driver", async function () {
    let clicked = 0;
    const element = {
      async waitForExist() {},
      async getText() {
        return "Select";
      },
      async click() {
        clicked++;
      },
    };
    const appSession = fakeAppSession({ element });
    const result = await findElement({
      config: {},
      step: {
        find: { elementText: "Select", click: true, surface: { app: "charmap" } },
      },
      driver: undefined,
      appSession,
    });
    assert.equal(result.status, "PASS");
    assert.equal(result.outputs.found, true);
    assert.equal(result.outputs.element.text, "Select");
    assert.equal(clicked, 1);
  });

  it("reports found=false with a failing existence assertion on a miss", async function () {
    const element = {
      async waitForExist() {
        throw new Error("nope");
      },
    };
    const appSession = fakeAppSession({ element });
    const result = await findElement({
      config: {},
      step: {
        find: { elementText: "Missing", timeout: 10, surface: { app: "charmap" } },
      },
      driver: undefined,
      appSession,
    });
    assert.equal(result.status, "FAIL");
    assert.equal(result.outputs.found, false);
    assert.ok(Array.isArray(result.assertions));
  });

  it("fails on sub-effects and unknown app names", async function () {
    const appSession = fakeAppSession({});
    const subEffect = await findElement({
      config: {},
      step: {
        find: {
          elementText: "x",
          moveTo: true,
          surface: { app: "charmap" },
        },
      },
      driver: undefined,
      appSession,
    });
    assert.match(subEffect.description, /sub-effects aren't supported/);

    const unknown = await findElement({
      config: {},
      step: { find: { elementText: "x", surface: { app: "ghost" } } },
      driver: undefined,
      appSession,
    });
    assert.match(unknown.description, /No app surface named "ghost"/);
  });
});

// ---------------------------------------------------------------------------
// App window selectors (ADR 01036): find/type act on a selected window.
// ---------------------------------------------------------------------------

// A windows-model (switch-then-act) app session with a pre-seeded baseline,
// the way startAppSurface leaves it. `elementsByWindow` maps a window handle
// to the element that driver.$() returns while that window is the root.
function windowsAppSession({ windows, elementsByWindow = {} }) {
  const state = { current: windows[0].handle, switches: [] };
  const missingElement = {
    async waitForExist() {
      throw new Error("not found");
    },
    async isExisting() {
      return false;
    },
  };
  const driver = {
    state,
    async getWindowHandles() {
      return windows.map((w) => w.handle);
    },
    async getWindowHandle() {
      return state.current;
    },
    async switchToWindow(handle) {
      if (!windows.some((w) => w.handle === handle))
        throw new Error(`no such window: ${handle}`);
      state.switches.push(handle);
      state.current = handle;
    },
    async getTitle() {
      return windows.find((w) => w.handle === state.current)?.title ?? "";
    },
    async $(selector) {
      if (selector === "/*") {
        return {
          getAttribute: async (name) =>
            name === "ProcessId"
              ? String(windows.find((w) => w.handle === state.current)?.pid ?? "")
              : null,
        };
      }
      return elementsByWindow[state.current] ?? missingElement;
    },
    async saveScreenshot(p) {
      state.capturedWindow = state.current;
      fs.writeFileSync(p, PNG_1X1);
    },
    async deleteSession() {},
  };
  const appSession = createAppSessionState();
  appSession.surfaces.set("charmap", {
    name: "charmap",
    appId: "charmap.exe",
    driver,
    launchedByUs: true,
    platform: "windows",
    mainWindowHandle: windows[0].handle,
    appPid: windows[0].pid,
    knownWindows: [windows[0].handle],
    foreignWindows: new Set(),
  });
  return { appSession, driver };
}

// A mac-model (window-as-element) app session. Each window element scopes
// finds via its own `$`.
function macAppSession({ windows }) {
  const state = { scopedSelectors: [] };
  const makeEl = (w) => ({
    elementId: w.id,
    async getAttribute(name) {
      return name === "title" ? w.title : null;
    },
    async isExisting() {
      return true;
    },
    async saveScreenshot(p) {
      state.capturedWindow = w.id;
      fs.writeFileSync(p, PNG_1X1);
    },
    async $(selector) {
      state.scopedSelectors.push(selector);
      return (
        w.elements?.[selector] ?? {
          async waitForExist() {
            throw new Error("not found");
          },
          async isExisting() {
            return false;
          },
        }
      );
    },
  });
  const driver = {
    state,
    async $$() {
      return windows.map(makeEl);
    },
    async getElementRect(id) {
      return windows.find((w) => w.id === id)?.rect ?? { x: 0, y: 0, width: 1, height: 1 };
    },
    async deleteSession() {},
  };
  const appSession = createAppSessionState();
  appSession.surfaces.set("TextEdit", {
    name: "TextEdit",
    appId: "com.apple.TextEdit",
    driver,
    launchedByUs: true,
    platform: "mac",
  });
  return { appSession, driver, state };
}

describe("windows app left-clicks use the UIA Invoke pattern (ADR 01036)", function () {
  // The driver's physical click is real mouse input at absolute coordinates,
  // which lands off-target on scaled (HiDPI) displays. The Invoke pattern is
  // coordinate-free; plain left clicks prefer it and fall back to the
  // physical click when the element doesn't support it.
  function clickSession({ executeImpl }) {
    const state = { executes: [], elementClicks: 0 };
    const element = {
      elementId: "el-1",
      async waitForExist() {},
      async getText() {
        return "Open Dialog";
      },
      async click() {
        state.elementClicks++;
      },
    };
    const driver = {
      state,
      async $() {
        return element;
      },
      async execute(cmd, arg) {
        state.executes.push({ cmd, arg });
        if (executeImpl) return executeImpl(cmd, arg);
      },
    };
    const appSession = createAppSessionState();
    appSession.surfaces.set("twowin", {
      name: "twowin",
      appId: "powershell.exe",
      driver,
      launchedByUs: true,
      platform: "windows",
    });
    return { appSession, state };
  }

  it("invokes instead of physically clicking on Windows", async function () {
    const { appSession, state } = clickSession({});
    const result = await findElement({
      config: {},
      step: {
        find: {
          elementText: "Open Dialog",
          click: true,
          surface: { app: "twowin" },
        },
      },
      driver: undefined,
      appSession,
    });
    assert.equal(result.status, "PASS");
    const invoke = state.executes.find((e) => e.cmd === "windows: invoke");
    assert.ok(invoke, "expected a windows: invoke call");
    assert.equal(invoke.arg["element-6066-11e4-a52e-4f735466cecf"], "el-1");
    assert.equal(state.elementClicks, 0);
  });

  it("falls back to the physical click when the element isn't invokable", async function () {
    const { appSession, state } = clickSession({
      executeImpl: (cmd) => {
        if (cmd === "windows: invoke")
          throw new Error("does not support the InvokePattern");
      },
    });
    const result = await findElement({
      config: {},
      step: {
        find: {
          elementText: "Open Dialog",
          click: true,
          surface: { app: "twowin" },
        },
      },
      driver: undefined,
      appSession,
    });
    assert.equal(result.status, "PASS");
    assert.equal(state.elementClicks, 1);
  });
});

describe("app window selectors: find/type wiring (ADR 01036)", function () {
  it("windows: find resolves a window by title and acts in it (sticky root)", async function () {
    const okElement = {
      async waitForExist() {},
      async getText() {
        return "OK";
      },
    };
    const { appSession, driver } = windowsAppSession({
      windows: [
        { handle: "0xA", title: "Main", pid: 100 },
        { handle: "0xB", title: "Create New Data Source", pid: 100 },
      ],
      elementsByWindow: { "0xB": okElement },
    });
    const result = await findElement({
      config: {},
      step: {
        find: {
          elementText: "OK",
          timeout: 500,
          surface: {
            app: "charmap",
            window: { title: "/Data Source/" },
          },
        },
      },
      driver: undefined,
      appSession,
    });
    assert.equal(result.status, "PASS");
    assert.equal(result.outputs.found, true);
    // Sticky: the session stays rooted at the dialog.
    assert.equal(driver.state.current, "0xB");
  });

  it("windows: find FAILs with the windows-seen report when no window matches", async function () {
    const { appSession } = windowsAppSession({
      windows: [{ handle: "0xA", title: "Main", pid: 100 }],
    });
    const result = await findElement({
      config: {},
      step: {
        find: {
          elementText: "x",
          timeout: 300,
          surface: { app: "charmap", window: { title: "Ghost" } },
        },
      },
      driver: undefined,
      appSession,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /No app window matched/);
  });

  it("mac: find scopes the locator under the selected window element", async function () {
    const bodyElement = {
      async waitForExist() {},
      async getText() {
        return "Body";
      },
    };
    const { appSession, state } = macAppSession({
      windows: [
        { id: "w1", title: "Untitled", rect: { x: 0, y: 0, width: 1, height: 1 } },
        {
          id: "w2",
          title: "Untitled 2",
          rect: { x: 5, y: 5, width: 2, height: 2 },
          elements: new Proxy(
            {},
            { get: () => bodyElement }
          ),
        },
      ],
    });
    const result = await findElement({
      config: {},
      step: {
        find: {
          elementText: "Body",
          timeout: 500,
          surface: { app: "TextEdit", window: "Untitled 2" },
        },
      },
      driver: undefined,
      appSession,
    });
    assert.equal(result.status, "PASS");
    assert.equal(result.outputs.found, true);
    // The compiled `//…` locator was anchored to the window subtree.
    assert.ok(state.scopedSelectors.length > 0);
    assert.ok(
      state.scopedSelectors.every((s) => String(s).startsWith(".//")),
      `expected scoped selectors, got: ${state.scopedSelectors.join(" | ")}`
    );
  });

  it("mobile: find with a window selector FAILs with the single-window message", async function () {
    const appSession = createAppSessionState();
    appSession.surfaces.set("chat", {
      name: "chat",
      appId: "com.example.chat",
      driver: {},
      launchedByUs: true,
      platform: "android",
      deviceName: "Pixel_7",
    });
    appSession.deviceSessions.set("Pixel_7", {
      driver: {},
      foregroundApp: "com.example.chat",
    });
    const result = await findElement({
      config: {},
      step: {
        find: { elementText: "x", surface: { app: "chat", window: -1 } },
      },
      driver: undefined,
      appSession,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /single-window/);
  });

  it("windows: type honors a window selector (was silently ignored)", async function () {
    const typed = [];
    const inputElement = {
      async waitForExist() {},
      async click() {},
      async addValue(text) {
        typed.push(text);
      },
    };
    const { appSession, driver } = windowsAppSession({
      windows: [
        { handle: "0xA", title: "Main", pid: 100 },
        { handle: "0xB", title: "Dialog", pid: 100 },
      ],
      elementsByWindow: { "0xB": inputElement },
    });
    const result = await typeKeys({
      config: {},
      step: {
        type: {
          keys: ["hello"],
          selector: '//Edit[@Name="Value"]',
          timeout: 500,
          surface: { app: "charmap", window: { title: "Dialog" } },
        },
      },
      driver: undefined,
      appSession,
    });
    assert.equal(result.status, "PASS");
    assert.deepEqual(typed, ["hello"]);
    assert.equal(driver.state.current, "0xB");
  });

  it("mobile: type with a window selector FAILs with the single-window message", async function () {
    const appSession = createAppSessionState();
    appSession.surfaces.set("chat", {
      name: "chat",
      appId: "com.example.chat",
      driver: {},
      launchedByUs: true,
      platform: "android",
      deviceName: "Pixel_7",
    });
    appSession.deviceSessions.set("Pixel_7", {
      driver: {},
      foregroundApp: "com.example.chat",
    });
    const result = await typeKeys({
      config: {},
      step: {
        type: {
          keys: ["$BACK$"],
          surface: { app: "chat", window: -1 },
        },
      },
      driver: undefined,
      appSession,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /single-window/);
  });
});

describe("app-surface platform column selection (A2)", function () {
  // A mac-registered surface must get AX locators (title/label), not UIA
  // (@Name) — the entry's platform picks the column.
  function macAppSession(selectors) {
    const appSession = createAppSessionState();
    appSession.surfaces.set("textedit", {
      name: "textedit",
      appId: "com.apple.TextEdit",
      platform: "mac",
      driver: {
        $: async (sel) => {
          selectors.push(sel);
          return {
            async waitForExist() {},
            async click() {},
            async addValue() {},
          };
        },
      },
      launchedByUs: true,
    });
    return appSession;
  }

  it("findElement locates via the AX column on mac surfaces", async function () {
    const selectors = [];
    const result = await findElement({
      config: {},
      step: {
        find: { elementText: "Save", surface: { app: "textedit" } },
      },
      driver: undefined,
      appSession: macAppSession(selectors),
    });
    assert.equal(result.status, "PASS");
    assert.match(selectors[0], /@title="Save"/);
  });

  it("typeKeys locates via the AX column on mac surfaces", async function () {
    const selectors = [];
    const result = await typeKeys({
      config: {},
      step: {
        type: {
          keys: ["hi"],
          elementText: "Document",
          surface: { app: "textedit" },
        },
      },
      driver: undefined,
      appSession: macAppSession(selectors),
    });
    assert.equal(result.status, "PASS");
    assert.match(selectors[0], /@title="Document"/);
  });
});

describe("typeKeys app-surface branch", function () {
  it("clicks to focus, types, and honors delayMs readiness", async function () {
    const typed = [];
    const element = {
      async waitForExist() {},
      async click() {},
      async addValue(v) {
        typed.push(v);
      },
    };
    const appSession = fakeAppSession({ element });
    const result = await typeKeys({
      config: {},
      step: {
        type: {
          keys: ["AB"],
          elementText: "Copy box",
          surface: { app: "charmap" },
          waitUntil: { delayMs: 1 },
        },
      },
      driver: undefined,
      appSession,
    });
    assert.equal(result.status, "PASS");
    assert.deepEqual(typed, ["AB"]);
  });

  it("fails loudly on special tokens, missing criteria, and wrong readiness", async function () {
    const appSession = fakeAppSession({});
    const tokens = await typeKeys({
      config: {},
      step: {
        type: {
          keys: ["$ENTER$"],
          elementText: "x",
          surface: { app: "charmap" },
        },
      },
      driver: undefined,
      appSession,
    });
    assert.match(tokens.description, /Special key tokens/);

    const noCriteria = await typeKeys({
      config: {},
      step: { type: { keys: ["hi"], surface: { app: "charmap" } } },
      driver: undefined,
      appSession,
    });
    assert.match(noCriteria.description, /requires element criteria/);

    // Process readiness on an app surface is rejected by the SCHEMA's
    // kind-shaped guard before the runtime backstop even runs.
    const wrongReadiness = await typeKeys({
      config: {},
      step: {
        type: {
          keys: ["hi"],
          elementText: "x",
          surface: { app: "charmap" },
          waitUntil: { stdio: "/x/" },
        },
      },
      driver: undefined,
      appSession,
    });
    assert.equal(wrongReadiness.status, "FAIL");
    assert.match(wrongReadiness.description, /Invalid step definition/);
  });
});

describe("saveScreenshot app-surface branch", function () {
  let dir;
  before(function () {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-app-shot-"));
  });
  after(function () {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("captures through the app driver", async function () {
    const appSession = fakeAppSession({});
    const target = path.join(dir, "app.png");
    const result = await saveScreenshot({
      config: {},
      step: {
        screenshot: {
          path: target,
          overwrite: "true",
          surface: { app: "charmap" },
        },
      },
      driver: undefined,
      appSession,
    });
    assert.equal(result.status, "PASS");
    assert.ok(fs.existsSync(target));
  });

  it("windows: captures a selected window (switched root, driver capture)", async function () {
    const { appSession, driver } = windowsAppSession({
      windows: [
        { handle: "0xA", title: "Main", pid: 100 },
        { handle: "0xB", title: "Dialog", pid: 100 },
      ],
    });
    const target = path.join(dir, "win-window.png");
    const result = await saveScreenshot({
      config: {},
      step: {
        screenshot: {
          path: target,
          overwrite: "true",
          surface: { app: "charmap", window: { title: "Dialog" } },
        },
      },
      driver: undefined,
      appSession,
    });
    assert.equal(result.status, "PASS");
    assert.ok(fs.existsSync(target));
    assert.equal(driver.state.capturedWindow, "0xB");
  });

  it("mac: captures the selected window ELEMENT", async function () {
    const { appSession, state } = macAppSession({
      windows: [
        { id: "w1", title: "Untitled", rect: { x: 0, y: 0, width: 1, height: 1 } },
        { id: "w2", title: "Untitled 2", rect: { x: 5, y: 5, width: 2, height: 2 } },
      ],
    });
    const target = path.join(dir, "mac-window.png");
    const result = await saveScreenshot({
      config: {},
      step: {
        screenshot: {
          path: target,
          overwrite: "true",
          surface: { app: "TextEdit", window: "Untitled 2" },
        },
      },
      driver: undefined,
      appSession,
    });
    assert.equal(result.status, "PASS");
    assert.ok(fs.existsSync(target));
    assert.equal(state.capturedWindow, "w2");
  });

  it("mac: a selector-less app capture uses the default window element (not the full display)", async function () {
    const { appSession, state } = macAppSession({
      windows: [
        { id: "w1", title: "Untitled", rect: { x: 0, y: 0, width: 1, height: 1 } },
      ],
    });
    const target = path.join(dir, "mac-default.png");
    const result = await saveScreenshot({
      config: {},
      step: {
        screenshot: {
          path: target,
          overwrite: "true",
          surface: { app: "TextEdit" },
        },
      },
      driver: undefined,
      appSession,
    });
    assert.equal(result.status, "PASS");
    assert.equal(state.capturedWindow, "w1");
  });

  it("mobile: a window selector on an app capture FAILs single-window", async function () {
    const appSession = createAppSessionState();
    appSession.surfaces.set("chat", {
      name: "chat",
      appId: "com.example.chat",
      driver: {},
      launchedByUs: true,
      platform: "android",
      deviceName: "Pixel_7",
    });
    appSession.deviceSessions.set("Pixel_7", {
      driver: {},
      foregroundApp: "com.example.chat",
    });
    const result = await saveScreenshot({
      config: {},
      step: {
        screenshot: {
          path: path.join(dir, "m.png"),
          surface: { app: "chat", window: -1 },
        },
      },
      driver: undefined,
      appSession,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /single-window/);
  });

  it("fails on unknown app refs", async function () {
    const appSession = fakeAppSession({});
    const unknown = await saveScreenshot({
      config: {},
      step: {
        screenshot: { path: path.join(dir, "u.png"), surface: { app: "ghost" } },
      },
      driver: undefined,
      appSession,
    });
    assert.match(unknown.description, /No app surface named "ghost"/);
  });

  it("fails with the unified guidance when nothing is active to capture", async function () {
    // No browser driver, no surface named, and no ACTIVE app (the registered
    // surface was never activated): nothing to capture — must be a clear
    // FAIL with the unified no-active-surface guidance (ADR 01081), not a
    // TypeError on the missing driver.
    const appSession = fakeAppSession({});
    const result = await saveScreenshot({
      config: {},
      step: { screenshot: { path: path.join(dir, "n.png"), overwrite: "true" } },
      driver: undefined,
      appSession,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /No active surface to act on/);
    assert.match(result.description, /startSurface/);

    // Same guard must fire BEFORE the crop path dereferences the missing
    // browser driver for element geometry.
    const withCrop = await saveScreenshot({
      config: {},
      step: {
        screenshot: {
          path: path.join(dir, "c.png"),
          overwrite: "true",
          crop: "#header",
        },
      },
      driver: undefined,
      appSession,
    });
    assert.equal(withCrop.status, "FAIL");
    assert.match(withCrop.description, /No active surface to act on/);
  });
});

describe("closeSurface app-surface branch", function () {
  it("closes a registered app surface (object form) and no-ops when absent", async function () {
    const appSession = fakeAppSession({});
    const closed = await closeSurface({
      config: {},
      step: { closeSurface: { app: "charmap" } },
      driver: undefined,
      processRegistry: new Map(),
      appSession,
    });
    assert.equal(closed.status, "PASS");
    assert.deepEqual(closed.outputs.closed, ["charmap"]);
    assert.equal(appSession.surfaces.size, 0);

    const absent = await closeSurface({
      config: {},
      step: { closeSurface: { app: "charmap" } },
      driver: undefined,
      processRegistry: new Map(),
      appSession,
    });
    assert.equal(absent.status, "PASS");
    assert.deepEqual(absent.outputs.absent, ["charmap"]);
  });

  it("prefers the process when a bare string names both a process and an app surface, and logs the ambiguity", async function () {
    // The ambiguity is logged (debug) and the process wins — the pre-app
    // behavior; the object form ({"app": …}) targets the app unambiguously.
    const appSession = fakeAppSession({ name: "shared" });
    let killed = 0;
    const processRegistry = new Map([
      [
        "shared",
        {
          bg: {
            async kill() {
              killed++;
            },
          },
        },
      ],
    ]);
    // Capture console output so we can assert the documented debug log fires.
    const logged = [];
    const realLog = console.log;
    console.log = (...args) => logged.push(args.join(" "));
    let result;
    try {
      result = await closeSurface({
        config: { logLevel: "debug" },
        step: { closeSurface: "shared" },
        driver: undefined,
        processRegistry,
        appSession,
      });
    } finally {
      console.log = realLog;
    }
    assert.equal(result.status, "PASS");
    assert.deepEqual(result.outputs.closed, ["shared"]);
    assert.equal(killed, 1, "the process should close, not the app");
    assert.equal(appSession.surfaces.size, 1, "the app surface stays open");
    assert.ok(
      logged.some((line) =>
        /names both a background process and an app surface/.test(line)
      ),
      "the ambiguity should be logged at debug level"
    );
  });

  it("resolves bare strings via the app registry", async function () {
    const appSession = fakeAppSession({});
    const byName = await closeSurface({
      config: {},
      step: { closeSurface: "charmap" },
      driver: undefined,
      processRegistry: new Map(),
      appSession,
    });
    assert.equal(byName.status, "PASS");
    assert.deepEqual(byName.outputs.closed, ["charmap"]);
  });

  it("windows: closes ONE window and keeps the surface open (ADR 01036)", async function () {
    const { appSession, driver } = windowsAppSession({
      windows: [
        { handle: "0xA", title: "Main", pid: 100 },
        { handle: "0xB", title: "Dialog", pid: 100 },
      ],
    });
    // Give the strategy a closable root: "windows: closeApp" marks the
    // current window closed in the helper's window table.
    const table = await driver.getWindowHandles();
    assert.equal(table.length, 2);
    driver.execute = async (cmd) => {
      if (cmd === "windows: closeApp") {
        const current = driver.state.current;
        const w = (await driver.getWindowHandles()).includes(current);
        if (w) driver.state.closedHandle = current;
      }
    };
    const result = await closeSurface({
      config: {},
      step: { closeSurface: { app: "charmap", window: { title: "Dialog" } } },
      driver: undefined,
      processRegistry: new Map(),
      appSession,
    });
    assert.equal(result.status, "PASS");
    assert.equal(driver.state.closedHandle, "0xB");
    // The surface itself stays open, rooted back at the main window.
    assert.equal(appSession.surfaces.size, 1);
    assert.equal(driver.state.current, "0xA");
  });

  it("refuses to close an app's last window, pointing at the bare form", async function () {
    const { appSession } = windowsAppSession({
      windows: [{ handle: "0xA", title: "Main", pid: 100 }],
    });
    const result = await closeSurface({
      config: {},
      step: { closeSurface: { app: "charmap", window: { title: "Main" } } },
      driver: undefined,
      processRegistry: new Map(),
      appSession,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /Refusing to close the last window/);
    assert.equal(appSession.surfaces.size, 1);
  });

  it("treats a window selector that matches nothing as an absent no-op", async function () {
    const { appSession } = windowsAppSession({
      windows: [
        { handle: "0xA", title: "Main", pid: 100 },
        { handle: "0xB", title: "Dialog", pid: 100 },
      ],
    });
    const result = await closeSurface({
      config: {},
      step: { closeSurface: { app: "charmap", window: { title: "Long gone" } } },
      driver: undefined,
      processRegistry: new Map(),
      appSession,
    });
    assert.equal(result.status, "PASS");
    assert.equal(appSession.surfaces.size, 1);
  });

  it("mobile: window-scoped app closes FAIL single-window", async function () {
    const appSession = createAppSessionState();
    appSession.surfaces.set("chat", {
      name: "chat",
      appId: "com.example.chat",
      driver: {},
      launchedByUs: true,
      platform: "android",
      deviceName: "Pixel_7",
    });
    const result = await closeSurface({
      config: {},
      step: { closeSurface: { app: "chat", window: -1 } },
      driver: undefined,
      processRegistry: new Map(),
      appSession,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /single-window/);
  });
});
