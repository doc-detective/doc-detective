// Unit tests for the phase A6 swipe step handler: form normalization, surface
// routing (app / browser / process), error wording, and outputs. Fake drivers
// only — no Appium, no browser.
import assert from "node:assert/strict";
import { swipeSurface } from "../dist/core/tests/swipe.js";
import { createAppSessionState } from "../dist/core/tests/appSurface.js";

const config = { logLevel: "silent" };

function makeFakeAppDriver({
  rect = { x: 0, y: 0, width: 1000, height: 2000 },
} = {}) {
  const calls = [];
  const actions = [];
  return {
    calls,
    actions,
    async getWindowRect() {
      return rect;
    },
    async execute(command, args) {
      calls.push({ command, args });
      return undefined;
    },
    action(type, opts) {
      const chain = { type, opts, steps: [] };
      actions.push(chain);
      const builder = {
        move(args) {
          chain.steps.push({ kind: "move", args });
          return builder;
        },
        down(args) {
          chain.steps.push({ kind: "down", args });
          return builder;
        },
        up(args) {
          chain.steps.push({ kind: "up", args });
          return builder;
        },
        pause(ms) {
          chain.steps.push({ kind: "pause", ms });
          return builder;
        },
        async perform() {
          chain.performed = true;
        },
      };
      return builder;
    },
  };
}

// A fake browser driver: first execute() call returns the viewport size,
// later calls record scrollBy invocations.
function makeFakeBrowserDriver({ viewport = [1000, 800] } = {}) {
  const executes = [];
  const actions = [];
  return {
    executes,
    actions,
    async execute(fn, ...args) {
      executes.push({ fn, args });
      if (executes.length === 1) return viewport;
      return undefined;
    },
    action(type, opts) {
      const chain = { type, opts, steps: [] };
      actions.push(chain);
      const builder = {
        move(args) {
          chain.steps.push({ kind: "move", args });
          return builder;
        },
        down(args) {
          chain.steps.push({ kind: "down", args });
          return builder;
        },
        up(args) {
          chain.steps.push({ kind: "up", args });
          return builder;
        },
        pause(ms) {
          chain.steps.push({ kind: "pause", ms });
          return builder;
        },
        async perform() {
          chain.performed = true;
        },
      };
      return builder;
    },
  };
}

function appSessionWith(entry) {
  const appSession = createAppSessionState();
  appSession.surfaces.set(entry.name, entry);
  return appSession;
}

describe("swipe step: app surfaces", function () {
  it("applies the default distance when the directional form omits it", async function () {
    const driver = makeFakeAppDriver();
    const appSession = appSessionWith({
      name: "myapp",
      appId: "com.example.myapp",
      driver,
      launchedByUs: true,
      platform: "android",
    });
    const result = await swipeSurface({
      config,
      step: { swipe: { direction: "up", surface: { app: "myapp" } } },
      driver: null,
      appSession,
    });
    assert.equal(result.status, "PASS");
    const call = driver.calls.find((c) => c.command === "mobile: swipeGesture");
    assert.ok(call, "expected mobile: swipeGesture");
    assert.equal(call.args.direction, "up");
    assert.equal(call.args.percent, 0.5);
    assert.deepEqual(result.outputs.direction, "up");
  });

  it("passes distance and duration through to the adapter", async function () {
    const driver = makeFakeAppDriver();
    const appSession = appSessionWith({
      name: "myapp",
      appId: "com.example.myapp",
      driver,
      launchedByUs: true,
      platform: "android",
    });
    const result = await swipeSurface({
      config,
      step: {
        swipe: {
          direction: "left",
          distance: 0.8,
          duration: 250,
          surface: { app: "myapp" },
        },
      },
      driver: null,
      appSession,
    });
    assert.equal(result.status, "PASS");
    const call = driver.calls.find((c) => c.command === "mobile: swipeGesture");
    assert.equal(call.args.percent, 0.8);
    assert.equal(result.outputs.duration, 250);
  });

  it("runs point-to-point swipes through the touch movement engine", async function () {
    const driver = makeFakeAppDriver();
    const appSession = appSessionWith({
      name: "myapp",
      appId: "com.example.myapp",
      driver,
      launchedByUs: true,
      platform: "android",
    });
    const result = await swipeSurface({
      config,
      step: {
        swipe: {
          from: { x: 500, y: 1600 },
          to: { x: 500, y: 400 },
          surface: { app: "myapp" },
        },
      },
      driver: null,
      appSession,
    });
    assert.equal(result.status, "PASS");
    assert.equal(driver.actions.length, 1);
    assert.equal(driver.actions[0].opts.parameters.pointerType, "touch");
    assert.deepEqual(result.outputs.from, { x: 500, y: 1600 });
  });

  it("fails on an unknown app surface name", async function () {
    const result = await swipeSurface({
      config,
      step: { swipe: { direction: "up", surface: { app: "nope" } } },
      driver: null,
      appSession: createAppSessionState(),
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /No app surface named "nope"/);
  });

  it("windows: swipes in a selected window using that window's rect", async function () {
    // Switch-then-act: the window selector re-roots the session, and the
    // gesture's coordinate math uses the selected window's rect.
    const windows = [
      { handle: "0xA", title: "Main", pid: 100, rect: { x: 0, y: 0, width: 1000, height: 2000 } },
      { handle: "0xB", title: "Dialog", pid: 100, rect: { x: 100, y: 100, width: 400, height: 400 } },
    ];
    const state = { current: "0xA" };
    const calls = [];
    const driver = {
      state,
      calls,
      async getWindowHandles() {
        return windows.map((w) => w.handle);
      },
      async getWindowHandle() {
        return state.current;
      },
      async switchToWindow(handle) {
        if (!windows.some((w) => w.handle === handle))
          throw new Error("no such window");
        state.current = handle;
      },
      async getTitle() {
        return windows.find((w) => w.handle === state.current)?.title ?? "";
      },
      async $() {
        return {
          getAttribute: async (name) =>
            name === "ProcessId"
              ? String(windows.find((w) => w.handle === state.current)?.pid ?? "")
              : null,
        };
      },
      async getWindowRect() {
        return windows.find((w) => w.handle === state.current)?.rect;
      },
      async execute(command, args) {
        calls.push({ command, args });
      },
    };
    const appSession = appSessionWith({
      name: "myapp",
      appId: "com.example.myapp",
      driver,
      launchedByUs: true,
      platform: "windows",
      mainWindowHandle: "0xA",
      appPid: 100,
      knownWindows: ["0xA"],
      foreignWindows: new Set(),
    });
    const result = await swipeSurface({
      config,
      step: {
        swipe: {
          direction: "up",
          surface: { app: "myapp", window: { title: "Dialog" } },
        },
      },
      driver: null,
      appSession,
    });
    assert.equal(result.status, "PASS");
    const scroll = calls.find((c) => c.command === "windows: scroll");
    assert.ok(scroll, "expected a windows: scroll gesture");
    // Center of the DIALOG rect (100,100 400x400) -> (300, 300).
    assert.equal(scroll.args.x, 300);
    assert.equal(scroll.args.y, 300);
  });

  it("windows: FAILs a window-targeted swipe when the window's bounds can't be read (no full-screen fallback)", async function () {
    // A resolved window whose rect comes back degenerate (width 0) must FAIL
    // rather than fall through to the driver's default rect (on Mac2 that's
    // the whole screen), which would misplace the gesture.
    const windows = [
      { handle: "0xA", title: "Main", pid: 100, rect: { x: 0, y: 0, width: 1000, height: 2000 } },
      { handle: "0xB", title: "Dialog", pid: 100, rect: { x: 100, y: 100, width: 0, height: 0 } },
    ];
    const state = { current: "0xA" };
    const calls = [];
    const driver = {
      state,
      calls,
      async getWindowHandles() {
        return windows.map((w) => w.handle);
      },
      async getWindowHandle() {
        return state.current;
      },
      async switchToWindow(handle) {
        if (!windows.some((w) => w.handle === handle))
          throw new Error("no such window");
        state.current = handle;
      },
      async getTitle() {
        return windows.find((w) => w.handle === state.current)?.title ?? "";
      },
      async $() {
        return {
          getAttribute: async (name) =>
            name === "ProcessId"
              ? String(windows.find((w) => w.handle === state.current)?.pid ?? "")
              : null,
        };
      },
      async getWindowRect() {
        return windows.find((w) => w.handle === state.current)?.rect;
      },
      async execute(command, args) {
        calls.push({ command, args });
      },
    };
    const appSession = appSessionWith({
      name: "myapp",
      appId: "com.example.myapp",
      driver,
      launchedByUs: true,
      platform: "windows",
      mainWindowHandle: "0xA",
      appPid: 100,
      knownWindows: ["0xA"],
      foreignWindows: new Set(),
    });
    const result = await swipeSurface({
      config,
      step: {
        swipe: {
          direction: "up",
          surface: { app: "myapp", window: { title: "Dialog" } },
        },
      },
      driver: null,
      appSession,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /couldn't determine the bounds/i);
    // No gesture was attempted.
    assert.equal(calls.find((c) => c.command === "windows: scroll"), undefined);
  });

  it("mobile: a window selector FAILs with the single-window message", async function () {
    const driver = makeFakeAppDriver();
    const appSession = appSessionWith({
      name: "myapp",
      appId: "com.example.myapp",
      driver,
      launchedByUs: true,
      platform: "android",
    });
    const result = await swipeSurface({
      config,
      step: {
        swipe: {
          direction: "up",
          surface: { app: "myapp", window: -1 },
        },
      },
      driver: null,
      appSession,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /single-window/);
  });

  it("wraps adapter throws into a FAIL", async function () {
    const driver = makeFakeAppDriver();
    driver.execute = async () => {
      throw new Error("gesture endpoint missing");
    };
    const appSession = appSessionWith({
      name: "myapp",
      appId: "com.example.myapp",
      driver,
      launchedByUs: true,
      platform: "android",
    });
    const result = await swipeSurface({
      config,
      step: { swipe: { direction: "up", surface: { app: "myapp" } } },
      driver: null,
      appSession,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /Couldn't swipe/);
    assert.match(result.description, /gesture endpoint missing/);
  });
});

describe("swipe step: browser and process surfaces", function () {
  it("scrolls the active tab for the simple string form", async function () {
    const driver = makeFakeBrowserDriver({ viewport: [1000, 800] });
    const result = await swipeSurface({
      config,
      step: { swipe: "up" },
      driver,
    });
    assert.equal(result.status, "PASS");
    // First execute reads the viewport; the second is the scrollBy with
    // finger-motion semantics: swipe up reveals content below (positive dy).
    assert.equal(driver.executes.length, 2);
    assert.deepEqual(driver.executes[1].args, [0, 400]);
  });

  it("maps horizontal directions onto scrollBy x", async function () {
    const driver = makeFakeBrowserDriver({ viewport: [1000, 800] });
    await swipeSurface({
      config,
      step: { swipe: { direction: "left", distance: 0.4 } },
      driver,
    });
    assert.deepEqual(driver.executes[1].args, [400, 0]);
  });

  it("runs point-to-point browser swipes through the movement engine as viewport pixels", async function () {
    const driver = makeFakeBrowserDriver({ viewport: [1000, 800] });
    const result = await swipeSurface({
      config,
      step: {
        swipe: { from: { x: 200, y: 400 }, to: { x: 800, y: 400 } },
      },
      driver,
    });
    assert.equal(result.status, "PASS");
    assert.equal(driver.actions.length, 1);
    assert.equal(driver.actions[0].opts.parameters.pointerType, "mouse");
    // Author pixels are viewport-relative and pass through unchanged — no
    // viewport read happens on this path.
    assert.equal(driver.executes.length, 0);
    assert.deepEqual(
      { x: driver.actions[0].steps[0].args.x, y: driver.actions[0].steps[0].args.y },
      { x: 200, y: 400 }
    );
  });

  it("rejects process surfaces at the schema layer (both forms)", async function () {
    // The process kind is unrepresentable in the swipe schema — a background
    // process has no screen to swipe. Bare strings are restricted to engine
    // keywords (the byEngineName precedent) and there is no { process } branch.
    for (const surface of ["bg", { process: "bg" }]) {
      const result = await swipeSurface({
        config,
        step: { swipe: { direction: "up", surface } },
        driver: makeFakeBrowserDriver(),
      });
      assert.equal(result.status, "FAIL", JSON.stringify(surface));
      assert.match(result.description, /Invalid step definition/);
    }
  });

  it("fails an { app } surface when no app session is active", async function () {
    const result = await swipeSurface({
      config,
      step: { swipe: { direction: "up", surface: { app: "myapp" } } },
      driver: makeFakeBrowserDriver(),
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /no app session/);
    assert.match(result.description, /startSurface/);
  });

  it("fails without any driver, pointing at the app-surface form", async function () {
    const result = await swipeSurface({
      config,
      step: { swipe: "up" },
      driver: null,
      appSession: createAppSessionState(),
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /surface/);
    assert.match(result.description, /app/);
  });

  it("fails an invalid step shape through schema validation", async function () {
    const result = await swipeSurface({
      config,
      step: { swipe: { direction: "diagonal" } },
      driver: makeFakeBrowserDriver(),
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /Invalid step definition/);
  });
});
