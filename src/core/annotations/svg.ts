// The annotation renderer. Pure: takes placed annotations (rects already in
// image pixels, resolved by the geometry layer) and emits SVG markup plus blur
// instructions. No driver, no sharp, no DOM — every geometry and style
// decision lives here so the buffer renderer (sharp composite) and the live
// DOM overlay draw byte-identical shapes from one implementation.
//
// Blur is the one thing SVG can't express as an overlay: an SVG filter can
// only blur what's inside the SVG, not the image behind it. So blurs come back
// as regions for the caller to apply in its own medium — sharp
// extract/blur/composite for buffers, backdrop-filter for the DOM.

import type { ResolvedAnnotation } from "./model.js";

export { annotationsToSvg, escapeXml, wrapText, anchorPoint };
export type { PlacedAnnotation, BlurRegion, Rect };

type Rect = { x: number; y: number; width: number; height: number };
type Point = { x: number; y: number };
type PlacedAnnotation = ResolvedAnnotation & { rect: Rect };
type BlurRegion = { rect: Rect; intensity: number };

const XML_ESCAPES: Record<string, string> = {
  "<": "&lt;",
  ">": "&gt;",
  "&": "&amp;",
  "'": "&apos;",
  '"': "&quot;",
};

function escapeXml(value: string): string {
  return String(value).replace(/[<>&'"]/g, (c) => XML_ESCAPES[c]);
}

// Round to at most 2dp and drop trailing zeros, so coordinates stay readable
// in debug output and stable across runs (sub-pixel jitter in a rect would
// otherwise churn the markup and every maxVariation baseline with it).
function num(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return String(Math.round(value * 100) / 100);
}

// Greedy word wrap. Width is estimated from the font size rather than measured
// — there's no text metrics engine here, and both renderers need the SAME
// answer, so a shared approximation beats each medium measuring for itself and
// disagreeing. 0.6em is a reasonable average advance for the sans-serif stacks
// this ships with.
const CHAR_WIDTH_RATIO = 0.6;

function wrapText(text: string, maxWidth: number, fontSize: number): string[] {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const maxChars = Math.max(1, Math.floor(maxWidth / (fontSize * CHAR_WIDTH_RATIO)));
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= maxChars || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// Resolve a named region against a rect. Unknown/absent regions land on the
// center, which is always a defined point even for a zero-size rect.
function anchorPoint(rect: Rect, region: unknown): Point {
  const left = rect.x;
  const right = rect.x + rect.width;
  const top = rect.y;
  const bottom = rect.y + rect.height;
  const midX = rect.x + rect.width / 2;
  const midY = rect.y + rect.height / 2;
  switch (region) {
    case "top-left":
      return { x: left, y: top };
    case "top":
      return { x: midX, y: top };
    case "top-right":
      return { x: right, y: top };
    case "right":
      return { x: right, y: midY };
    case "bottom-right":
      return { x: right, y: bottom };
    case "bottom":
      return { x: midX, y: bottom };
    case "bottom-left":
      return { x: left, y: bottom };
    case "left":
      return { x: left, y: midY };
    default:
      return { x: midX, y: midY };
  }
}

// A placement can nudge an already-chosen point.
function applyOffset(point: Point, placement: any): Point {
  if (placement && typeof placement === "object" && placement.offset) {
    return {
      x: point.x + (placement.offset.x ?? 0),
      y: point.y + (placement.offset.y ?? 0),
    };
  }
  return point;
}

// The region a placement names, or undefined if it isn't a named region.
function placementRegion(placement: any): string | undefined {
  return typeof placement === "string" ? placement : undefined;
}

// Intersect a rect with the canvas. Returns null when they don't overlap —
// a blur that lands entirely off-canvas has nothing to redact, and passing it
// to sharp's extract would throw.
function clipToCanvas(rect: Rect, canvas: { width: number; height: number }): Rect | null {
  const x = Math.max(0, Math.round(rect.x));
  const y = Math.max(0, Math.round(rect.y));
  const right = Math.min(canvas.width, Math.round(rect.x + rect.width));
  const bottom = Math.min(canvas.height, Math.round(rect.y + rect.height));
  const width = right - x;
  const height = bottom - y;
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

function styleAttrs(item: PlacedAnnotation): string {
  const opacity = item.style.opacity;
  return opacity !== undefined && opacity !== 1 ? ` opacity="${num(opacity)}"` : "";
}

// --- per-type renderers -----------------------------------------------------

function renderOutline(item: PlacedAnnotation): string {
  const pad = item.style.padding ?? 0;
  const rect = {
    x: item.rect.x - pad,
    y: item.rect.y - pad,
    width: item.rect.width + pad * 2,
    height: item.rect.height + pad * 2,
  };
  return (
    `<rect x="${num(rect.x)}" y="${num(rect.y)}" ` +
    `width="${num(rect.width)}" height="${num(rect.height)}" ` +
    `rx="${num(item.style.radius ?? 0)}" fill="none" ` +
    `stroke="${escapeXml(item.style.color!)}" ` +
    `stroke-width="${num(item.style.strokeWidth ?? 2)}"${styleAttrs(item)}/>`
  );
}

const ARROW_LENGTH = 64;

// Direction an arrow travels, by the region it's placed at: an arrow placed
// "top" comes down from above, so it points south.
const ARROW_VECTORS: Record<string, Point> = {
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  "top-left": { x: -0.707, y: -0.707 },
  "top-right": { x: 0.707, y: -0.707 },
  "bottom-left": { x: -0.707, y: 0.707 },
  "bottom-right": { x: 0.707, y: 0.707 },
};

function renderArrow(item: PlacedAnnotation): string {
  const region = placementRegion(item.placement) ?? "top";
  const vector = ARROW_VECTORS[region] ?? ARROW_VECTORS.top;
  // Tip lands on the target's edge in the arrow's direction, then any offset
  // nudges it.
  const tip = applyOffset(anchorPoint(item.rect, region), item.placement);
  const tail = {
    x: tip.x + vector.x * ARROW_LENGTH,
    y: tip.y + vector.y * ARROW_LENGTH,
  };
  const width = item.style.strokeWidth ?? 3;
  const head = Math.max(6, width * 3);
  // Arrowhead: a triangle at the tip, square to the shaft.
  const backX = tip.x + vector.x * head;
  const backY = tip.y + vector.y * head;
  const perpX = -vector.y;
  const perpY = vector.x;
  const points = [
    `${num(tip.x)},${num(tip.y)}`,
    `${num(backX + perpX * head * 0.5)},${num(backY + perpY * head * 0.5)}`,
    `${num(backX - perpX * head * 0.5)},${num(backY - perpY * head * 0.5)}`,
  ].join(" ");
  const color = escapeXml(item.style.color!);
  const attrs = styleAttrs(item);
  return (
    `<line x1="${num(tail.x)}" y1="${num(tail.y)}" x2="${num(backX)}" y2="${num(backY)}" ` +
    `stroke="${color}" stroke-width="${num(width)}" stroke-linecap="round"${attrs}/>` +
    `<polygon points="${points}" fill="${color}"${attrs}/>`
  );
}

function renderBadge(item: PlacedAnnotation): string {
  const region = placementRegion(item.placement) ?? "top-left";
  const center = applyOffset(anchorPoint(item.rect, region), item.placement);
  const fontSize = item.style.fontSize ?? 13;
  const radius = fontSize;
  const color = escapeXml(item.style.color!);
  const background = escapeXml(item.style.background ?? "#E11D48");
  const attrs = styleAttrs(item);
  const label = item.label ?? "";
  return (
    `<circle cx="${num(center.x)}" cy="${num(center.y)}" r="${num(radius)}" ` +
    `fill="${background}"${attrs}/>` +
    `<text x="${num(center.x)}" y="${num(center.y)}" fill="${color}" ` +
    `font-family="${escapeXml(item.style.fontFamily!)}" font-size="${num(fontSize)}" ` +
    `text-anchor="middle" dominant-baseline="central"${attrs}>${escapeXml(label)}</text>`
  );
}

const LINE_HEIGHT_RATIO = 1.35;

// Lay out a text box: background rect + one <text> per wrapped line. Shared by
// callout and text so both wrap and pad identically.
function renderTextBox(
  item: PlacedAnnotation,
  topLeft: Point,
  canvas: { width: number; height: number }
): { markup: string; rect: Rect } {
  const fontSize = item.style.fontSize ?? 14;
  const pad = item.style.padding ?? 8;
  const maxWidth = item.style.maxWidth ?? 280;
  const lines = wrapText(item.label ?? "", maxWidth, fontSize);
  const lineHeight = fontSize * LINE_HEIGHT_RATIO;
  const textWidth = lines.reduce(
    (widest, line) => Math.max(widest, line.length * fontSize * CHAR_WIDTH_RATIO),
    0
  );
  const boxWidth = textWidth + pad * 2;
  const boxHeight = lines.length * lineHeight + pad * 2;
  // Keep the box on canvas; a callout near the right edge should slide left
  // rather than render half off the image.
  const x = Math.max(0, Math.min(topLeft.x, canvas.width - boxWidth));
  const y = Math.max(0, Math.min(topLeft.y, canvas.height - boxHeight));
  const attrs = styleAttrs(item);
  const background = escapeXml(item.style.background ?? "#1E293B");
  const color = escapeXml(item.style.color!);
  let markup =
    `<rect x="${num(x)}" y="${num(y)}" width="${num(boxWidth)}" height="${num(boxHeight)}" ` +
    `rx="${num(item.style.radius ?? 4)}" fill="${background}"${attrs}/>`;
  lines.forEach((line, index) => {
    const baseline = y + pad + lineHeight * index + fontSize;
    markup +=
      `<text x="${num(x + pad)}" y="${num(baseline)}" fill="${color}" ` +
      `font-family="${escapeXml(item.style.fontFamily!)}" font-size="${num(fontSize)}"${attrs}>` +
      `${escapeXml(line)}</text>`;
  });
  return { markup, rect: { x, y, width: boxWidth, height: boxHeight } };
}

const CALLOUT_GAP = 48;

function renderCallout(
  item: PlacedAnnotation,
  canvas: { width: number; height: number }
): string {
  const region = placementRegion(item.placement) ?? "right";
  const anchor = applyOffset(anchorPoint(item.rect, region), item.placement);
  const vector = ARROW_VECTORS[region] ?? ARROW_VECTORS.right;
  // Push the box away from the element along the placement direction, then
  // draw a leader line back to the anchor.
  const boxOrigin = {
    x: anchor.x + vector.x * CALLOUT_GAP,
    y: anchor.y + vector.y * CALLOUT_GAP,
  };
  const { markup, rect } = renderTextBox(item, boxOrigin, canvas);
  const boxCenter = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  const line =
    `<line x1="${num(anchor.x)}" y1="${num(anchor.y)}" ` +
    `x2="${num(boxCenter.x)}" y2="${num(boxCenter.y)}" ` +
    `stroke="${escapeXml(item.style.color!)}" ` +
    `stroke-width="${num(item.style.strokeWidth ?? 2)}"${styleAttrs(item)}/>`;
  // Leader first so the box paints over it.
  return line + markup;
}

function renderText(
  item: PlacedAnnotation,
  canvas: { width: number; height: number }
): string {
  const origin = applyOffset(
    { x: item.rect.x, y: item.rect.y },
    item.placement
  );
  return renderTextBox(item, origin, canvas).markup;
}

// --- entry point ------------------------------------------------------------

/**
 * Render placed annotations into a single SVG overlay sized to the canvas,
 * plus the blur regions the caller must apply itself.
 *
 * @param items Annotations whose rects are already in image pixels, relative
 *   to the canvas origin (the geometry layer handles scaling and any crop
 *   offset).
 * @param canvas Dimensions of the image the overlay composites onto.
 */
function annotationsToSvg(
  items: PlacedAnnotation[],
  canvas: { width: number; height: number }
): { svg: string; blurRegions: BlurRegion[] } {
  const blurRegions: BlurRegion[] = [];
  let body = "";

  for (const item of items) {
    switch (item.type) {
      case "blur": {
        const rect = clipToCanvas(item.rect, canvas);
        if (rect) blurRegions.push({ rect, intensity: item.style.intensity ?? 14 });
        break;
      }
      case "outline":
        body += renderOutline(item);
        break;
      case "arrow":
        body += renderArrow(item);
        break;
      case "badge":
        body += renderBadge(item);
        break;
      case "callout":
        body += renderCallout(item, canvas);
        break;
      case "text":
        body += renderText(item, canvas);
        break;
    }
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${num(canvas.width)}" ` +
    `height="${num(canvas.height)}" viewBox="0 0 ${num(canvas.width)} ${num(canvas.height)}">` +
    `${body}</svg>`;
  return { svg, blurRegions };
}
