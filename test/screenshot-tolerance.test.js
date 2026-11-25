// ADR 01220: `threshold`, `maxDiffPixels`, and diff images for screenshot
// comparisons.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { saveScreenshot } from "../dist/core/tests/saveScreenshot.js";
import { getRunOutputDir } from "../dist/core/utils.js";

const require = createRequire(import.meta.url);
const { PNG } = require("pngjs");

const WIDTH = 100;
const HEIGHT = 80;

// A gray PNG; `paint(x, y)` returns an [r, g, b] override or undefined.
function png(paint = () => undefined, gray = 128) {
  const image = new PNG({ width: WIDTH, height: HEIGHT });
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const [r, g, b] = paint(x, y) ?? [gray, gray, gray];
      const i = (y * WIDTH + x) * 4;
      image.data[i] = r;
      image.data[i + 1] = g;
      image.data[i + 2] = b;
      image.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(image);
}

function fakeDriver(buffer) {
  return {
    async takeScreenshot() {
      return buffer.toString("base64");
    },
  };
}

// Font smoothing noise: the top half shifts by six levels, far below what a
// reader can see.
const noisy = () => png((x, y) => (y < HEIGHT / 2 ? [134, 134, 134] : undefined));
// A real change: a 2x5 red block, exactly 10 pixels.
const changed = () => png((x, y) => (x < 2 && y < 5 ? [255, 0, 0] : undefined));

describe("screenshot tolerance and diff images (ADR 01220)", function () {
  this.timeout(20000);
  let tmpDir;
  let runDir;
  let target;

  beforeEach(function () {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-tolerance-"));
    runDir = path.join(tmpDir, "run", "screenshots");
    target = path.join(tmpDir, "docs", "shot.png");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, png());
  });
  afterEach(function () {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function compare(screenshot, capture, options = {}, stepId = "t") {
    return saveScreenshot({
      config: { outputDir: tmpDir },
      step: { stepId, screenshot: { path: target, overwrite: "aboveVariation", ...screenshot } },
      driver: fakeDriver(capture),
      ...options,
    });
  }

  it("ignores anti-aliasing noise at the default threshold", async function () {
    const result = await compare({ maxVariation: 0.05 }, noisy());
    assert.equal(result.status, "PASS");
    assert.equal(result.outputs.diffPixels, 0);
  });

  it("counts the same noise at `threshold: 0`", async function () {
    const result = await compare({ maxVariation: 0.05, threshold: 0 }, noisy());
    assert.equal(result.status, "WARNING");
    assert.equal(result.outputs.diffPixels, (WIDTH * HEIGHT) / 2);
  });

  it("passes when changed pixels are within `maxDiffPixels`", async function () {
    const result = await compare({ maxVariation: 1, maxDiffPixels: 20 }, changed());
    assert.equal(result.status, "PASS");
    assert.equal(result.outputs.diffPixels, 10);
    assert.deepEqual(
      result.assertions.find((a) => a.statement.includes("diffPixels")),
      { statement: "$$outputs.diffPixels <= 20", source: "implicit", result: "PASS" }
    );
  });

  it("warns when changed pixels exceed `maxDiffPixels`, even within `maxVariation`", async function () {
    const result = await compare({ maxVariation: 1, maxDiffPixels: 5 }, changed());
    assert.equal(result.status, "WARNING");
    assert.ok(
      result.description.includes(
        "Screenshot differs from the reference by 10 pixels, more than `maxDiffPixels` (5)."
      ),
      result.description
    );
    assert.deepEqual(
      result.assertions.find((a) => a.statement.includes("diffPixels")),
      { statement: "$$outputs.diffPixels <= 5", source: "implicit", result: "WARNING" }
    );
  });

  it("checks `maxDiffPixels` alongside the default `maxVariation`", async function () {
    const result = await compare({ maxDiffPixels: 5 }, changed());
    assert.equal(result.status, "WARNING");
    assert.deepEqual(
      result.assertions.map((a) => [a.statement, a.result]),
      [
        ["$$outputs.aspectRatioMatches == true", "PASS"],
        ["$$outputs.variation <= 0.05", "PASS"],
        ["$$outputs.diffPixels <= 5", "WARNING"],
      ]
    );
  });

  it("writes the diff and the previous reference to the run folder", async function () {
    const reference = fs.readFileSync(target);
    const result = await compare({ maxVariation: 0.0001 }, changed(), { screenshotsDir: () => runDir });
    assert.equal(result.status, "WARNING");

    const diffPath = path.join(runDir, "shot-t.diff.png");
    const previousPath = path.join(runDir, "shot-t.previous.png");
    assert.equal(result.outputs.diffPath, diffPath);
    assert.equal(result.outputs.previousPath, previousPath);
    // The reference was overwritten (aboveVariation), but the previous copy
    // keeps the original bytes.
    assert.ok(!fs.readFileSync(target).equals(reference));
    assert.ok(fs.readFileSync(previousPath).equals(reference));
    const diff = PNG.sync.read(fs.readFileSync(diffPath));
    assert.equal(diff.width, WIDTH);
    assert.equal(diff.height, HEIGHT);
    assert.ok(result.description.endsWith(`See \`${diffPath}\`.`), result.description);
    // Nothing new lands next to the docs.
    assert.deepEqual(fs.readdirSync(path.dirname(target)), ["shot.png"]);
  });

  it("writes no diff when the images are identical", async function () {
    const result = await compare({ maxVariation: 0.05 }, png(), { screenshotsDir: () => runDir });
    assert.equal(result.status, "PASS");
    assert.equal(result.outputs.diffPixels, 0);
    assert.equal(result.outputs.diffPath, undefined);
    assert.equal(result.outputs.previousPath, undefined);
    assert.equal(fs.existsSync(runDir), false);
  });

  it("keeps the artifacts of two references that share a basename", async function () {
    const other = path.join(tmpDir, "docs", "b", "shot.png");
    fs.mkdirSync(path.dirname(other), { recursive: true });
    fs.writeFileSync(other, png());
    const first = await compare({ maxVariation: 0.0001 }, changed(), { screenshotsDir: () => runDir }, "a");
    target = other;
    const second = await compare({ maxVariation: 0.0001 }, changed(), { screenshotsDir: () => runDir }, "b");
    assert.equal(first.outputs.diffPath, path.join(runDir, "shot-a.diff.png"));
    assert.equal(second.outputs.diffPath, path.join(runDir, "shot-b.diff.png"));
    assert.notEqual(first.outputs.previousPath, second.outputs.previousPath);
    assert.deepEqual(fs.readdirSync(runDir).sort(), [
      "shot-a.diff.png",
      "shot-a.previous.png",
      "shot-b.diff.png",
      "shot-b.previous.png",
    ]);
  });

  it("keeps each pair when the same step runs twice", async function () {
    const first = await compare({ maxVariation: 0.0001 }, changed(), { screenshotsDir: () => runDir });
    // The first run overwrote the reference; restore it so the rerun drifts too.
    fs.writeFileSync(target, png());
    const second = await compare({ maxVariation: 0.0001 }, changed(), { screenshotsDir: () => runDir });
    assert.equal(first.outputs.diffPath, path.join(runDir, "shot-t.diff.png"));
    assert.equal(first.outputs.previousPath, path.join(runDir, "shot-t.previous.png"));
    assert.equal(second.outputs.diffPath, path.join(runDir, "shot-t-2.diff.png"));
    assert.equal(second.outputs.previousPath, path.join(runDir, "shot-t-2.previous.png"));
    assert.deepEqual(fs.readdirSync(runDir).sort(), [
      "shot-t-2.diff.png",
      "shot-t-2.previous.png",
      "shot-t.diff.png",
      "shot-t.previous.png",
    ]);
  });

  it("falls back to the run folder's screenshots folder without `screenshotsDir`", async function () {
    const config = { outputDir: tmpDir };
    const result = await saveScreenshot({
      config,
      step: { stepId: "t", screenshot: { path: target, maxVariation: 0.0001 } },
      driver: fakeDriver(changed()),
    });
    assert.equal(result.status, "WARNING");
    const dir = path.join(getRunOutputDir(config), "screenshots");
    assert.equal(result.outputs.diffPath, path.join(dir, "shot-t.diff.png"));
    assert.equal(result.outputs.previousPath, path.join(dir, "shot-t.previous.png"));
    assert.ok(fs.existsSync(result.outputs.diffPath));
    assert.ok(fs.existsSync(result.outputs.previousPath));
    assert.deepEqual(fs.readdirSync(path.dirname(target)), ["shot.png"]);
  });
});
