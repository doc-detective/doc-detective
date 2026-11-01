// Finds a picture on a captured surface, by shape and by color (ADR 01146).
//
// `TM_CCOEFF_NORMED` removes each channel's mean and scale, so on its own it can't
// see a recolored icon. Every candidate therefore gets a separate color check, and
// its score is the lower of the two. The measurements behind every constant here
// are in docs/design/visual-element-matching.md.

import fs from "node:fs";
import { loadHeavyDep } from "../../runtime/loader.js";

export {
  DEFAULT_IMAGE_THRESHOLD,
  ImageReferenceError,
  loadOpenCv,
  loadImageReference,
  matchImageOnce,
  missMessage,
  redactElementImage,
  referenceLabel,
};

const DEFAULT_IMAGE_THRESHOLD = 0.9;

// The largest possible RGB distance, so a color score of 0.9 allows 44 levels.
const MAX_COLOR_DISTANCE = Math.sqrt(3) * 255;

// Past this score a size can't be beaten by enough to matter, so the sweep stops.
const STOP_SCORE = 0.98;

// Common icon sizes first, so a real icon is usually found early.
const COMMON_HEIGHTS = [24, 16, 20, 32, 18, 14, 22, 28, 36, 40, 48, 64, 12];
const WHOLE_HEIGHTS = Array.from({ length: 53 }, (_, i) => i + 12);

// Browsers draw thin strokes up to 28% lighter than a file predicts, but the hue
// stays put. Below this share of ink at full coverage, a stroke counts as thin.
const THIN_INK_SHARE = 0.75;
const THICK_DRIFT = 0.05;
const THIN_DRIFT = 0.25;

// A file's pixels are its one color if they stay this close to their average.
const ONE_COLOR_SPREAD = 24;

// A page of repeated flat content can produce many peaks. Color is only worth
// checking on the strongest.
const MAX_PEAKS = 200;

type Rgb = [number, number, number];
type Kind = "opaque" | "oneColor" | "multiColor";

type Render = { rgba: Uint8Array; width: number; height: number };

type ImageReference = {
  label: string;
  buffer: Buffer;
  isSvg: boolean;
  width: number;
  height: number;
  kind: Kind;
  // The one-color file's color, or `color` when the step gives one.
  color: Rgb | null;
  colorGiven: boolean;
  threshold: number;
  renders: Map<number, Render>;
};

type Candidate = {
  x: number;
  y: number;
  width: number;
  height: number;
  score: number;
  shape: number;
  color: number;
  fileColor: string;
  pageColor: string;
};

type Capture = {
  rgb: Uint8Array;
  width: number;
  height: number;
  grayMat: any;
  rgbMat: any;
};

class ImageReferenceError extends Error {}

let _sharp: any = null;
let _cv: Promise<any> | null = null;

async function getSharp(ctx: { cacheDir?: string } = {}): Promise<any> {
  if (!_sharp) {
    const mod = await loadHeavyDep<any>("sharp", { ctx });
    _sharp = mod.default ?? mod;
  }
  return _sharp;
}

// opencv-bindings aborts the process on any unhandled rejection, and adds an
// uncaughtException handler. @appium/opencv's init then removes EVERY
// unhandledRejection listener, including the runner's. Restore both once loaded.
function loadOpenCv(ctx: { cacheDir?: string } = {}): Promise<any> {
  if (!_cv) {
    _cv = (async () => {
      const events = ["unhandledRejection", "uncaughtException"] as const;
      const listeners = events.map((event) => process.listeners(event as any));
      try {
        const appium = await loadHeavyDep<any>("@appium/opencv", { ctx });
        await appium.initOpenCv();
        const bindings = await loadHeavyDep<any>("opencv-bindings", { ctx });
        const cv = bindings.default ?? bindings;
        // The module is a thenable that resolves to itself. Handing it to a promise
        // spins the microtask queue forever, where no timeout can ever fire.
        delete cv.then;
        return cv;
      } finally {
        events.forEach((event, i) => {
          process.removeAllListeners(event);
          for (const listener of listeners[i]) process.on(event as any, listener as any);
        });
      }
    })();
  }
  return _cv;
}

const toHex = (color: number[]) =>
  "#" +
  color
    .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"))
    .join("");

const fromHex = (hex: string): Rgb => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

// What a failure message calls this reference. Never the base64 value itself.
function referenceLabel(elementImage: any): string {
  if (typeof elementImage === "string") return elementImage;
  return elementImage?.path ?? "base64 reference";
}

// A copy of a step's criteria that's safe to print. A base64 value can be megabytes.
function redactElementImage(criteria: any): any {
  if (!criteria || typeof criteria !== "object" || !criteria.elementImage?.base64) return criteria;
  return { ...criteria, elementImage: "base64 reference" };
}

async function loadImageReference(
  elementImage: any,
  ctx: { cacheDir?: string } = {}
): Promise<ImageReference> {
  const sharp = await getSharp(ctx);
  const spec = typeof elementImage === "string" ? { path: elementImage } : elementImage;
  const label = referenceLabel(elementImage);

  let buffer: Buffer;
  if (spec.base64 !== undefined) {
    buffer = Buffer.from(spec.base64.replace(/^data:[^,]*;base64,/, ""), "base64");
  } else {
    try {
      buffer = fs.readFileSync(spec.path);
    } catch (error: any) {
      throw new ImageReferenceError(`Couldn't read the image reference ${label}: ${error.code ?? error.message}.`);
    }
  }

  let isSvg = false;
  let rgba: Uint8Array;
  let width: number;
  let height: number;
  try {
    isSvg = (await sharp(buffer).metadata()).format === "svg";
    const raw = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    rgba = raw.data;
    width = raw.info.width;
    height = raw.info.height;
  } catch {
    throw new ImageReferenceError(`The image reference ${label} isn't an image.`);
  }

  const { kind, average, flat } = classify(rgba, width, height);
  if (flat) {
    throw new ImageReferenceError(
      `The image reference ${label} is a single color, which would match any area of that color. Use a reference with a visible shape.`
    );
  }
  if (spec.color !== undefined && kind !== "oneColor") {
    throw new ImageReferenceError(
      `\`color\` works only with a transparent file in one color, and ${label} ${kind === "opaque" ? "has no transparency" : "has several colors"}.`
    );
  }

  return {
    label,
    buffer,
    isSvg,
    width,
    height,
    kind,
    color: kind === "oneColor" ? (spec.color ? fromHex(spec.color) : average) : null,
    colorGiven: spec.color !== undefined,
    threshold: spec.threshold ?? DEFAULT_IMAGE_THRESHOLD,
    renders: new Map(),
  };
}

// Screenshots are fully opaque. A file counts as transparent once a real share of
// its pixels is see-through, so a stray soft corner doesn't change how it's compared.
function classify(rgba: Uint8Array, width: number, height: number): { kind: Kind; average: Rgb; flat: boolean } {
  const n = width * height;
  let clear = 0;
  let sum = 0;
  const total = [0, 0, 0];
  const low = [255, 255, 255];
  const high = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const a = rgba[i * 4 + 3];
    if (a < 128) clear++;
    if (a === 0) continue;
    sum += a;
    for (let c = 0; c < 3; c++) {
      const v = rgba[i * 4 + c];
      total[c] += v * a;
      if (a >= 128) {
        if (v < low[c]) low[c] = v;
        if (v > high[c]) high[c] = v;
      }
    }
  }
  const average = (sum ? total.map((v) => v / sum) : [0, 0, 0]) as Rgb;
  if (clear < n * 0.01) {
    return { kind: "opaque", average, flat: high.every((v, c) => v - low[c] <= 1) };
  }
  if (clear === n) return { kind: "oneColor", average, flat: true };
  let spread = 0;
  for (let i = 0; i < n; i++) {
    if (rgba[i * 4 + 3] < 128) continue;
    const d = Math.hypot(rgba[i * 4] - average[0], rgba[i * 4 + 1] - average[1], rgba[i * 4 + 2] - average[2]);
    if (d > spread) spread = d;
  }
  return { kind: spread <= ONE_COLOR_SPREAD ? "oneColor" : "multiColor", average, flat: false };
}

// The heights to try, in device pixels, in order.
function sweepHeights(reference: ImageReference, scale: number): number[] {
  const { kind, height, isSvg } = reference;
  const heights =
    kind === "opaque"
      ? [height, height * scale, (height * scale) / 2]
      : [
          // A raster's own size is already in device pixels. An SVG's is in CSS pixels.
          isSvg ? height * scale : height,
          ...(kind === "oneColor"
            ? [...COMMON_HEIGHTS, ...WHOLE_HEIGHTS.filter((h) => !COMMON_HEIGHTS.includes(h))]
            : COMMON_HEIGHTS
          ).map((h) => h * scale),
        ];
  return [...new Set(heights.map(Math.round))].filter((h) => h >= 1);
}

// An SVG renders fresh at each size, because resizing a raster loses thin strokes.
async function renderAt(reference: ImageReference, height: number, ctx: { cacheDir?: string }): Promise<Render> {
  const cached = reference.renders.get(height);
  if (cached) return cached;
  const sharp = await getSharp(ctx);
  let pipeline = sharp(reference.buffer);
  if (reference.isSvg) {
    pipeline = sharp(reference.buffer, { density: Math.max(1, (72 * height) / reference.height) });
    const drawn = await pipeline.clone().png().toBuffer();
    pipeline = sharp(drawn);
    if ((await pipeline.metadata()).height !== height) pipeline = sharp(drawn).resize({ height });
  } else if (height !== reference.height) {
    pipeline = pipeline.resize({ height });
  }
  const { data, info } = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const render = { rgba: data, width: info.width, height: info.height };
  reference.renders.set(height, render);
  return render;
}

// One-color files: where the capture is `background + (icon - background) * alpha`,
// recover the icon's color. The slope is the ratio of standard deviations, because
// a least-squares slope shrinks when a stroke is slightly misaligned.
function fitIconColor(
  capture: Capture,
  x: number,
  y: number,
  render: Render
): { icon: number[]; background: number[]; ink: number } {
  const { width: tw, height: th, rgba } = render;
  const n = tw * th;
  let sumA = 0;
  let sumAA = 0;
  for (let i = 0; i < n; i++) {
    const a = rgba[i * 4 + 3] / 255;
    sumA += a;
    sumAA += a * a;
  }
  const varA = n * sumAA - sumA * sumA;
  const icon = [0, 0, 0];
  const background = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    let sumV = 0;
    let sumVV = 0;
    let sumAV = 0;
    for (let j = 0; j < th; j++) {
      for (let i = 0; i < tw; i++) {
        const a = rgba[(j * tw + i) * 4 + 3] / 255;
        const v = capture.rgb[((y + j) * capture.width + x + i) * 3 + c];
        sumV += v;
        sumVV += v * v;
        sumAV += a * v;
      }
    }
    const cov = n * sumAV - sumA * sumV;
    const varV = n * sumVV - sumV * sumV;
    const slope = (cov < 0 ? -1 : 1) * Math.sqrt(Math.max(varV, 0) / varA);
    background[c] = (sumV - slope * sumA) / n;
    icon[c] = background[c] + slope;
  }
  return { icon, background, ink: sumAA / sumA };
}

// Hue is the part of the difference off the line from the background to the file's
// color, and counts in full. Lightness is the part along it, and counts only past
// a tolerance, because thin strokes legitimately drift along that line.
function oneColorScore(fit: { icon: number[]; background: number[]; ink: number }, color: Rgb): number {
  const expected = color.map((v, c) => v - fit.background[c]);
  const seen = fit.icon.map((v, c) => v - fit.background[c]);
  const ee = expected[0] ** 2 + expected[1] ** 2 + expected[2] ** 2;
  const along = ee > 1 ? (seen[0] * expected[0] + seen[1] * expected[1] + seen[2] * expected[2]) / ee : 1;
  const off = Math.hypot(seen[0] - along * expected[0], seen[1] - along * expected[1], seen[2] - along * expected[2]);
  const tolerance = fit.ink >= THIN_INK_SHARE ? THICK_DRIFT : THIN_DRIFT;
  const drift = Math.sqrt(ee) * Math.max(0, Math.abs(1 - along) - tolerance);
  return 1 - Math.hypot(off, drift) / MAX_COLOR_DISTANCE;
}

// Opaque references and multi-color files: take each channel's gain from the ratio
// of standard deviations and its offset from the means, then report how far the
// reference's colors move under them. This needs no pixel alignment, so text that
// shifts between browsers isn't punished twice.
function gainOffsetScore(
  capture: Capture,
  x: number,
  y: number,
  render: Render,
  counts: (alpha: number) => boolean
): { score: number; fileColor: string; pageColor: string } {
  const { width: tw, height: th, rgba } = render;
  const moved = [0, 0, 0];
  const fileMean = [0, 0, 0];
  const pageMean = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    let sumT = 0;
    let sumV = 0;
    let sumTT = 0;
    let sumVV = 0;
    let sumTV = 0;
    let m = 0;
    let low = 255;
    let high = 0;
    for (let j = 0; j < th; j++) {
      for (let i = 0; i < tw; i++) {
        const q = (j * tw + i) * 4;
        if (!counts(rgba[q + 3])) continue;
        const t = rgba[q + c];
        const v = capture.rgb[((y + j) * capture.width + x + i) * 3 + c];
        sumT += t;
        sumV += v;
        sumTT += t * t;
        sumVV += v * v;
        sumTV += t * v;
        m++;
        if (t < low) low = t;
        if (t > high) high = t;
      }
    }
    if (m === 0) continue;
    const varT = m * sumTT - sumT * sumT;
    const varV = m * sumVV - sumV * sumV;
    const cov = m * sumTV - sumT * sumV;
    const gain = varT / m / m < 1 ? 1 : (cov < 0 ? -1 : 1) * Math.sqrt(Math.max(varV, 0) / varT);
    const offset = (sumV - gain * sumT) / m;
    moved[c] = Math.max(Math.abs(gain * low + offset - low), Math.abs(gain * high + offset - high));
    fileMean[c] = sumT / m;
    pageMean[c] = sumV / m;
  }
  return {
    score: 1 - Math.hypot(moved[0], moved[1], moved[2]) / MAX_COLOR_DISTANCE,
    fileColor: toHex(fileMean),
    pageColor: toHex(pageMean),
  };
}

function scoreColor(
  capture: Capture,
  reference: ImageReference,
  render: Render,
  x: number,
  y: number,
  shape: number
): Candidate {
  let color: number;
  let fileColor: string;
  let pageColor: string;
  if (reference.kind === "oneColor") {
    const fit = fitIconColor(capture, x, y, render);
    color = oneColorScore(fit, reference.color!);
    fileColor = toHex(reference.color!);
    pageColor = toHex(fit.icon);
  } else {
    const scored = gainOffsetScore(
      capture,
      x,
      y,
      render,
      reference.kind === "opaque" ? () => true : (alpha) => alpha >= 230
    );
    color = scored.score;
    fileColor = scored.fileColor;
    pageColor = scored.pageColor;
  }
  return {
    x,
    y,
    width: render.width,
    height: render.height,
    score: Math.min(shape, color),
    shape,
    color,
    fileColor,
    pageColor,
  };
}

// Scores one size at every location, then checks color at each peak.
function scanSize(
  cv: any,
  capture: Capture,
  reference: ImageReference,
  render: Render,
  regions: { x: number; y: number; width: number; height: number }[] | null
): { candidates: Candidate[]; best: Candidate | null; closest: Candidate | null } {
  const { width: tw, height: th, rgba } = render;
  const n = tw * th;
  const isOneColor = reference.kind === "oneColor";
  const template = new cv.Mat(th, tw, isOneColor ? cv.CV_8UC1 : cv.CV_8UC3);
  const mask = reference.kind === "multiColor" ? new cv.Mat(th, tw, cv.CV_8UC1) : null;
  for (let i = 0; i < n; i++) {
    const q = i * 4;
    if (isOneColor) {
      template.data[i] = rgba[q + 3];
    } else {
      template.data[i * 3] = rgba[q];
      template.data[i * 3 + 1] = rgba[q + 1];
      template.data[i * 3 + 2] = rgba[q + 2];
    }
    if (mask) mask.data[i] = rgba[q + 3] > 127 ? 255 : 0;
  }
  const result = new cv.Mat();
  try {
    const source = isOneColor ? capture.grayMat : capture.rgbMat;
    if (mask) cv.matchTemplate(source, template, result, cv.TM_CCOEFF_NORMED, mask);
    else cv.matchTemplate(source, template, result, cv.TM_CCOEFF_NORMED);

    const map = result.data32F;
    const cols = result.cols;
    const rows = result.rows;
    // One result covers both polarities for a silhouette, because an icon can be
    // lighter or darker than its background. A mask can produce non-finite cells.
    const shapeAt = (i: number) => {
      const v = isOneColor ? Math.abs(map[i]) : map[i];
      return v <= 1.0001 ? Math.min(v, 1) : -2;
    };
    const inScope = (x: number, y: number) =>
      !regions ||
      regions.some(
        (r) => x >= r.x - 1 && y >= r.y - 1 && x + tw <= r.x + r.width + 1 && y + th <= r.y + r.height + 1
      );

    const peaks: { x: number; y: number; shape: number }[] = [];
    let top = { x: 0, y: 0, shape: -2 };
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        const shape = shapeAt(i);
        if (shape === -2 || !inScope(x, y)) continue;
        if (shape > top.shape) top = { x, y, shape };
        if (shape < reference.threshold) continue;
        if (x > 0 && shapeAt(i - 1) >= shape) continue;
        if (y > 0 && shapeAt(i - cols) >= shape) continue;
        if (x < cols - 1 && shapeAt(i + 1) > shape) continue;
        if (y < rows - 1 && shapeAt(i + cols) > shape) continue;
        peaks.push({ x, y, shape });
      }
    }
    peaks.sort((a, b) => b.shape - a.shape);
    const candidates = peaks
      .slice(0, MAX_PEAKS)
      .map((p) => scoreColor(capture, reference, render, p.x, p.y, p.shape));
    const best = candidates.reduce<Candidate | null>((a, b) => (!a || b.score > a.score ? b : a), null);
    // What a miss at this size reports. A location whose shape matched, if any did.
    const closest = best ?? (top.shape === -2 ? null : scoreColor(capture, reference, render, top.x, top.y, top.shape));
    return { candidates, best, closest };
  } finally {
    template.delete();
    mask?.delete();
    result.delete();
  }
}

// Several locations can mark one place. Keep the strongest of each.
function suppressOverlaps(candidates: Candidate[]): Candidate[] {
  const kept: Candidate[] = [];
  for (const c of [...candidates].sort((a, b) => b.score - a.score)) {
    const overlaps = kept.some(
      (k) => Math.hypot(k.x - c.x, k.y - c.y) < Math.min(c.width, c.height) / 2
    );
    if (!overlaps) kept.push(c);
  }
  return kept;
}

const toCss = (c: Candidate, scale: number): Candidate => ({
  ...c,
  x: c.x / scale,
  y: c.y / scale,
  width: c.width / scale,
  height: c.height / scale,
});

// Looks once. `capture` is a PNG of the surface at device resolution. Locations in
// the result are CSS pixels, relative to the viewport.
async function matchImageOnce({
  capture,
  elementImage,
  reference,
  scale = 1,
  regions = null,
  cacheDir,
}: {
  capture: Buffer;
  elementImage?: any;
  reference?: ImageReference;
  scale?: number;
  regions?: { x: number; y: number; width: number; height: number }[] | null;
  cacheDir?: string;
}): Promise<{ match: Candidate | null; matches: Candidate[]; best: Candidate | null; threshold: number }> {
  const ctx = { cacheDir };
  const ref = reference ?? (await loadImageReference(elementImage, ctx));
  const cv = await loadOpenCv(ctx);
  const sharp = await getSharp(ctx);

  const flat = sharp(capture).flatten({ background: "#ffffff" });
  const color = await flat.clone().raw().toBuffer({ resolveWithObject: true });
  const gray = await flat.clone().greyscale().raw().toBuffer();
  const { width, height } = color.info;
  const grayMat = new cv.Mat(height, width, cv.CV_8UC1);
  grayMat.data.set(gray);
  const rgbMat = new cv.Mat(height, width, cv.CV_8UC3);
  rgbMat.data.set(color.data);
  const surface: Capture = { rgb: color.data, width, height, grayMat, rgbMat };
  const deviceRegions = regions
    ? regions.map((r) => ({ x: r.x * scale, y: r.y * scale, width: r.width * scale, height: r.height * scale }))
    : null;

  try {
    let best: Candidate | null = null;
    let closest: Candidate | null = null;
    let matches: Candidate[] = [];
    let fits = false;
    for (const h of sweepHeights(ref, scale)) {
      const render = await renderAt(ref, h, ctx);
      if (render.width > width || render.height > height) continue;
      fits = true;
      const scan = scanSize(cv, surface, ref, render, deviceRegions);
      if (scan.best && (!best || scan.best.score > best.score)) {
        best = scan.best;
        matches = scan.candidates.filter((c) => c.score >= ref.threshold);
      }
      // Across sizes a miss goes by shape, not score. A neighboring size can score
      // higher while misreading the color, and people copy that color into `color`.
      if (scan.closest && (!closest || scan.closest.shape > closest.shape)) closest = scan.closest;
      if (best && best.score >= STOP_SCORE) break;
    }
    if (!fits) {
      throw new ImageReferenceError(
        `The image reference ${ref.label} is ${ref.width}×${ref.height} pixels, larger than the ${width}×${height} surface.`
      );
    }
    const kept = suppressOverlaps(matches);
    const top = kept.length ? Math.max(...kept.map((c) => c.score)) : 0;
    const first = kept
      .filter((c) => c.score >= top - 0.01)
      .sort((a, b) => a.y - b.y || a.x - b.x)[0];
    return {
      match: first ? toCss(first, scale) : null,
      matches: kept.map((c) => toCss(c, scale)),
      best: closest ? toCss(closest, scale) : null,
      threshold: ref.threshold,
    };
  } finally {
    grayMat.delete();
    rgbMat.delete();
  }
}

function missMessage(reference: ImageReference, best: Candidate | null, scale: number): string {
  const { label, threshold } = reference;
  const surface = `the surface's display scale of ${Math.round(scale * 100) / 100}`;
  if (!best) return `Couldn't find ${label}: no location could be scored, with ${surface}.`;
  let message =
    `Couldn't find ${label}. The closest match scored ${best.score.toFixed(2)} ` +
    `(shape ${best.shape.toFixed(2)}, color ${best.color.toFixed(2)}) ` +
    `at (${Math.round(best.x)}, ${Math.round(best.y)}), below the threshold of ${threshold}, with ${surface}.`;
  if (best.shape >= threshold && best.color < threshold) {
    message += ` The shape matched, but the reference is ${best.fileColor} and the page shows ${best.pageColor}.`;
    if (reference.kind === "oneColor" && !reference.colorGiven) {
      message += " A file drawn in currentColor renders black, so give the icon's color in `color`.";
    }
  }
  return message;
}
