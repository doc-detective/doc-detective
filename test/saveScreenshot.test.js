import assert from "node:assert/strict";
import {
  clampCropRect,
  aspectRatiosMatch,
} from "../dist/core/tests/saveScreenshot.js";

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
