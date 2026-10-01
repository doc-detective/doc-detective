// Bug #2 (the silent viewport floor): a browser/OS minimum window size can
// clamp a small requested viewport with no error, and the step still PASSes.
// startSurface now reads the viewport back after resizing, warns when it was
// floored, and reports the realized size in `outputs.viewport` so the rendered
// dimensions are ground truth rather than an assumption.
import assert from "node:assert/strict";
import { startSurfaceStep } from "../dist/core/tests/startSurface.js";
import {
  createSessionRegistry,
  registerSession,
} from "../dist/core/tests/browserSessions.js";

// A browser driver that models the window→viewport relationship: the page
// viewport is the window minus fixed chrome, and an optional `floorWidth`
// simulates the minimum window width that clamps a small requested viewport.
function viewportDriver({ floorWidth } = {}) {
  const initialViewport = { width: 1000, height: 700 };
  const initialWindow = { width: 1024, height: 800 };
  const chromeW = initialWindow.width - initialViewport.width; // 24
  const chromeH = initialWindow.height - initialViewport.height; // 100
  let lastSet = null;
  return {
    state: {},
    async execute() {
      if (!lastSet) return { ...initialViewport };
      let width = lastSet.w - chromeW;
      const height = lastSet.h - chromeH;
      if (floorWidth) width = Math.max(width, floorWidth);
      return { width, height };
    },
    async getWindowSize() {
      return { ...initialWindow };
    },
    async setWindowSize(w, h) {
      lastSet = { w, h };
    },
    async deleteSession() {},
  };
}

// A context driver that carries a session registry whose `open` yields the
// given surface driver.
function contextDriverOpening(openDriver) {
  const registry = createSessionRegistry({ open: async () => openDriver });
  const contextDriver = {
    state: {},
    async execute() {
      return { width: 1000, height: 700 };
    },
    async getWindowSize() {
      return { width: 1024, height: 800 };
    },
    async setWindowSize() {},
    async deleteSession() {},
  };
  registerSession(registry, {
    name: "chrome",
    engine: "chrome",
    driver: contextDriver,
  });
  return contextDriver;
}

// Capture (WARNING)-level log lines emitted during `fn`.
async function captureWarnings(fn) {
  const original = console.log;
  const lines = [];
  console.log = (...args) => {
    lines.push(args.join(" "));
  };
  try {
    await fn();
  } finally {
    console.log = original;
  }
  return lines.filter((l) => l.startsWith("(WARNING)"));
}

const config = { logLevel: "warning" };

describe("startSurface viewport read-back (Bug #2)", function () {
  it("warns and reports the floored size when the browser clamps the viewport", async function () {
    const surface = viewportDriver({ floorWidth: 500 });
    const contextDriver = contextDriverOpening(surface);
    let result;
    const warnings = await captureWarnings(async () => {
      result = await startSurfaceStep({
        config,
        step: {
          startSurface: {
            browser: "firefox",
            name: "mobile",
            viewport: { width: 375, height: 812 },
          },
        },
        platform: "windows",
        driver: contextDriver,
      });
    });
    assert.equal(result.status, "PASS", result.description);
    // Ground truth: the realized viewport, not the request.
    assert.deepEqual(result.outputs.viewport, {
      requested: { width: 375, height: 812 },
      actual: { width: 500, height: 812 },
    });
    // The floor is surfaced, not silent.
    assert.equal(warnings.length, 1, warnings.join("\n"));
    assert.match(warnings[0], /375/);
    assert.match(warnings[0], /500/);
    assert.match(warnings[0], /mobile/);
  });

  it("does not warn when the viewport is realized exactly", async function () {
    const surface = viewportDriver(); // no floor
    const contextDriver = contextDriverOpening(surface);
    let result;
    const warnings = await captureWarnings(async () => {
      result = await startSurfaceStep({
        config,
        step: {
          startSurface: {
            browser: "firefox",
            name: "mobile",
            viewport: { width: 375, height: 812 },
          },
        },
        platform: "windows",
        driver: contextDriver,
      });
    });
    assert.equal(result.status, "PASS", result.description);
    assert.deepEqual(result.outputs.viewport, {
      requested: { width: 375, height: 812 },
      actual: { width: 375, height: 812 },
    });
    assert.equal(warnings.length, 0, warnings.join("\n"));
  });

  it("reports no viewport output and no warning when none was requested", async function () {
    const surface = viewportDriver();
    const contextDriver = contextDriverOpening(surface);
    let result;
    const warnings = await captureWarnings(async () => {
      result = await startSurfaceStep({
        config,
        step: { startSurface: { browser: "firefox", name: "plain" } },
        platform: "windows",
        driver: contextDriver,
      });
    });
    assert.equal(result.status, "PASS", result.description);
    assert.equal(result.outputs.viewport, undefined);
    assert.equal(warnings.length, 0, warnings.join("\n"));
  });
});
