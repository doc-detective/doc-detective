import assert from "node:assert/strict";
import {
  computeScale,
  toCanvasRect,
  positionTargetRect,
  appWindowOrigin,
  APP_UNSUPPORTED_CRITERIA,
  appCriteriaError,
} from "../dist/core/annotations/geometry.js";

describe("annotations/geometry", function () {
  describe("computeScale", function () {
    it("derives the device pixel ratio from image vs logical width", function () {
      // A 2x Retina capture of an 800px viewport.
      assert.equal(computeScale(1600, 800), 2);
      // A 1x capture.
      assert.equal(computeScale(800, 800), 1);
      // Windows 150% display scaling.
      assert.equal(computeScale(1200, 800), 1.5);
    });

    it("falls back to 1 for a missing or nonsense logical width", function () {
      // Deriving scale from the capture means we never query DPI — but a
      // driver that reports a junk width must not produce NaN/Infinity rects.
      assert.equal(computeScale(800, 0), 1);
      assert.equal(computeScale(800, undefined), 1);
      assert.equal(computeScale(800, -5), 1);
      assert.equal(computeScale(800, NaN), 1);
    });
  });

  describe("toCanvasRect", function () {
    it("scales a logical rect into image pixels", function () {
      const rect = toCanvasRect({ x: 10, y: 20, width: 30, height: 40 }, 2);
      assert.deepEqual(rect, { x: 20, y: 40, width: 60, height: 80 });
    });

    it("subtracts the crop origin so rects land in the cropped canvas", function () {
      // Element at logical (100,100) on a 2x capture -> image (200,200).
      // Crop starts at image (150,150) -> element sits at (50,50) in the crop.
      const rect = toCanvasRect(
        { x: 100, y: 100, width: 50, height: 25 },
        2,
        { x: 150, y: 150 }
      );
      assert.deepEqual(rect, { x: 50, y: 50, width: 100, height: 50 });
    });

    it("defaults the crop origin to the image origin", function () {
      const rect = toCanvasRect({ x: 5, y: 5, width: 1, height: 1 }, 1);
      assert.deepEqual(rect, { x: 5, y: 5, width: 1, height: 1 });
    });

    it("keeps rects finite when the scale is degenerate", function () {
      const rect = toCanvasRect({ x: 1, y: 1, width: 1, height: 1 }, 1);
      for (const value of Object.values(rect)) {
        assert.ok(Number.isFinite(value));
      }
    });
  });

  describe("positionTargetRect", function () {
    const canvas = { width: 800, height: 600 };

    it("resolves a named region against the canvas", function () {
      assert.deepEqual(positionTargetRect("top-right", canvas, 1), {
        x: 800,
        y: 0,
        width: 0,
        height: 0,
      });
      assert.deepEqual(positionTargetRect("center", canvas, 1), {
        x: 400,
        y: 300,
        width: 0,
        height: 0,
      });
    });

    it("scales an absolute point into image pixels", function () {
      // Points are authored in the capture's logical units, so a 2x capture
      // doubles them — the author shouldn't have to know the pixel ratio.
      assert.deepEqual(positionTargetRect({ x: 100, y: 50 }, canvas, 2), {
        x: 200,
        y: 100,
        width: 0,
        height: 0,
      });
    });

    it("resolves named regions in image pixels regardless of scale", function () {
      // A named region is relative to the FINAL image, so it must not be
      // scaled a second time.
      assert.deepEqual(positionTargetRect("bottom-right", canvas, 2), {
        x: 800,
        y: 600,
        width: 0,
        height: 0,
      });
    });
  });

  describe("appWindowOrigin", function () {
    const windowRect = { x: 25, y: 115, w: 816, h: 767 };

    it("does not rebase on Windows", function () {
      // The Windows driver session is rooted at the app window, so
      // getElementRect is already window-relative and the capture covers that
      // same window. Rebasing shifted annotations off their targets by exactly
      // the window's desktop position — verified against Character Map.
      assert.deepEqual(appWindowOrigin("windows", windowRect), { x: 0, y: 0 });
    });

    it("rebases onto the window origin on macOS", function () {
      // Mac2 reports screen coordinates — appWindowRect's result feeds
      // ffmpeg's display crop, which only works in screen space — while the
      // capture is an element screenshot of the window.
      assert.deepEqual(appWindowOrigin("mac", windowRect), { x: 25, y: 115 });
    });

    it("does not rebase for mobile or unknown platforms", function () {
      // Mobile captures in-device, so rects and image share the device origin.
      assert.deepEqual(appWindowOrigin("android", windowRect), { x: 0, y: 0 });
      assert.deepEqual(appWindowOrigin("ios", windowRect), { x: 0, y: 0 });
      assert.deepEqual(appWindowOrigin(undefined, windowRect), { x: 0, y: 0 });
    });

    it("falls back to the origin when the window rect is unavailable", function () {
      // appWindowRect returns null on mobile and on a transient rect failure;
      // that must not produce NaN coordinates.
      assert.deepEqual(appWindowOrigin("mac", null), { x: 0, y: 0 });
      assert.deepEqual(appWindowOrigin("mac", undefined), { x: 0, y: 0 });
    });
  });

  describe("appCriteriaError", function () {
    it("names the unsupported criteria on app surfaces", function () {
      // Must stay aligned with buildAppLocator in appSurface.ts, which is the
      // real gate: it rejects elementClass AND elementAttribute, plus a
      // CSS-shaped selector. Drifting from that list doesn't change what
      // resolves — it just downgrades a precise error into a vague one.
      assert.deepEqual(APP_UNSUPPORTED_CRITERIA, [
        "selector",
        "elementClass",
        "elementAttribute",
      ]);
    });

    it("flags elementAttribute on app surfaces", function () {
      const message = appCriteriaError({ elementAttribute: { role: "button" } });
      assert.ok(message);
      assert.ok(message.includes("elementAttribute"));
    });

    it("returns an error naming the offending field and the supported ones", function () {
      const message = appCriteriaError({ selector: "#a" });
      assert.ok(message.includes("selector"));
      assert.ok(message.includes("elementText"));
    });

    it("returns null for natively-mappable criteria", function () {
      assert.equal(appCriteriaError({ elementText: "Save" }), null);
      assert.equal(appCriteriaError({ elementId: "save" }), null);
      assert.equal(appCriteriaError({ elementTestId: "save" }), null);
      assert.equal(appCriteriaError({ elementAria: "Save" }), null);
    });

    it("flags elementClass on app surfaces", function () {
      const message = appCriteriaError({ elementClass: "btn" });
      assert.ok(message.includes("elementClass"));
    });

    it("rejects a bare string target on app surfaces", function () {
      // A string target is selector-or-display-text. On a native surface a CSS
      // selector can't run, so resolving it would mean silently guessing it's
      // display text. Ask for the explicit field instead — relaxing this later
      // is backward-compatible; tightening it wouldn't be.
      const message = appCriteriaError("#submit-button");
      assert.ok(message);
      assert.ok(message.includes("elementText"));
    });
  });

  describe("allTargetError", function () {
    it("rejects `all` with a bare string target", async function () {
      const { allTargetError } = await import(
        "../dist/core/annotations/geometry.js"
      );
      // `all` exists for redaction, where matching the wrong thing is a
      // disclosure. A selector-or-text string is too ambiguous for that.
      assert.ok(allTargetError("#secret", true));
      assert.equal(allTargetError({ selector: ".secret" }, true), null);
      assert.equal(allTargetError("#secret", false), null);
    });

    it("rejects `all` on app surfaces, where the find resolves one element", async function () {
      const { allTargetError } = await import(
        "../dist/core/annotations/geometry.js"
      );
      // Honoring `all` here would annotate the first match and silently skip
      // the rest — for blur, a shot that looks redacted but isn't. Refusing
      // beats under-redacting; a multi-match native find can lift this later.
      const message = allTargetError({ elementText: "Account ID" }, true, true);
      assert.ok(message);
      assert.match(message, /isn't supported on app surfaces/);
      // Browser surfaces are unaffected...
      assert.equal(
        allTargetError({ elementText: "Account ID" }, true, false),
        null
      );
      // ...and so is `all: false` anywhere.
      assert.equal(
        allTargetError({ elementText: "Account ID" }, false, true),
        null
      );
    });
  });
});
