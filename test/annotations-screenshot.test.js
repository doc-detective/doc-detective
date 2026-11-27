// Integration coverage for `screenshot.annotations` through the real
// saveScreenshot pipeline, with a fake driver. Fixture specs can assert PASS
// and SKIPPED but never FAIL, so the guard and assertion paths have to be
// pinned here.

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

async function makePngBuffer(width, height, background = { r: 255, g: 255, b: 255 }) {
  return sharp({ create: { width, height, channels: 3, background } })
    .png()
    .toBuffer();
}

// A fake browser driver: serves a capture, reports a viewport width, and
// resolves any element to a fixed rect.
function fakeDriver(buffer, { innerWidth = 800, rect, found = true } = {}) {
  const element = { elementId: "el-1" };
  return {
    async takeScreenshot() {
      return buffer.toString("base64");
    },
    async pause() {},
    async $$() {
      return found ? [element] : [];
    },
    async $() {
      return found ? element : { error: "no such element" };
    },
    async execute(fn) {
      const source = String(fn);
      if (source.includes("getBoundingClientRect")) {
        return rect ?? { x: 100, y: 100, width: 200, height: 50 };
      }
      // The crop path asks for {innerWidth, innerHeight}; the annotation path
      // asks for the innerWidth SCALAR. Keying both off "innerWidth" made the
      // scalar query return an object, so computeScale saw a non-number and
      // silently fell back to 1:1 — hiding the whole scale path from these
      // tests. Match on innerHeight to tell them apart.
      if (source.includes("innerHeight")) {
        return { width: innerWidth, height: 600 };
      }
      if (source.includes("innerWidth")) return innerWidth;
      if (source.includes("devicePixelRatio")) return 1;
      return undefined;
    },
  };
}

// findElement resolves through the real findStrategies against this driver, so
// the element stub has to cover the surface those strategies touch —
// waitForExist for the shorthand path, the getters setElementOutputs reads.
function fakeElement({ found = true } = {}) {
  return {
    elementId: "el-1",
    async waitForExist() {
      if (!found) throw new Error("element never existed");
      return true;
    },
    async isExisting() {
      return found;
    },
    async getText() {
      return "Submit";
    },
    async getComputedLabel() {
      return "Submit";
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
      return "button";
    },
    async getHTML() {
      return "<button>Submit</button>";
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

function fakeFindableDriver(buffer, opts = {}) {
  const driver = fakeDriver(buffer, opts);
  const found = opts.found !== false;
  const element = fakeElement({ found });
  driver.$$ = async () => (found ? [element] : []);
  driver.$ = async () => element;
  return driver;
}

describe("screenshot annotations", function () {
  this.timeout(20000);

  let dir;
  beforeEach(function () {
    if (!sharp) this.skip();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-annotations-"));
  });
  afterEach(function () {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  it("composites an outline into the saved image", async function () {
    const capture = await makePngBuffer(800, 600);
    const driver = fakeFindableDriver(capture);
    const result = await saveScreenshot({
      config: {},
      step: {
        stepId: "s1",
        screenshot: {
          path: path.join(dir, "annotated.png"),
          overwrite: "true",
          annotations: [{ outline: ".submit" }],
        },
      },
      driver,
    });

    assert.equal(result.status, "PASS", result.description);
    const written = fs.readFileSync(path.join(dir, "annotated.png"));
    // The overlay must have actually changed pixels, not just not-crashed.
    assert.notEqual(written.length, capture.length);
    assert.equal(result.outputs.annotationTargetsFound, true);
    assert.equal(result.outputs.annotationsInBounds, true);
  });

  it("FAILs when an annotation target can't be found", async function () {
    // A vanished annotation is a doc bug; for blur it's a disclosure. Fail
    // rather than silently ship an unannotated image.
    const capture = await makePngBuffer(400, 300);
    const driver = fakeFindableDriver(capture, { found: false });
    const result = await saveScreenshot({
      config: {},
      step: {
        stepId: "s2",
        screenshot: {
          path: path.join(dir, "missing.png"),
          overwrite: "true",
          annotations: [{ outline: ".nope" }],
        },
      },
      driver,
    });

    assert.equal(result.status, "FAIL");
    assert.equal(result.outputs.annotationTargetsFound, false);
    assert.match(result.description, /Couldn't resolve every annotation target/);
  });

  it("applies a blur without emitting overlay markup", async function () {
    const capture = await makePngBuffer(800, 600);
    const driver = fakeFindableDriver(capture);
    const result = await saveScreenshot({
      config: {},
      step: {
        stepId: "s3",
        screenshot: {
          path: path.join(dir, "blurred.png"),
          overwrite: "true",
          annotations: [{ blur: ".secret" }],
        },
      },
      driver,
    });

    assert.equal(result.status, "PASS", result.description);
    assert.ok(fs.existsSync(path.join(dir, "blurred.png")));
  });

  it("warns when an annotation lands outside the canvas", async function () {
    const capture = await makePngBuffer(400, 300);
    const driver = fakeFindableDriver(capture, {
      rect: { x: 5000, y: 5000, width: 10, height: 10 },
    });
    const result = await saveScreenshot({
      config: {},
      step: {
        stepId: "s4",
        screenshot: {
          path: path.join(dir, "oob.png"),
          overwrite: "true",
          annotations: [{ outline: ".offscreen" }],
        },
      },
      driver,
    });

    // Still a usable image, so this is a warning rather than a failure.
    assert.equal(result.outputs.annotationsInBounds, false);
    assert.equal(result.status, "WARNING", result.description);
  });

  it("treats a position target on the canvas edge as in bounds", async function () {
    // "top-right" resolves to exactly (canvas.width, 0). That's a valid
    // placement — the renderer slides the box back on-canvas — so an
    // edge-exact point must not read as out of frame.
    const capture = await makePngBuffer(800, 600);
    const driver = fakeFindableDriver(capture);
    const result = await saveScreenshot({
      config: {},
      step: {
        stepId: "s8",
        screenshot: {
          path: path.join(dir, "edge.png"),
          overwrite: "true",
          annotations: [
            { text: { position: "top-right" }, label: "Demo" },
            { text: { position: "bottom-right" }, label: "Demo" },
          ],
        },
      },
      driver,
    });
    assert.equal(result.outputs.annotationsInBounds, true);
    assert.equal(result.status, "PASS", result.description);
  });

  it("does not warn about out-of-frame matches when `all` is set", async function () {
    // Matching EVERY element and finding some below the fold is expected, not
    // a mistake — and nothing outside the frame is in the image to leak. Only
    // a targeted annotation missing the frame is worth surfacing.
    const capture = await makePngBuffer(400, 300);
    const driver = fakeFindableDriver(capture, {
      rect: { x: 5000, y: 5000, width: 10, height: 10 },
    });
    const result = await saveScreenshot({
      config: {},
      step: {
        stepId: "s9",
        screenshot: {
          path: path.join(dir, "all-oob.png"),
          overwrite: "true",
          annotations: [{ blur: { selector: ".secret" }, all: true }],
        },
      },
      driver,
    });
    assert.equal(result.outputs.annotationsInBounds, true);
    assert.equal(result.status, "PASS", result.description);
  });

  it("scales element rects by the capture's pixel ratio", async function () {
    // A 1600px-wide capture of an 800px viewport is a 2x (Retina) shot. Scale
    // is derived from the capture rather than queried, which is what makes
    // display scaling work without a devicePixelRatio read.
    //
    // The rect is chosen so the assertion can only pass if scaling happened:
    // logical (900, 900) sits inside a 1600x1200 canvas untouched, but at 2x
    // it lands at (1800, 1800) — off-canvas. So annotationsInBounds === false
    // proves the scale was applied. (A scale-1 fallback would report true.)
    const capture = await makePngBuffer(1600, 1200);
    const driver = fakeFindableDriver(capture, {
      innerWidth: 800,
      rect: { x: 900, y: 900, width: 10, height: 10 },
    });
    const result = await saveScreenshot({
      config: {},
      step: {
        stepId: "s10",
        screenshot: {
          path: path.join(dir, "retina.png"),
          overwrite: "true",
          annotations: [{ outline: ".submit", style: { padding: 0 } }],
        },
      },
      driver,
    });

    assert.equal(
      result.outputs.annotationsInBounds,
      false,
      "expected the 2x scale to push the element off-canvas; a scale-1 fallback would report in-bounds"
    );
    const written = fs.readFileSync(path.join(dir, "retina.png"));
    const meta = await sharp(written).metadata();
    assert.equal(meta.width, 1600);
    assert.equal(meta.height, 1200);
  });

  it("keeps a 1:1 capture unscaled", async function () {
    // Same element, same canvas, but a viewport that matches the capture ->
    // scale 1, so the rect stays where it is and lands in bounds. Pairs with
    // the test above to pin both sides of the scale computation.
    const capture = await makePngBuffer(1600, 1200);
    const driver = fakeFindableDriver(capture, {
      innerWidth: 1600,
      rect: { x: 900, y: 900, width: 10, height: 10 },
    });
    const result = await saveScreenshot({
      config: {},
      step: {
        stepId: "s10b",
        screenshot: {
          path: path.join(dir, "onex.png"),
          overwrite: "true",
          annotations: [{ outline: ".submit", style: { padding: 0 } }],
        },
      },
      driver,
    });
    assert.equal(result.outputs.annotationsInBounds, true);
    assert.equal(result.status, "PASS", result.description);
  });

  it("rejects `all` on an app surface rather than under-redacting", async function () {
    // The app find path resolves ONE element, so honoring `all` there would
    // annotate the first match and silently skip the rest — a shot that looks
    // redacted but isn't. Pinned here because a fixture can't assert FAIL.
    const { allTargetError } = await import(
      "../dist/core/annotations/geometry.js"
    );
    const message = allTargetError({ elementText: "Account ID" }, true, true);
    assert.ok(message, "all:true on an app surface must be refused");
    assert.match(message, /isn't supported on app surfaces/);
    // The same target is fine on a browser surface.
    assert.equal(allTargetError({ elementText: "Account ID" }, true, false), null);
    // And `all: false` is unaffected on either.
    assert.equal(allTargetError({ elementText: "Account ID" }, false, true), null);
  });

  it("rejects `all` with a bare string target", async function () {
    const capture = await makePngBuffer(400, 300);
    const driver = fakeFindableDriver(capture);
    const result = await saveScreenshot({
      config: {},
      step: {
        stepId: "s5",
        screenshot: {
          path: path.join(dir, "all.png"),
          overwrite: "true",
          annotations: [{ blur: ".secret", all: true }],
        },
      },
      driver,
    });
    // `.secret` is a string target — ambiguous for a redaction that must match
    // every element.
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /needs an explicit target object/);
  });

  it("honors a config-level annotationDefaults theme", async function () {
    const capture = await makePngBuffer(800, 600);
    const driver = fakeFindableDriver(capture);
    const result = await saveScreenshot({
      config: { annotationDefaults: { color: "#00FF00", strokeWidth: 6 } },
      step: {
        stepId: "s6",
        screenshot: {
          path: path.join(dir, "themed.png"),
          overwrite: "true",
          annotations: [{ outline: ".submit" }],
        },
      },
      driver,
    });
    assert.equal(result.status, "PASS", result.description);
  });

  it("leaves an un-annotated screenshot byte-identical to the capture", async function () {
    // The annotation stage must be inert when no annotations are set —
    // otherwise every existing maxVariation baseline would shift.
    const capture = await makePngBuffer(300, 200);
    const driver = fakeDriver(capture);
    const result = await saveScreenshot({
      config: {},
      step: {
        stepId: "s7",
        screenshot: { path: path.join(dir, "plain.png"), overwrite: "true" },
      },
      driver,
    });
    assert.equal(result.status, "PASS", result.description);
    const written = fs.readFileSync(path.join(dir, "plain.png"));
    assert.deepEqual(written, capture);
    assert.equal(result.outputs.annotationTargetsFound, undefined);
  });
});

// 2px black-and-white columns: the sharpest content there is, so any blur over
// it shows as a collapse in horizontal contrast.
async function makeStripedPng(width, height) {
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      raw.fill(Math.floor(x / 2) % 2 ? 255 : 0, (y * width + x) * 3, (y * width + x + 1) * 3);
    }
  }
  return sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

// Mean absolute difference between horizontal neighbors, in grey levels.
// Stripes read about 127; a blurred region reads near 0.
async function sharpness(file, { x0, y0, x1, y1 }) {
  const { data, info } = await sharp(file)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let sum = 0;
  let count = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1 - 1; x++) {
      sum += Math.abs(data[y * info.width + x + 1] - data[y * info.width + x]);
      count++;
    }
  }
  return sum / count;
}

// A page with a live `annotate` blur up. The layer draws blurs with CSS
// `backdrop-filter`, which Firefox leaves out of WebDriver screenshots, so the
// capture comes back unblurred, the way Firefox returns it. With `navigates`,
// the page loads a new document between the capture and the read.
function liveBlurDriver(buffer, { innerWidth, regions, fail = false, navigates = false }) {
  const driver = fakeDriver(buffer, { innerWidth });
  const execute = driver.execute;
  driver.state = { annotations: [{ id: "redact", spec: { blur: "#secret" } }] };
  driver.execute = async (fn, ...args) => {
    const source = String(fn);
    if (source.includes("dd-blur")) {
      if (fail) throw new Error("no such window");
      if (source.includes("requestAnimationFrame")) return true;
      if (navigates) return { viewportWidth: innerWidth, regions: [], watched: false };
      return { viewportWidth: innerWidth, regions, watched: true };
    }
    return execute(fn, ...args);
  };
  return driver;
}

describe("live annotate blurs in a screenshot", function () {
  this.timeout(20000);

  let dir;
  beforeEach(function () {
    if (!sharp) this.skip();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-live-blur-"));
  });
  afterEach(function () {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  it("burns the layer's blurs into the capture, scaled to its pixels", async function () {
    // An 800px capture of a 400px viewport is 2x, so the CSS rect (50, 50,
    // 100×100) covers image pixels 100–300, and (250, 200, 50×50) covers
    // 500–600 across and 400–500 down.
    const capture = await makeStripedPng(800, 600);
    const driver = liveBlurDriver(capture, {
      innerWidth: 400,
      regions: [
        { x: 50, y: 50, width: 100, height: 100, intensity: 14 },
        { x: 250, y: 200, width: 50, height: 50, intensity: 14 },
      ],
    });
    const file = path.join(dir, "live-blur.png");
    const result = await saveScreenshot({
      config: {},
      step: { stepId: "live1", screenshot: { path: file, overwrite: "true" } },
      driver,
    });

    assert.equal(result.status, "PASS", result.description);
    const under = await sharpness(file, { x0: 120, y0: 120, x1: 280, y1: 280 });
    const underSecond = await sharpness(file, { x0: 515, y0: 415, x1: 585, y1: 485 });
    const beside = await sharpness(file, { x0: 420, y0: 120, x1: 780, y1: 280 });
    assert.ok(under < 5, `the region under the live blur reads ${under.toFixed(2)}, so it wasn't blurred`);
    assert.ok(underSecond < 5, `the region under the second blur reads ${underSecond.toFixed(2)}, so it wasn't blurred`);
    assert.ok(beside > 120, `the region beside the blur reads ${beside.toFixed(2)}, so the blur spread past its rect`);
  });

  it("keeps the stronger blur where a weaker one overlaps it", async function () {
    // A weak blur listed after a strong one, and spread over it, as a tracked
    // blur that moved during the capture is.
    const capture = await makeStripedPng(400, 300);
    const driver = liveBlurDriver(capture, {
      innerWidth: 400,
      regions: [
        { x: 150, y: 50, width: 100, height: 100, intensity: 14 },
        { x: 0, y: 50, width: 400, height: 100, intensity: 1 },
      ],
    });
    const file = path.join(dir, "overlap.png");
    const result = await saveScreenshot({
      config: {},
      step: { stepId: "live4", screenshot: { path: file, overwrite: "true" } },
      driver,
    });

    assert.equal(result.status, "PASS", result.description);
    const overlap = await sharpness(file, { x0: 170, y0: 70, x1: 230, y1: 130 });
    assert.ok(overlap < 5, `the overlap reads ${overlap.toFixed(2)}, so the weaker blur replaced the stronger one`);
  });

  it("reads every place a tracked blur was drawn since the watch, even one it left", async function () {
    // Runs the real page code against a stand-in page. The blur is drawn at
    // x 50–150, moves to x 250–350 for one frame, and is back before the read,
    // so a screenshot in that frame shows it at x 250–350.
    const { watchBlurRegions, readBlurRegions } = await import("../dist/core/annotations/domAdapter.js");
    let left = 50;
    const blur = {
      getBoundingClientRect: () => ({ left, top: 50, right: left + 100, bottom: 150 }),
      getAttribute: () => "14",
    };
    const layer = { isConnected: true, shadowRoot: { querySelectorAll: () => [blur] } };
    const frames = [];
    const saved = ["document", "window", "requestAnimationFrame", "cancelAnimationFrame"].map((key) => [key, global[key]]);
    Object.assign(global, {
      document: { querySelector: () => layer },
      window: { innerWidth: 400 },
      requestAnimationFrame: (fn) => frames.push(fn),
      cancelAnimationFrame: () => frames.splice(0),
    });
    const driver = { execute: async (fn, ...args) => fn(...args) };
    try {
      assert.equal(await watchBlurRegions(driver), true);
      left = 250;
      frames.shift()();
      left = 50;
      frames.shift()();
      const page = await readBlurRegions(driver);
      assert.deepEqual(page.regions, [{ x: 50, y: 50, width: 300, height: 100, intensity: 14 }]);
      assert.equal(page.watched, true);
      assert.equal(frames.length, 0, "the read must stop the watch");

      // A new document's layer has no watch on it.
      const fresh = { isConnected: true, shadowRoot: { querySelectorAll: () => [] } };
      global.document = { querySelector: () => fresh };
      assert.equal((await readBlurRegions(driver)).watched, false);
    } finally {
      for (const [key, value] of saved) global[key] = value;
    }
  });

  it("keeps each frame's scroll, so whole-page blurs cover where the capture drew them", async function () {
    // A blur fixed in the viewport at y 50 while the page scrolls to 400 for
    // the captured frame and back to 0 before the read: in the document it was
    // drawn at y 50 and at y 450, so it must cover both.
    const { watchBlurRegions, readBlurRegions } = await import("../dist/core/annotations/domAdapter.js");
    const blur = {
      getBoundingClientRect: () => ({ left: 50, top: 50, right: 150, bottom: 150 }),
      getAttribute: () => "14",
    };
    const layer = { isConnected: true, shadowRoot: { querySelectorAll: () => [blur] } };
    const frames = [];
    const saved = ["document", "window", "requestAnimationFrame", "cancelAnimationFrame"].map((key) => [key, global[key]]);
    const win = { innerWidth: 400, scrollX: 0, scrollY: 0 };
    Object.assign(global, {
      document: { querySelector: () => layer },
      window: win,
      requestAnimationFrame: (fn) => frames.push(fn),
      cancelAnimationFrame: () => frames.splice(0),
    });
    const driver = { execute: async (fn, ...args) => fn(...args) };
    try {
      await watchBlurRegions(driver);
      win.scrollY = 400;
      frames.shift()();
      win.scrollY = 0;
      const page = await readBlurRegions(driver);
      assert.deepEqual(page.documentRegions, [{ x: 50, y: 50, width: 100, height: 500, intensity: 14 }]);
      assert.deepEqual(page.regions, [{ x: 50, y: 50, width: 100, height: 100, intensity: 14 }]);
    } finally {
      for (const [key, value] of saved) global[key] = value;
    }
  });

  it("FAILs rather than save the capture unblurred when the page changes before the read", async function () {
    const capture = await makeStripedPng(400, 300);
    const driver = liveBlurDriver(capture, {
      innerWidth: 400,
      regions: [{ x: 50, y: 50, width: 100, height: 100, intensity: 14 }],
      navigates: true,
    });
    const file = path.join(dir, "navigated.png");
    const result = await saveScreenshot({
      config: {},
      step: { stepId: "live5", screenshot: { path: file, overwrite: "true" } },
      driver,
    });

    assert.equal(result.status, "FAIL");
    assert.match(result.description, /Couldn't read where the live `blur` annotations are on the page\. The page changed during the screenshot\./);
    assert.equal(fs.existsSync(file), false);
  });

  it("FAILs rather than save the capture unblurred when the page won't report its blurs", async function () {
    const capture = await makeStripedPng(400, 300);
    const driver = liveBlurDriver(capture, { innerWidth: 400, regions: [], fail: true });
    const file = path.join(dir, "unreadable.png");
    const result = await saveScreenshot({
      config: {},
      step: { stepId: "live2", screenshot: { path: file, overwrite: "true" } },
      driver,
    });

    assert.equal(result.status, "FAIL");
    assert.match(result.description, /Couldn't read where the live `blur` annotations are on the page\. \S/);
    assert.equal(fs.existsSync(file), false);
  });
});
