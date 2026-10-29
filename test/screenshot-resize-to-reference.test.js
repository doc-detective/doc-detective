// #769 / ADR 01144: when a capture and its reference differ in size because the
// environment rendered the browser differently, saveScreenshot resizes the
// window to the reference's viewport, captures again, and restores the window.
// Unsized browser sessions get a 1200×800 default viewport.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

import {
  saveScreenshot,
  referenceViewport,
} from "../dist/core/tests/saveScreenshot.js";
import { applyBrowserSize, DEFAULT_VIEWPORT } from "../dist/core/utils.js";

const require = createRequire(import.meta.url);
const sharpMod = require("sharp");
const sharp = sharpMod.default ?? sharpMod;

async function makePngBuffer(width, height) {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 0, b: 0 } },
  })
    .png()
    .toBuffer();
}

// A browser whose screenshot is its viewport: the window minus a fixed frame,
// scaled by `dpr`. `maxWindow` models headed Chrome, which can't grow past the
// display. Every setWindowSize lands in `calls`.
function browserDriver({
  window = { width: 1224, height: 900 },
  frame = { width: 24, height: 100 },
  dpr = 1,
  maxWindow,
  sizeTarget,
} = {}) {
  let win = { ...window };
  const viewport = () => ({
    width: win.width - frame.width,
    height: win.height - frame.height,
  });
  return {
    state: sizeTarget ? { sizeTarget } : {},
    calls: [],
    async execute() {
      return { ...viewport(), dpr };
    },
    async getWindowSize() {
      return { ...win };
    },
    async setWindowSize(w, h) {
      this.calls.push([w, h]);
      win = {
        width: maxWindow ? Math.min(w, maxWindow.width) : w,
        height: maxWindow ? Math.min(h, maxWindow.height) : h,
      };
    },
    async takeScreenshot() {
      const v = viewport();
      const buf = await makePngBuffer(
        Math.round(v.width * dpr),
        Math.round(v.height * dpr)
      );
      return buf.toString("base64");
    },
  };
}

// Collect console lines at one level while `fn` runs.
async function captureLog(level, fn) {
  const original = console.log;
  const lines = [];
  console.log = (...args) => lines.push(args.join(" "));
  try {
    return { value: await fn(), lines: lines.filter((l) => l.startsWith(`(${level})`)) };
  } finally {
    console.log = original;
  }
}

const config = { logLevel: "warning" };

describe("referenceViewport", function () {
  const base = {
    dpr: 1,
    viewport: { width: 1200, height: 800 },
    window: { width: 1224, height: 900 },
  };

  it("returns null when the capture already matches the reference", function () {
    assert.equal(
      referenceViewport({
        ...base,
        target: { kind: "default", width: 1200, height: 800 },
        capture: { width: 1200, height: 800 },
        reference: { width: 1200, height: 800 },
      }),
      null
    );
  });

  it("returns null without a size target", function () {
    assert.equal(
      referenceViewport({
        ...base,
        target: undefined,
        capture: { width: 1200, height: 800 },
        reference: { width: 1000, height: 700 },
      }),
      null
    );
  });

  it("follows the reference for a default size, at any distance", function () {
    assert.deepEqual(
      referenceViewport({
        ...base,
        target: { kind: "default", width: 1200, height: 800 },
        capture: { width: 1200, height: 800 },
        reference: { width: 758, height: 426 },
      }),
      { width: 758, height: 426 }
    );
  });

  it("divides the reference by devicePixelRatio", function () {
    assert.deepEqual(
      referenceViewport({
        ...base,
        dpr: 2,
        target: { kind: "default", width: 1200, height: 800 },
        capture: { width: 2400, height: 1600 },
        reference: { width: 2000, height: 1500 },
      }),
      { width: 1000, height: 750 }
    );
  });

  it("leaves a uniform scale (a devicePixelRatio difference) to the resample", function () {
    assert.equal(
      referenceViewport({
        ...base,
        target: { kind: "default", width: 1200, height: 800 },
        capture: { width: 1200, height: 800 },
        reference: { width: 2400, height: 1600 },
      }),
      null
    );
  });

  it("follows a reference that shows the authored viewport", function () {
    assert.deepEqual(
      referenceViewport({
        ...base,
        target: { kind: "viewport", width: 1200, height: 800 },
        capture: { width: 1200, height: 788 },
        reference: { width: 1200, height: 800 },
      }),
      { width: 1200, height: 800 }
    );
  });

  it("ignores an out-of-date reference when the authored viewport changed", function () {
    assert.equal(
      referenceViewport({
        ...base,
        target: { kind: "viewport", width: 1440, height: 900 },
        capture: { width: 1440, height: 900 },
        reference: { width: 1200, height: 800 },
      }),
      null
    );
  });

  it("follows a reference within 5% of the authored window", function () {
    // Needs a 1224×930 window for a 1200×830 viewport: 30px over 900 is 3.3%.
    assert.deepEqual(
      referenceViewport({
        ...base,
        target: { kind: "window", width: 1224, height: 900 },
        capture: { width: 1200, height: 800 },
        reference: { width: 1200, height: 830 },
      }),
      { width: 1200, height: 830 }
    );
  });

  it("ignores a reference that needs more than 5% of the authored window", function () {
    // Needs a 1224×1000 window: 100px over 900 is 11%.
    assert.equal(
      referenceViewport({
        ...base,
        target: { kind: "window", width: 1224, height: 900 },
        capture: { width: 1200, height: 800 },
        reference: { width: 1200, height: 900 },
      }),
      null
    );
  });
});

describe("applyBrowserSize", function () {
  it("realizes an authored viewport and records it as the size target", async function () {
    const driver = browserDriver();
    const { target, realized } = await applyBrowserSize(
      driver,
      { viewport: { width: 1000, height: 700 } },
      config
    );
    assert.deepEqual(target, { kind: "viewport", width: 1000, height: 700 });
    assert.deepEqual(realized, { width: 1000, height: 700 });
    assert.deepEqual(driver.state.sizeTarget, target);
  });

  it("sets an authored window, keeping the current size on an unset axis", async function () {
    const driver = browserDriver();
    const { target } = await applyBrowserSize(
      driver,
      { window: { width: 1366 } },
      config
    );
    assert.deepEqual(target, { kind: "window", width: 1366 });
    assert.deepEqual(driver.calls, [[1366, 900]]);
    assert.deepEqual(driver.state.sizeTarget, target);
  });

  it("prefers the viewport when both are authored", async function () {
    const driver = browserDriver();
    const { target } = await applyBrowserSize(
      driver,
      { viewport: { width: 1000 }, window: { width: 1366, height: 768 } },
      config
    );
    assert.equal(target.kind, "viewport");
  });

  it("applies the 1200×800 default viewport when nothing is authored", async function () {
    const driver = browserDriver({ window: { width: 780, height: 580 } });
    const { target, realized } = await applyBrowserSize(driver, {}, config);
    assert.deepEqual(DEFAULT_VIEWPORT, { width: 1200, height: 800 });
    assert.deepEqual(target, { kind: "default", width: 1200, height: 800 });
    assert.deepEqual(realized, { width: 1200, height: 800 });
  });

  it("treats non-positive dimensions as unset", async function () {
    const driver = browserDriver();
    const { target } = await applyBrowserSize(
      driver,
      { viewport: { width: 0, height: -5 }, window: { width: 0 } },
      config
    );
    assert.equal(target.kind, "default");
  });

  it("keeps the session when the default can't be applied", async function () {
    const driver = browserDriver();
    driver.setWindowSize = async () => {
      throw new Error("no window here");
    };
    const { target, realized } = await applyBrowserSize(driver, {}, config);
    assert.equal(target.kind, "default");
    assert.equal(realized, undefined);
    assert.deepEqual(driver.state.sizeTarget, target);
  });

  it("doesn't warn when a host can't fit the default nobody asked for", async function () {
    const driver = browserDriver({ maxWindow: { width: 1024, height: 768 } });
    const { lines } = await captureLog("WARNING", () =>
      applyBrowserSize(driver, undefined, config)
    );
    assert.deepEqual(lines, []);
  });
});

describe("saveScreenshot resizes to the reference (#769)", function () {
  let tmpDir;
  beforeEach(function () {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-resize-ref-"));
  });
  afterEach(function () {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function reference(width, height) {
    const file = path.join(tmpDir, "ref.png");
    fs.writeFileSync(file, await makePngBuffer(width, height));
    return file;
  }

  const defaultTarget = { kind: "default", width: 1200, height: 800 };

  it("retakes at the reference's size, compares, and restores the window", async function () {
    const file = await reference(1000, 700);
    const driver = browserDriver({ sizeTarget: defaultTarget });
    const result = await saveScreenshot({
      config,
      step: { stepId: "resize1", screenshot: file },
      driver,
    });
    assert.equal(result.status, "PASS");
    assert.deepEqual(result.outputs.resizedToReference, {
      from: { width: 1200, height: 800 },
      to: { width: 1000, height: 700 },
    });
    assert.equal(result.outputs.width, 1000);
    assert.equal(result.outputs.height, 700);
    assert.equal(result.outputs.variation, 0);
    assert.equal(result.outputs.changed, false);
    assert.deepEqual(driver.calls.at(-1), [1224, 900], "window restored");
  });

  it("grows past the current window for a larger reference", async function () {
    const file = await reference(2400, 1700);
    const driver = browserDriver({ sizeTarget: defaultTarget });
    const result = await saveScreenshot({
      config,
      step: { stepId: "resize2", screenshot: file },
      driver,
    });
    assert.equal(result.status, "PASS");
    assert.deepEqual(result.outputs.resizedToReference.to, {
      width: 2400,
      height: 1700,
    });
    assert.deepEqual(driver.calls.at(-1), [1224, 900]);
  });

  it("compares the original capture when the window can't reach the reference", async function () {
    const file = await reference(2400, 1700);
    const driver = browserDriver({
      sizeTarget: defaultTarget,
      maxWindow: { width: 1924, height: 1180 },
    });
    const { value: result, lines } = await captureLog("WARNING", () =>
      saveScreenshot({
        config,
        step: { stepId: "resize3", screenshot: file },
        driver,
      })
    );
    assert.equal(result.outputs.resizedToReference, undefined);
    assert.equal(result.outputs.width, 1200);
    assert.match(lines.join("\n"), /2400×1700/);
    assert.deepEqual(driver.calls.at(-1), [1224, 900]);
  });

  const noResize = {
    "the session has no size target": () => ({
      driver: browserDriver(),
      screenshot: {},
    }),
    "overwrite is true": () => ({
      driver: browserDriver({ sizeTarget: defaultTarget }),
      screenshot: { overwrite: "true" },
    }),
    "the authored viewport no longer matches the reference": () => ({
      driver: browserDriver({
        sizeTarget: { kind: "viewport", width: 1200, height: 800 },
      }),
      screenshot: { maxVariation: 1 },
    }),
  };
  for (const [why, setup] of Object.entries(noResize)) {
    it(`doesn't resize when ${why}`, async function () {
      const file = await reference(1000, 700);
      const { driver, screenshot } = setup();
      const result = await saveScreenshot({
        config,
        step: { stepId: "noresize", screenshot: { path: file, ...screenshot } },
        driver,
      });
      assert.deepEqual(driver.calls, []);
      assert.equal(result.outputs.resizedToReference, undefined);
    });
  }

  it("doesn't resize while a recording is running (it would show in the video)", async function () {
    const file = await reference(1000, 700);
    const driver = browserDriver({ sizeTarget: defaultTarget });
    driver.state.recordings = [{}];
    const result = await saveScreenshot({
      config,
      step: { stepId: "recording", screenshot: { path: file, maxVariation: 1 } },
      driver,
    });
    assert.deepEqual(driver.calls, []);
    assert.equal(result.outputs.resizedToReference, undefined);
  });

  it("doesn't resize a recording checkpoint (it would show in the video)", async function () {
    const file = await reference(1000, 700);
    const driver = browserDriver({ sizeTarget: defaultTarget });
    await saveScreenshot({
      config,
      step: { stepId: "checkpoint", screenshot: file },
      driver,
      internal: {
        compareOnly: true,
        capturePath: path.join(tmpDir, "staged.png"),
      },
    });
    assert.deepEqual(driver.calls, []);
  });

  it("doesn't resize a cropped capture", async function () {
    const file = await reference(10, 10);
    const driver = browserDriver({ sizeTarget: defaultTarget });
    const element = {
      elementId: "el",
      async waitForExist() {
        return true;
      },
      async getText() {
        return "";
      },
      async getHTML() {
        return "<div></div>";
      },
      async getTagName() {
        return "div";
      },
      async getValue() {
        return "";
      },
      async getAttribute() {
        return null;
      },
      async getLocation() {
        return { x: 10, y: 10 };
      },
      async getSize() {
        return { width: 50, height: 40 };
      },
      async isClickable() {
        return true;
      },
      async isEnabled() {
        return true;
      },
      async isSelected() {
        return false;
      },
      async isDisplayed() {
        return true;
      },
    };
    Object.assign(driver, {
      async $() {
        return element;
      },
      async $$() {
        return [element];
      },
      async pause() {},
      async execute(fn) {
        const src = typeof fn === "function" ? fn.toString() : "";
        if (src.includes("getBoundingClientRect"))
          return { x: 10, y: 10, width: 50, height: 40 };
        if (src.includes("devicePixelRatio")) return 1;
        return { width: 1200, height: 800 };
      },
    });
    const result = await saveScreenshot({
      config,
      step: {
        stepId: "crop",
        screenshot: { path: file, crop: { selector: "#el" }, maxVariation: 1 },
      },
      driver,
    });
    assert.equal(result.outputs.cropElementFound, true);
    assert.deepEqual(driver.calls, []);
  });
});
