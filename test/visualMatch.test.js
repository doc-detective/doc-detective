import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import {
  normalizeImageCriterion,
  isDataUri,
  resolveMatchThreshold,
  scaleLadder,
  captureRectToLogical,
  rectCenter,
  rectContainsPoint,
  dedupeMatches,
  loadTemplateBuffer,
  matchTemplate,
} from "../dist/core/tests/visualMatch.js";

const require = createRequire(import.meta.url);

// Lazily resolve the heavy deps; the matcher integration tests are skipped
// when either isn't installed in this environment (same gating pattern as
// saveScreenshot.test.js).
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
// Pure helpers (no heavy deps)
// ---------------------------------------------------------------------------

describe("visualMatch pure helpers", function () {
  describe("normalizeImageCriterion", function () {
    it("wraps a bare string path", function () {
      assert.deepEqual(normalizeImageCriterion("icons/gear.png"), {
        path: "icons/gear.png",
      });
    });

    it("wraps a bare data URI string", function () {
      const uri = "data:image/png;base64,iVBORw0KGgo=";
      assert.deepEqual(normalizeImageCriterion(uri), { path: uri });
    });

    it("passes an object form through", function () {
      const criterion = {
        path: "gear.png",
        matchThreshold: 0.9,
        region: { x: 0, y: 0, width: 100, height: 100 },
      };
      assert.deepEqual(normalizeImageCriterion(criterion), criterion);
    });

    it("throws on an empty string", function () {
      assert.throws(() => normalizeImageCriterion(""), /image/i);
    });

    it("throws on an object without a path", function () {
      assert.throws(() => normalizeImageCriterion({ matchThreshold: 0.5 }), /path/i);
    });

    it("throws on a non-string, non-object value", function () {
      assert.throws(() => normalizeImageCriterion(42), /image/i);
    });
  });

  describe("isDataUri", function () {
    it("accepts image data URIs", function () {
      assert.equal(isDataUri("data:image/png;base64,AAAA"), true);
      assert.equal(isDataUri("data:image/jpeg;base64,AAAA"), true);
    });

    it("rejects paths and other strings", function () {
      assert.equal(isDataUri("gear.png"), false);
      assert.equal(isDataUri("C:\\images\\gear.png"), false);
      assert.equal(isDataUri("https://example.com/gear.png"), false);
    });
  });

  describe("resolveMatchThreshold", function () {
    it("prefers the step value", function () {
      assert.equal(
        resolveMatchThreshold(0.65, { imageMatching: { matchThreshold: 0.9 } }),
        0.65
      );
    });

    it("falls back to the config default", function () {
      assert.equal(
        resolveMatchThreshold(undefined, {
          imageMatching: { matchThreshold: 0.9 },
        }),
        0.9
      );
    });

    it("falls back to 0.8 when neither is set", function () {
      assert.equal(resolveMatchThreshold(undefined, {}), 0.8);
      assert.equal(resolveMatchThreshold(undefined, undefined), 0.8);
    });

    it("honors an explicit step threshold of 0", function () {
      assert.equal(resolveMatchThreshold(0, {}), 0);
    });
  });

  describe("scaleLadder", function () {
    it("collapses to a single entry at 1:1 capture scale (plus fallbacks)", function () {
      const ladder = scaleLadder(1);
      // 1 first, then the cross-machine fallback scales; no duplicates.
      assert.equal(ladder[0], 1);
      assert.equal(new Set(ladder).size, ladder.length);
    });

    it("orders capture-scale variants first at 2x", function () {
      const ladder = scaleLadder(2);
      assert.deepEqual(ladder.slice(0, 3), [1, 2, 0.5]);
    });

    it("clamps entries to the [0.1, 8] range", function () {
      for (const s of scaleLadder(20)) {
        assert.ok(s >= 0.1 && s <= 8, `scale ${s} out of range`);
      }
    });

    it("collapses near-duplicate entries (within 1%)", function () {
      const ladder = scaleLadder(1.005);
      // 1.005 and 1 collapse; no two entries within 1% of each other.
      for (let i = 0; i < ladder.length; i++) {
        for (let j = i + 1; j < ladder.length; j++) {
          assert.ok(
            Math.abs(ladder[i] - ladder[j]) / ladder[j] > 0.01,
            `entries ${ladder[i]} and ${ladder[j]} are near-duplicates`
          );
        }
      }
    });

    it("falls back to a sane ladder for junk capture scales", function () {
      for (const junk of [0, -1, NaN, Infinity]) {
        const ladder = scaleLadder(junk);
        assert.ok(ladder.length >= 1, `empty ladder for ${junk}`);
        assert.equal(ladder[0], 1);
      }
    });
  });

  describe("captureRectToLogical", function () {
    it("divides by the capture scale", function () {
      assert.deepEqual(
        captureRectToLogical({ x: 200, y: 100, width: 64, height: 32 }, 2),
        { x: 100, y: 50, width: 32, height: 16 }
      );
    });

    it("is identity at scale 1", function () {
      const rect = { x: 5, y: 6, width: 7, height: 8 };
      assert.deepEqual(captureRectToLogical(rect, 1), rect);
    });

    it("treats junk scale as 1:1 rather than exploding", function () {
      const rect = { x: 5, y: 6, width: 7, height: 8 };
      assert.deepEqual(captureRectToLogical(rect, 0), rect);
      assert.deepEqual(captureRectToLogical(rect, NaN), rect);
    });
  });

  describe("rectCenter / rectContainsPoint", function () {
    it("computes the center", function () {
      assert.deepEqual(rectCenter({ x: 10, y: 20, width: 30, height: 40 }), {
        x: 25,
        y: 40,
      });
    });

    it("contains its own center and excludes outside points", function () {
      const rect = { x: 10, y: 20, width: 30, height: 40 };
      assert.equal(rectContainsPoint(rect, rectCenter(rect)), true);
      assert.equal(rectContainsPoint(rect, { x: 9, y: 21 }), false);
      assert.equal(rectContainsPoint(rect, { x: 41, y: 61 }), false);
    });
  });

  describe("dedupeMatches", function () {
    it("merges matches whose centers are within the separation, keeping the best", function () {
      const merged = dedupeMatches(
        [
          { rect: { x: 100, y: 100, width: 40, height: 40 }, score: 0.91 },
          { rect: { x: 104, y: 102, width: 40, height: 40 }, score: 0.97 },
          { rect: { x: 400, y: 100, width: 40, height: 40 }, score: 0.85 },
        ],
        16
      );
      assert.equal(merged.length, 2);
      // Sorted best-first; the near-duplicate pair collapsed to the 0.97.
      assert.equal(merged[0].score, 0.97);
      assert.equal(merged[1].score, 0.85);
    });

    it("keeps distinct matches beyond the separation", function () {
      const merged = dedupeMatches(
        [
          { rect: { x: 0, y: 0, width: 20, height: 20 }, score: 0.9 },
          { rect: { x: 30, y: 0, width: 20, height: 20 }, score: 0.9 },
        ],
        16
      );
      assert.equal(merged.length, 2);
    });

    it("returns an empty array for no matches", function () {
      assert.deepEqual(dedupeMatches([], 16), []);
    });
  });
});

// ---------------------------------------------------------------------------
// loadTemplateBuffer (fs + data URI; no opencv)
// ---------------------------------------------------------------------------

describe("visualMatch loadTemplateBuffer", function () {
  let tmpDir;
  before(function () {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-visualmatch-"));
  });
  after(function () {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("reads a template file from disk", async function () {
    const file = path.join(tmpDir, "tpl.png");
    fs.writeFileSync(file, Buffer.from("89504e47", "hex"));
    const buffer = await loadTemplateBuffer({ path: file });
    assert.deepEqual(buffer, Buffer.from("89504e47", "hex"));
  });

  it("decodes a data URI", async function () {
    const payload = Buffer.from("hello");
    const uri = `data:image/png;base64,${payload.toString("base64")}`;
    const buffer = await loadTemplateBuffer({ path: uri });
    assert.deepEqual(buffer, payload);
  });

  it("throws an actionable error for a missing file", async function () {
    await assert.rejects(
      () => loadTemplateBuffer({ path: path.join(tmpDir, "nope.png") }),
      /template/i
    );
  });

  it("throws an actionable error for a malformed data URI", async function () {
    await assert.rejects(
      () => loadTemplateBuffer({ path: "data:image/png;base64" }),
      /data URI/i
    );
  });
});

// ---------------------------------------------------------------------------
// matchTemplate (needs sharp + @appium/opencv; skipped when absent)
// ---------------------------------------------------------------------------

// Render a synthetic "screenshot": a light canvas with a distinctive
// multi-color glyph pasted at a known position. `scale` renders the whole
// scene at that multiple (simulating a HiDPI capture). `glyphs` positions are
// in 1x logical units.
async function makeScene({
  width = 800,
  height = 600,
  scale = 1,
  glyphs = [{ x: 300, y: 200 }],
} = {}) {
  const s = scale;
  const glyphSvg = (gx, gy) => `
    <rect x="${gx * s}" y="${gy * s}" width="${48 * s}" height="${48 * s}" rx="${6 * s}" fill="#2563eb"/>
    <circle cx="${(gx + 24) * s}" cy="${(gy + 24) * s}" r="${14 * s}" fill="none" stroke="#facc15" stroke-width="${4 * s}"/>
    <rect x="${(gx + 20) * s}" y="${(gy + 8) * s}" width="${8 * s}" height="${10 * s}" fill="#ef4444"/>`;
  const svg = `<svg width="${width * s}" height="${height * s}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#f3f4f6"/>
    ${glyphs.map((g) => glyphSvg(g.x, g.y)).join("")}
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

// Crop the glyph out of a 1x scene render -> the "user's template file".
async function makeTemplate() {
  const scene = await makeScene();
  return sharp(scene)
    .extract({ left: 300, top: 200, width: 48, height: 48 })
    .png()
    .toBuffer();
}

(sharp && opencv ? describe : describe.skip)("visualMatch matchTemplate", function () {
  // Template matching over full scale ladders is real work; WASM init on the
  // first call adds ~600ms.
  this.timeout(120000);

  it("finds an exact-scale template at the right rect with a high score", async function () {
    const capture = await makeScene();
    const template = await makeTemplate();
    const result = await matchTemplate({
      capture,
      template,
      threshold: 0.8,
      captureScale: 1,
    });
    assert.ok(result.best, "expected a match");
    assert.ok(result.best.score >= 0.99, `score ${result.best.score}`);
    assert.ok(Math.abs(result.best.rect.x - 300) <= 2, `x ${result.best.rect.x}`);
    assert.ok(Math.abs(result.best.rect.y - 200) <= 2, `y ${result.best.rect.y}`);
    assert.ok(Math.abs(result.best.scaleUsed - 1) < 0.01);
    assert.equal(result.matches.length, 1);
  });

  it("recovers a 1x template on a 2x capture via the scale ladder", async function () {
    const capture = await makeScene({ scale: 2 });
    const template = await makeTemplate();
    const result = await matchTemplate({
      capture,
      template,
      threshold: 0.8,
      captureScale: 2,
    });
    assert.ok(result.best, "expected a match across scales");
    assert.ok(result.best.score >= 0.9, `score ${result.best.score}`);
    // Rect is in CAPTURE pixels: 2x the logical position.
    assert.ok(Math.abs(result.best.rect.x - 600) <= 4, `x ${result.best.rect.x}`);
    assert.ok(Math.abs(result.best.rect.y - 400) <= 4, `y ${result.best.rect.y}`);
    assert.ok(Math.abs(result.best.scaleUsed - 2) < 0.01, `scaleUsed ${result.best.scaleUsed}`);
  });

  it("reports multiple matches for duplicate targets (ambiguity signal)", async function () {
    const capture = await makeScene({
      glyphs: [
        { x: 100, y: 100 },
        { x: 500, y: 400 },
      ],
    });
    const template = await makeScene().then((scene) =>
      sharp(scene).extract({ left: 300, top: 200, width: 48, height: 48 }).png().toBuffer()
    );
    // The template glyph is identical to both pasted glyphs.
    const result = await matchTemplate({
      capture,
      template,
      threshold: 0.8,
      captureScale: 1,
    });
    assert.equal(result.matches.length, 2, `matches: ${JSON.stringify(result.matches)}`);
  });

  it("returns no best but a bestCandidate below threshold when asked", async function () {
    // A template that is NOT in the scene.
    const foreign = await sharp(
      Buffer.from(
        `<svg width="48" height="48" xmlns="http://www.w3.org/2000/svg">
           <rect width="48" height="48" fill="#111"/>
           <circle cx="24" cy="24" r="16" fill="#0f0"/>
         </svg>`
      )
    )
      .png()
      .toBuffer();
    const capture = await makeScene();
    const result = await matchTemplate({
      capture,
      template: foreign,
      threshold: 0.8,
      captureScale: 1,
      collectBestCandidate: true,
    });
    assert.equal(result.best, null);
    assert.deepEqual(result.matches, []);
    assert.ok(result.bestCandidate, "expected a best candidate for diagnostics");
    assert.ok(
      result.bestCandidate.score < 0.8,
      `bestCandidate score ${result.bestCandidate.score}`
    );
  });

  it("restricts the search to a region and reports capture-space rects", async function () {
    const capture = await makeScene({
      glyphs: [
        { x: 100, y: 100 },
        { x: 500, y: 400 },
      ],
    });
    const template = await makeTemplate();
    const result = await matchTemplate({
      capture,
      template,
      threshold: 0.8,
      captureScale: 1,
      regionPx: { x: 400, y: 300, width: 400, height: 300 },
    });
    assert.ok(result.best, "expected a match inside the region");
    assert.equal(result.matches.length, 1, "the out-of-region duplicate must be excluded");
    // Rect must come back in full-capture coordinates (origin added back).
    assert.ok(Math.abs(result.best.rect.x - 500) <= 2, `x ${result.best.rect.x}`);
    assert.ok(Math.abs(result.best.rect.y - 400) <= 2, `y ${result.best.rect.y}`);
  });

  it("fails with an actionable message when the matching dep is unavailable", async function () {
    const capture = await makeScene();
    const template = await makeTemplate();
    await assert.rejects(
      () =>
        matchTemplate({
          capture,
          template,
          threshold: 0.8,
          captureScale: 1,
          deps: {
            getOpenCv: async () => {
              throw new Error("Cannot find module '@appium/opencv'");
            },
          },
        }),
      /doc-detective install/i
    );
  });
});
