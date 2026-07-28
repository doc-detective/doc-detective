import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { findAppElement } from "../dist/core/tests/appSurface.js";

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

// 800x600 window capture with the distinctive glyph at (300,200), 1x scale.
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

const WINDOWS_XML = `<?xml version="1.0"?>
<Window x="0" y="0" width="800" height="600">
  <Pane x="0" y="0" width="800" height="600">
    <Button x="300" y="200" width="48" height="48" Name="Gear"/>
  </Pane>
</Window>`;

// Page source whose bounds DON'T contain the glyph -> recovery must fail.
const WINDOWS_XML_ELSEWHERE = `<?xml version="1.0"?>
<Window x="0" y="0" width="800" height="600">
  <Pane x="0" y="0" width="10" height="10"/>
</Window>`;

function makeAppElement({ elementId = "app-el-1", text = "Gear" } = {}) {
  return {
    elementId,
    getText: async () => text,
    waitForExist: async () => true,
    isExisting: async () => true,
    click: async () => {},
  };
}

function makeAppDriver({
  scene,
  pageSource = WINDOWS_XML,
  locatorElement = null,
  recoveredElement = null,
  elementRect = { x: 300, y: 200, width: 48, height: 48 },
} = {}) {
  return {
    __taps: [],
    saveScreenshot: async (filePath) => {
      fs.writeFileSync(filePath, scene);
    },
    getWindowRect: async () => ({ x: 100, y: 50, width: 800, height: 600 }),
    getPageSource: async () => pageSource,
    getElementRect: async () => elementRect,
    $: async (selector) => {
      if (typeof selector === "string" && selector.startsWith("/Window")) {
        return recoveredElement;
      }
      return locatorElement;
    },
    execute: async () => {},
  };
}

const baseVisual = (driver, config = {}) => ({
  entry: { platform: "windows", driver },
  windowTarget: null,
  config,
  stepId: "app-visual-test",
});

(sharp && opencv ? describe : describe.skip)("findAppElement image criterion", function () {
  this.timeout(180000);

  let tmpDir, template;
  before(async function () {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-app-visual-"));
    const scene = await makeScene();
    const buffer = await sharp(scene)
      .extract({ left: 300, top: 200, width: 48, height: 48 })
      .png()
      .toBuffer();
    template = path.join(tmpDir, "glyph.png");
    fs.writeFileSync(template, buffer);
  });
  after(function () {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("recovers a real element from the page source (image-only)", async function () {
    const scene = await makeScene();
    const recovered = makeAppElement({ elementId: "recovered" });
    const driver = makeAppDriver({ scene, recoveredElement: recovered });

    const result = await findAppElement({
      driver,
      criteria: { image: template },
      timeout: 5000,
      platform: "windows",
      visual: baseVisual(driver),
    });

    assert.equal(result.error, undefined, result.error);
    assert.equal(result.element, recovered);
    assert.ok(result.imageMatch, "expected imageMatch");
    assert.ok(result.imageMatch.score >= 0.99);
    assert.ok(Math.abs(result.imageMatch.rect.x - 300) <= 2);
    assert.ok(Math.abs(result.imageMatch.center.x - 324) <= 3);
  });

  it("falls back to rect-only when recovery misses", async function () {
    const scene = await makeScene();
    const driver = makeAppDriver({
      scene,
      pageSource: WINDOWS_XML_ELSEWHERE,
    });

    const result = await findAppElement({
      driver,
      criteria: { image: template },
      timeout: 5000,
      platform: "windows",
      visual: baseVisual(driver),
    });

    assert.equal(result.error, undefined, result.error);
    assert.equal(result.element, null);
    assert.equal(result.recovered, false);
    assert.ok(result.imageMatch, "rect-only contract must include imageMatch");
    assert.match(result.recoveryReason, /bounds/i);
  });

  it("AND semantics: locator element must contain a match center", async function () {
    const scene = await makeScene();
    const locatorElement = makeAppElement({ elementId: "gear-btn" });
    const driver = makeAppDriver({ scene, locatorElement });

    const result = await findAppElement({
      driver,
      criteria: { image: template, elementText: "Gear" },
      timeout: 5000,
      platform: "windows",
      visual: baseVisual(driver),
    });

    assert.equal(result.error, undefined, result.error);
    assert.equal(result.element, locatorElement);
    assert.ok(result.imageMatch);
  });

  it("AND semantics: rejects a locator element outside the match", async function () {
    const scene = await makeScene();
    const locatorElement = makeAppElement({ elementId: "elsewhere" });
    const driver = makeAppDriver({
      scene,
      locatorElement,
      elementRect: { x: 0, y: 0, width: 20, height: 20 },
    });

    const result = await findAppElement({
      driver,
      criteria: { image: template, elementText: "Gear" },
      timeout: 1500,
      platform: "windows",
      visual: baseVisual(driver),
    });

    assert.ok(result.error, "expected a not-found error");
    assert.equal(result.element, undefined);
  });

  it("errors cleanly without the visual context", async function () {
    const scene = await makeScene();
    const driver = makeAppDriver({ scene });

    const result = await findAppElement({
      driver,
      criteria: { image: template },
      timeout: 1000,
      platform: "windows",
    });

    assert.ok(result.error);
    assert.match(result.error, /surface/i);
  });

  it("reports a miss with the best score", async function () {
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
    const scene = await makeScene();
    const driver = makeAppDriver({ scene });
    const outDir = fs.mkdtempSync(path.join(tmpDir, "out-"));

    const result = await findAppElement({
      driver,
      criteria: { image: foreignFile },
      timeout: 1200,
      platform: "windows",
      visual: baseVisual(driver, { output: outDir }),
    });

    assert.ok(result.error);
    assert.match(result.error, /best visual candidate scored/i);
  });
});
