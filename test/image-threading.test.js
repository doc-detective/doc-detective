import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { criteriaFromTarget } from "../dist/core/annotations/geometry.js";
import { typeKeys } from "../dist/core/tests/typeKeys.js";
import { saveScreenshot } from "../dist/core/tests/saveScreenshot.js";

const require = createRequire(import.meta.url);

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

// Same synthetic scene/driver rig as findElement-image.test.js, reduced to
// what these threading paths need.
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

function makeElement({ elementId = "el-1", text = "Submit", rect } = {}) {
  return {
    elementId,
    __rect: rect ?? { x: 300, y: 200, width: 48, height: 48 },
    getText: async () => text,
    getHTML: async () => `<button>${text}</button>`,
    getTagName: async () => "button",
    getValue: async () => "",
    getLocation: async () => ({ x: 0, y: 0 }),
    getSize: async () => ({ width: 48, height: 48 }),
    isClickable: async () => true,
    isEnabled: async () => true,
    isSelected: async () => false,
    isDisplayed: async () => true,
    isExisting: async () => true,
    getAttribute: async () => null,
    getComputedLabel: async () => text,
    waitForExist: async () => true,
    click: async () => {},
    scrollIntoView: async () => {},
  };
}

function makeDriver({ scene, candidates = [], pointElement = null } = {}) {
  return {
    __keys: [],
    $$: async () => candidates,
    $: async () => makeElement({ elementId: "html-el", text: "" }),
    pause: async () => {},
    takeScreenshot: async () => scene.toString("base64"),
    keys: async function (value) {
      this.__keys.push(value);
    },
    execute: async (fn, ...args) => {
      const src = String(fn);
      // The crop path's viewport probe reads BOTH dimensions as an object;
      // captureForMatch's scale probe reads bare innerWidth.
      if (src.includes("innerHeight")) return { width: 800, height: 600 };
      if (src.includes("innerWidth")) return 800;
      if (src.includes("devicePixelRatio")) return 1;
      if (src.includes("elementFromPoint")) return pointElement;
      if (src.includes("getBoundingClientRect")) {
        const el = args[0];
        return el?.__rect ?? null;
      }
      return null;
    },
  };
}

const baseConfig = { logLevel: "silent" };

describe("image criterion threading (pure)", function () {
  it("criteriaFromTarget carries the image field", function () {
    const criteria = criteriaFromTarget({
      image: "glyph.png",
      elementText: "Settings",
    });
    assert.equal(criteria.image, "glyph.png");
    assert.equal(criteria.elementText, "Settings");
  });
});

(sharp && opencv ? describe : describe.skip)("image criterion threading (drivers)", function () {
  this.timeout(180000);

  let tmpDir;
  before(function () {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-image-thread-"));
  });
  after(function () {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("type targets an element via the image criterion", async function () {
    const scene = await makeScene();
    const template = await makeTemplateFile(tmpDir);
    const target = makeElement({ elementId: "field" });
    const driver = makeDriver({ scene, pointElement: target });

    const result = await typeKeys({
      config: baseConfig,
      step: { type: { keys: "hello", image: template } },
      driver,
    });

    assert.equal(result.status, "PASS", result.description);
    assert.equal(result.outputs.found, true);
    assert.ok(driver.__keys.length > 0, "expected keys to be sent");
  });

  it("type FAILs when the image criterion misses", async function () {
    const scene = await makeScene();
    // Foreign template: not present in the scene.
    const foreign = await sharp(
      Buffer.from(
        `<svg width="48" height="48" xmlns="http://www.w3.org/2000/svg">
           <rect width="48" height="48" fill="#111"/><circle cx="24" cy="24" r="16" fill="#0f0"/>
         </svg>`
      )
    )
      .png()
      .toBuffer();
    const foreignFile = path.join(tmpDir, "foreign.png");
    fs.writeFileSync(foreignFile, foreign);
    const driver = makeDriver({ scene });

    const result = await typeKeys({
      config: baseConfig,
      step: { type: { keys: "hello", image: foreignFile, timeout: 1000 } },
      driver,
    });

    assert.equal(result.status, "FAIL");
    assert.equal(result.outputs.found, false);
    assert.equal(driver.__keys.length, 0, "keys must not be sent on a miss");
  });

  it("screenshot crop accepts an image criterion", async function () {
    const scene = await makeScene();
    const template = await makeTemplateFile(tmpDir);
    const target = makeElement({
      elementId: "glyph-el",
      rect: { x: 300, y: 200, width: 48, height: 48 },
    });
    const driver = makeDriver({ scene, pointElement: target });
    const outPath = path.join(tmpDir, "crop-out.png");

    const result = await saveScreenshot({
      config: baseConfig,
      step: {
        stepId: "crop-image",
        screenshot: { path: outPath, crop: { image: template } },
      },
      driver,
    });

    assert.equal(result.status, "PASS", result.description);
    assert.ok(fs.existsSync(outPath), "cropped screenshot must be written");
    const meta = await sharp(outPath).metadata();
    assert.equal(meta.width, 48);
    assert.equal(meta.height, 48);
  });
});
