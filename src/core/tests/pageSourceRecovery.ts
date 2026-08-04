// Native-app element recovery for visual matching (ADR 01087): none of the
// four app drivers exposes a hit-test API, but ALL of them expose per-node
// bounds in getPageSource() XML — NovaWindows emits window-relative
// x/y/width/height, Mac2 and WDA emit x/y/width/height (screen coords /
// points), and uiautomator2-server emits bounds="[l,t][r,b]" (verified in
// each driver's source). So: parse the tree, find the smallest node whose
// bounds contain the match center, rebuild it as a positional XPath, and
// re-find it through the driver — a REAL element handle, not a phantom.
//
// Best-effort by contract: every failure path returns { element: null,
// reason } and never throws, so callers can fall back to rect-only outputs.

import { XMLParser } from "fast-xml-parser";
import { rectContainsPoint } from "./visualMatch.js";
import type { Rect } from "./visualMatch.js";

export { parsePageSource, smallestNodeContaining, xpathForNode, recoverAppElement };
export type { SourceNode };

type SourceNode = {
  tag: string;
  attributes: Record<string, string>;
  rect: Rect | null;
  children: SourceNode[];
  parent: SourceNode | null;
  depth: number;
};

// Android's uiautomator2-server bounds shape: "[left,top][right,bottom]".
const ANDROID_BOUNDS = /^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/;

function rectFromAttributes(
  attributes: Record<string, string>,
  platform: string
): Rect | null {
  if (platform === "android") {
    const match = ANDROID_BOUNDS.exec(attributes.bounds ?? "");
    if (!match) return null;
    const [left, top, right, bottom] = match.slice(1).map(Number);
    if (right <= left || bottom <= top) return null;
    return { x: left, y: top, width: right - left, height: bottom - top };
  }
  // windows / mac / ios: x/y/width/height attributes.
  const x = Number.parseFloat(attributes.x);
  const y = Number.parseFloat(attributes.y);
  const width = Number.parseFloat(attributes.width);
  const height = Number.parseFloat(attributes.height);
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }
  return { x, y, width, height };
}

// Parse a driver's page-source XML into a bounds-bearing tree. Returns null
// (never throws) when the XML is empty or malformed — recovery degrades to
// rect-only rather than failing the find.
function parsePageSource(xml: string, platform: string): SourceNode | null {
  if (!xml || typeof xml !== "string") return null;
  let parsed: any;
  try {
    // preserveOrder keeps sibling order (positional XPath indexes depend on
    // it); attributes keep their names under ":@".
    const parser = new XMLParser({
      preserveOrder: true,
      ignoreAttributes: false,
      attributeNamePrefix: "",
      // Bounds attributes must stay strings ("[0,0][1080,1920]" and float
      // coords alike); we parse them ourselves.
      parseAttributeValue: false,
    });
    parsed = parser.parse(xml);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  const buildNode = (
    entry: any,
    parent: SourceNode | null,
    depth: number
  ): SourceNode | null => {
    const tag = Object.keys(entry).find((k) => k !== ":@");
    if (!tag || tag === "?xml") return null;
    const attributes: Record<string, string> = {};
    for (const [key, value] of Object.entries(entry[":@"] ?? {})) {
      attributes[key] = String(value);
    }
    const node: SourceNode = {
      tag,
      attributes,
      rect: rectFromAttributes(attributes, platform),
      children: [],
      parent,
      depth,
    };
    const childEntries = Array.isArray(entry[tag]) ? entry[tag] : [];
    for (const childEntry of childEntries) {
      const child = buildNode(childEntry, node, depth + 1);
      if (child) node.children.push(child);
    }
    return node;
  };

  for (const entry of parsed) {
    const node = buildNode(entry, null, 0);
    if (node) return node;
  }
  return null;
}

// The node the match center "belongs to": smallest bounds-containing area,
// ties broken by depth (deepest wins — a child overlapping its container
// exactly is the more specific target).
function smallestNodeContaining(
  root: SourceNode | null,
  point: { x: number; y: number }
): SourceNode | null {
  if (!root) return null;
  let best: SourceNode | null = null;
  let bestArea = Infinity;
  const visit = (node: SourceNode) => {
    if (node.rect && rectContainsPoint(node.rect, point)) {
      const area = node.rect.width * node.rect.height;
      if (
        area < bestArea ||
        (area === bestArea && best !== null && node.depth > best.depth)
      ) {
        best = node;
        bestArea = area;
      }
    }
    for (const child of node.children) visit(child);
  };
  visit(root);
  return best;
}

// Rebuild a tree node as a positional XPath (`/Window/Pane[1]/Button[2]`) —
// tag names in the source XML match each driver's XPath view of the same
// tree, and positional indexes survive attribute quirks that name-based
// predicates wouldn't.
function xpathForNode(root: SourceNode, target: SourceNode): string {
  const segments: string[] = [];
  let node: SourceNode | null = target;
  while (node && node !== root) {
    const parent: SourceNode = node.parent!;
    const sameTagSiblings = parent.children.filter((c) => c.tag === node!.tag);
    const index = sameTagSiblings.indexOf(node) + 1;
    segments.unshift(`${node.tag}[${index}]`);
    node = parent;
  }
  return `/${root.tag}${segments.length ? "/" + segments.join("/") : ""}`;
}

// Driver-coupled recovery: source -> containing node -> positional XPath ->
// re-find. `point` must already be in the platform's page-source coordinate
// space (window-relative on Windows, screen coords on macOS, device px on
// Android, points on iOS) — the caller owns that transform because only it
// knows the capture scale and window origin.
async function recoverAppElement({
  driver,
  platform,
  point,
}: {
  driver: any;
  platform: string;
  point: { x: number; y: number };
}): Promise<{ element: any | null; reason?: string }> {
  try {
    const xml = await driver.getPageSource();
    const root = parsePageSource(xml, platform);
    if (!root) {
      return { element: null, reason: "couldn't parse the app page source" };
    }
    const node = smallestNodeContaining(root, point);
    if (!node || node === root) {
      // The root (window/application) containing the point is vacuous — it
      // means no actual CONTROL's bounds contain it. Rect-only is more honest
      // than handing back the whole window as "the element".
      return {
        element: null,
        reason: "no element bounds in the page source contain the match point",
      };
    }
    const xpath = xpathForNode(root, node);
    const element = await driver.$(xpath);
    if (!element) {
      return { element: null, reason: `re-find by ${xpath} returned nothing` };
    }
    if (element.elementId) return { element };
    // wdio's lazy handle: confirm it resolves before handing it out.
    try {
      await element.waitForExist({ timeout: 2000 });
      return { element };
    } catch {
      return { element: null, reason: `re-find by ${xpath} missed` };
    }
  } catch (error: any) {
    return { element: null, reason: error?.message ?? String(error) };
  }
}
