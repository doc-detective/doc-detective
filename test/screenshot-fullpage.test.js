// `screenshot.fullPage` and `screenshot.animations` (ADR 01224). Runs the real
// saveScreenshot pipeline against fake drivers, one per capture path, so the
// calls each browser gets are visible.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { saveScreenshot } from "../dist/core/tests/saveScreenshot.js";

const require = createRequire(import.meta.url);

let sharp;
try {
  const mod = require("sharp");
  sharp = mod && (mod.default ?? mod);
} catch {
  sharp = null;
}

const WHITE = { r: 255, g: 255, b: 255 };

async function makePng(width, height, block) {
  let image = sharp({ create: { width, height, channels: 3, background: WHITE } });
  if (block) {
    const patch = await sharp({
      create: { width: block.width, height: block.height, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();
    image = image.composite([{ input: patch, left: block.x, top: block.y }]);
  }
  return image.png().toBuffer();
}

function fakeElement() {
  return {
    elementId: "el-1",
    async waitForExist() {
      return true;
    },
    async isExisting() {
      return true;
    },
    async getText() {
      return "3 December";
    },
    async getComputedLabel() {
      return "3 December";
    },
    async getAttribute() {
      return null;
    },
    async getLocation() {
      return { x: 100, y: 100 };
    },
    async getSize() {
      return { width: 200, height: 50 };
    },
    async getTagName() {
      return "span";
    },
    async getHTML() {
      return "<span>3 December</span>";
    },
    async getValue() {
      return "";
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
}

// An 800×600 viewport over a 1600px-tall page, scrolled to `scrollY`. The
// window is the viewport plus 100px of browser chrome, and `maxViewport` caps
// how tall the viewport can grow, like a headed browser on a small screen.
function fakeDriver({
  browserName = "chrome",
  isBidi = false,
  viewportCapture,
  pageCapture,
  pageHeight = 1600,
  scrollY = 0,
  maxViewport = Infinity,
  rect = { x: 100, y: 100, width: 200, height: 50 },
  throwOnCapture = false,
} = {}) {
  const calls = [];
  const window = { width: 800, height: 700 };
  let scroll = { x: 0, y: scrollY };
  const viewport = () => ({ width: window.width, height: Math.min(window.height - 100, maxViewport) });
  const element = fakeElement();
  return {
    calls,
    capabilities: { browserName },
    isBidi,
    get scroll() {
      return scroll;
    },
    window,
    async takeScreenshot() {
      calls.push({ kind: "takeScreenshot", viewport: viewport() });
      if (throwOnCapture) throw new Error("session gone");
      return (viewport().height >= pageHeight ? pageCapture : viewportCapture).toString("base64");
    },
    async fullPageScreenshot() {
      calls.push({ kind: "fullPageScreenshot" });
      return pageCapture.toString("base64");
    },
    async browsingContextCaptureScreenshot(params) {
      calls.push({ kind: "bidiCapture", params });
      return { data: pageCapture.toString("base64") };
    },
    async getWindowHandle() {
      return "ctx-1";
    },
    async getWindowSize() {
      return { ...window };
    },
    async setWindowSize(width, height) {
      calls.push({ kind: "setWindowSize", width, height });
      window.width = width;
      window.height = height;
      // A viewport as tall as the page can't scroll.
      if (viewport().height >= pageHeight) scroll = { x: 0, y: 0 };
    },
    async pause() {},
    async $$() {
      return [element];
    },
    async $() {
      return element;
    },
    async execute(fn, ...args) {
      const source = String(fn);
      calls.push({ kind: "execute", source, args });
      if (source.includes("scrollTo")) {
        scroll = { x: args[0], y: args[1] };
        return undefined;
      }
      if (source.includes("scrollHeight")) {
        return { x: scroll.x, y: scroll.y, height: pageHeight, viewportHeight: viewport().height };
      }
      if (source.includes("getBoundingClientRect")) return { ...rect, y: rect.y - scroll.y };
      if (source.includes("innerHeight")) return viewport();
      if (source.includes("innerWidth")) return viewport().width;
      if (source.includes("devicePixelRatio")) return 1;
      return undefined;
    },
  };
}

describe("screenshot fullPage and animations", function () {
  this.timeout(20000);

  let dir;
  let viewportCapture;
  let pageCapture;
  before(async function () {
    if (!sharp) this.skip();
    viewportCapture = await makePng(800, 600);
    pageCapture = await makePng(800, 1600);
  });
  beforeEach(function () {
    if (!sharp) this.skip();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-fullpage-"));
  });
  afterEach(function () {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  function run(screenshot, driver) {
    return saveScreenshot({
      config: {},
      step: { stepId: "f1", screenshot: { path: path.join(dir, "page.png"), ...screenshot } },
      driver,
    });
  }

  async function savedHeight() {
    return (await sharp(path.join(dir, "page.png")).metadata()).height;
  }

  const kinds = (driver) => driver.calls.map((c) => c.kind).filter((k) => k !== "execute");

  it("captures the whole page through geckodriver in Firefox", async function () {
    const driver = fakeDriver({ browserName: "firefox", viewportCapture, pageCapture });
    const result = await run({ fullPage: true }, driver);
    assert.equal(result.status, "PASS", result.description);
    assert.deepEqual(kinds(driver), ["fullPageScreenshot"]);
    assert.equal(await savedHeight(), 1600);
  });

  it("captures the document over BiDi when the session has a socket", async function () {
    const driver = fakeDriver({ isBidi: true, viewportCapture, pageCapture });
    const result = await run({ fullPage: true }, driver);
    assert.equal(result.status, "PASS", result.description);
    const bidi = driver.calls.find((c) => c.kind === "bidiCapture");
    assert.deepEqual(bidi.params, { context: "ctx-1", origin: "document" });
    assert.ok(!driver.calls.some((c) => c.kind === "setWindowSize"));
    assert.equal(await savedHeight(), 1600);
  });

  it("without BiDi, grows the window to the page, captures, and puts the window and scroll back", async function () {
    const driver = fakeDriver({ viewportCapture, pageCapture, scrollY: 300 });
    const result = await run({ fullPage: true }, driver);
    assert.equal(result.status, "PASS", result.description);
    assert.equal(await savedHeight(), 1600);
    const resizes = driver.calls.filter((c) => c.kind === "setWindowSize");
    assert.deepEqual(resizes[0], { kind: "setWindowSize", width: 800, height: 1700 });
    assert.deepEqual(resizes.at(-1), { kind: "setWindowSize", width: 800, height: 700 });
    assert.deepEqual(driver.window, { width: 800, height: 700 });
    assert.deepEqual(driver.scroll, { x: 0, y: 300 });
  });

  it("skips when the screen caps the window below the page height", async function () {
    const driver = fakeDriver({ browserName: "Safari", viewportCapture, pageCapture, maxViewport: 900 });
    const result = await run({ fullPage: true }, driver);
    assert.equal(result.status, "SKIPPED", result.description);
    assert.equal(result.description, "Skipped: `safari` can't capture a page taller than the screen.");
    assert.ok(!driver.calls.some((c) => c.kind === "takeScreenshot"));
    assert.deepEqual(driver.window, { width: 800, height: 700 });
    assert.ok(!fs.existsSync(path.join(dir, "page.png")));
  });

  it("doesn't resize a page that already fits the viewport", async function () {
    const driver = fakeDriver({ viewportCapture, pageCapture: viewportCapture, pageHeight: 500 });
    const result = await run({ fullPage: true }, driver);
    assert.equal(result.status, "PASS", result.description);
    assert.deepEqual(kinds(driver), ["takeScreenshot"]);
  });

  it("without fullPage, captures the viewport as before", async function () {
    const driver = fakeDriver({ browserName: "firefox", viewportCapture, pageCapture });
    const result = await run({}, driver);
    assert.equal(result.status, "PASS", result.description);
    assert.deepEqual(kinds(driver), ["takeScreenshot"]);
    assert.equal(await savedHeight(), 600);
  });

  it("places masks at their page position, adding the scroll offset", async function () {
    // The date sits at page y 1100. The viewport is scrolled 1000px, so the
    // element reports y 100. Without the offset the mask misses the date.
    const target = path.join(dir, "page.png");
    fs.writeFileSync(target, await makePng(800, 1600));
    const capture = await makePng(800, 1600, { x: 100, y: 1100, width: 200, height: 50 });
    const screenshot = { path: target, maxVariation: 0.001, overwrite: "aboveVariation", fullPage: true };
    const compared = await saveScreenshot({
      config: {},
      step: {
        stepId: "f3",
        screenshot: { ...screenshot, mask: ["#date"] },
      },
      driver: fakeDriver({
        browserName: "firefox",
        viewportCapture,
        pageCapture: capture,
        scrollY: 1000,
        rect: { x: 100, y: 1100, width: 200, height: 50 },
      }),
    });
    assert.equal(compared.status, "PASS", compared.description);
    assert.equal(compared.outputs.maskTargetsFound, true);
    assert.equal(compared.outputs.overwritten ?? false, false);
  });

  it("`animations: disabled` freezes animations before the capture and thaws them after", async function () {
    const driver = fakeDriver({ viewportCapture, pageCapture });
    const result = await run({ animations: "disabled" }, driver);
    assert.equal(result.status, "PASS", result.description);
    const order = driver.calls.map((c) =>
      c.kind === "execute"
        ? c.source.includes("getAnimations") && c.source.includes("finish")
          ? "freeze"
          : c.source.includes("data-dd-animations") && c.source.includes("remove")
            ? "thaw"
            : "execute"
        : c.kind
    );
    const freeze = order.indexOf("freeze");
    const shot = order.indexOf("takeScreenshot");
    const thaw = order.indexOf("thaw");
    assert.ok(freeze >= 0 && freeze < shot && shot < thaw, order.join(","));
  });

  it("`animations: disabled` thaws animations even when the capture fails", async function () {
    const driver = fakeDriver({ viewportCapture, pageCapture, throwOnCapture: true });
    const result = await run({ animations: "disabled" }, driver);
    assert.equal(result.status, "FAIL");
    assert.ok(driver.calls.some((c) => c.kind === "execute" && c.source.includes("data-dd-animations") && c.source.includes("remove")));
  });

  for (const animations of [undefined, "allow"]) {
    it(`\`animations: ${animations}\` leaves animations alone`, async function () {
      const driver = fakeDriver({ viewportCapture, pageCapture });
      const result = await run(animations ? { animations } : {}, driver);
      assert.equal(result.status, "PASS", result.description);
      assert.ok(!driver.calls.some((c) => c.kind === "execute" && c.source.includes("getAnimations")));
    });
  }
});
