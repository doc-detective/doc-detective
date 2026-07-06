// Unit tests for click.duration (phase A6 long-press): threading through
// click → find, the per-platform app long-press dispatch, and the browser
// W3C press chain. Fake drivers only.
import assert from "node:assert/strict";
import { clickElement } from "../dist/core/tests/click.js";
import { createAppSessionState } from "../dist/core/tests/appSurface.js";
import { performElementPress } from "../dist/core/tests/movement.js";

const config = { logLevel: "silent" };

function makeFakeAppDriver() {
  const calls = [];
  const element = {
    elementId: "el-1",
    clicked: 0,
    async waitForExist() {},
    async getText() {
      return "Element text";
    },
    async click() {
      element.clicked += 1;
    },
  };
  return {
    calls,
    element,
    async getWindowRect() {
      return { x: 0, y: 0, width: 1000, height: 2000 };
    },
    async execute(command, args) {
      calls.push({ command, args });
      return undefined;
    },
    async $() {
      return element;
    },
  };
}

function appSessionWith(entry) {
  const appSession = createAppSessionState();
  appSession.surfaces.set(entry.name, entry);
  return appSession;
}

describe("click.duration on app surfaces", function () {
  it("long-presses via mobile: longClickGesture on Android", async function () {
    const driver = makeFakeAppDriver();
    const appSession = appSessionWith({
      name: "myapp",
      appId: "com.example.myapp",
      driver,
      launchedByUs: true,
      platform: "android",
    });
    const result = await clickElement({
      config,
      step: {
        click: {
          elementText: "Message",
          duration: 800,
          surface: { app: "myapp" },
        },
      },
      driver: null,
      appSession,
    });
    assert.equal(result.status, "PASS");
    const call = driver.calls.find(
      (c) => c.command === "mobile: longClickGesture"
    );
    assert.ok(call, "expected mobile: longClickGesture");
    assert.equal(call.args.duration, 800);
    assert.equal(call.args.elementId, "el-1");
    assert.equal(driver.element.clicked, 0, "plain click must not fire");
    assert.match(result.description, /Long-pressed/);
  });

  it("long-presses via windows: click durationMs on Windows", async function () {
    const driver = makeFakeAppDriver();
    const appSession = appSessionWith({
      name: "notepad",
      appId: "notepad.exe",
      driver,
      launchedByUs: true,
      platform: "windows",
    });
    const result = await clickElement({
      config,
      step: {
        click: {
          elementText: "File",
          duration: 600,
          surface: { app: "notepad" },
        },
      },
      driver: null,
      appSession,
    });
    assert.equal(result.status, "PASS");
    const call = driver.calls.find((c) => c.command === "windows: click");
    assert.ok(call, "expected windows: click");
    assert.equal(call.args.durationMs, 600);
  });

  it("keeps the plain click when no duration is set", async function () {
    const driver = makeFakeAppDriver();
    const appSession = appSessionWith({
      name: "myapp",
      appId: "com.example.myapp",
      driver,
      launchedByUs: true,
      platform: "android",
    });
    const result = await clickElement({
      config,
      step: { click: { elementText: "Message", surface: { app: "myapp" } } },
      driver: null,
      appSession,
    });
    assert.equal(result.status, "PASS");
    assert.equal(driver.element.clicked, 1);
    assert.equal(driver.calls.length, 0, "no gesture extension calls");
  });

  it("wraps a long-press driver error into a FAIL", async function () {
    const driver = makeFakeAppDriver();
    driver.execute = async () => {
      throw new Error("no such endpoint");
    };
    const appSession = appSessionWith({
      name: "myapp",
      appId: "com.example.myapp",
      driver,
      launchedByUs: true,
      platform: "android",
    });
    const result = await clickElement({
      config,
      step: {
        click: {
          elementText: "Message",
          duration: 800,
          surface: { app: "myapp" },
        },
      },
      driver: null,
      appSession,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /long-press/i);
    assert.match(result.description, /no such endpoint/);
  });
});

describe("performElementPress (browser long-press)", function () {
  function makeActionDriver() {
    const actions = [];
    return {
      actions,
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

  it("builds move-down-pause-up on the element with the button index", async function () {
    const driver = makeActionDriver();
    const element = { elementId: "web-el" };
    await performElementPress({ driver, element, button: "right", duration: 900 });
    const chain = driver.actions[0];
    assert.equal(chain.performed, true);
    const kinds = chain.steps.map((s) => s.kind);
    assert.deepEqual(kinds, ["move", "down", "pause", "up"]);
    assert.equal(chain.steps[0].args.origin, element);
    assert.equal(chain.steps[1].args.button, 2);
    assert.equal(chain.steps[2].ms, 900);
    assert.equal(chain.steps[3].args.button, 2);
  });

  it("defaults to the left button", async function () {
    const driver = makeActionDriver();
    await performElementPress({
      driver,
      element: { elementId: "e" },
      duration: 100,
    });
    assert.equal(driver.actions[0].steps[1].args.button, 0);
  });
});
