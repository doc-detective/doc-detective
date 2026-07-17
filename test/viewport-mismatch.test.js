import assert from "node:assert/strict";
import {
  viewportMismatchWarning,
  resolveViewportTarget,
  isViewportFloored,
} from "../dist/core/utils.js";

// A browser/OS enforces a minimum window size, so a requested viewport can be
// silently floored (the "the browser had a floor I didn't know about" case).
// `viewportMismatchWarning` compares the requested viewport against what the
// page actually rendered (window.innerWidth/innerHeight read back after the
// resize) and returns a human-readable warning when they diverge, or null when
// every requested dimension landed within tolerance.
describe("viewportMismatchWarning", function () {
  it("returns null when the rendered viewport matches the request exactly", function () {
    assert.equal(
      viewportMismatchWarning({ width: 375, height: 812 }, { width: 375, height: 812 }),
      null
    );
  });

  it("warns when the rendered width was floored above the requested width", function () {
    const msg = viewportMismatchWarning({ width: 375 }, { width: 500 });
    assert.ok(msg, "expected a warning message");
    assert.match(msg, /375/);
    assert.match(msg, /500/);
    assert.match(msg, /width/i);
  });

  it("only compares dimensions that were actually requested", function () {
    // Height omitted from the request: an unrequested height difference must
    // not produce a warning.
    assert.equal(
      viewportMismatchWarning({ width: 800 }, { width: 800, height: 611 }),
      null
    );
  });

  it("warns on a height-only request that was floored", function () {
    const msg = viewportMismatchWarning({ height: 200 }, { height: 400 });
    assert.ok(msg);
    assert.match(msg, /height/i);
    assert.doesNotMatch(msg, /width/i);
  });

  it("respects a tolerance so sub-threshold deltas (e.g. scrollbar) don't warn", function () {
    assert.equal(
      viewportMismatchWarning({ width: 400 }, { width: 385 }, 15),
      null
    );
    assert.ok(viewportMismatchWarning({ width: 400 }, { width: 384 }, 15));
  });

  it("warns when the rendered dimension could not be read back", function () {
    const msg = viewportMismatchWarning({ width: 375 }, { width: NaN });
    assert.ok(msg, "expected a warning when the actual width is unknown");
    assert.match(msg, /375/);
  });

  it("returns null when nothing was requested", function () {
    assert.equal(viewportMismatchWarning({}, { width: 500, height: 500 }), null);
  });
});

// `isViewportFloored` is the narrower "the browser refused to shrink" signal
// (rendered LARGER than requested), distinct from viewportMismatchWarning's
// any-divergence check. It powers the context stamp the useMobilePlatforms
// hint reads.
describe("isViewportFloored", function () {
  it("is true when the rendered width exceeds the request beyond tolerance", function () {
    assert.equal(isViewportFloored({ width: 375 }, { width: 501 }), true);
  });

  it("is false when the viewport was realized exactly", function () {
    assert.equal(
      isViewportFloored({ width: 375, height: 812 }, { width: 375, height: 812 }),
      false
    );
  });

  it("is false for a within-tolerance overshoot (scrollbar)", function () {
    assert.equal(isViewportFloored({ width: 375 }, { width: 385 }), false);
  });

  it("is false when the render came back SMALLER than requested", function () {
    // Smaller isn't a floor — the window shrank fine.
    assert.equal(isViewportFloored({ width: 375 }, { width: 300 }), false);
  });

  it("only considers requested dimensions", function () {
    assert.equal(isViewportFloored({ width: 375 }, { width: 375, height: 900 }), false);
  });

  it("is false when the rendered dimension is unreadable", function () {
    assert.equal(isViewportFloored({ width: 375 }, { width: NaN }), false);
  });

  it("detects a floored height", function () {
    assert.equal(isViewportFloored({ height: 200 }, { height: 400 }), true);
  });
});

describe("resolveViewportTarget", function () {
  const current = { width: 1000, height: 700 };

  it("uses both requested dimensions when both are given", function () {
    assert.deepEqual(resolveViewportTarget({ width: 375, height: 812 }, current), {
      width: 375,
      height: 812,
    });
  });

  it("fills a missing height from the current viewport (width-only request)", function () {
    assert.deepEqual(resolveViewportTarget({ width: 375 }, current), {
      width: 375,
      height: 700,
    });
  });

  it("fills a missing width from the current viewport (height-only request)", function () {
    assert.deepEqual(resolveViewportTarget({ height: 812 }, current), {
      width: 1000,
      height: 812,
    });
  });

  it("falls back to current for non-positive requested values", function () {
    assert.deepEqual(resolveViewportTarget({ width: 0, height: -5 }, current), {
      width: 1000,
      height: 700,
    });
  });
});
