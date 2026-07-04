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

  it("fails on window selectors, sub-effects, and unknown app names", async function () {
    const appSession = fakeAppSession({});
    const windowSel = await findElement({
      config: {},
      step: {
        find: { elementText: "x", surface: { app: "charmap", window: -1 } },
      },
      driver: undefined,
      appSession,
    });
    assert.match(windowSel.description, /Window selectors on app surfaces/);

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

  it("fails on window selectors and unknown app refs", async function () {
    const appSession = fakeAppSession({});
    const windowSel = await saveScreenshot({
      config: {},
      step: {
        screenshot: {
          path: path.join(dir, "w.png"),
          surface: { app: "charmap", window: -1 },
        },
      },
      driver: undefined,
      appSession,
    });
    assert.match(windowSel.description, /Window selectors on app captures/);

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

  it("fails with guidance when an app-only context captures without a surface", async function () {
    // No browser driver and no surface named: nothing to capture — must be a
    // clear FAIL, not a TypeError on the missing driver.
    const appSession = fakeAppSession({});
    const result = await saveScreenshot({
      config: {},
      step: { screenshot: { path: path.join(dir, "n.png"), overwrite: "true" } },
      driver: undefined,
      appSession,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /No browser session/);
    assert.match(result.description, /"app"/);

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
    assert.match(withCrop.description, /No browser session/);
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

  it("rejects window-scoped app closes and resolves bare strings via the app registry", async function () {
    const appSession = fakeAppSession({});
    const windowClose = await closeSurface({
      config: {},
      step: { closeSurface: { app: "charmap", window: -1 } },
      driver: undefined,
      processRegistry: new Map(),
      appSession,
    });
    assert.equal(windowClose.status, "FAIL");
    assert.match(windowClose.description, /lands in a later phase/);

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
});
