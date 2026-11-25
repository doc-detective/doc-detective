// `screenshot.mask` (ADR 01216): areas ignored when a capture is compared with
// its reference. Runs the real saveScreenshot pipeline against a fake driver,
// because fixtures can assert PASS and SKIPPED but never FAIL.

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

// A white PNG, optionally with a black block drawn where the "date" sits.
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

function fakeElement(found) {
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

// Serves the capture, reports an 800px-wide viewport, and resolves every
// element to `rect`.
function fakeDriver(buffer, { rect = { x: 100, y: 100, width: 200, height: 50 }, found = true, innerWidth = 800 } = {}) {
  const element = fakeElement(found);
  return {
    async takeScreenshot() {
      return buffer.toString("base64");
    },
    async pause() {},
    async $$() {
      return found ? [element] : [];
    },
    async $() {
      return element;
    },
    async execute(fn) {
      const source = String(fn);
      if (source.includes("getBoundingClientRect")) return rect;
      if (source.includes("innerHeight")) return { width: innerWidth, height: 600 };
      if (source.includes("innerWidth")) return innerWidth;
      if (source.includes("devicePixelRatio")) return 1;
      return undefined;
    },
  };
}

describe("screenshot mask", function () {
  this.timeout(20000);

  let dir;
  beforeEach(function () {
    if (!sharp) this.skip();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-mask-"));
  });
  afterEach(function () {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  // The reference has no date; the new capture shows one at (100, 100). That's
  // 10,000 of 480,000 pixels, about 2%: over a 1% maxVariation.
  async function compare(screenshot, driverOptions = {}, reference) {
    const target = path.join(dir, "billing.png");
    fs.writeFileSync(target, reference ?? (await makePng(800, 600)));
    const capture = await makePng(800, 600, { x: 100, y: 100, width: 200, height: 50 });
    const result = await saveScreenshot({
      config: {},
      step: {
        stepId: "m1",
        screenshot: { path: target, maxVariation: 0.01, overwrite: "aboveVariation", ...screenshot },
      },
      driver: fakeDriver(capture, driverOptions),
    });
    return { result, target };
  }

  it("warns on the changed area without a mask", async function () {
    const { result } = await compare({});
    assert.equal(result.status, "WARNING", result.description);
    assert.ok(result.outputs.variation > 0.01);
  });

  it("passes when a string mask covers the changed area", async function () {
    const { result } = await compare({ mask: [".date"] });
    assert.equal(result.status, "PASS", result.description);
    assert.equal(result.outputs.variation, 0);
    assert.equal(result.outputs.maskedRegions, 1);
    assert.equal(result.outputs.maskTargetsFound, true);
    assert.ok(
      result.assertions.some(
        (a) => a.statement === "$$outputs.maskTargetsFound == true" && a.result === "PASS"
      )
    );
  });

  it("passes when an element-object mask covers the changed area", async function () {
    const { result } = await compare({ mask: [{ selector: ".date" }] });
    assert.equal(result.status, "PASS", result.description);
    assert.equal(result.outputs.maskedRegions, 1);
  });

  it("leaves the saved reference untouched", async function () {
    const reference = await makePng(800, 600);
    const { target } = await compare({ mask: [".date"] }, {}, reference);
    assert.ok(fs.readFileSync(target).equals(reference));
  });

  it("FAILs when a mask target can't be found", async function () {
    const { result } = await compare({ mask: [".nope"] }, { found: false });
    assert.equal(result.status, "FAIL", result.description);
    assert.equal(result.outputs.maskTargetsFound, false);
    assert.match(result.description, /^Couldn't find every mask target\./);
    assert.match(result.description, /Couldn't find the element to mask: \.nope\./);
  });

  it("warns when a targeted mask lands outside the capture", async function () {
    const { result } = await compare(
      { mask: [".offscreen"] },
      { rect: { x: 900, y: 100, width: 50, height: 50 } }
    );
    assert.equal(result.status, "WARNING", result.description);
    assert.equal(result.outputs.masksInBounds, false);
    assert.equal(result.outputs.maskedRegions, 0);
  });

  it("scales mask areas when the comparison resamples", async function () {
    // A half-size reference forces the resample path (a devicePixelRatio
    // difference), so the 800x600 capture's mask has to shrink with it.
    const reference = await makePng(400, 300);
    const { result } = await compare({ mask: [".date"] }, {}, reference);
    assert.equal(result.status, "PASS", result.description);
    assert.equal(result.outputs.variation, 0);
  });

  it("ignores masks when there's no reference to compare with", async function () {
    const target = path.join(dir, "new.png");
    const capture = await makePng(800, 600);
    const result = await saveScreenshot({
      config: {},
      step: { stepId: "m2", screenshot: { path: target, maxVariation: 0.01, mask: [".nope"] } },
      driver: fakeDriver(capture, { found: false }),
    });
    assert.equal(result.status, "PASS", result.description);
    assert.equal(result.outputs.maskTargetsFound, undefined);
  });
});
