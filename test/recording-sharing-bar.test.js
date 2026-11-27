// While Chrome captures a tab, its sharing bar shortens the page. The browser
// engine grows the window by the bar's height so the page, and the video, keep
// the viewport's size, and the window goes back when the recording stops.
import assert from "node:assert/strict";
import { holdViewportUnderSharingBar } from "../dist/core/utils.js";

// Collect console lines while `fn` runs.
async function captureConsole(fn) {
  const { log, error } = console;
  const lines = [];
  console.error = console.log = (...args) => lines.push(args.join(" "));
  try {
    await fn();
    return lines;
  } finally {
    console.log = log;
    console.error = error;
  }
}

// A window whose viewport is the window minus a frame, minus a bar once shown.
// `maxHeight` models a headed window the display can't grow.
function barDriver({ window = { width: 816, height: 700 }, frame = { width: 16, height: 100 }, bar = 58, maxHeight } = {}) {
  let win = { ...window };
  return {
    calls: [],
    async execute() {
      return { width: win.width - frame.width, height: win.height - frame.height - bar };
    },
    async getWindowSize() {
      return { ...win };
    },
    async setWindowSize(width, height) {
      this.calls.push([width, height]);
      win = { width, height: maxHeight ? Math.min(height, maxHeight) : height };
    },
  };
}

describe("holdViewportUnderSharingBar", function () {
  it("grows the window by the bar's height and returns the size to restore", async function () {
    const driver = barDriver();
    const restore = await holdViewportUnderSharingBar(driver, { width: 800, height: 600 }, {}, 200);
    assert.deepEqual(restore, { width: 816, height: 700 });
    assert.deepEqual(driver.calls, [[816, 758]]);
    assert.deepEqual(await driver.execute(), { width: 800, height: 600 });
  });

  it("warns once when the window can't grow enough for the bar", async function () {
    const driver = barDriver({ maxHeight: 720 });
    const config = { logLevel: "warning" };
    const lines = await captureConsole(() =>
      holdViewportUnderSharingBar(driver, { width: 800, height: 600 }, config, 200)
    );
    assert.deepEqual(lines, [
      "Warning: Couldn't make the window tall enough for Chrome's sharing bar, so the recording is about 38 pixels shorter than the viewport. Run headless or use a smaller viewport.",
    ]);
  });

  it("doesn't warn when the window grows enough for the bar", async function () {
    const driver = barDriver();
    const lines = await captureConsole(() =>
      holdViewportUnderSharingBar(driver, { width: 800, height: 600 }, { logLevel: "warning" }, 200)
    );
    assert.deepEqual(lines, []);
  });

  it("leaves the window alone when no bar shortens the page", async function () {
    const driver = barDriver({ bar: 0 });
    const restore = await holdViewportUnderSharingBar(driver, { width: 800, height: 600 }, {}, 200);
    assert.equal(restore, undefined);
    assert.deepEqual(driver.calls, []);
  });

  it("does nothing without a viewport to hold", async function () {
    const driver = barDriver();
    assert.equal(await holdViewportUnderSharingBar(driver, undefined, {}, 200), undefined);
    assert.deepEqual(driver.calls, []);
  });
});
