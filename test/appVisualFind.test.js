import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { findAppElement } from "../dist/core/tests/appSurface.js";
import { findElement } from "../dist/core/tests/findElement.js";

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

// ---------------------------------------------------------------------------
// findElement app-branch integration: rect-only contract, coordinate-tap
// fallback, and the sub-effect guards. Uses a Windows-platform fake surface
// (activeAppWindow returns null off macOS, so no window enumeration runs).
// ---------------------------------------------------------------------------

function makeAppContext(driver, { name = "fakeapp" } = {}) {
  const entry = { platform: "windows", driver, name };
  const tracker = { mru: [{ kind: "app", name }] };
  const appSession = {
    surfaces: new Map([[name, entry]]),
    activeApp: name,
    tracker,
  };
  return { entry, appSession, tracker };
}

function makeRecordingAppDriver({
  scene,
  pageSource = WINDOWS_XML_ELSEWHERE,
  recoveredElement = null,
} = {}) {
  const driver = makeAppDriver({ scene, pageSource, recoveredElement });
  driver.__executes = [];
  const baseExecute = driver.execute;
  driver.execute = async (cmd, args) => {
    driver.__executes.push({ cmd, args });
    return baseExecute(cmd, args);
  };
  return driver;
}

(sharp && opencv ? describe : describe.skip)("findElement app image criterion", function () {
  this.timeout(180000);

  let tmpDir, template, foreignFile;
  before(async function () {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-app-fe-visual-"));
    const scene = await makeScene();
    fs.writeFileSync(
      (template = path.join(tmpDir, "glyph.png")),
      await sharp(scene).extract({ left: 300, top: 200, width: 48, height: 48 }).png().toBuffer()
    );
    fs.writeFileSync(
      (foreignFile = path.join(tmpDir, "foreign.png")),
      await sharp(
        Buffer.from(
          `<svg width="48" height="48" xmlns="http://www.w3.org/2000/svg"><rect width="48" height="48" fill="#111"/><circle cx="24" cy="24" r="16" fill="#0f0"/></svg>`
        )
      ).png().toBuffer()
    );
  });
  after(function () {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("rect-only match PASSes with imageMatch outputs and taps by coordinates on click", async function () {
    const scene = await makeScene();
    const driver = makeRecordingAppDriver({ scene });
    const { appSession, tracker } = makeAppContext(driver);

    const result = await findElement({
      config: { logLevel: "silent" },
      step: {
        find: {
          image: template,
          surface: { app: "fakeapp" },
          click: true,
          timeout: 5000,
        },
      },
      driver: null,
      appSession,
      surfaceTracker: tracker,
    });

    assert.equal(result.status, "PASS", result.description);
    assert.equal(result.outputs.found, true);
    assert.ok(result.outputs.imageMatch, "expected imageMatch outputs");
    assert.match(result.description, /coordinates/i);
    // Windows tapAtPoint = windows: click at SCREEN coords: window origin
    // (100,50 from getWindowRect) + match center (324,224).
    const tap = driver.__executes.find((e) => e.cmd === "windows: click");
    assert.ok(tap, "expected a coordinate tap");
    assert.equal(tap.args.x, 424);
    assert.equal(tap.args.y, 274);
  });

  it("rect-only match FAILs a non-left click with guidance", async function () {
    const scene = await makeScene();
    const driver = makeRecordingAppDriver({ scene });
    const { appSession, tracker } = makeAppContext(driver);

    const result = await findElement({
      config: { logLevel: "silent" },
      step: {
        find: {
          image: template,
          surface: { app: "fakeapp" },
          click: { button: "right" },
          timeout: 5000,
        },
      },
      driver: null,
      appSession,
      surfaceTracker: tracker,
    });

    assert.equal(result.status, "FAIL");
    assert.match(result.description, /recovered element/i);
  });

  it("rect-only match FAILs the type sub-effect with the app-surface message", async function () {
    const scene = await makeScene();
    const driver = makeRecordingAppDriver({ scene });
    const { appSession, tracker } = makeAppContext(driver);

    const result = await findElement({
      config: { logLevel: "silent" },
      step: {
        find: {
          image: template,
          surface: { app: "fakeapp" },
          type: "hello",
          timeout: 5000,
        },
      },
      driver: null,
      appSession,
      surfaceTracker: tracker,
    });

    assert.equal(result.status, "FAIL");
    assert.match(result.description, /type/i);
  });

  it("recovered element PASSes and clicks through the element", async function () {
    const scene = await makeScene();
    const recovered = makeAppElement({ elementId: "gear" });
    let clicked = 0;
    recovered.click = async () => {
      clicked++;
    };
    const driver = makeRecordingAppDriver({
      scene,
      pageSource: WINDOWS_XML,
      recoveredElement: recovered,
    });
    const { appSession, tracker } = makeAppContext(driver);

    const result = await findElement({
      config: { logLevel: "silent" },
      step: {
        find: {
          image: template,
          surface: { app: "fakeapp" },
          click: true,
          timeout: 5000,
        },
      },
      driver: null,
      appSession,
      surfaceTracker: tracker,
    });

    assert.equal(result.status, "PASS", result.description);
    assert.ok(result.outputs.imageMatch);
    // The UIA Invoke path runs first (fake execute resolves), so either the
    // invoke fired or the element click did — assert the click landed at all.
    const invoked = driver.__executes.some((e) => e.cmd === "windows: invoke");
    assert.ok(invoked || clicked > 0, "expected an element-based click");
    // The discriminating contract: a recovered element means the
    // coordinate-tap fallback must NOT run.
    assert.ok(
      !driver.__executes.some((e) => e.cmd === "windows: click"),
      "expected no coordinate-tap fallback"
    );
  });

  it("a visual miss FAILs with structured imageMiss outputs", async function () {
    const scene = await makeScene();
    const driver = makeRecordingAppDriver({ scene });
    const { appSession, tracker } = makeAppContext(driver);
    const outDir = fs.mkdtempSync(path.join(tmpDir, "out-"));

    const result = await findElement({
      config: { logLevel: "silent", output: outDir },
      step: {
        find: {
          image: foreignFile,
          surface: { app: "fakeapp" },
          timeout: 1200,
        },
      },
      driver: null,
      appSession,
      surfaceTracker: tracker,
    });

    assert.equal(result.status, "FAIL");
    assert.match(result.description, /best visual candidate scored/i);
    assert.ok(result.outputs.imageMiss, "expected imageMiss outputs");
    assert.ok(result.outputs.imageMiss.bestScore < 0.8);
  });
});

// Appended: the app-path timeout verdict must also reflect the FINAL state.
(sharp && opencv ? describe : describe.skip)("findAppElement ambiguity settling", function () {
  this.timeout(180000);

  it("reports a miss (not ambiguity) when duplicate matches settle to zero", async function () {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-app-settle-"));
    try {
      const duoScene = await makeScene([
        { x: 100, y: 100 },
        { x: 500, y: 400 },
      ]);
      const emptyScene = await sharp(
        Buffer.from(
          `<svg width="800" height="600" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f3f4f6"/></svg>`
        )
      )
        .png()
        .toBuffer();
      const template = path.join(tmpDir, "glyph.png");
      fs.writeFileSync(
        template,
        await sharp(duoScene).extract({ left: 100, top: 100, width: 48, height: 48 }).png().toBuffer()
      );
      const scenes = [duoScene];
      const driver = makeAppDriver({ scene: duoScene });
      driver.saveScreenshot = async (filePath) => {
        fs.writeFileSync(filePath, scenes.shift() ?? emptyScene);
      };

      const result = await findAppElement({
        driver,
        criteria: { image: template },
        timeout: 2500,
        platform: "windows",
        visual: baseVisual(driver),
      });

      assert.ok(result.error, "expected a not-found error");
      assert.doesNotMatch(result.error, /regions matched the template/);
      assert.match(result.error, /visual candidate|no candidate/i);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
