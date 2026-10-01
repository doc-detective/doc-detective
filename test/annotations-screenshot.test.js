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
