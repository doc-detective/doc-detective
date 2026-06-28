import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import {
  clampCropRect,
  aspectRatiosMatch,
  saveScreenshot,
} from "../dist/core/tests/saveScreenshot.js";

const require = createRequire(import.meta.url);

// Lazily resolve sharp; the unified-model integration tests are skipped if the
// heavy dep isn't installed in this environment.
let sharp;
try {
  const mod = require("sharp");
  sharp = mod && (mod.default ?? mod);
} catch {
  sharp = null;
}

// Build a solid-color PNG buffer of the given dimensions.
async function makePngBuffer(width, height, { r, g, b } = { r: 255, g: 0, b: 0 }) {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r, g, b },
    },
  })
    .png()
    .toBuffer();
}

// A fake WebDriver whose saveScreenshot writes a chosen PNG buffer to the
// target path. No crop -> execute()/pause() are never called.
function fakeDriver(buffer) {
  return {
    async saveScreenshot(filePath) {
      fs.writeFileSync(filePath, buffer);
    },
  };
}

describe("clampCropRect", function () {
  it("produces identical dimensions when requested rect straddles y=0 vs sits just below", function () {
    const imgW = 2400;
    const imgH = 1600;
    const clamped = clampCropRect(
      { x: 77, y: -5, width: 199, height: 32 },
      imgW,
      imgH,
    );
    const unclamped = clampCropRect(
      { x: 77, y: 0, width: 199, height: 32 },
      imgW,
      imgH,
    );
    assert.equal(clamped.width, unclamped.width);
    assert.equal(clamped.height, unclamped.height);
  });

  it("shifts down when y is negative (does not shrink height)", function () {
    const r = clampCropRect(
      { x: 10, y: -4, width: 50, height: 20 },
      1000,
      1000,
    );
    assert.equal(r.y, 0);
    assert.equal(r.height, 20);
  });

  it("shifts right when x is negative (does not shrink width)", function () {
    const r = clampCropRect(
      { x: -3, y: 10, width: 50, height: 20 },
      1000,
      1000,
    );
    assert.equal(r.x, 0);
    assert.equal(r.width, 50);
  });

  it("shifts up when rect overflows bottom", function () {
    const r = clampCropRect(
      { x: 0, y: 990, width: 10, height: 20 },
      1000,
      1000,
    );
    assert.equal(r.y, 980);
    assert.equal(r.height, 20);
  });

  it("shifts left when rect overflows right", function () {
    const r = clampCropRect(
      { x: 990, y: 0, width: 20, height: 10 },
      1000,
      1000,
    );
    assert.equal(r.x, 980);
    assert.equal(r.width, 20);
  });

  it("falls back to shrink when requested rect is larger than the image", function () {
    const r = clampCropRect(
      { x: 0, y: 0, width: 2000, height: 2000 },
      1000,
      1000,
    );
    assert.equal(r.width, 1000);
    assert.equal(r.height, 1000);
  });

  it("leaves an already-in-bounds rect untouched", function () {
    const r = clampCropRect(
      { x: 50, y: 50, width: 100, height: 100 },
      1000,
      1000,
    );
    assert.deepEqual(r, { x: 50, y: 50, width: 100, height: 100 });
  });
});

describe("aspectRatiosMatch", function () {
  it("rejects the bug's 7.37 vs 6.22 case", function () {
    assert.equal(
      aspectRatiosMatch({ width: 199, height: 27 }, { width: 199, height: 32 }),
      false,
    );
  });

  it("accepts sub-pixel rounding jitter within 5%", function () {
    assert.equal(
      aspectRatiosMatch({ width: 199, height: 32 }, { width: 200, height: 32 }),
      true,
    );
  });

  it("accepts identical ratios", function () {
    assert.equal(
      aspectRatiosMatch({ width: 100, height: 50 }, { width: 200, height: 100 }),
      true,
    );
  });

  it("rejects clearly different ratios (2:1 vs 1:1)", function () {
    assert.equal(
      aspectRatiosMatch({ width: 200, height: 100 }, { width: 100, height: 100 }),
      false,
    );
  });
});

// Unified assertion model: each implicit verification check is exposed as a
// computed output and asserted via a `$$` expression evaluated by the shared
// engine. These tests use a fake driver that writes real PNGs so the
// comparison/decode paths run for real, and assert that:
//   - status (PASS/WARNING/FAIL/SKIPPED) is byte-identical to prior behavior,
//   - the emitted assertions are the expected `{statement, source, result}`,
//   - the computed outputs the statements reference are present.
const describeIfSharp = sharp ? describe : describe.skip;

describeIfSharp("saveScreenshot unified assertions", function () {
  this.timeout(20000);
  let tmpDir;

  beforeEach(function () {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-screenshot-"));
  });
  afterEach(function () {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const config = {};

  it("new capture (no reference) -> PASS with no comparison assertions", async function () {
    const target = path.join(tmpDir, "shot.png");
    const buf = await makePngBuffer(100, 80);
    const result = await saveScreenshot({
      config,
      step: { stepId: "s1", screenshot: { path: target } },
      driver: fakeDriver(buf),
    });
    assert.equal(result.status, "PASS");
    // No reference + no crop -> empty applicable spec list.
    assert.deepEqual(result.assertions, []);
    assert.equal(result.outputs.screenshotPath, target);
    assert.equal(result.outputs.changed, true);
    assert.ok(fs.existsSync(target));
  });

  it("within-variation (identical reference) -> PASS with a passing variation assertion", async function () {
    const target = path.join(tmpDir, "shot.png");
    const buf = await makePngBuffer(100, 80);
    // Pre-create the reference (identical image).
    fs.writeFileSync(target, buf);
    const result = await saveScreenshot({
      config,
      step: {
        stepId: "s2",
        screenshot: { path: target, maxVariation: 0.05, overwrite: "aboveVariation" },
      },
      driver: fakeDriver(buf),
    });
    assert.equal(result.status, "PASS");
    // aspect-ratio (PASS) then variation (PASS).
    assert.deepEqual(result.assertions, [
      { statement: "$$outputs.aspectRatioMatch == true", source: "implicit", result: "PASS" },
      { statement: "$$outputs.variation <= 0.05", source: "implicit", result: "PASS" },
    ]);
    assert.equal(result.outputs.aspectRatioMatch, true);
    assert.equal(typeof result.outputs.variation, "number");
    assert.ok(result.outputs.variation <= 0.05);
  });

  it("over-variation -> WARNING with a warning variation assertion", async function () {
    const target = path.join(tmpDir, "shot.png");
    // Reference is red; new capture is fully different (blue) -> ~100% diff.
    const refBuf = await makePngBuffer(100, 80, { r: 255, g: 0, b: 0 });
    const newBuf = await makePngBuffer(100, 80, { r: 0, g: 0, b: 255 });
    fs.writeFileSync(target, refBuf);
    const result = await saveScreenshot({
      config,
      step: {
        stepId: "s3",
        // aboveVariation = the default comparison mode: compare, and replace the
        // reference when the diff exceeds maxVariation.
        screenshot: { path: target, maxVariation: 0.05, overwrite: "aboveVariation" },
      },
      driver: fakeDriver(newBuf),
    });
    assert.equal(result.status, "WARNING");
    assert.deepEqual(result.assertions, [
      { statement: "$$outputs.aspectRatioMatch == true", source: "implicit", result: "PASS" },
      { statement: "$$outputs.variation <= 0.05", source: "implicit", result: "WARNING" },
    ]);
    assert.equal(result.outputs.aspectRatioMatch, true);
    assert.ok(result.outputs.variation > 0.05);
  });

  it("aspect-ratio mismatch -> FAIL; variation spec never pushed", async function () {
    const target = path.join(tmpDir, "shot.png");
    const refBuf = await makePngBuffer(200, 100); // 2:1
    const newBuf = await makePngBuffer(100, 100); // 1:1
    fs.writeFileSync(target, refBuf);
    const result = await saveScreenshot({
      config,
      step: {
        stepId: "s4",
        screenshot: { path: target, maxVariation: 0.05, overwrite: "aboveVariation" },
      },
      driver: fakeDriver(newBuf),
    });
    assert.equal(result.status, "FAIL");
    assert.deepEqual(result.assertions, [
      { statement: "$$outputs.aspectRatioMatch == true", source: "implicit", result: "FAIL" },
    ]);
    assert.equal(result.outputs.aspectRatioMatch, false);
    assert.equal(result.outputs.variation, undefined);
  });

  it("file exists + overwrite:false -> SKIPPED with no assertions", async function () {
    const target = path.join(tmpDir, "shot.png");
    const buf = await makePngBuffer(100, 80);
    fs.writeFileSync(target, buf);
    const result = await saveScreenshot({
      config,
      step: {
        // overwrite:"false" + existing file short-circuits to SKIPPED BEFORE any
        // capture/comparison.
        stepId: "s5",
        screenshot: { path: target, overwrite: "false" },
      },
      driver: fakeDriver(buf),
    });
    assert.equal(result.status, "SKIPPED");
    // The SKIPPED early-return carries an empty assertions array so the result
    // shape is consistent with every other return path (no comparison specs
    // were gathered, but the field is never left undefined).
    assert.deepEqual(result.assertions, []);
  });

  it("overwrite:true with existing reference -> PASS, no comparison assertion, file overwritten", async function () {
    const target = path.join(tmpDir, "shot.png");
    const refBuf = await makePngBuffer(100, 80, { r: 255, g: 0, b: 0 });
    const newBuf = await makePngBuffer(100, 80, { r: 0, g: 255, b: 0 });
    fs.writeFileSync(target, refBuf);
    const result = await saveScreenshot({
      config,
      step: {
        stepId: "s6",
        screenshot: { path: target, overwrite: "true" },
      },
      driver: fakeDriver(newBuf),
    });
    assert.equal(result.status, "PASS");
    // Unconditional overwrite -> no comparison performed -> empty applicable specs.
    assert.deepEqual(result.assertions, []);
    assert.equal(result.outputs.changed, true);
    assert.equal(result.outputs.screenshotPath, target);
  });

  it("PNG decode error on a non-PNG reference -> EXECUTION FAIL, no assertions", async function () {
    const target = path.join(tmpDir, "shot.png");
    // Existing reference is NOT a valid PNG.
    fs.writeFileSync(target, "not a png");
    const buf = await makePngBuffer(100, 80);
    const result = await saveScreenshot({
      config,
      step: {
        stepId: "s7",
        screenshot: { path: target, maxVariation: 0.05, overwrite: "aboveVariation" },
      },
      driver: fakeDriver(buf),
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /Couldn't decode PNG/);
    // Execution error -> no assertion records.
    assert.equal(result.assertions, undefined);
  });
});
