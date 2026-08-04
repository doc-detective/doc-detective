import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { findElement } from "../dist/core/tests/findElement.js";

const require = createRequire(import.meta.url);

// The whole suite needs the matching deps; skip cleanly where absent (same
// gating as visualMatch.test.js).
let sharp;
try {
  const mod = require("sharp");
  sharp = mod && (mod.default ?? mod);
} catch {
  sharp = null;
}
let opencv;
try {
  const mod = require("@appium/opencv");
  opencv = mod && (mod.default ?? mod);
} catch {
  opencv = null;
}

// ---------------------------------------------------------------------------
// Synthetic scene + fake driver
// ---------------------------------------------------------------------------

// 800x600 logical scene rendered at 1x -> captureScale 1 (innerWidth 800).
// Distinctive multi-color glyphs at given 1x positions.
async function makeScene(glyphs = [{ x: 300, y: 200 }]) {
  const glyphSvg = (gx, gy) => `
    <rect x="${gx}" y="${gy}" width="48" height="48" rx="6" fill="#2563eb"/>
    <circle cx="${gx + 24}" cy="${gy + 24}" r="14" fill="none" stroke="#facc15" stroke-width="4"/>
    <rect x="${gx + 20}" y="${gy + 8}" width="8" height="10" fill="#ef4444"/>`;
  const svg = `<svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#f3f4f6"/>
    ${glyphs.map((g) => glyphSvg(g.x, g.y)).join("")}
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function makeTemplateFile(dir, name = "glyph.png") {
  const scene = await makeScene([{ x: 300, y: 200 }]);
  const template = await sharp(scene)
    .extract({ left: 300, top: 200, width: 48, height: 48 })
    .png()
    .toBuffer();
  const file = path.join(dir, name);
  fs.writeFileSync(file, template);
  return file;
}

// A foreign glyph that is NOT in any scene.
async function makeForeignTemplateFile(dir) {
  const template = await sharp(
    Buffer.from(
      `<svg width="48" height="48" xmlns="http://www.w3.org/2000/svg">
         <rect width="48" height="48" fill="#111"/>
         <circle cx="24" cy="24" r="16" fill="#0f0"/>
       </svg>`
    )
  )
    .png()
    .toBuffer();
  const file = path.join(dir, "foreign.png");
  fs.writeFileSync(file, template);
  return file;
}

// Mock element with a viewport rect, exposing everything setElementOutputs
// probes.
function makeElement({ elementId = "el-1", text = "Submit", rect } = {}) {
  return {
    elementId,
    __rect: rect ?? { x: 0, y: 0, width: 10, height: 10 },
    getText: async () => text,
    getHTML: async () => `<button>${text}</button>`,
    getTagName: async () => "button",
    getValue: async () => "",
    getLocation: async () => ({ x: 0, y: 0 }),
    getSize: async () => ({ width: 10, height: 10 }),
    isClickable: async () => true,
    isEnabled: async () => true,
    isSelected: async () => false,
    isDisplayed: async () => true,
    isExisting: async () => true,
    getAttribute: async () => null,
    getComputedLabel: async () => text,
    waitForExist: async () => true,
    click: async () => {},
  };
}

// Fake wdio driver over a scene buffer. `execute` dispatches on the callback
// source: innerWidth probe, elementFromPoint recovery, and per-element
// getBoundingClientRect reads.
function makeDriver({
  scene,
  candidates = [],
  pointElement = null,
  htmlElement = null,
} = {}) {
  return {
    __scene: scene,
    $$: async () => candidates,
    $: async () => htmlElement ?? makeElement({ elementId: "html-el", text: "" }),
    pause: async () => {},
    takeScreenshot: async () => scene.toString("base64"),
    execute: async (fn, ...args) => {
      const src = String(fn);
      if (src.includes("innerWidth")) return 800;
      if (src.includes("elementFromPoint")) {
        return pointElement;
      }
      if (src.includes("getBoundingClientRect")) {
        const el = args[0];
        return el?.__rect ?? null;
      }
      return null;
    },
  };
}

const baseConfig = { logLevel: "silent" };

(sharp && opencv ? describe : describe.skip)("findElement image criterion (browser)", function () {
  this.timeout(180000);

  let tmpDir;
  before(function () {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-image-find-"));
  });
  after(function () {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("image-only find recovers the element at the match center", async function () {
    const scene = await makeScene([{ x: 300, y: 200 }]);
    const template = await makeTemplateFile(tmpDir);
    const target = makeElement({
      elementId: "gear-btn",
      text: "Settings",
      rect: { x: 300, y: 200, width: 48, height: 48 },
    });
    const driver = makeDriver({ scene, pointElement: target });

    const result = await findElement({
      config: baseConfig,
      step: { find: { image: template, timeout: 3000 } },
      driver,
    });

    assert.equal(result.status, "PASS", result.description);
    assert.equal(result.outputs.found, true);
    assert.equal(result.outputs.rawElement, target);
    assert.ok(result.outputs.imageMatch, "expected imageMatch outputs");
    assert.ok(result.outputs.imageMatch.score >= 0.99);
    // Logical-unit rect at captureScale 1.
    assert.ok(Math.abs(result.outputs.imageMatch.rect.x - 300) <= 2);
    assert.ok(Math.abs(result.outputs.imageMatch.rect.y - 200) <= 2);
    assert.ok(Math.abs(result.outputs.imageMatch.center.x - 324) <= 3);
    assert.ok(Math.abs(result.outputs.imageMatch.center.y - 224) <= 3);
    assert.match(result.description, /image/i);
  });

  it("image AND elementText picks the co-located candidate among identical glyphs", async function () {
    const scene = await makeScene([
      { x: 100, y: 100 },
      { x: 500, y: 400 },
    ]);
    const template = await makeTemplateFile(tmpDir);
    const left = makeElement({
      elementId: "left",
      text: "Wrong",
      rect: { x: 100, y: 100, width: 48, height: 48 },
    });
    const right = makeElement({
      elementId: "right",
      text: "Right",
      rect: { x: 500, y: 400, width: 48, height: 48 },
    });
    const driver = makeDriver({ scene, candidates: [left, right] });

    const result = await findElement({
      config: baseConfig,
      step: { find: { image: template, elementText: "Right", timeout: 5000 } },
      driver,
    });

    assert.equal(result.status, "PASS", result.description);
    assert.equal(result.outputs.rawElement, right);
    assert.ok(result.outputs.imageMatch, "expected imageMatch outputs");
    // The reported match is the one that co-located with the element.
    assert.ok(Math.abs(result.outputs.imageMatch.rect.x - 500) <= 2);
  });

  it("selector AND image rejects a candidate that doesn't contain the match", async function () {
    const scene = await makeScene([{ x: 300, y: 200 }]);
    const template = await makeTemplateFile(tmpDir);
    const wrong = makeElement({
      elementId: "wrong",
      rect: { x: 0, y: 0, width: 50, height: 50 },
    });
    const driver = makeDriver({ scene, candidates: [wrong] });

    const result = await findElement({
      config: baseConfig,
      step: { find: { selector: "button", image: template, timeout: 1500 } },
      driver,
    });

    assert.equal(result.status, "FAIL");
    assert.equal(result.outputs.found, false);
  });

  it("ambiguous image-only find fails naming the match count", async function () {
    const scene = await makeScene([
      { x: 100, y: 100 },
      { x: 500, y: 400 },
    ]);
    const template = await makeTemplateFile(tmpDir);
    const driver = makeDriver({ scene });

    const result = await findElement({
      config: baseConfig,
      step: { find: { image: template, timeout: 1500 } },
      driver,
    });

    assert.equal(result.status, "FAIL");
    assert.match(result.description, /2/);
    assert.match(result.description, /region|criteri/i);
  });

  it("a rect region disambiguates identical glyphs", async function () {
    const scene = await makeScene([
      { x: 100, y: 100 },
      { x: 500, y: 400 },
    ]);
    const template = await makeTemplateFile(tmpDir);
    const target = makeElement({
      elementId: "right",
      rect: { x: 500, y: 400, width: 48, height: 48 },
    });
    const driver = makeDriver({ scene, pointElement: target });

    const result = await findElement({
      config: baseConfig,
      step: {
        find: {
          image: {
            path: template,
            region: { x: 400, y: 300, width: 400, height: 300 },
          },
          timeout: 3000,
        },
      },
      driver,
    });

    assert.equal(result.status, "PASS", result.description);
    assert.ok(Math.abs(result.outputs.imageMatch.rect.x - 500) <= 2);
  });

  it("an element-criteria region disambiguates identical glyphs", async function () {
    const scene = await makeScene([
      { x: 100, y: 100 },
      { x: 500, y: 400 },
    ]);
    const template = await makeTemplateFile(tmpDir);
    const regionElement = makeElement({
      elementId: "toolbar",
      text: "Toolbar",
      rect: { x: 400, y: 300, width: 400, height: 300 },
    });
    const target = makeElement({
      elementId: "right",
      rect: { x: 500, y: 400, width: 48, height: 48 },
    });
    const driver = makeDriver({
      scene,
      candidates: [regionElement],
      pointElement: target,
    });

    const result = await findElement({
      config: baseConfig,
      step: {
        find: {
          image: { path: template, region: { selector: "#toolbar" } },
          timeout: 3000,
        },
      },
      driver,
    });

    assert.equal(result.status, "PASS", result.description);
    assert.ok(Math.abs(result.outputs.imageMatch.rect.x - 500) <= 2);
  });

  it("a miss reports the best score and writes an annotated diagnostic", async function () {
    const scene = await makeScene([{ x: 300, y: 200 }]);
    const template = await makeForeignTemplateFile(tmpDir);
    const driver = makeDriver({ scene });
    const outDir = fs.mkdtempSync(path.join(tmpDir, "out-"));

    const result = await findElement({
      config: { ...baseConfig, output: outDir },
      step: { find: { image: template, timeout: 1200 }, stepId: "miss-step" },
      driver,
    });

    assert.equal(result.status, "FAIL");
    assert.match(result.description, /best visual candidate scored/i);
    assert.ok(result.outputs.imageMiss, "expected imageMiss outputs");
    assert.ok(result.outputs.imageMiss.bestScore < 0.8);
    assert.ok(
      result.outputs.imageMiss.diagnosticPath,
      "expected a diagnostic path"
    );
    assert.ok(
      fs.existsSync(result.outputs.imageMiss.diagnosticPath),
      "diagnostic PNG must exist"
    );
  });

  it("FAILs rather than passing on <html> when no element sits at the match center", async function () {
    // elementFromPoint returning null (transparent region, decorative pixels)
    // must NOT silently resolve to the document root — a later click/type
    // would target the wrong thing.
    const scene = await makeScene([{ x: 300, y: 200 }]);
    const template = await makeTemplateFile(tmpDir);
    const driver = makeDriver({ scene, pointElement: null });

    const result = await findElement({
      config: baseConfig,
      step: { find: { image: template, timeout: 1200 } },
      driver,
    });

    assert.equal(result.status, "FAIL");
    assert.equal(result.outputs.found, false);
  });

  it("a missing template file fails with an actionable message", async function () {
    const scene = await makeScene([{ x: 300, y: 200 }]);
    const driver = makeDriver({ scene });

    const result = await findElement({
      config: baseConfig,
      step: {
        find: { image: path.join(tmpDir, "nope.png"), timeout: 1000 },
      },
      driver,
    });

    assert.equal(result.status, "FAIL");
    assert.match(result.description, /template/i);
  });

  it("threshold precedence: config default applies, step matchThreshold overrides", async function () {
    // A slightly blurred template scores high but below a near-perfect bar.
    const scene = await makeScene([{ x: 300, y: 200 }]);
    const blurred = await sharp(
      fs.readFileSync(await makeTemplateFile(tmpDir, "sharp.png"))
    )
      .blur(1.2)
      .png()
      .toBuffer();
    const blurredFile = path.join(tmpDir, "blurred.png");
    fs.writeFileSync(blurredFile, blurred);
    const target = makeElement({
      elementId: "gear-btn",
      rect: { x: 300, y: 200, width: 48, height: 48 },
    });
    const strictConfig = {
      ...baseConfig,
      imageMatching: { matchThreshold: 0.9995 },
    };

    // Config default (0.9995) rejects the blurred template...
    const miss = await findElement({
      config: strictConfig,
      step: { find: { image: blurredFile, timeout: 1200 } },
      driver: makeDriver({ scene, pointElement: target }),
    });
    assert.equal(miss.status, "FAIL");
    assert.match(miss.description, /0\.9995/);

    // ...and a permissive step-level matchThreshold overrides it.
    const hit = await findElement({
      config: strictConfig,
      step: {
        find: {
          image: { path: blurredFile, matchThreshold: 0.5 },
          timeout: 5000,
        },
      },
      driver: makeDriver({ scene, pointElement: target }),
    });
    assert.equal(hit.status, "PASS", hit.description);
    assert.ok(hit.outputs.imageMatch.score >= 0.5);
  });
});
