// Proofs for the claims in docs/design/visual-element-matching.md. Each test name
// starts with the claim it proves, so `manni cite` can pin a claim to its proof.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePaths } from "../dist/core/files.js";
import { loadHeavyDep } from "../dist/runtime/loader.js";
import { findElementByCriteria, setElementOutputs } from "../dist/core/tests/findStrategies.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let expect;
before(async function () {
  ({ expect } = await import("chai"));
});

describe("elementImage paths", function () {
  const specFile = path.join(__dirname, "fixtures-dir", "doc.spec.json");
  const resolved = (relativePathBase, elementImage) =>
    resolvePaths({
      config: { relativePathBase },
      object: { find: { elementImage } },
      filePath: specFile,
      nested: true,
      objectType: "spec",
    });

  it("image-path-relative: a string path resolves against the spec file", async function () {
    const out = await resolved("file", "icons/save.svg");
    expect(out.find.elementImage).to.equal(path.join(path.dirname(specFile), "icons", "save.svg"));
  });

  it("image-path-relative: an object's path resolves against the spec file", async function () {
    const out = await resolved("file", { path: "icons/save.svg", threshold: 0.95 });
    expect(out.find.elementImage).to.deep.equal({
      path: path.join(path.dirname(specFile), "icons", "save.svg"),
      threshold: 0.95,
    });
  });

  it("image-path-relative: relativePathBase cwd resolves against the working directory", async function () {
    const out = await resolved("cwd", "icons/save.svg");
    expect(out.find.elementImage).to.equal(path.resolve("icons/save.svg"));
  });

  it("image-path-relative: base64 isn't treated as a path", async function () {
    const out = await resolved("file", { base64: "iVBORw0KGgo=" });
    expect(out.find.elementImage).to.deep.equal({ base64: "iVBORw0KGgo=" });
  });
});

// ---- The matcher. Pages here are composed with sharp, so these prove the algorithm.
// test/core-artifacts/interactions/find-image.spec.json proves it across real browsers.
describe("elementImage matching", function () {
  this.timeout(180000);
  let sharp, match, visual, tmp;

  const icon = (body, color, h, stroke = 2) =>
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${h}" height="${h}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${stroke}">${body}</svg>`
    );
  const GEAR = `<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M5 19l3-3M16 8l3-3"/>`;
  const RING = `<circle cx="12" cy="12" r="9"/>`;
  const solid = (color, h) =>
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${h}" height="${h}" viewBox="0 0 24 24"><path d="M12 2l10 18H2z" fill="${color}"/></svg>`
    );
  const disc = (fill, mark, path_, h) =>
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${h}" height="${h}" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="${fill}"/><path d="${path_}" fill="none" stroke="${mark}" stroke-width="7"/></svg>`
    );
  const check = (fill, mark, h = 32) => disc(fill, mark, "M18 33l10 10 18-22", h);
  const cross = (fill, mark, h = 32) => disc(fill, mark, "M20 20l24 24M44 20L20 44", h);

  // items: { svg, x, y }, drawn over a flat background, in device pixels.
  const page = async ({ width = 400, height = 300, background = "#ffffff", items = [], density = 1 }) =>
    sharp({ create: { width: width * density, height: height * density, channels: 4, background } })
      .composite(items.map((item) => ({ input: item.svg, left: item.x, top: item.y })))
      .png()
      .toBuffer();
  const once = (capture, elementImage, options = {}) =>
    match.matchImageOnce({ capture, elementImage, scale: 1, ...options });
  const near = (found, x, y, tolerance = 2) => {
    expect(found, "a match").to.exist;
    expect(Math.abs(found.x - x), `x ${found.x} vs ${x}`).to.be.at.most(tolerance);
    expect(Math.abs(found.y - y), `y ${found.y} vs ${y}`).to.be.at.most(tolerance);
  };
  const fileOf = (name, buffer) => {
    const p = path.join(tmp, name);
    fs.writeFileSync(p, buffer);
    return p;
  };
  const b64 = (buffer) => buffer.toString("base64");

  // A driver with just enough to capture a page and record pointer actions.
  function fakeDriver(capture, { viewport, captures, dom } = {}) {
    let size = null;
    const nothing = async () => null;
    // A DOM element, for the end of a drag that doesn't use an image.
    const domElement = dom && {
      elementId: "dom",
      dom,
      getText: nothing,
      getHTML: nothing,
      getTagName: nothing,
      getValue: nothing,
      isClickable: nothing,
      isEnabled: nothing,
      isSelected: nothing,
      isDisplayed: nothing,
      getLocation: async () => ({ x: dom.x, y: dom.y }),
      getSize: async () => ({ width: dom.width, height: dom.height }),
    };
    const driver = {
      actions: [],
      executed: [],
      typed: [],
      isMobile: false,
      state: {},
      takeScreenshot: async () => b64((captures && captures.shift()) || capture),
      pause: nothing,
      keys: async (keys) => driver.typed.push(...[].concat(keys)),
      getWindowSize: async () => ({ width: 400, height: 300 }),
      $$: async () => (domElement ? [domElement] : []),
      execute: async (fn, ...args) => {
        driver.executed.push(String(fn));
        if (args[0]?.dom) {
          const { x, y, width, height } = args[0].dom;
          return { x: x + width / 2, y: y + height / 2 };
        }
        if (String(fn).includes("devicePixelRatio")) return 1;
        if (!size) {
          const info = await sharp(capture).metadata();
          size = viewport ?? { width: info.width, height: info.height };
        }
        return size;
      },
    };
    driver.action = () => {
      const chain = {
        move: (args) => (driver.actions.push(["move", args]), chain),
        down: (args) => (driver.actions.push(["down", args]), chain),
        up: (args) => (driver.actions.push(["up", args]), chain),
        pause: (ms) => (driver.actions.push(["pause", ms]), chain),
        perform: async () => {},
      };
      return chain;
    };
    return driver;
  }

  before(async function () {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "find-image-"));
    const mod = await loadHeavyDep("sharp");
    sharp = mod.default ?? mod;
    match = await import("../dist/core/tests/imageMatch.js");
    visual = await import("../dist/core/tests/visualMatch.js");
  });
  after(function () {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  describe("process state", function () {
    it("image-process-listeners: matching leaves process listeners as it found them", async function () {
      const rejection = () => {};
      const exception = () => {};
      process.on("unhandledRejection", rejection);
      process.on("uncaughtException", exception);
      const seen = {
        unhandledRejection: process.listeners("unhandledRejection"),
        uncaughtException: process.listeners("uncaughtException"),
      };
      try {
        await match.loadOpenCv();
        const svg = icon(GEAR, "#333333", 24);
        await once(await page({ items: [{ svg, x: 40, y: 40 }] }), { base64: b64(svg) });
        expect(process.listeners("unhandledRejection")).to.deep.equal(seen.unhandledRejection);
        expect(process.listeners("uncaughtException")).to.deep.equal(seen.uncaughtException);
      } finally {
        process.removeListener("unhandledRejection", rejection);
        process.removeListener("uncaughtException", exception);
      }
    });

    it("image-process-listeners: a one-time listener stays one-time", async function () {
      // A fresh copy of the module, because every other test shares one that's already loaded.
      const fresh = await import(`../dist/core/tests/imageMatch.js?once=${Date.now()}`);
      const rejection = () => {};
      process.once("unhandledRejection", rejection);
      try {
        await fresh.loadOpenCv();
        expect(process.rawListeners("unhandledRejection").some((l) => l.listener === rejection)).to.equal(true);
      } finally {
        process.removeListener("unhandledRejection", rejection);
      }
    });

    it("image-load-retry: a failed load isn't kept, so a later step can load the matcher", async function () {
      // A fresh copy of the module, because every other test shares one that's already loaded.
      const fresh = await import(`../dist/core/tests/imageMatch.js?retry=${Date.now()}`);
      // An unsafe cache path fails the install before anything downloads.
      const failure = await fresh.loadOpenCv({ cacheDir: path.join(tmp, "bad;dir") }).catch((error) => error);
      expect(failure.message).to.include("shell-metacharacter");
      const cv = await fresh.loadOpenCv();
      expect(cv.getBuildInformation).to.be.a("function");
    });

    it("image-matcher-error: an error while matching fails the step with a reason", async function () {
      const svg = icon(GEAR, "#333333", 24);
      for (const capture of [Buffer.from("short"), Buffer.alloc(2048, 65)]) {
        const driver = { isMobile: false, takeScreenshot: async () => b64(capture), execute: async () => ({ width: 400 }) };
        const found = await visual.findByImage({ elementImage: { base64: b64(svg) }, driver, timeout: 0 });
        expect(found.element).to.equal(null);
        expect(found.error).to.match(/^Couldn't match base64 reference: ./);
      }
    });
  });

  describe("reference forms", function () {
    it("image-file-formats: a PNG, a JPEG, and an SVG all match", async function () {
      const svg = icon(GEAR, "#333333", 24);
      const shot = await page({ items: [{ svg, x: 80, y: 60 }] });
      near((await once(shot, fileOf("gear.svg", svg))).match, 80, 60);
      near((await once(shot, fileOf("gear.png", await sharp(svg).png().toBuffer()))).match, 80, 60);
      const jpeg = await sharp(shot).extract({ left: 70, top: 50, width: 44, height: 44 }).jpeg({ quality: 100 }).toBuffer();
      near((await once(shot, fileOf("gear.jpg", jpeg))).match, 70, 50);
    });

    it("image-base64: the value works with or without a data prefix", async function () {
      const svg = icon(GEAR, "#333333", 24);
      const png = await sharp(svg).png().toBuffer();
      const shot = await page({ items: [{ svg, x: 80, y: 60 }] });
      near((await once(shot, { base64: b64(png) })).match, 80, 60);
      near((await once(shot, { base64: `data:image/png;base64,${b64(png)}` })).match, 80, 60);
    });

    it("image-missing-file: a missing file fails at once, without waiting", async function () {
      const started = Date.now();
      const found = await visual.findByImage({
        elementImage: path.join(tmp, "none.png"),
        driver: fakeDriver(await page({})),
        timeout: 5000,
      });
      expect(found.element).to.equal(null);
      expect(found.error).to.match(/none\.png/);
      expect(Date.now() - started).to.be.below(2000);
    });

    it("image-missing-file: a file that isn't an image fails at once", async function () {
      const started = Date.now();
      const found = await visual.findByImage({
        elementImage: fileOf("note.png", Buffer.from("not an image")),
        driver: fakeDriver(await page({})),
        timeout: 5000,
      });
      expect(found.error).to.match(/isn't an image/);
      expect(Date.now() - started).to.be.below(2000);
    });

    it("image-missing-file: an invalid base64 value fails at once", async function () {
      const started = Date.now();
      const found = await visual.findByImage({
        elementImage: { base64: "bm90IGFuIGltYWdl" },
        driver: fakeDriver(await page({})),
        timeout: 5000,
      });
      expect(found.error).to.match(/base64 reference/);
      expect(found.error).to.match(/isn't an image/);
      expect(Date.now() - started).to.be.below(2000);
    });

    it("image-uniform-reference: a single-color reference with no transparency fails", async function () {
      const flat = await sharp({ create: { width: 20, height: 20, channels: 3, background: "#336699" } }).png().toBuffer();
      const found = await visual.findByImage({
        elementImage: fileOf("flat.png", flat),
        driver: fakeDriver(await page({ background: "#336699" })),
        timeout: 0,
      });
      expect(found.element).to.equal(null);
      expect(found.error).to.match(/single color/i);
    });

    it("image-oversized-reference: a reference too large at every size fails, giving both sizes", async function () {
      const big = await sharp({ create: { width: 900, height: 900, channels: 3, background: "#ffffff" } })
        .composite([{ input: icon(GEAR, "#333333", 64), left: 10, top: 10 }])
        .png()
        .toBuffer();
      const found = await visual.findByImage({
        elementImage: fileOf("big.png", big),
        driver: fakeDriver(await page({ width: 200, height: 150 })),
        timeout: 0,
      });
      expect(found.error).to.match(/900×900/);
      expect(found.error).to.match(/200×150/);
    });

    it("image-oversized-reference: a transparent file larger than the surface matches at a smaller size", async function () {
      const shot = await page({ items: [{ svg: icon(GEAR, "#333333", 24), x: 40, y: 50 }] });
      near((await once(shot, { base64: b64(icon(GEAR, "#333333", 900)) })).match, 40, 50);
    });
  });

  describe("transparent one-color files", function () {
    it("image-file-one-color: finds its shape on a lighter or darker background, in its own color", async function () {
      const dark = icon(GEAR, "#333333", 24);
      near((await once(await page({ items: [{ svg: dark, x: 40, y: 50 }] }), { base64: b64(dark) })).match, 40, 50);
      near((await once(await page({ background: "#eeeeff", items: [{ svg: dark, x: 40, y: 50 }] }), { base64: b64(dark) })).match, 40, 50);
      const white = icon(GEAR, "#ffffff", 24);
      near((await once(await page({ background: "#224455", items: [{ svg: white, x: 40, y: 50 }] }), { base64: b64(white) })).match, 40, 50);
    });

    it("image-file-one-color: can miss an icon that stands out mainly by color, not lightness", async function () {
      for (const [color, background] of [["#ff0000", "#7f7f7f"], ["#00ff00", "#ff00ff"]]) {
        const file = icon(GEAR, color, 24);
        const shot = await page({ background, items: [{ svg: file, x: 40, y: 50 }] });
        const result = await once(shot, { base64: b64(file) });
        expect(result.match, `${color} on ${background}`).to.equal(null);
        expect(result.best.color, "the color itself is right").to.be.above(0.9);
      }
    });

    it("image-file-one-color: a red file doesn't find a blue icon with the same shape", async function () {
      const shot = await page({ items: [{ svg: icon(GEAR, "#1a5fb4", 24), x: 40, y: 50 }] });
      const result = await once(shot, { base64: b64(icon(GEAR, "#e01b24", 24)) });
      expect(result.match).to.equal(null);
      expect(result.best.shape).to.be.above(0.9);
      expect(result.best.color).to.be.below(0.9);
    });

    it("image-color-field: color overrides the file's color", async function () {
      const shot = await page({ items: [{ svg: icon(GEAR, "#1a5fb4", 24), x: 40, y: 50 }] });
      const file = b64(icon(GEAR, "currentColor", 24));
      expect((await once(shot, { base64: file })).match, "black without color").to.equal(null);
      near((await once(shot, { base64: file, color: "#1a5fb4" })).match, 40, 50);
      expect((await once(shot, { base64: file, color: "#e01b24" })).match).to.equal(null);
    });

    it("image-color-one-color-only: color fails on an opaque reference and on a multi-color file", async function () {
      const opaque = await sharp({ create: { width: 30, height: 30, channels: 3, background: "#ffffff" } })
        .composite([{ input: icon(GEAR, "#333333", 24), left: 3, top: 3 }])
        .png()
        .toBuffer();
      const multi = await sharp(check("#2ec27e", "#ffffff", 64)).png().toBuffer();
      for (const buffer of [opaque, multi]) {
        const found = await visual.findByImage({
          elementImage: { base64: b64(buffer), color: "#112233" },
          driver: fakeDriver(await page({})),
          timeout: 0,
        });
        expect(found.element).to.equal(null);
        expect(found.error).to.match(/`color` works only/);
      }
    });

    it("image-color-hue: colors have to be close, and threshold tells close ones apart", async function () {
      const shot = await page({ items: [{ svg: solid("#e01b24", 24), x: 40, y: 50 }] });
      const file = b64(solid("#000000", 24));
      near((await once(shot, { base64: file, color: "#e01b24" })).match, 40, 50);
      near((await once(shot, { base64: file, color: "#c01c28" })).match, 40, 50);
      expect((await once(shot, { base64: file, color: "#ff7800" })).match).to.equal(null);
      expect((await once(shot, { base64: file, color: "#1a5fb4" })).match).to.equal(null);
      const gray = await page({ items: [{ svg: solid("#888888", 24), x: 40, y: 50 }] });
      expect((await once(gray, { base64: file, color: "#333333" })).match).to.equal(null);
      const blue = await page({ items: [{ svg: solid("#2a3fb4", 24), x: 40, y: 50 }] });
      near((await once(blue, { base64: file, color: "#1a5fb4" })).match, 40, 50);
      expect((await once(blue, { base64: file, color: "#1a5fb4", threshold: 0.97 })).match).to.equal(null);
    });

    it("image-color-hue: threshold can't separate a lighter and a darker shade on very thin lines", async function () {
      const ring = (color, stroke) => icon(RING, color, 24, stroke);
      const thin = await page({ items: [{ svg: ring("#555555", 1), x: 40, y: 50 }] });
      near((await once(thin, { base64: b64(ring("#333333", 1)), threshold: 0.97 })).match, 40, 50);
      const thick = await page({ items: [{ svg: ring("#555555", 2), x: 40, y: 50 }] });
      expect((await once(thick, { base64: b64(ring("#333333", 2)), threshold: 0.97 })).match).to.equal(null);
    });

    it("image-color-hue: a neighboring size can't let through a color the right size rejects", async function () {
      const triangle = (color) => solid(color, 24);
      const shot = await page({ items: [{ svg: triangle("#666666"), x: 40, y: 50 }] });
      const result = await once(shot, { base64: b64(triangle("#333333")) });
      expect(result.match).to.equal(null);
      expect(result.best.height).to.equal(24);
    });

    it("image-outputs: a close shade reports the icon's own size", async function () {
      const shot = await page({ items: [{ svg: solid("#c01c28", 24), x: 40, y: 50 }] });
      const { match: found } = await once(shot, { base64: b64(solid("#e01b24", 24)) });
      near(found, 40, 50, 0);
      expect(found.height).to.equal(24);
    });

    it("image-color-thin: a very thin line tolerates more lightness drift, and no more hue", async function () {
      const ring = (color, stroke) => icon(RING, color, 24, stroke);
      const thin = await page({ items: [{ svg: ring("#777777", 1), x: 40, y: 50 }] });
      near((await once(thin, { base64: b64(ring("#333333", 1)) })).match, 40, 50);
      const thick = await page({ items: [{ svg: ring("#777777", 2), x: 40, y: 50 }] });
      expect((await once(thick, { base64: b64(ring("#333333", 2)) })).match, "at 2 pixels").to.equal(null);
      const blue = await page({ items: [{ svg: ring("#1a5fb4", 1), x: 40, y: 50 }] });
      expect((await once(blue, { base64: b64(ring("#e01b24", 1)) })).match, "another hue").to.equal(null);
    });

    it("image-score-min: a location's score is the lower of its shape and color scores", async function () {
      const shot = await page({ items: [{ svg: solid("#555555", 24), x: 40, y: 50 }] });
      const { best } = await once(shot, { base64: b64(solid("#000000", 24)) });
      expect(best.shape).to.be.above(0.95);
      expect(best.color).to.be.below(0.9);
      expect(best.score).to.equal(Math.min(best.shape, best.color));
    });

    it("image-file-any-size: tries every whole size from 12 to 64", async function () {
      const file = b64(icon(GEAR, "#333333", 24));
      for (const h of [12, 15, 26, 33, 47, 64]) {
        const shot = await page({ items: [{ svg: icon(GEAR, "#333333", h), x: 40, y: 50 }] });
        const { match: found } = await once(shot, { base64: file });
        near(found, 40, 50);
        expect(found.height, `size ${h}`).to.equal(h);
      }
    });

    it("image-file-any-size: resizes a raster much larger than its use", async function () {
      const file = await sharp(icon(GEAR, "#333333", 256)).png().toBuffer();
      const shot = await page({ items: [{ svg: icon(GEAR, "#333333", 20), x: 40, y: 50 }] });
      near((await once(shot, { base64: b64(file) })).match, 40, 50);
    });

    it("image-file-any-size: a multi-color file matches at a size it isn't drawn at", async function () {
      const reference = b64(await sharp(check("#2ec27e", "#ffffff", 64)).png().toBuffer());
      for (const h of [20, 48]) {
        const shot = await page({ items: [{ svg: check("#2ec27e", "#ffffff", h), x: 40, y: 50 }] });
        const { match: found } = await once(shot, { base64: reference });
        near(found, 40, 50);
        expect(found.height, `size ${h}`).to.equal(h);
      }
    });

    it("image-file-any-size: stops at the first near-perfect match", async function () {
      // The file's first size, 24, nearly matches a slightly heavier ring. The real icon is 20 tall.
      const file = b64(icon(RING, "#333333", 24));
      const shot = await page({
        items: [
          { svg: icon(RING, "#333333", 24, 2.2), x: 40, y: 50 },
          { svg: icon(RING, "#333333", 20), x: 200, y: 200 },
        ],
      });
      const { match: found } = await once(shot, { base64: file });
      near(found, 40, 50);
      expect(found.score).to.be.at.least(0.98);
    });

    it("image-sweep-best: without a near-perfect match, the highest score wins over a false match at an earlier size", async function () {
      // The file's first size, 24, reaches the threshold on a heavier ring. The real icon is 20 tall.
      const file = b64(icon(RING, "#333333", 24));
      const heavier = { svg: icon(RING, "#333333", 24, 2.6), x: 40, y: 50 };
      const alone = await once(await page({ items: [heavier] }), { base64: file });
      expect(alone.best.score, "the heavier ring alone passes").to.be.at.least(0.9);
      expect(alone.best.score, "but not perfectly").to.be.below(0.98);
      const shot = await page({ items: [heavier, { svg: icon(RING, "#333333", 20), x: 200, y: 200 }] });
      near((await once(shot, { base64: file })).match, 200, 200);
    });

    it("image-svg-rendered: an SVG stays sharp at a large size, where a small PNG doesn't", async function () {
      const shot = await page({ items: [{ svg: icon(GEAR, "#333333", 40), x: 40, y: 50 }] });
      const svg = await once(shot, { base64: b64(icon(GEAR, "#333333", 24)) });
      expect(svg.best.score).to.be.above(0.98);
      const tiny = await sharp(icon(GEAR, "#333333", 12)).png().toBuffer();
      const png = await once(shot, { base64: b64(tiny) });
      expect(png.best.shape).to.be.below(svg.best.shape);
    });

    it("image-device-pixels: a file matches at device resolution on a 2× surface, and reports CSS pixels", async function () {
      const shot = await page({ width: 200, height: 150, density: 2, items: [{ svg: icon(GEAR, "#333333", 48), x: 81, y: 41 }] });
      const { match: found } = await once(shot, { base64: b64(icon(GEAR, "#333333", 24)) }, { scale: 2 });
      near(found, 40.5, 20.5, 1);
      expect(found.height).to.equal(24);
      expect(found.score).to.be.above(0.98);
    });
  });

  describe("transparent multi-color files", function () {
    it("image-file-multicolor: matches on any background, keeping different interiors distinct", async function () {
      const reference = b64(await sharp(check("#2ec27e", "#ffffff", 64)).png().toBuffer());
      for (const background of ["#ffffff", "#224455"]) {
        const shot = await page({
          background,
          items: [
            { svg: cross("#2ec27e", "#ffffff"), x: 40, y: 50 },
            { svg: check("#2ec27e", "#ffffff"), x: 200, y: 50 },
          ],
        });
        near((await once(shot, { base64: reference })).match, 200, 50);
      }
    });

    it("image-file-multicolor: a thin outline matches on light and dark backgrounds alike", async function () {
      const outline = (stroke) =>
        Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke-width="${stroke}"><circle cx="12" cy="12" r="9" stroke="#1a5fb4"/><path d="M8 12l3 3 5-6" stroke="#e01b24"/></svg>`
        );
      for (const stroke of [2, 1.5]) {
        for (const background of ["#ffffff", "#ffe066", "#1f2937"]) {
          const shot = await page({ background, items: [{ svg: outline(stroke), x: 40, y: 50 }] });
          near((await once(shot, { base64: b64(outline(stroke)) })).match, 40, 50);
        }
      }
    });

    it("image-file-multicolor: can miss very thin lines at a small size", async function () {
      const outline = (h, stroke) =>
        Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${h}" height="${h}" viewBox="0 0 24 24" fill="none" stroke-width="${stroke}"><circle cx="12" cy="12" r="9" stroke="#1a5fb4"/><path d="M8 12l3 3 5-6" stroke="#e01b24"/></svg>`
        );
      const shot = await page({ items: [{ svg: outline(16, 1), x: 40, y: 50 }] });
      expect((await once(shot, { base64: b64(outline(16, 1)) })).match).to.equal(null);
    });

    it("image-file-any-size: a multi-color file can miss at a size that isn't a common one", async function () {
      const reference = b64(await sharp(check("#2ec27e", "#ffffff", 32)).png().toBuffer());
      const shot = await page({ items: [{ svg: check("#2ec27e", "#ffffff", 60), x: 40, y: 50 }] });
      expect((await once(shot, { base64: reference })).match).to.equal(null);
    });

    it("image-file-multicolor: a blue disc doesn't match a green one", async function () {
      const shot = await page({ items: [{ svg: check("#3584e4", "#ffffff"), x: 40, y: 50 }] });
      const result = await once(shot, { base64: b64(await sharp(check("#2ec27e", "#ffffff", 32)).png().toBuffer()) });
      expect(result.match).to.equal(null);
      expect(result.best.color).to.be.below(0.9);
    });
  });

  describe("opaque references", function () {
    const crop = async (shot, x, y, size = 32) =>
      sharp(shot).extract({ left: x, top: y, width: size, height: size }).png().toBuffer();

    it("image-opaque-exact: matches its colors and background", async function () {
      const white = await page({ items: [{ svg: solid("#333333", 24), x: 44, y: 54 }] });
      const reference = b64(await crop(white, 40, 50));
      near((await once(white, { base64: reference })).match, 40, 50);
      const toolbar = await page({ background: "#224455", items: [{ svg: solid("#333333", 24), x: 44, y: 54 }] });
      expect((await once(toolbar, { base64: reference })).match, "another background").to.equal(null);
      const recolored = await page({ items: [{ svg: solid("#1a5fb4", 24), x: 44, y: 54 }] });
      const result = await once(recolored, { base64: reference });
      expect(result.match, "another color").to.equal(null);
      expect(result.best.shape).to.be.above(0.9);
    });

    it("image-rescale: a 2× crop works on a 1× surface, and the other way round", async function () {
      const one = await page({ items: [{ svg: icon(GEAR, "#333333", 24), x: 44, y: 54 }] });
      const two = await page({ density: 2, items: [{ svg: icon(GEAR, "#333333", 48), x: 88, y: 108 }] });
      near((await once(one, { base64: b64(await crop(two, 80, 100, 64)) })).match, 40, 50);
      near((await once(two, { base64: b64(await crop(one, 40, 50)) }, { scale: 2 })).match, 40, 50);
    });

    it("image-rescale: a crop of a solid icon works from either density", async function () {
      const one = await page({ items: [{ svg: solid("#333333", 24), x: 44, y: 54 }] });
      const two = await page({ density: 2, items: [{ svg: solid("#333333", 48), x: 88, y: 108 }] });
      near((await once(one, { base64: b64(await crop(two, 80, 100, 64)) })).match, 40, 50);
      near((await once(two, { base64: b64(await crop(one, 40, 50)) }, { scale: 2 })).match, 40, 50);
    });

    it("image-rescale: a crop with thin lines can miss on a screen with a higher density", async function () {
      const one = await page({ items: [{ svg: icon(RING, "#333333", 24, 1), x: 44, y: 54 }] });
      const two = await page({ density: 2, items: [{ svg: icon(RING, "#333333", 48, 1), x: 88, y: 108 }] });
      expect((await once(two, { base64: b64(await crop(one, 40, 50)) }, { scale: 2 })).match).to.equal(null);
    });

    it("image-first-match: when places tie, the topmost wins, then the leftmost", async function () {
      const svg = icon(GEAR, "#333333", 24);
      const file = { base64: b64(svg) };
      near((await once(await page({ items: [{ svg, x: 200, y: 200 }, { svg, x: 300, y: 40 }, { svg, x: 40, y: 200 }] }), file)).match, 300, 40);
      near((await once(await page({ items: [{ svg, x: 300, y: 40 }, { svg, x: 40, y: 40 }] }), file)).match, 40, 40);
    });

    it("image-first-match: a copy at another size doesn't compete", async function () {
      const file = { base64: b64(icon(GEAR, "#333333", 24)) };
      const shot = await page({
        height: 500,
        items: [
          { svg: icon(GEAR, "#333333", 20), x: 40, y: 320 },
          { svg: icon(GEAR, "#333333", 24), x: 40, y: 420 },
        ],
      });
      near((await once(shot, file)).match, 40, 420);
    });

    it("image-default-threshold: defaults to 0.9, and threshold overrides it", async function () {
      const chart = (height) =>
        Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="#fff"/><rect x="10" y="30" width="20" height="50" fill="#1a5fb4"/><rect x="50" y="${80 - height}" width="20" height="${height}" fill="#1a5fb4"/><rect x="90" y="10" width="20" height="70" fill="#1a5fb4"/></svg>`
        );
      const reference = b64(await sharp(chart(40)).png().toBuffer());
      const changed = await page({ items: [{ svg: chart(30), x: 40, y: 40 }] });
      const result = await once(changed, { base64: reference });
      expect(result.best.score).to.be.within(0.9, 0.99);
      near(result.match, 40, 40);
      expect((await once(changed, { base64: reference, threshold: 0.99 })).match).to.equal(null);
      expect(match.DEFAULT_IMAGE_THRESHOLD).to.equal(0.9);
    });
  });

  describe("finding on a surface", function () {
    it("image-outputs: outputs describe the match in CSS pixels, and everything else is null", async function () {
      const shot = await page({ width: 200, height: 150, density: 2, items: [{ svg: icon(GEAR, "#333333", 48), x: 80, y: 40 }] });
      const driver = fakeDriver(shot, { viewport: { width: 200, height: 150 } });
      const found = await visual.findByImage({ elementImage: { base64: b64(icon(GEAR, "#333333", 24)) }, driver, timeout: 0 });
      const outputs = await setElementOutputs({ element: found.element });
      expect(outputs.element.location).to.deep.equal({ x: 40, y: 20 });
      expect(outputs.element.size).to.deep.equal({ width: 24, height: 24 });
      expect(outputs.element.matchScore).to.be.above(0.98);
      for (const field of ["text", "html", "tag", "value", "clickable", "enabled", "selected", "displayed", "displayedInViewport"]) {
        expect(outputs.element[field], field).to.equal(null);
      }
    });

    it("image-retries-until-timeout: keeps looking until the image appears", async function () {
      const blank = await page({});
      const svg = icon(GEAR, "#333333", 24);
      const shot = await page({ items: [{ svg, x: 40, y: 50 }] });
      const driver = fakeDriver(shot, { captures: [blank, blank] });
      const found = await visual.findByImage({ elementImage: { base64: b64(svg) }, driver, timeout: 20000 });
      expect(found.element.isVisualMatch).to.equal(true);
    });

    it("image-retries-until-timeout: timeout 0 checks once", async function () {
      const blank = await page({});
      const svg = icon(GEAR, "#333333", 24);
      const shot = await page({ items: [{ svg, x: 40, y: 50 }] });
      const driver = fakeDriver(shot, { captures: [blank] });
      const found = await visual.findByImage({ elementImage: { base64: b64(svg) }, driver, timeout: 0 });
      expect(found.element).to.equal(null);
    });

    it("image-combined: other criteria scope the match to their elements", async function () {
      const svg = icon(GEAR, "#333333", 24);
      const shot = await page({ items: [{ svg, x: 40, y: 50 }, { svg, x: 300, y: 200 }] });
      const found = await visual.findByImage({
        elementImage: { base64: b64(svg) },
        driver: fakeDriver(shot),
        timeout: 0,
        scope: async () => [{ x: 280, y: 180, width: 80, height: 80 }],
      });
      expect(await found.element.getLocation()).to.deep.equal({ x: 300, y: 200 });
      const nothing = await visual.findByImage({
        elementImage: { base64: b64(svg) },
        driver: fakeDriver(shot),
        timeout: 0,
        scope: async () => [],
      });
      expect(nothing.element).to.equal(null);
    });

    it("image-combined: an element replaced during a look is retried, and doesn't fail the step", async function () {
      const svg = icon(GEAR, "#333333", 24);
      const shot = await page({ items: [{ svg, x: 40, y: 50 }] });
      const driver = fakeDriver(shot, { dom: { x: 20, y: 30, width: 80, height: 80 } });
      const execute = driver.execute;
      let reads = 0;
      driver.execute = async (fn, ...args) => {
        if (!String(fn).includes("getBoundingClientRect")) return execute(fn, ...args);
        if (++reads === 1) throw new Error("stale element reference");
        return { x: 20, y: 30, width: 80, height: 80 };
      };
      const found = await findElementByCriteria({ selector: "#box", elementImage: { base64: b64(svg) }, driver, timeout: 3000 });
      expect(found.error).to.equal(null);
      expect(reads).to.be.at.least(2);
      expect(await found.element.getLocation()).to.deep.equal({ x: 40, y: 50 });
    });

    it("image-combined: one replaced element doesn't discard the others, even with timeout 0", async function () {
      const svg = icon(GEAR, "#333333", 24);
      const shot = await page({ items: [{ svg, x: 40, y: 50 }] });
      const driver = fakeDriver(shot, { dom: { x: 20, y: 30, width: 80, height: 80 } });
      const [element] = await driver.$$();
      driver.$$ = async () => [element, { ...element }];
      const execute = driver.execute;
      let reads = 0;
      driver.execute = async (fn, ...args) => {
        if (!String(fn).includes("getBoundingClientRect")) return execute(fn, ...args);
        if (++reads === 1) throw new Error("stale element reference");
        return { x: 20, y: 30, width: 80, height: 80 };
      };
      const found = await findElementByCriteria({ selector: "#box", elementImage: { base64: b64(svg) }, driver, timeout: 0 });
      expect(found.error).to.equal(null);
      expect(await found.element.getLocation()).to.deep.equal({ x: 40, y: 50 });
    });

    it("image-miss-message: names the score, its parts, where it was, the threshold, and the display scale", async function () {
      const shot = await page({ width: 200, height: 150, density: 2, items: [{ svg: icon(GEAR, "#1a5fb4", 48), x: 80, y: 40 }] });
      const driver = fakeDriver(shot, { viewport: { width: 200, height: 150 } });
      const found = await visual.findByImage({ elementImage: fileOf("save.svg", icon(GEAR, "#e01b24", 24)), driver, timeout: 0 });
      expect(found.element).to.equal(null);
      expect(found.error).to.match(/save\.svg/);
      expect(found.error).to.match(/scored 0\.\d\d/);
      expect(found.error).to.match(/shape (0\.\d\d|1\.00)/);
      expect(found.error).to.match(/color 0\.\d\d/);
      expect(found.error).to.match(/\(40, 20\)/);
      expect(found.error).to.match(/threshold of 0\.9/);
      expect(found.error).to.match(/display scale of 2/);
      expect(found.error).to.match(/#e01b24/);
      expect(found.error).to.match(/#1[0-9a-f]5[0-9a-f]b[0-9a-f]/);
    });

    it("image-miss-message: a multi-color file's changed colors show as a low shape score", async function () {
      const shot = await page({ items: [{ svg: check("#3584e4", "#ffffff"), x: 40, y: 50 }] });
      const reference = { base64: b64(check("#2ec27e", "#ffffff")) };
      const { match: found, best } = await once(shot, reference);
      expect(found).to.equal(null);
      expect(best.shape).to.be.below(0.9);
    });

    it("image-color-field: a miss on a black file suggests `color`", async function () {
      const shot = await page({ items: [{ svg: icon(GEAR, "#1a5fb4", 24), x: 40, y: 50 }] });
      const found = await visual.findByImage({ elementImage: { base64: b64(icon(GEAR, "currentColor", 24)) }, driver: fakeDriver(shot), timeout: 0 });
      expect(found.error).to.match(/`color`/);
    });

    it("image-base64-not-printed: a failed step's message leaves the value out", async function () {
      const value = b64(icon(GEAR, "#e01b24", 24));
      const found = await visual.findByImage({ elementImage: { base64: value }, driver: fakeDriver(await page({})), timeout: 0 });
      expect(found.error).to.match(/base64 reference/);
      expect(found.error).to.not.include(value);
      const redacted = match.redactElementImage({ selector: "#a", elementImage: { base64: value, threshold: 0.8 } });
      expect(JSON.stringify(redacted)).to.not.include(value);
      expect(redacted.selector).to.equal("#a");
      expect(redacted.elementImage).to.equal("base64 reference");
    });

    it("image-base64-not-printed: a validation warning repeats the step", async function () {
      const { runTests } = await import("../dist/core/index.js");
      const value = b64(icon(GEAR, "#e01b24", 24));
      const input = fileOf(
        "invalid.spec.json",
        JSON.stringify({ tests: [{ steps: [{ find: { elementImage: { base64: value, threshold: 5 } } }] }] })
      );
      const { log } = console;
      const printed = [];
      console.log = (...args) => printed.push(...args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))));
      try {
        await runTests({ input, logLevel: "warning", telemetry: { send: false }, detectSteps: false });
      } finally {
        console.log = log;
      }
      expect(printed.join("\n")).to.include(value);
    });

    it("image-no-mobile: fails on a mobile browser and says so", async function () {
      const driver = fakeDriver(await page({}));
      driver.isMobile = true;
      const found = await visual.findByImage({ elementImage: fileOf("m.svg", icon(GEAR, "#333333", 24)), driver, timeout: 5000 });
      expect(found.element).to.equal(null);
      expect(found.error).to.match(/mobile/i);
    });
  });

  describe("a match stands in for an element", function () {
    const located = async () => {
      const svg = icon(GEAR, "#333333", 24);
      const driver = fakeDriver(await page({ items: [{ svg, x: 40, y: 50 }] }));
      const found = await visual.findByImage({ elementImage: { base64: b64(svg) }, driver, timeout: 0 });
      return { driver, element: found.element };
    };

    it("image-click-center: click presses the center of the match", async function () {
      const { driver, element } = await located();
      await element.click();
      expect(driver.actions).to.deep.equal([
        ["move", { x: 52, y: 62 }],
        ["down", { button: 0 }],
        ["up", { button: 0 }],
      ]);
    });

    it("image-click-center: click honors the button", async function () {
      const { driver, element } = await located();
      await element.click({ button: "right" });
      expect(driver.actions).to.deep.equal([
        ["move", { x: 52, y: 62 }],
        ["down", { button: 2 }],
        ["up", { button: 2 }],
      ]);
    });

    it("image-annotation-target: all returns every match", async function () {
      const svg = icon(GEAR, "#333333", 24);
      const shot = await page({ items: [{ svg, x: 40, y: 50 }, { svg, x: 200, y: 50 }, { svg, x: 40, y: 200 }] });
      const found = await visual.findByImage({ elementImage: { base64: b64(svg) }, driver: fakeDriver(shot), timeout: 0, all: true });
      expect(found.elements).to.have.length(3);
      expect(await Promise.all(found.elements.map((e) => e.getLocation()))).to.have.deep.members([
        { x: 40, y: 50 },
        { x: 200, y: 50 },
        { x: 40, y: 200 },
      ]);
    });
  });

  describe("what independent verification found", function () {
    const BLUE = "#1a5fb4";
    const grid = (count, svgAt) =>
      Array.from({ length: count }, (_, i) => ({ svg: svgAt(i), x: 10 + (i % 20) * 32, y: 10 + Math.floor(i / 20) * 32 }));
    const rounded = (rx) =>
      Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><rect width="24" height="24" rx="${rx}" fill="#7c3aed"/></svg>`
      );
    const counting = (driver) => {
      const take = driver.takeScreenshot;
      driver.looks = 0;
      driver.takeScreenshot = async () => {
        driver.looks++;
        return take();
      };
      return driver;
    };

    it("image-score-min: hundreds of other copies don't crowd out the real one", async function () {
      const red = icon(GEAR, "#e01b24", 24);
      const items = grid(301, (i) => (i === 300 ? icon(GEAR, BLUE, 24) : red));
      const shot = await page({ width: 700, height: 560, items });
      near((await once(shot, { base64: b64(icon(GEAR, BLUE, 24)) })).match, items[300].x, items[300].y);
    });

    it("image-annotation-target: all finds hundreds of copies", async function () {
      const blue = icon(GEAR, BLUE, 24);
      const shot = await page({ width: 700, height: 560, items: grid(300, () => blue) });
      const { matches } = await once(shot, { base64: b64(blue) }, { all: true });
      expect(matches).to.have.length(300);
    });

    it("image-retries-until-timeout: a look that outlasts the timeout gets one more look", async function () {
      const blue = icon(GEAR, BLUE, 24);
      const shot = await page({ items: [{ svg: blue, x: 40, y: 50 }] });
      const captures = [await page({}), shot];
      const found = await visual.findByImage({
        elementImage: { base64: b64(blue) },
        driver: fakeDriver(shot, { captures }),
        timeout: 1,
      });
      expect(found.error).to.equal(null);
      near(await found.element.getLocation(), 40, 50);
    });

    it("image-retries-until-timeout: with timeout 0, it looks once", async function () {
      const driver = counting(fakeDriver(await page({})));
      await visual.findByImage({ elementImage: { base64: b64(icon(GEAR, BLUE, 24)) }, driver, timeout: 0 });
      expect(driver.looks).to.equal(1);
    });

    it("image-retries-until-timeout: an unchanged page isn't matched again", async function () {
      const shot = await page({});
      // The same picture in different bytes, so a look can't tell that nothing changed.
      const other = await sharp(shot).png({ compressionLevel: 1 }).toBuffer();
      expect(other.equals(shot)).to.equal(false);
      const elementImage = { base64: b64(icon(GEAR, BLUE, 24)) };
      const started = Date.now();
      await visual.findByImage({ elementImage, driver: fakeDriver(shot), timeout: 0 });
      // Compare the two rather than count looks, because CI runners differ several times over in speed.
      const timeout = Math.max(2000, 4 * (Date.now() - started));
      const unchanged = counting(fakeDriver(shot));
      await visual.findByImage({ elementImage, driver: unchanged, timeout });
      const captures = Array.from({ length: 500 }, (_, i) => (i % 2 ? shot : other));
      const changing = counting(fakeDriver(shot, { captures }));
      await visual.findByImage({ elementImage, driver: changing, timeout });
      expect(unchanged.looks).to.be.above(changing.looks);
    });

    it("image-timeout-overrun: a step finishes the check it started, past the timeout", async function () {
      const driver = fakeDriver(await page({ width: 2400, height: 1600 }));
      const started = Date.now();
      await visual.findByImage({ elementImage: { base64: b64(icon(GEAR, BLUE, 24)) }, driver, timeout: 1 });
      expect(Date.now() - started).to.be.above(500);
    });

    it("image-default-threshold: threshold 1 accepts an exact copy", async function () {
      const file = solid("#333333", 24);
      const shot = await page({ items: [{ svg: file, x: 40, y: 50 }] });
      near((await once(shot, { base64: b64(file), threshold: 1 })).match, 40, 50);
    });

    it("image-uniform-reference: a solid icon with rounded corners is still an icon", async function () {
      for (const rx of [1, 2, 3]) {
        const file = rounded(rx);
        const shot = await page({ items: [{ svg: file, x: 40, y: 50 }] });
        near((await once(shot, { base64: b64(file) })).match, 40, 50);
      }
    });

    it("image-uniform-reference: a very thin line is still an icon", async function () {
      // Its ink straddles two rows of pixels, so no pixel is even half covered.
      const line = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#333333" stroke-width="0.75"><path d="M4 12h16"/></svg>`
      );
      const shot = await page({ items: [{ svg: line, x: 40, y: 50 }] });
      near((await once(shot, { base64: b64(line) })).match, 40, 50);
    });

    it("image-uniform-reference: a file with nothing to see, or an even veil, fails", async function () {
      for (const alpha of [0, 0.4]) {
        const veil = await sharp({ create: { width: 24, height: 24, channels: 4, background: { r: 51, g: 51, b: 51, alpha } } }).png().toBuffer();
        const found = await visual.findByImage({ elementImage: { base64: b64(veil) }, driver: fakeDriver(await page({})), timeout: 0 });
        expect(found.error, `alpha ${alpha}`).to.match(/single color/);
      }
    });

    it("image-miss-message: only a black file is told about `color`", async function () {
      const shot = await page({ items: [{ svg: icon(GEAR, BLUE, 24), x: 40, y: 50 }] });
      const found = await visual.findByImage({
        elementImage: { base64: b64(icon(GEAR, "#e01b24", 24)) },
        driver: fakeDriver(shot),
        timeout: 0,
      });
      expect(found.error).to.match(/shape matched/);
      expect(found.error).to.not.match(/`color`/);
    });

    it("image-miss-message: a faint spot isn't called a shape match", async function () {
      const shot = await page({ items: [{ svg: icon(GEAR, "#f3f4f6", 24), x: 40, y: 50 }] });
      const found = await visual.findByImage({
        elementImage: { base64: b64(icon(GEAR, "currentColor", 24)) },
        driver: fakeDriver(shot),
        timeout: 0,
      });
      expect(found.error).to.not.match(/shape matched/);
      expect(found.error).to.not.match(/`color`/);
    });

    it("image-rescale: a crop from a 1.25× or 1.5× screen works on a 1× screen", async function () {
      const shot = await page({ items: [{ svg: check("#2ec27e", "#ffffff", 32), x: 44, y: 54 }] });
      for (const density of [1.25, 1.5]) {
        const size = Math.round(40 * density);
        const crop = await sharp({ create: { width: size, height: size, channels: 3, background: "#ffffff" } })
          .composite([
            { input: check("#2ec27e", "#ffffff", Math.round(32 * density)), left: Math.round(4 * density), top: Math.round(4 * density) },
          ])
          .png()
          .toBuffer();
        const { match: found } = await once(shot, { base64: b64(crop) });
        near(found, 40, 50, 3);
      }
    });

    it("image-miss-message: drag, crop, and annotations say why, too", async function () {
      const missing = path.join(tmp, "not-there.svg");
      const why = /Couldn't read the image reference/;
      const shot = await page({ items: [{ svg: icon(GEAR, BLUE, 24), x: 40, y: 50 }] });

      const { dragAndDropElement } = await import("../dist/core/tests/dragAndDrop.js");
      const dragged = await dragAndDropElement({
        config: {},
        step: { dragAndDrop: { source: { elementImage: missing }, target: { elementImage: { base64: b64(icon(GEAR, BLUE, 24)) } } } },
        driver: fakeDriver(shot),
      });
      expect(dragged.status).to.equal("FAIL");
      expect(dragged.description).to.match(/Couldn't find source element/);
      expect(dragged.description).to.match(why);

      const { saveScreenshot } = await import("../dist/core/tests/saveScreenshot.js");
      const cropped = await saveScreenshot({
        config: {},
        step: { screenshot: { path: path.join(tmp, "why.png"), crop: { elementImage: missing } } },
        driver: fakeDriver(shot),
      });
      expect(cropped.status).to.equal("FAIL");
      expect(cropped.description).to.match(/Couldn't find element to crop/);
      expect(cropped.description).to.match(why);

      const geometry = await import("../dist/core/annotations/geometry.js");
      for (const all of [false, true]) {
        const { errors } = await geometry.resolveAnnotationRects({
          config: {},
          annotations: [{ type: "blur", target: { elementImage: missing }, all }],
          driver: fakeDriver(shot),
          canvas: { width: 400, height: 300 },
          scale: 1,
        });
        expect(errors[0]).to.match(why);
      }
    });

    it("image-no-mobile: drag and crop say why on a mobile browser", async function () {
      const shot = await page({});
      const mobile = () => Object.assign(fakeDriver(shot), { isMobile: true });
      const elementImage = { base64: b64(icon(GEAR, BLUE, 24)) };

      const { dragAndDropElement } = await import("../dist/core/tests/dragAndDrop.js");
      const dragged = await dragAndDropElement({
        config: {},
        step: { dragAndDrop: { source: { elementImage }, target: { elementImage } } },
        driver: mobile(),
      });
      expect(dragged.description).to.match(/mobile/);

      const { saveScreenshot } = await import("../dist/core/tests/saveScreenshot.js");
      const cropped = await saveScreenshot({
        config: {},
        step: { screenshot: { path: path.join(tmp, "mobile.png"), crop: { elementImage } } },
        driver: mobile(),
      });
      expect(cropped.description).to.match(/mobile/);
    });
  });

  describe("actions that build on find", function () {
    const BLUE = "#1a5fb4";
    const blue = () => ({ base64: b64(icon(GEAR, BLUE, 24)) });
    const red = () => ({ base64: b64(check("#e01b24", "#ffffff", 32)) });
    const blueCenter = { x: 52, y: 62 };
    const redCenter = { x: 216, y: 116 };
    const moves = (driver) => driver.actions.filter(([kind]) => kind === "move").map(([, args]) => args);
    let shot, findElement, dragAndDropElement, typeKeys, waitForBrowserReadiness, saveScreenshot, geometry, buildAppLocator;

    before(async function () {
      ({ findElement } = await import("../dist/core/tests/findElement.js"));
      ({ dragAndDropElement } = await import("../dist/core/tests/dragAndDrop.js"));
      ({ typeKeys, waitForBrowserReadiness } = await import("../dist/core/tests/typeKeys.js"));
      ({ saveScreenshot } = await import("../dist/core/tests/saveScreenshot.js"));
      ({ buildAppLocator } = await import("../dist/core/tests/appSurface.js"));
      geometry = await import("../dist/core/annotations/geometry.js");
      shot = await page({
        items: [
          { svg: icon(GEAR, BLUE, 24), x: 40, y: 50 },
          { svg: check("#e01b24", "#ffffff", 32), x: 200, y: 100 },
        ],
      });
    });

    it("image-click-center: click presses and releases at the center of the match", async function () {
      const driver = fakeDriver(shot);
      const result = await findElement({ config: {}, step: { find: { elementImage: blue(), click: true } }, driver });
      expect(result.status, result.description).to.equal("PASS");
      expect(moves(driver)).to.deep.equal([blueCenter]);
      expect(driver.actions.map(([kind]) => kind)).to.deep.equal(["move", "down", "up"]);
    });

    it("image-click-center: a right click and a long press happen at the center too", async function () {
      const right = fakeDriver(shot);
      await findElement({ config: {}, step: { find: { elementImage: blue(), click: { button: "right" } } }, driver: right });
      expect(moves(right)).to.deep.equal([blueCenter]);
      expect(right.actions.find(([kind]) => kind === "down")[1]).to.deep.equal({ button: 2 });

      const held = fakeDriver(shot);
      const result = await findElement({ config: {}, step: { find: { elementImage: blue(), click: { duration: 50 } } }, driver: held });
      expect(result.status, result.description).to.equal("PASS");
      expect(moves(held)).to.deep.equal([blueCenter]);
      expect(held.actions.map(([kind]) => kind)).to.include("pause");
    });

    it("image-moveto: moveTo goes to the center of the match", async function () {
      const driver = fakeDriver(shot);
      const result = await findElement({ config: {}, step: { find: { elementImage: blue(), moveTo: true } }, driver });
      expect(result.status, result.description).to.equal("PASS");
      expect(moves(driver)[0]).to.include(blueCenter);
    });

    it("image-type-focuses: type clicks the center of the match, then types", async function () {
      const driver = fakeDriver(shot);
      const result = await typeKeys({ config: {}, step: { type: { keys: ["hello"], elementImage: blue() } }, driver });
      expect(result.status, result.description).to.equal("PASS");
      expect(moves(driver)).to.deep.equal([blueCenter]);
      expect(driver.typed).to.deep.equal(["hello"]);
    });

    it("image-type-focuses: a missing image fails without typing", async function () {
      const driver = fakeDriver(await page({}));
      const result = await typeKeys({ config: {}, step: { type: { keys: ["hello"], elementImage: blue() } }, driver });
      expect(result.status).to.equal("FAIL");
      expect(driver.typed).to.deep.equal([]);
      expect(result.description).to.not.include(blue().base64);
    });

    it("image-drag: both ends can be images, using pointer input only", async function () {
      const driver = fakeDriver(shot);
      const result = await dragAndDropElement({
        config: {},
        step: { dragAndDrop: { source: { elementImage: blue() }, target: { elementImage: red() }, duration: 10 } },
        driver,
      });
      expect(result.status, result.description).to.equal("PASS");
      expect(moves(driver)).to.deep.equal([blueCenter, { duration: 10, ...redCenter }]);
      expect(driver.actions.map(([kind]) => kind)).to.deep.equal(["move", "down", "pause", "move", "up"]);
    });

    it("image-drag: the other end can use other criteria", async function () {
      const dom = { x: 300, y: 200, width: 40, height: 20 };
      const toDom = fakeDriver(shot, { dom });
      const dropped = await dragAndDropElement({
        config: {},
        step: { dragAndDrop: { source: { elementImage: blue() }, target: { selector: "#drop" }, duration: 10 } },
        driver: toDom,
      });
      expect(dropped.status, dropped.description).to.equal("PASS");
      expect(moves(toDom)).to.deep.equal([blueCenter, { duration: 10, x: 320, y: 210 }]);

      const fromDom = fakeDriver(shot, { dom });
      const lifted = await dragAndDropElement({
        config: {},
        step: { dragAndDrop: { source: { selector: "#drag" }, target: { elementImage: blue() }, duration: 10 } },
        driver: fromDom,
      });
      expect(lifted.status, lifted.description).to.equal("PASS");
      expect(moves(fromDom)).to.deep.equal([{ x: 320, y: 210 }, { duration: 10, ...blueCenter }]);
    });

    it("image-crop: crops to the match plus padding, without scrolling", async function () {
      const file = path.join(tmp, "crop.png");
      const driver = fakeDriver(shot);
      const result = await saveScreenshot({
        config: {},
        step: { screenshot: { path: file, crop: { elementImage: blue(), padding: 5 } } },
        driver,
      });
      expect(result.status, result.description).to.equal("PASS");
      expect(driver.executed.some((source) => source.includes("scrollIntoView"))).to.equal(false);
      const cropped = await sharp(file).metadata();
      expect([cropped.width, cropped.height]).to.deep.equal([34, 34]);
    });

    it("image-annotation-target: marks the match, and every match with all", async function () {
      const resolve = (annotation, capture) =>
        geometry.resolveAnnotationRects({
          config: {},
          annotations: [annotation],
          driver: fakeDriver(capture),
          canvas: { width: 400, height: 300 },
          scale: 1,
        });
      const one = await resolve({ type: "blur", target: { elementImage: blue() } }, shot);
      expect(one.errors).to.deep.equal([]);
      expect(one.placed[0].rect).to.deep.equal({ x: 40, y: 50, width: 24, height: 24 });

      const twice = await page({
        items: [
          { svg: icon(GEAR, BLUE, 24), x: 40, y: 50 },
          { svg: icon(GEAR, BLUE, 24), x: 200, y: 50 },
        ],
      });
      const all = await resolve({ type: "blur", target: { elementImage: blue() }, all: true }, twice);
      expect(all.placed.map((p) => p.rect.x)).to.have.members([40, 200]);
    });

    it("image-annotation-target: all marks every copy, at every size", async function () {
      const capture = await page({
        items: [
          { svg: icon(GEAR, BLUE, 24), x: 40, y: 50 },
          { svg: icon(GEAR, BLUE, 36), x: 120, y: 50 },
          { svg: icon(GEAR, BLUE, 18), x: 220, y: 50 },
          { svg: icon(GEAR, "#e01b24", 24), x: 300, y: 50 },
        ],
      });
      const { placed, errors } = await geometry.resolveAnnotationRects({
        config: {},
        annotations: [{ type: "blur", target: { elementImage: blue() }, all: true }],
        driver: fakeDriver(capture),
        canvas: { width: 400, height: 300 },
        scale: 1,
      });
      expect(errors).to.deep.equal([]);
      expect(placed.map((p) => [p.rect.x, p.rect.width]).sort((a, b) => a[0] - b[0])).to.deep.equal([
        [40, 24],
        [120, 36],
        [220, 18],
      ]);
    });

    it("image-annotation-target: a copy in another color or at a size it doesn't try stays unmarked, and the step passes", async function () {
      const capture = await page({
        items: [
          { svg: icon(GEAR, BLUE, 24), x: 40, y: 50 },
          { svg: icon(GEAR, BLUE, 80), x: 120, y: 50 },
          { svg: icon(GEAR, "#e01b24", 24), x: 300, y: 50 },
        ],
      });
      const { placed, errors } = await geometry.resolveAnnotationRects({
        config: {},
        annotations: [{ type: "blur", target: { elementImage: blue() }, all: true }],
        driver: fakeDriver(capture),
        canvas: { width: 400, height: 300 },
        scale: 1,
      });
      expect(errors).to.deep.equal([]);
      expect(placed.map((p) => p.rect.x)).to.deep.equal([40]);
    });

    it("image-base64-not-printed: annotation and wait failures don't print the value", async function () {
      for (const all of [false, true]) {
        const { errors } = await geometry.resolveAnnotationRects({
          config: {},
          annotations: [{ type: "blur", target: { elementImage: blue(), timeout: 0 }, all }],
          driver: fakeDriver(await page({})),
          canvas: { width: 400, height: 300 },
          scale: 1,
        });
        expect(errors).to.have.length(1);
        expect(errors[0]).to.not.include(blue().base64);
      }
      const waited = await waitForBrowserReadiness({
        driver: fakeDriver(await page({})),
        waitUntil: { find: { elementImage: blue() } },
        timeout: 0,
      });
      expect(waited.ok).to.equal(false);
      expect(waited.message).to.not.include(blue().base64);
      expect(waited.message).to.match(/base64 reference/);
    });

    it("image-wait: a wait passes once the image appears", async function () {
      const captures = [await page({}), shot];
      const waited = await waitForBrowserReadiness({
        driver: fakeDriver(shot, { captures }),
        waitUntil: { find: { elementImage: blue() } },
        timeout: 5000,
      });
      expect(waited.ok, waited.message).to.equal(true);
      expect(captures).to.have.length(0);
    });

    it("image-browser-only: an app surface fails and says so", async function () {
      expect(buildAppLocator({ elementImage: blue() }).error).to.match(/elementImage/);
      expect(geometry.appCriteriaError({ elementImage: blue() })).to.match(/elementImage/);

      const { createAppSessionState } = await import("../dist/core/tests/appSurface.js");
      const appSession = createAppSessionState();
      const typed = [];
      appSession.surfaces.set("chat", {
        name: "chat",
        appId: "com.example.chat",
        platform: "android",
        driver: { execute: async (_script, args) => typed.push(args) },
        launchedByUs: true,
      });
      const result = await typeKeys({
        config: {},
        step: { type: { keys: ["hello"], elementImage: blue(), surface: { app: "chat" } } },
        driver: undefined,
        appSession,
      });
      expect(result.status).to.equal("FAIL");
      expect(result.description).to.match(/elementImage/);
      expect(typed, "nothing typed into the focused element").to.deep.equal([]);
    });
  });
});

// ---- What a fixture can't express, because a spec can't assert that a step fails.
describe("elementImage in real browsers", function () {
  // The setup runs every case in two browsers: 2.5 to over 5 minutes on CI runners.
  this.timeout(600000);
  const here = path.dirname(fileURLToPath(import.meta.url));
  const file = (name) => path.join(here, "server", "public", name);
  const url = "http://localhost:8092/find-image.html";
  const failing = {
    "image-color-hue: a file doesn't find its shape in another hue": {
      find: { selector: "#tinted", elementImage: { path: file("find-image-save.svg"), color: "#ff7800" }, timeout: 0 },
    },
    "image-color-hue: a file doesn't find its shape in a clearly different shade": {
      find: { selector: "#tinted", elementImage: { path: file("find-image-save.svg"), color: "#0a2a50" }, timeout: 0 },
    },
    "image-file-one-color: a black file doesn't find a white icon": {
      find: { selector: "#dark", elementImage: file("find-image-gear.svg"), timeout: 0 },
    },
    "image-file-multicolor: a recolored multi-color file doesn't match": {
      find: { elementImage: { base64: "__DISC__" }, timeout: 0 },
    },
    "image-on-screen-only: an icon below the fold isn't found": {
      find: { elementImage: file("find-image-far.svg"), timeout: 0 },
    },
    "image-combined: an image outside the other criteria isn't found": {
      find: { selector: "#tinted", elementImage: file("find-image-check.svg"), timeout: 0 },
    },
    "image-missing-file: a missing file fails": {
      find: { elementImage: file("find-image-does-not-exist.svg") },
    },
    "image-color-one-color-only: color fails on an opaque reference": {
      find: { elementImage: { path: file("find-image-chart.png"), color: "#112233" } },
    },
    "image-wait: a goTo wait says why the image wasn't found": {
      goTo: { url, waitUntil: { find: { elementImage: file("find-image-does-not-exist.svg") } } },
    },
    "image-click-hover: a click leaves the cursor on an icon that recolors on hover": [
      { click: { elementImage: file("find-image-hover.svg") } },
      { find: { elementImage: file("find-image-hover.svg"), timeout: 0 } },
    ],
    "image-crop-scrolls: a crop with a selector scrolls what was on screen away": [
      { screenshot: { path: "far.png", overwrite: "true", crop: { selector: "#far" } } },
      { find: { elementImage: file("find-image-save.svg"), timeout: 0 } },
    ],
    // If Firefox starts dropping here, take the warning off the page, along with this test.
    "image-drag-firefox: a drag by image passes without dropping an HTML5 draggable": [
      { dragAndDrop: { source: { elementImage: file("find-image-drag5.svg") }, target: { selector: "#html5-zone" } } },
      { find: { selector: "#html5-log", elementText: "dropped", timeout: 0 } },
    ],
    "image-drag-firefox: an image at the other end doesn't drop one either": [
      { dragAndDrop: { source: { selector: "#html5-item" }, target: { elementImage: file("find-image-target5.svg") } } },
      { find: { selector: "#html5-log", elementText: "dropped", timeout: 0 } },
    ],
  };
  const onlyIn = {
    "image-drag-firefox: a drag by image passes without dropping an HTML5 draggable": "firefox",
    "image-drag-firefox: an image at the other end doesn't drop one either": "firefox",
  };
  const why = {
    "image-missing-file: a missing file fails": /Couldn't read the image reference/,
    "image-color-one-color-only: color fails on an opaque reference": /`color` works only/,
    "image-wait: a goTo wait says why the image wasn't found": /Couldn't read the image reference/,
  };
  let contexts, disc;

  before(async function () {
    const { runTests } = await import("../dist/core/index.js");
    disc = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#1a5fb4"/><path d="M18 33l10 10 18-22" fill="none" stroke="#ffffff" stroke-width="7"/></svg>`
    ).toString("base64");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "find-image-browsers-"));
    const input = path.join(dir, "negatives.spec.json");
    fs.writeFileSync(
      input,
      JSON.stringify({
        tests: Object.entries(failing).map(([testId, step]) => ({
          testId,
          steps: [{ goTo: url }, ...[].concat(JSON.parse(JSON.stringify(step).replace("__DISC__", disc)))],
        })),
      })
    );
    try {
      const result = await runTests({
        input,
        output: dir,
        logLevel: "silent",
        telemetry: { send: false },
        detectSteps: false,
        runOn: [
          {
            platforms: ["windows", "mac", "linux"],
            browsers: [
              { name: "chrome", headless: true },
              { name: "firefox", headless: true },
            ],
          },
        ],
      });
      contexts = result.specs[0].tests.flatMap((test) =>
        test.contexts.map((context) => ({ testId: test.testId, context }))
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  for (const name of Object.keys(failing)) {
    it(name, function () {
      const ran = contexts.filter(
        (c) =>
          c.testId === name &&
          c.context.result !== "SKIPPED" &&
          (!onlyIn[name] || c.context.browser?.name === onlyIn[name])
      );
      if (onlyIn[name] && !ran.length) this.skip();
      expect(ran, "a browser ran it").to.not.have.length(0);
      for (const { context } of ran) {
        const step = context.steps.at(-1);
        for (const earlier of context.steps.slice(0, -1)) {
          expect(earlier.result, `${context.browser?.name}: ${earlier.resultDescription}`).to.equal("PASS");
        }
        expect(step.result, `${context.browser?.name}: ${step.resultDescription}`).to.equal("FAIL");
        expect(step.resultDescription).to.not.include("base64,");
        if (why[name]) expect(step.resultDescription).to.match(why[name]);
      }
    });
  }

  it("image-base64-not-printed: results repeat the step as written", function () {
    const name = "image-file-multicolor: a recolored multi-color file doesn't match";
    const ran = contexts.filter((c) => c.testId === name && c.context.result !== "SKIPPED");
    expect(ran, "a browser ran it").to.not.have.length(0);
    for (const { context } of ran) {
      const step = context.steps.at(-1);
      expect(step.find.elementImage.base64).to.equal(disc);
      expect(step.resultDescription).to.not.include(disc);
    }
  });

  it("image-miss-message: a miss in a browser gives the color on the page", function () {
    const name = "image-color-hue: a file doesn't find its shape in another hue";
    const ran = contexts.filter((c) => c.testId === name && c.context.result !== "SKIPPED");
    for (const { context } of ran) {
      const message = context.steps.at(-1).resultDescription;
      expect(message).to.match(/shape matched/);
      expect(message).to.include("#ff7800");
      expect(message).to.match(/#1[0-9a-f]5[0-9a-f]b[0-9a-f]/);
    }
  });
});
