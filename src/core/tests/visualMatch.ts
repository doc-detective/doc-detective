// Visual element matching: locate a template image (icon file or cropped
// screenshot) inside a surface capture via OpenCV template matching, so the
// `image` finding criterion can resolve elements no DOM/accessibility
// semantics can reach (ADR 01087).
//
// Layout mirrors annotations/geometry.ts: pure, dependency-free helpers first
// (unit-testable with plain data), then the sharp/opencv-coupled matcher
// (testable with synthetic buffers), then driver-coupled capture helpers.
//
// Scale is the landmine this module exists to bury: a template captured at
// one display scale fails TOTALLY against a capture at another (verified —
// 2x-vs-1x scores below any usable threshold), so every match runs a ladder
// of candidate template scales and the best score wins. The ladder leads
// with the capture-derived scales (a template cropped from a same-machine
// screenshot is already at capture scale; an icon file authored at 1x needs
// the capture scale) and falls back to the common display ratios so a
// template captured on a differently-scaled machine still matches.

import fs from "node:fs";
import { loadHeavyDep } from "../../runtime/loader.js";

export {
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
};
export type { Rect, ImageCriterion, VisualMatch, MatchTemplateResult };

type Rect = { x: number; y: number; width: number; height: number };

type ImageCriterion = {
  // Template image: a file path (resolved by resolvePaths before the step
  // runs) or a data:image/...;base64 URI.
  path: string;
  // Minimum normalized match score (0-1) to accept. Resolved against the
  // config default by resolveMatchThreshold.
  matchThreshold?: number;
  // Search-region scoping: a rect in logical units, or nested element
  // criteria (resolved by the caller — this module only sees pixels).
  region?: any;
};

type VisualMatch = { rect: Rect; score: number; scaleUsed: number };

type MatchTemplateResult = {
  // Best match at/above threshold, in CAPTURE pixels. Null on a miss.
  best: VisualMatch | null;
  // Every at/above-threshold match after location dedupe, best first. More
  // than one entry with no other criteria to disambiguate = ambiguity.
  matches: VisualMatch[];
  // Best score seen anywhere, even below threshold — miss diagnostics only.
  // Populated when collectBestCandidate is set; otherwise mirrors `best`.
  bestCandidate: VisualMatch | null;
};

// The default config-level threshold. Deliberately far above Appium's loose
// 0.4: verified scores are 1.0 exact, ~0.999 under color drift, ~0.975 after
// DPR rescaling, so 0.8 keeps headroom for compression artifacts while
// rejecting lookalikes.
const DEFAULT_MATCH_THRESHOLD = 0.8;

// Early-exit score: a ladder scale that matches this well ends the ladder —
// later scales can't meaningfully beat it and each costs a full matchTemplate
// pass over the capture.
const EARLY_EXIT_SCORE = 0.95;

// Fallback template scales beyond the capture-derived ones: the common
// display-scale ratios (Windows 125%/150%/200%, macOS 2x/3x) and their
// inverses, so a template captured on a differently-scaled machine still
// lands. Ordered by likelihood.
const FALLBACK_SCALES = [2, 0.5, 1.5, 2 / 3, 1.25, 0.8, 3, 1 / 3];

// Template scales outside this range are noise: below 0.1 the template
// degenerates to a few pixels, above 8 it outgrows any real capture.
const MIN_SCALE = 0.1;
const MAX_SCALE = 8;

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

// Normalize the schema's string-or-object `image` criterion to the object
// form. Throws on shapes the schema should have rejected — an actionable
// message beats a downstream undefined-path crash when a caller bypasses
// validation (env-substituted values).
function normalizeImageCriterion(image: any): ImageCriterion {
  if (typeof image === "string") {
    if (!image.trim()) {
      throw new Error(
        "The image criterion is an empty string; provide a template image path or data URI."
      );
    }
    return { path: image };
  }
  if (image && typeof image === "object" && !Array.isArray(image)) {
    if (typeof image.path !== "string" || !image.path.trim()) {
      throw new Error(
        "The image criterion object requires a `path` (template image file path or data URI)."
      );
    }
    return image as ImageCriterion;
  }
  throw new Error(
    "The image criterion must be a string (path or data URI) or an object with a `path`."
  );
}

function isDataUri(value: string): boolean {
  return typeof value === "string" && value.startsWith("data:image/");
}

// Threshold precedence: step value (an explicit 0 is a real choice) >
// config default > built-in. Mirrors saveScreenshot's maxVariation handling
// (ADR 00139: fractional 0-1 semantics).
function resolveMatchThreshold(stepValue: any, config: any): number {
  if (typeof stepValue === "number" && Number.isFinite(stepValue)) {
    return stepValue;
  }
  const configValue = config?.imageMatching?.matchThreshold;
  if (typeof configValue === "number" && Number.isFinite(configValue)) {
    return configValue;
  }
  return DEFAULT_MATCH_THRESHOLD;
}

// Candidate template scales, most likely first, clamped to sanity and with
// near-duplicates (within 1%) collapsed to the earlier (more likely) entry.
function scaleLadder(captureScale: any): number[] {
  const s =
    typeof captureScale === "number" &&
    Number.isFinite(captureScale) &&
    captureScale > 0
      ? captureScale
      : 1;
  const clamp = (v: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, v));
  const candidates = [1, s, 1 / s, ...FALLBACK_SCALES].map(clamp);
  const ladder: number[] = [];
  for (const candidate of candidates) {
    const isDuplicate = ladder.some(
      (kept) => Math.abs(candidate - kept) / kept <= 0.01
    );
    if (!isDuplicate) ladder.push(candidate);
  }
  return ladder;
}

// Capture-pixel rect -> logical units. Junk scale degrades to 1:1 rather
// than exploding into NaN/Infinity (same posture as computeScale).
function captureRectToLogical(rect: Rect, captureScale: any): Rect {
  const s =
    typeof captureScale === "number" &&
    Number.isFinite(captureScale) &&
    captureScale > 0
      ? captureScale
      : 1;
  return {
    x: rect.x / s,
    y: rect.y / s,
    width: rect.width / s,
    height: rect.height / s,
  };
}

function rectCenter(rect: Rect): { x: number; y: number } {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function rectContainsPoint(rect: Rect, point: { x: number; y: number }): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

// Collapse matches whose centers sit within `minSeparation` px of an
// already-kept (better-scoring) match. Two jobs: opencv's per-scale neighbor
// filter can still emit near-duplicate peaks, and the SAME location often
// clears the threshold at two adjacent ladder scales — without a cross-scale
// merge every real target would look ambiguous. Returns best-first.
function dedupeMatches<T extends { rect: Rect; score: number }>(
  matches: T[],
  minSeparation: number
): T[] {
  const sorted = [...matches].sort((a, b) => b.score - a.score);
  const kept: T[] = [];
  for (const match of sorted) {
    const center = rectCenter(match.rect);
    const isDuplicate = kept.some((existing) => {
      const existingCenter = rectCenter(existing.rect);
      return (
        Math.hypot(center.x - existingCenter.x, center.y - existingCenter.y) <=
        minSeparation
      );
    });
    if (!isDuplicate) kept.push(match);
  }
  return kept;
}

// ---------------------------------------------------------------------------
// Template loading (fs / data URI)
// ---------------------------------------------------------------------------

async function loadTemplateBuffer(criterion: ImageCriterion): Promise<Buffer> {
  const { path: templatePath } = criterion;
  if (isDataUri(templatePath)) {
    const commaIndex = templatePath.indexOf(",");
    if (commaIndex === -1 || !templatePath.slice(0, commaIndex).includes("base64")) {
      throw new Error(
        "The image criterion's data URI is malformed; expected data:image/<type>;base64,<payload>."
      );
    }
    const payload = templatePath.slice(commaIndex + 1);
    const buffer = Buffer.from(payload, "base64");
    if (buffer.length === 0) {
      throw new Error("The image criterion's data URI decoded to an empty image.");
    }
    return buffer;
  }
  try {
    return fs.readFileSync(templatePath);
  } catch (error: any) {
    throw new Error(
      `Couldn't read the template image at "${templatePath}": ${error?.message ?? error}`
    );
  }
}

// ---------------------------------------------------------------------------
// Matcher (sharp + @appium/opencv)
// ---------------------------------------------------------------------------

// Memoized heavy-dep getters, same pattern as saveScreenshot.ts: ctx is
// honored on first call; the JIT preflight in runTests() already matched
// config.cacheDir before any step executes.
let _sharp: any = null;
let _opencv: any = null;

async function getSharp(ctx: { cacheDir?: string } = {}): Promise<any> {
  if (!_sharp) {
    const mod = await loadHeavyDep<any>("sharp", { ctx });
    _sharp = mod && (mod.default ?? mod);
  }
  return _sharp;
}

async function getOpenCv(ctx: { cacheDir?: string } = {}): Promise<any> {
  if (!_opencv) {
    const mod = await loadHeavyDep<any>("@appium/opencv", { ctx });
    _opencv = mod && (mod.default ?? mod);
  }
  return _opencv;
}

// Run the template through the scale ladder against a capture and return
// every qualifying match in CAPTURE pixels. Never mutates its inputs; the
// optional `cache` (persisted by the caller across poll iterations) memoizes
// scaled template buffers so re-polling doesn't re-resize.
async function matchTemplate({
  capture,
  template,
  threshold,
  captureScale,
  regionPx,
  collectBestCandidate = false,
  cache,
  ctx = {},
  deps = {},
}: {
  capture: Buffer;
  template: Buffer;
  threshold: number;
  captureScale: number;
  // Optional search region in CAPTURE pixels; results come back in
  // full-capture coordinates regardless.
  regionPx?: Rect;
  // Also track the best score below threshold (miss diagnostics). Off by
  // default — it costs one extra matchTemplate pass per silent ladder scale.
  collectBestCandidate?: boolean;
  cache?: { scaledTemplates?: Map<number, Buffer> };
  ctx?: { cacheDir?: string };
  deps?: {
    getSharp?: (ctx: any) => Promise<any>;
    getOpenCv?: (ctx: any) => Promise<any>;
  };
}): Promise<MatchTemplateResult> {
  let opencv: any;
  let sharp: any;
  try {
    opencv = await (deps.getOpenCv ?? getOpenCv)(ctx);
    sharp = await (deps.getSharp ?? getSharp)(ctx);
  } catch (error: any) {
    // The match IS the step's purpose, so a missing engine is a FAIL with a
    // recovery path, not a silent skip (pixelmatch precedent).
    throw new Error(
      `Image matching requires the optional @appium/opencv and sharp dependencies. ` +
        `Install them with \`doc-detective install\`. Original error: ${error?.message ?? error}`
    );
  }

  // Region scoping: crop the haystack, remember the origin to add back so
  // every reported rect is in full-capture coordinates.
  let haystack = capture;
  let origin = { x: 0, y: 0 };
  const captureMeta = await sharp(capture).metadata();
  if (regionPx) {
    const left = Math.max(0, Math.round(regionPx.x));
    const top = Math.max(0, Math.round(regionPx.y));
    const width = Math.min(
      Math.round(regionPx.width),
      (captureMeta.width ?? 0) - left
    );
    const height = Math.min(
      Math.round(regionPx.height),
      (captureMeta.height ?? 0) - top
    );
    if (width <= 0 || height <= 0) {
      return { best: null, matches: [], bestCandidate: null };
    }
    haystack = await sharp(capture)
      .extract({ left, top, width, height })
      .png()
      .toBuffer();
    origin = { x: left, y: top };
  }
  const haystackMeta = regionPx ? await sharp(haystack).metadata() : captureMeta;

  const templateMeta = await sharp(template).metadata();
  const baseWidth = templateMeta.width ?? 0;
  const baseHeight = templateMeta.height ?? 0;
  if (!baseWidth || !baseHeight) {
    throw new Error("The template image has no decodable dimensions.");
  }

  const scaledTemplates = cache?.scaledTemplates ?? new Map<number, Buffer>();
  if (cache && !cache.scaledTemplates) cache.scaledTemplates = scaledTemplates;

  const getScaledTemplate = async (scale: number): Promise<Buffer | null> => {
    const width = Math.max(1, Math.round(baseWidth * scale));
    const height = Math.max(1, Math.round(baseHeight * scale));
    // OpenCV rejects a template larger than the haystack.
    if (
      width > (haystackMeta.width ?? 0) ||
      height > (haystackMeta.height ?? 0)
    ) {
      return null;
    }
    if (scale === 1) return template;
    const cached = scaledTemplates.get(scale);
    if (cached) return cached;
    const scaled = await sharp(template)
      .resize({ width, height, fit: "fill" })
      .png()
      .toBuffer();
    scaledTemplates.set(scale, scaled);
    return scaled;
  };

  const allMatches: VisualMatch[] = [];
  let bestCandidate: VisualMatch | null = null;
  const trackCandidate = (candidate: VisualMatch) => {
    if (!bestCandidate || candidate.score > bestCandidate.score) {
      bestCandidate = candidate;
    }
  };
  const toCaptureRect = (rect: any): Rect => ({
    x: rect.x + origin.x,
    y: rect.y + origin.y,
    width: rect.width,
    height: rect.height,
  });

  // The multiple-match scan reports each cluster's FIRST score at/above the
  // threshold in scan order, not its true peak (single-shot mode uses
  // minMaxLoc and does report the peak — verified: an exact-crop template
  // scores 1.0 single-shot but ~0.85 via the cluster representative). Refine
  // each cluster with a single-shot pass over a small window around it so
  // reported scores/rects are true peaks — otherwise users tune thresholds
  // against understated numbers and the early-exit never fires.
  const refineMatch = async (
    raw: { rect: Rect; score: number },
    scaledTemplate: Buffer,
    scale: number
  ): Promise<{ rect: Rect; score: number }> => {
    try {
      const tplW = Math.max(1, Math.round(baseWidth * scale));
      const tplH = Math.max(1, Math.round(baseHeight * scale));
      const hayW = haystackMeta.width ?? 0;
      const hayH = haystackMeta.height ?? 0;
      const left = Math.max(0, Math.round(raw.rect.x - tplW));
      const top = Math.max(0, Math.round(raw.rect.y - tplH));
      const width = Math.min(3 * tplW, hayW - left);
      const height = Math.min(3 * tplH, hayH - top);
      if (width < tplW || height < tplH) return raw;
      const window = await sharp(haystack)
        .extract({ left, top, width, height })
        .png()
        .toBuffer();
      const single = await opencv.getImageOccurrence(window, scaledTemplate, {
        threshold: 0,
        multiple: false,
      });
      if (!single?.rect) return raw;
      return {
        rect: {
          x: left + single.rect.x,
          y: top + single.rect.y,
          width: single.rect.width,
          height: single.rect.height,
        },
        score: single.score,
      };
    } catch {
      return raw; // Refinement is an accuracy upgrade, never a failure mode.
    }
  };

  for (const scale of scaleLadder(captureScale)) {
    const scaledTemplate = await getScaledTemplate(scale);
    if (!scaledTemplate) continue;
    // Neighbor threshold scales with the template so adjacent identical
    // icons in a toolbar stay distinct while sub-pixel peaks collapse.
    const matchNeighbourThreshold = Math.max(
      10,
      Math.round((baseWidth * scale) / 2)
    );
    let occurrence: any = null;
    try {
      occurrence = await opencv.getImageOccurrence(haystack, scaledTemplate, {
        threshold,
        multiple: true,
        matchNeighbourThreshold,
      });
    } catch {
      // getImageOccurrence throws when nothing clears the threshold — that's
      // a no-match-at-this-scale, not an error.
    }
    let rawScaleMatches: Array<{ rect: Rect; score: number }> = (
      occurrence?.multiple ?? []
    ).filter((m: any) => m?.rect);
    // Single-shape fallback in case the library returns a bare result.
    if (!rawScaleMatches.length && occurrence?.rect) {
      rawScaleMatches = [{ rect: occurrence.rect, score: occurrence.score }];
    }
    const scaleMatches: VisualMatch[] = [];
    for (const raw of rawScaleMatches) {
      const refined = await refineMatch(raw, scaledTemplate, scale);
      scaleMatches.push({
        rect: toCaptureRect(refined.rect),
        score: refined.score,
        scaleUsed: scale,
      });
    }
    allMatches.push(...scaleMatches);
    for (const match of scaleMatches) trackCandidate(match);

    if (!scaleMatches.length && collectBestCandidate) {
      // Nothing cleared the threshold at this scale; grab the best score
      // anyway so a miss can report how close the closest region came.
      try {
        const single = await opencv.getImageOccurrence(
          haystack,
          scaledTemplate,
          { threshold: 0, multiple: false }
        );
        if (single?.rect) {
          trackCandidate({
            rect: toCaptureRect(single.rect),
            score: single.score,
            scaleUsed: scale,
          });
        }
      } catch {
        // Diagnostics stay best-effort.
      }
    }

    const scaleBest = scaleMatches.reduce(
      (max: number, m) => Math.max(max, m.score),
      0
    );
    if (scaleBest >= Math.max(threshold, EARLY_EXIT_SCORE)) break;
  }

  // Cross-scale + intra-scale location dedupe. Separation follows the
  // matched template size: half a template width, floored at 16px.
  const bestScale = allMatches.length
    ? allMatches.reduce((a, b) => (b.score > a.score ? b : a)).scaleUsed
    : 1;
  const minSeparation = Math.max(16, Math.round((baseWidth * bestScale) / 2));
  const matches = dedupeMatches(allMatches, minSeparation);

  return {
    best: matches[0] ?? null,
    matches,
    bestCandidate: bestCandidate ?? matches[0] ?? null,
  };
}
