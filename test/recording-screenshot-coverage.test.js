import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import sinon from "sinon";

import {
  clampCropRect,
  aspectRatiosMatch,
  saveScreenshot,
} from "../dist/core/tests/saveScreenshot.js";
import { startRecording } from "../dist/core/tests/startRecording.js";
import { stopRecording } from "../dist/core/tests/stopRecording.js";
import { browserDownloadDir } from "../dist/core/tests/ffmpegRecorder.js";

const require = createRequire(import.meta.url);

// Lazily resolve sharp; the saveScreenshot crop/compare tests that need real
// image encoding are skipped when the heavy dep isn't installed.
let sharp;
try {
  const mod = require("sharp");
  sharp = mod && (mod.default ?? mod);
} catch {
  sharp = null;
}

async function makePngBuffer(width, height, { r, g, b } = { r: 255, g: 0, b: 0 }) {
  return sharp({
    create: { width, height, channels: 3, background: { r, g, b } },
  })
    .png()
    .toBuffer();
}

// A fully-featured fake WebDriverIO element so findElement's setElementOutputs
// (which calls getText/getHTML/getTagName/getValue/getLocation/getSize/…) runs
// without throwing. Callers override location/size for the crop geometry.
function makeFakeElement({ location = { x: 0, y: 0 }, size = { width: 10, height: 10 } } = {}) {
  return {
    elementId: "el-fake",
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
      return location;
    },
    async getSize() {
      return size;
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

// A fake WebDriver whose saveScreenshot writes a chosen PNG buffer to the
// target path. Optional overrides let individual tests supply crop-related
// hooks (execute/getLocation/getSize/pause) without a real browser.
function fakeDriver(buffer, overrides = {}) {
  return {
    async saveScreenshot(filePath) {
      fs.writeFileSync(filePath, buffer);
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Pure helpers — clampCropRect (exhaustive) + aspectRatiosMatch (tolerance).
// These extend, not duplicate, test/saveScreenshot.test.js: they cover edge
// cases (exact fit, zero-offset, simultaneous width+height overflow, tolerance
// boundary) not asserted there.
// ---------------------------------------------------------------------------
describe("recording/screenshot coverage: pure helpers", function () {
  describe("clampCropRect (edge cases)", function () {
    it("leaves an exact-fit rect (width==imgW, height==imgH) untouched", function () {
      const r = clampCropRect({ x: 0, y: 0, width: 100, height: 50 }, 100, 50);
      assert.deepEqual(r, { x: 0, y: 0, width: 100, height: 50 });
    });

    it("shrinks BOTH axes when the rect exceeds the image in width and height", function () {
      const r = clampCropRect(
        { x: 30, y: 40, width: 5000, height: 6000 },
        800,
        600,
      );
      assert.deepEqual(r, { x: 0, y: 0, width: 800, height: 600 });
    });

    it("shifts on x while shrinking on y simultaneously", function () {
      // width fits (shift left needed), height overflows the image (shrink).
      const r = clampCropRect(
        { x: 950, y: 10, width: 100, height: 5000 },
        1000,
        400,
      );
      assert.equal(r.x, 900); // 1000 - 100
      assert.equal(r.width, 100);
      assert.equal(r.y, 0);
      assert.equal(r.height, 400);
    });

    it("does not move a rect that ends exactly at the right/bottom edge", function () {
      const r = clampCropRect(
        { x: 900, y: 300, width: 100, height: 100 },
        1000,
        400,
      );
      assert.deepEqual(r, { x: 900, y: 300, width: 100, height: 100 });
    });

    it("handles a zero-sized rect (no NaN, stays in bounds)", function () {
      const r = clampCropRect({ x: -5, y: -5, width: 0, height: 0 }, 100, 100);
      assert.deepEqual(r, { x: 0, y: 0, width: 0, height: 0 });
    });
  });

  describe("aspectRatiosMatch (tolerance boundary)", function () {
    it("accepts a ratio difference exactly at the 5% boundary", function () {
      // ra=1 (100/100); rb such that (rb-ra)/rb == 0.05 -> rb = 1/0.95.
      // Use 100x95 -> rb = 1.0526..., diff/max = 0.05 exactly -> <= 0.05 true.
      assert.equal(
        aspectRatiosMatch({ width: 100, height: 100 }, { width: 100, height: 95 }),
        true,
      );
    });

    it("rejects a ratio difference just past 5%", function () {
      assert.equal(
        aspectRatiosMatch({ width: 100, height: 100 }, { width: 100, height: 90 }),
        false,
      );
    });

    it("is symmetric in argument order", function () {
      const a = { width: 199, height: 27 };
      const b = { width: 199, height: 32 };
      assert.equal(aspectRatiosMatch(a, b), aspectRatiosMatch(b, a));
    });
  });
});

// ---------------------------------------------------------------------------
// saveScreenshot — branches not covered by test/saveScreenshot.test.js.
// All hermetic: fake driver + real sharp/pngjs on locally-constructed PNGs.
// ---------------------------------------------------------------------------
const describeIfSharp = sharp ? describe : describe.skip;

describeIfSharp("saveScreenshot: extra branches", function () {
  this.timeout(20000);
  let tmpDir;
  const config = {};

  beforeEach(function () {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-shot-cov-"));
  });
  afterEach(function () {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    sinon.restore();
  });

  it("FAILs on an invalid step definition (missing required shape)", async function () {
    const buf = await makePngBuffer(10, 10);
    const result = await saveScreenshot({
      config,
      // A step that is not a valid step_v3 object.
      step: { stepId: "x", screenshot: 12345 },
      driver: fakeDriver(buf),
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /Invalid step definition/);
  });

  it("boolean screenshot:true derives a <stepId>.png path under cwd-relative dir", async function () {
    const buf = await makePngBuffer(12, 12);
    const stepId = `bool_${Date.now()}`;
    const result = await saveScreenshot({
      config,
      step: { stepId, screenshot: true },
      driver: fakeDriver(buf),
    });
    assert.equal(result.status, "PASS");
    assert.ok(result.outputs.screenshotPath.endsWith(`${stepId}.png`));
    // Clean up the file written into the current working directory.
    try {
      fs.unlinkSync(result.outputs.screenshotPath);
    } catch {
      /* ignore */
    }
  });

  it("string screenshot form is coerced to { path } and captured", async function () {
    const target = path.join(tmpDir, "as-string.png");
    const buf = await makePngBuffer(20, 16);
    const result = await saveScreenshot({
      config,
      step: { stepId: "str1", screenshot: target },
      driver: fakeDriver(buf),
    });
    assert.equal(result.status, "PASS");
    assert.equal(result.outputs.screenshotPath, target);
    assert.ok(fs.existsSync(target));
  });

  it("new capture (no reference) preserves sourceIntegration on the output", async function () {
    const target = path.join(tmpDir, "new-si.png");
    const buf = await makePngBuffer(24, 18);
    const result = await saveScreenshot({
      config,
      step: {
        stepId: "newsi",
        screenshot: {
          path: target,
          sourceIntegration: { type: "heretto", integrationName: "z" },
        },
      },
      driver: fakeDriver(buf),
    });
    assert.equal(result.status, "PASS");
    assert.equal(result.outputs.changed, true);
    assert.deepEqual(result.outputs.sourceIntegration, {
      type: "heretto",
      integrationName: "z",
    });
  });

  it("screenshot.directory (no path) resolves <stepId>.png under that directory", async function () {
    const subdir = path.join(tmpDir, "shots");
    const buf = await makePngBuffer(16, 16);
    const result = await saveScreenshot({
      config,
      step: { stepId: "dirshot", screenshot: { directory: subdir } },
      driver: fakeDriver(buf),
    });
    assert.equal(result.status, "PASS");
    assert.ok(result.outputs.screenshotPath.startsWith(subdir));
    assert.ok(result.outputs.screenshotPath.endsWith("dirshot.png"));
    assert.ok(fs.existsSync(result.outputs.screenshotPath));
  });

  it("resizes a same-aspect reference of different dimensions before diffing", async function () {
    const target = path.join(tmpDir, "resize.png");
    // Reference 200x100 (2:1); new capture 100x50 (2:1) — aspect matches, but
    // dimensions differ, exercising the sharp resize-to-common-size path.
    const refBuf = await makePngBuffer(200, 100, { r: 10, g: 20, b: 30 });
    const newBuf = await makePngBuffer(100, 50, { r: 10, g: 20, b: 30 });
    fs.writeFileSync(target, refBuf);
    const result = await saveScreenshot({
      config,
      step: {
        stepId: "resize1",
        screenshot: { path: target, maxVariation: 0.05, overwrite: "aboveVariation" },
      },
      driver: fakeDriver(newBuf),
    });
    // Same solid color at both sizes -> near-zero diff -> within variation.
    assert.equal(result.status, "PASS");
    assert.equal(result.outputs.aspectRatioMatch, true);
    assert.equal(typeof result.outputs.variation, "number");
  });

  it("FAILs when driver.saveScreenshot throws (capture error, no assertions)", async function () {
    const target = path.join(tmpDir, "boom.png");
    const result = await saveScreenshot({
      config,
      step: { stepId: "boom", screenshot: { path: target } },
      driver: {
        async saveScreenshot() {
          throw new Error("device lost");
        },
      },
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /Couldn't save screenshot/);
  });

  it("FAILs to fetch a private/unreachable URL reference (offline SSRF guard)", async function () {
    // A private-loopback URL fails the public-host guard / connection before any
    // network round-trip, so this is deterministic offline.
    const buf = await makePngBuffer(10, 10);
    const result = await saveScreenshot({
      config,
      step: {
        stepId: "urlfail",
        screenshot: { path: "http://127.0.0.1:1/ref.png" },
      },
      driver: fakeDriver(buf),
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /Couldn't fetch remote reference image/);
    // The redacted URL must not leak a path beyond the origin+pathname.
    assert.match(result.description, /127\.0\.0\.1/);
  });

  it("preserves sourceIntegration on over-variation (aboveVariation) replace", async function () {
    const target = path.join(tmpDir, "shot.png");
    const refBuf = await makePngBuffer(100, 80, { r: 255, g: 0, b: 0 });
    const newBuf = await makePngBuffer(100, 80, { r: 0, g: 0, b: 255 });
    fs.writeFileSync(target, refBuf);
    const result = await saveScreenshot({
      config,
      step: {
        stepId: "si1",
        screenshot: {
          path: target,
          maxVariation: 0.05,
          overwrite: "aboveVariation",
          sourceIntegration: { type: "heretto", integrationName: "my-heretto" },
        },
      },
      driver: fakeDriver(newBuf),
    });
    assert.equal(result.status, "WARNING");
    assert.equal(result.outputs.changed, true);
    assert.deepEqual(result.outputs.sourceIntegration, {
      type: "heretto",
      integrationName: "my-heretto",
    });
  });

  it("within-variation carries sourceIntegration and deletes the temp capture", async function () {
    const target = path.join(tmpDir, "shot.png");
    const buf = await makePngBuffer(60, 40);
    fs.writeFileSync(target, buf);
    const filesBefore = fs.readdirSync(tmpDir).length;
    const result = await saveScreenshot({
      config,
      step: {
        stepId: "si2",
        screenshot: {
          path: target,
          maxVariation: 0.05,
          overwrite: "aboveVariation",
          sourceIntegration: { type: "heretto", integrationName: "x" },
        },
      },
      driver: fakeDriver(buf),
    });
    assert.equal(result.status, "PASS");
    assert.deepEqual(result.outputs.sourceIntegration, {
      type: "heretto",
      integrationName: "x",
    });
    // The temp capture was unlinked; only the original reference remains.
    assert.equal(fs.readdirSync(tmpDir).length, filesBefore);
  });

  it("overwrite:true preserves sourceIntegration on the fast-path replace", async function () {
    const target = path.join(tmpDir, "shot.png");
    const refBuf = await makePngBuffer(30, 20, { r: 255, g: 0, b: 0 });
    const newBuf = await makePngBuffer(30, 20, { r: 0, g: 255, b: 0 });
    fs.writeFileSync(target, refBuf);
    const result = await saveScreenshot({
      config,
      step: {
        stepId: "si3",
        screenshot: {
          path: target,
          overwrite: "true",
          sourceIntegration: { type: "heretto", integrationName: "y" },
        },
      },
      driver: fakeDriver(newBuf),
    });
    assert.equal(result.status, "PASS");
    assert.deepEqual(result.outputs.sourceIntegration, {
      type: "heretto",
      integrationName: "y",
    });
    assert.equal(result.outputs.changed, true);
  });

  // --- crop paths -----------------------------------------------------------
  // A crop-capable fake driver: findElement runs for real against this driver.
  // findElement resolves an element via driver.$/$$ etc.; to keep this
  // hermetic we drive the "element not found" and "found + fits/!fits" paths
  // through the driver hooks the code reads after findElement.

  it("crop element not found -> FAIL with a cropElementFound assertion", async function () {
    const target = path.join(tmpDir, "crop-miss.png");
    const buf = await makePngBuffer(200, 150);
    // driver.$ returns an element with no elementId -> findElement FAILs to
    // locate, so saveScreenshot reports "Couldn't find element to crop."
    const driver = fakeDriver(buf, {
      async $() {
        return { elementId: undefined, error: { error: "no such element" } };
      },
      async $$() {
        return [];
      },
      async execute() {
        return { width: 800, height: 600 };
      },
    });
    const result = await saveScreenshot({
      config,
      step: {
        stepId: "cropmiss",
        screenshot: { path: target, crop: { selector: "#nope" } },
      },
      driver,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /Couldn't find element to crop/);
    assert.equal(result.outputs.cropElementFound, false);
    assert.deepEqual(result.assertions, [
      {
        statement: "$$outputs.cropElementFound == true",
        source: "implicit",
        result: "FAIL",
      },
    ]);
  });

  it("crop element larger than viewport -> FAIL with a fitsViewport assertion", async function () {
    const target = path.join(tmpDir, "crop-toobig.png");
    const buf = await makePngBuffer(200, 150);
    const fakeEl = makeFakeElement({
      location: { x: 0, y: 0 },
      size: { width: 5000, height: 5000 },
    });
    const driver = fakeDriver(buf, {
      async $() {
        return fakeEl;
      },
      async $$() {
        return [fakeEl];
      },
      // findElement + the viewport read both go through execute; return a small
      // viewport so the huge element can't fit.
      async execute() {
        return { width: 300, height: 200 };
      },
    });
    const result = await saveScreenshot({
      config,
      step: {
        stepId: "croptoobig",
        screenshot: { path: target, crop: { selector: "#big" } },
      },
      driver,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /can't fit in viewport/);
    assert.equal(result.outputs.fitsViewport, false);
    // cropElementFound passed, fitsViewport failed.
    assert.deepEqual(result.assertions, [
      {
        statement: "$$outputs.cropElementFound == true",
        source: "implicit",
        result: "PASS",
      },
      {
        statement: "$$outputs.fitsViewport == true",
        source: "implicit",
        result: "FAIL",
      },
    ]);
  });

  it("crop success -> captures, extracts via sharp, and PASSes", async function () {
    const target = path.join(tmpDir, "crop-ok.png");
    const buf = await makePngBuffer(400, 300);
    const fakeEl = makeFakeElement({
      location: { x: 10, y: 10 },
      size: { width: 50, height: 40 },
    });
    // execute is called for several distinct purposes; branch on the source
    // string of the passed function so each returns a sane shape.
    const driver = fakeDriver(buf, {
      async $() {
        return fakeEl;
      },
      async $$() {
        return [fakeEl];
      },
      async pause() {},
      async execute(fn) {
        const src = typeof fn === "function" ? fn.toString() : "";
        if (src.includes("innerWidth") && src.includes("innerHeight") && !src.includes("devicePixelRatio")) {
          return { width: 800, height: 600 };
        }
        if (src.includes("devicePixelRatio")) return 1;
        if (src.includes("getBoundingClientRect")) {
          return { x: 10, y: 10, width: 50, height: 40 };
        }
        // scrollIntoView / scrollBy and any other no-op executes.
        return undefined;
      },
    });
    const result = await saveScreenshot({
      config,
      step: {
        stepId: "cropok",
        screenshot: { path: target, crop: { selector: "#ok", padding: 5 } },
      },
      driver,
    });
    assert.equal(result.status, "PASS");
    assert.ok(fs.existsSync(target));
    // The saved file is the cropped image; its dimensions reflect rect+padding.
    const meta = await sharp(target).metadata();
    assert.equal(meta.width, 60); // 50 + 5 + 5
    assert.equal(meta.height, 50); // 40 + 5 + 5
    assert.equal(result.outputs.cropElementFound, true);
    assert.equal(result.outputs.fitsViewport, true);
  });

  it("crop that resolves to a zero-size rect -> FAIL from sharp extract", async function () {
    const target = path.join(tmpDir, "crop-zero.png");
    const buf = await makePngBuffer(200, 150);
    const fakeEl = makeFakeElement({
      location: { x: 5, y: 5 },
      size: { width: 10, height: 10 },
    });
    const driver = fakeDriver(buf, {
      async $() {
        return fakeEl;
      },
      async $$() {
        return [fakeEl];
      },
      async pause() {},
      async execute(fn) {
        const src = typeof fn === "function" ? fn.toString() : "";
        if (src.includes("innerWidth") && !src.includes("devicePixelRatio")) {
          return { width: 800, height: 600 };
        }
        if (src.includes("devicePixelRatio")) return 1;
        if (src.includes("getBoundingClientRect")) {
          // A zero-width/height rect makes sharp.extract throw.
          return { x: 5, y: 5, width: 0, height: 0 };
        }
        return undefined;
      },
    });
    const result = await saveScreenshot({
      config,
      step: {
        stepId: "cropzero",
        screenshot: { path: target, crop: { selector: "#zero", padding: 0 } },
      },
      driver,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /Couldn't crop image/);
  });

  it("hides and restores the synthetic cursor when a recording is active", async function () {
    const target = path.join(tmpDir, "cursor.png");
    const buf = await makePngBuffer(24, 24);
    const executed = [];
    const driver = fakeDriver(buf, {
      // isRecordingActive(driver) reads driver.state.recordings.length > 0.
      state: { recordings: [{ id: "r1" }] },
      async execute(fn) {
        executed.push(typeof fn === "function" ? fn.toString() : String(fn));
        return undefined;
      },
    });
    const result = await saveScreenshot({
      config,
      step: { stepId: "cur", screenshot: { path: target } },
      driver,
    });
    assert.equal(result.status, "PASS");
    // Cursor was hidden (display none) before capture and restored (block) after.
    assert.ok(executed.some((s) => s.includes('"none"') || s.includes("'none'")));
    assert.ok(executed.some((s) => s.includes('"block"') || s.includes("'block'")));
  });
});

// ---------------------------------------------------------------------------
// startRecording — guard/skip/error branches that return BEFORE any real
// ffmpeg spawn, plus the browser-engine path (pure driver mocking, no spawn).
// The real-ffmpeg-spawn path is intentionally NOT exercised (see notes).
// ---------------------------------------------------------------------------
describe("startRecording: guards + browser engine", function () {
  this.timeout(15000);
  let tmpDir;
  const config = {};

  beforeEach(function () {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-startrec-"));
  });
  afterEach(function () {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    sinon.restore();
  });

  it("FAILs on an invalid step definition", async function () {
    const result = await startRecording({
      config,
      context: {},
      step: { stepId: "x", record: 12345 },
      driver: {},
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /Invalid step definition/);
  });

  it("record:false -> SKIPPED", async function () {
    const result = await startRecording({
      config,
      context: {},
      step: { stepId: "x", record: false },
      driver: {},
    });
    assert.equal(result.status, "SKIPPED");
    assert.match(result.description, /record: false/);
  });

  it("existing target file + overwrite:false -> SKIPPED", async function () {
    const target = path.join(tmpDir, "exists.mp4");
    fs.writeFileSync(target, "stub");
    const result = await startRecording({
      config,
      context: {},
      step: { stepId: "x", record: { path: target, overwrite: "false" } },
      driver: {},
    });
    assert.equal(result.status, "SKIPPED");
    assert.match(result.description, /File already exists/);
  });

  it("target already claimed by an active recording -> SKIPPED", async function () {
    const target = path.join(tmpDir, "busy.mp4");
    const driver = {
      state: {
        recordings: [{ type: "ffmpeg", targetPath: target }],
      },
    };
    const result = await startRecording({
      config,
      context: {},
      step: { stepId: "x", record: { path: target } },
      driver,
    });
    assert.equal(result.status, "SKIPPED");
    assert.match(result.description, /already in use by an active recording/);
  });

  it("browser engine in headless mode -> SKIPPED", async function () {
    const target = path.join(tmpDir, "h.mp4");
    const result = await startRecording({
      config,
      context: { browser: { name: "chrome", headless: true } },
      step: { stepId: "x", record: { path: target, engine: "browser" } },
      driver: {},
    });
    assert.equal(result.status, "SKIPPED");
    assert.match(result.description, /headless mode with the browser engine/);
  });

  it("browser engine on non-chrome -> SKIPPED", async function () {
    const target = path.join(tmpDir, "ff.mp4");
    const result = await startRecording({
      config,
      context: { browser: { name: "firefox", headless: false } },
      step: { stepId: "x", record: { path: target, engine: "browser" } },
      driver: {},
    });
    assert.equal(result.status, "SKIPPED");
    assert.match(result.description, /requires Chrome/);
  });

  it("ffmpeg engine headless without a virtual display -> SKIPPED", async function () {
    const target = path.join(tmpDir, "ff-headless.mp4");
    const result = await startRecording({
      config,
      context: { browser: { name: "firefox", headless: true } },
      step: { stepId: "x", record: { path: target, engine: "ffmpeg" } },
      driver: {},
    });
    assert.equal(result.status, "SKIPPED");
    assert.match(result.description, /without a virtual display/);
  });

  it("record:true boolean is coerced to a <stepId>.mp4 path (headless ffmpeg SKIP)", async function () {
    // record:true -> { path: "<stepId>.mp4" }. We route to the ffmpeg engine and
    // make the context headless with no display so it SKIPs before spawning.
    const result = await startRecording({
      config,
      context: { browser: { name: "firefox", headless: true } },
      step: { stepId: "boolrec", record: true },
      driver: {},
    });
    assert.equal(result.status, "SKIPPED");
    assert.match(result.description, /without a virtual display/);
  });

  it("record string form is coerced to { path } (headless ffmpeg SKIP)", async function () {
    const rel = `str-${Date.now()}.mp4`;
    const result = await startRecording({
      config,
      context: { browser: { name: "firefox", headless: true } },
      step: { stepId: "strrec", record: rel },
      driver: {},
    });
    assert.equal(result.status, "SKIPPED");
    // The relative path's parent (".") already exists, so no mkdir side effect.
    assert.match(result.description, /without a virtual display/);
  });

  it("record.directory resolves the default path under that directory (headless ffmpeg SKIP)", async function () {
    const subdir = path.join(tmpDir, "nested", "vids");
    const result = await startRecording({
      config,
      context: { browser: { name: "firefox", headless: true } },
      step: {
        stepId: "dirrec",
        record: { directory: subdir },
      },
      driver: {},
    });
    assert.equal(result.status, "SKIPPED");
    assert.match(result.description, /without a virtual display/);
    // The directory was created as a side effect of the path resolution + mkdir.
    assert.ok(fs.existsSync(subdir));
  });

  // A fake driver for the browser-engine happy/fail paths. instantiateCursor
  // is satisfied by driver.$ returning an already-instantiated cursor
  // (truthy elementId) so it skips the DOM/performActions work.
  function browserDriver({ recorderStarted = true } = {}) {
    let title = "Original Title";
    return {
      state: {},
      async getTitle() {
        return title;
      },
      async getWindowHandle() {
        return "orig-handle";
      },
      async waitUntil() {
        return true;
      },
      async $() {
        return { elementId: "cursor-exists" };
      },
      async execute(fn, arg) {
        // document.title setter: (title) => (document.title = title)
        if (typeof fn === "function" && fn.length >= 1 && typeof arg === "string") {
          title = arg;
        }
        return undefined;
      },
      async createWindow() {
        return { handle: "recorder-handle" };
      },
      async switchToWindow() {},
      async url() {},
      async executeAsync() {
        return recorderStarted;
      },
      async closeWindow() {},
    };
  }

  it("browser engine success -> PASS with a MediaRecorder recording handle", async function () {
    const target = path.join(tmpDir, "browser-ok.mp4");
    const result = await startRecording({
      config,
      context: { browser: { name: "chrome", headless: false }, contextId: "ctx-a" },
      step: { stepId: "brok", record: { path: target, engine: "browser" } },
      driver: browserDriver({ recorderStarted: true }),
    });
    assert.equal(result.status, "PASS");
    assert.ok(result.recording);
    assert.equal(result.recording.type, "MediaRecorder");
    assert.equal(result.recording.tab, "recorder-handle");
    assert.equal(result.recording.targetPath, target);
    assert.ok(result.recording.downloadPath.endsWith(".webm"));
  });

  it("browser engine removes a stale download from a prior crashed run", async function () {
    const contextId = `ctx-stale-${Date.now()}`;
    const baseName = "brstale";
    const target = path.join(tmpDir, `${baseName}.mp4`);
    // Pre-create a stale <baseName>.webm in the per-context download dir so the
    // unlink branch runs.
    const downloadDir = browserDownloadDir(contextId);
    fs.mkdirSync(downloadDir, { recursive: true });
    const stale = path.join(downloadDir, `${baseName}.webm`);
    fs.writeFileSync(stale, "stale bytes");
    assert.ok(fs.existsSync(stale));
    const result = await startRecording({
      config,
      context: { browser: { name: "chrome", headless: false }, contextId },
      step: { stepId: "brstale-step", record: { path: target, engine: "browser" } },
      driver: browserDriver({ recorderStarted: true }),
    });
    assert.equal(result.status, "PASS");
    // The stale file was removed before recording started.
    assert.equal(fs.existsSync(stale), false);
  });

  it("browser engine getDisplayMedia rejection -> FAIL and restores the original tab", async function () {
    const target = path.join(tmpDir, "browser-fail.mp4");
    const result = await startRecording({
      config,
      context: { browser: { name: "chrome", headless: false }, contextId: "ctx-b" },
      step: { stepId: "brfail", record: { path: target, engine: "browser" } },
      driver: browserDriver({ recorderStarted: false }),
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /Failed to start recording/);
    assert.equal(result.recording, undefined);
  });

  it("second browser-engine recording falls back to ffmpeg (warns), then skips if headless-like guard", async function () {
    // A browser plan with an already-active MediaRecorder recording triggers the
    // ffmpeg fallback. We keep it hermetic by making the context headless with no
    // virtual display so it lands on the ffmpeg headless SKIPPED guard rather
    // than spawning a real ffmpeg. This exercises the fallback branch + warning.
    const target = path.join(tmpDir, "fallback.mp4");
    const warnings = [];
    const capturingConfig = {
      logger: (level, msg) => warnings.push(`${level}:${msg}`),
    };
    const driver = {
      state: { recordings: [{ type: "MediaRecorder" }] },
    };
    const result = await startRecording({
      config: capturingConfig,
      context: {
        browser: { name: "chrome", headless: true },
        contextId: "ctx-c",
      },
      step: { stepId: "fb", record: { path: target, engine: "browser" } },
      driver,
    });
    // headless + no __display -> ffmpeg headless SKIPPED guard.
    assert.equal(result.status, "SKIPPED");
    assert.match(result.description, /without a virtual display/);
  });
});

// ---------------------------------------------------------------------------
// stopRecording — guards + MediaRecorder branches that return BEFORE any real
// transcode/ffmpeg spawn. The transcode (real ffmpeg) path is NOT exercised.
// ---------------------------------------------------------------------------
describe("stopRecording: guards + MediaRecorder", function () {
  this.timeout(15000);
  const config = {};

  afterEach(function () {
    sinon.restore();
  });

  it("FAILs on an invalid step definition", async function () {
    const result = await stopRecording({
      config,
      // An unknown property on the stopRecord object fails step_v3 validation.
      step: { stopRecord: { unknownField: true } },
      driver: {},
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /Invalid step definition/);
  });

  it("stopRecord:false -> SKIPPED (explicit no-op)", async function () {
    const result = await stopRecording({
      config,
      step: { stopRecord: false },
      driver: { state: { recordings: [{ type: "ffmpeg" }] } },
    });
    assert.equal(result.status, "SKIPPED");
    assert.match(result.description, /disabled \(stopRecord: false\)/);
  });

  it("no recordings at all -> SKIPPED 'isn't started'", async function () {
    const result = await stopRecording({
      config,
      step: { stopRecord: true },
      driver: { state: { recordings: [] } },
    });
    assert.equal(result.status, "SKIPPED");
    assert.match(result.description, /isn't started/);
  });

  it("named target not found -> SKIPPED with the target name", async function () {
    const result = await stopRecording({
      config,
      step: { stopRecord: "demo" },
      driver: { state: { recordings: [{ type: "ffmpeg", name: "other" }] } },
    });
    assert.equal(result.status, "SKIPPED");
    assert.match(result.description, /No active recording named 'demo'/);
  });

  it("only a synthetic autoRecord recording present, untargeted stop -> SKIPPED (still running)", async function () {
    const result = await stopRecording({
      config,
      step: { stopRecord: true },
      driver: {
        state: { recordings: [{ type: "ffmpeg", synthetic: true }] },
      },
    });
    assert.equal(result.status, "SKIPPED");
    assert.match(result.description, /automatic \(autoRecord\) recording is still running/);
  });

  it("MediaRecorder whose recorder object is missing -> FAIL and drops the handle", async function () {
    const recordings = [
      { type: "MediaRecorder", tab: "rec-tab", downloadPath: "x.webm", targetPath: "y.mp4" },
    ];
    const driver = {
      state: { recordings },
      async switchToWindow() {},
      async execute() {
        // recorderExists check -> false.
        return false;
      },
      async getWindowHandles() {
        return ["rec-tab", "content-tab"];
      },
      async closeWindow() {},
    };
    const result = await stopRecording({ config, step: { stopRecord: true }, driver });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /recorder object doesn't exist/);
    // Handle dropped so a retry doesn't loop.
    assert.equal(recordings.length, 0);
  });

  it("MediaRecorder download times out -> FAIL and drops the handle (fake timers)", async function () {
    const clock = sinon.useFakeTimers();
    try {
      const recordings = [
        {
          type: "MediaRecorder",
          tab: "rec-tab",
          // A path that never appears on disk -> waitForStableFile times out.
          downloadPath: path.join(os.tmpdir(), `never-${Date.now()}.webm`),
          targetPath: path.join(os.tmpdir(), "out.mp4"),
        },
      ];
      const switchToWindow = sinon.spy();
      const driver = {
        state: { recordings },
        switchToWindow,
        async execute() {
          return true; // recorder exists; recorder.stop() is a no-op here.
        },
        // On timeout, stopRecording now closes the recorder tab and restores
        // focus (so later steps don't run in it), which needs these methods.
        async getWindowHandle() {
          return "content-tab";
        },
        async getWindowHandles() {
          return ["rec-tab", "content-tab"];
        },
        async closeWindow() {},
      };
      const promise = stopRecording({ config, step: { stopRecord: true }, driver });
      // waitForStableFile polls every 500ms for maxSeconds*2 (=120) iterations.
      // Advance the fake clock past the full 60s window so it resolves false.
      await clock.tickAsync(61_000);
      const result = await promise;
      assert.equal(result.status, "FAIL");
      assert.match(result.description, /download timed out/);
      assert.equal(recordings.length, 0);
      // Focus is restored to the content tab, not left in the recorder tab.
      assert(switchToWindow.calledWith("content-tab"));
    } finally {
      clock.restore();
    }
  });
});
