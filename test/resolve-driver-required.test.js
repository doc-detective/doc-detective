import assert from "node:assert/strict";
import { isDriverRequired } from "../dist/core/resolveTests.js";

describe("resolveTests/isDriverRequired", function () {
  it("requires a driver for a test whose only step is runBrowserScript", function () {
    const test = { steps: [{ runBrowserScript: "return document.title;" }] };
    assert.equal(isDriverRequired({ test }), true);
  });

  it("does not require a driver for a pure host/HTTP test", function () {
    const test = {
      steps: [{ runShell: "echo hi" }, { httpRequest: { url: "https://x.test" } }],
    };
    assert.equal(isDriverRequired({ test }), false);
  });

  it("still requires a driver for classic browser steps (regression)", function () {
    const test = { steps: [{ goTo: "https://x.test" }, { runShell: "echo hi" }] };
    assert.equal(isDriverRequired({ test }), true);
  });

  it("requires a driver for a startSurface browser descriptor (Phase 6)", function () {
    const test = { steps: [{ startSurface: { browser: "chrome" } }] };
    assert.equal(isDriverRequired({ test }), true);
  });

  it("requires a driver when a parallel startSurface array contains a browser descriptor", function () {
    const test = {
      steps: [
        {
          startSurface: [
            { process: "node", name: "repl" },
            { browser: "firefox", name: "admin" },
          ],
        },
      ],
    };
    assert.equal(isDriverRequired({ test }), true);
  });

  it("does not require a driver for app or process startSurface forms", function () {
    // App surfaces provision their own per-context Appium server through the
    // app preflight; background processes need no driver at all.
    for (const startSurface of [
      { app: "C:\\Windows\\System32\\notepad.exe" },
      { process: "node", name: "repl" },
      [{ app: "com.example.myapp" }, { process: "node", name: "repl" }],
    ]) {
      const test = { steps: [{ startSurface }] };
      assert.equal(
        isDriverRequired({ test }),
        false,
        JSON.stringify(startSurface)
      );
    }
  });
});
