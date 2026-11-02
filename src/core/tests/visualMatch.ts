// A match on screen standing in for an element (ADR 01146). It has the methods the
// callers of findElementByCriteria use, so find, click, moveTo, and type work
// without a branch per caller. Paths that hand an element to `driver.execute`
// check `isVisualMatch` first, because there's no DOM node behind it.

import { isRecordingActive } from "./ffmpegRecorder.js";
import {
  ImageReferenceError,
  loadImageReference,
  matchImageOnce,
  missMessage,
  referenceLabel,
} from "./imageMatch.js";

export { findByImage, isVisualMatch, visualRect, visualCenter, viewportCenter };

type Rect = { x: number; y: number; width: number; height: number };

const BUTTONS: Record<string, number> = { left: 0, middle: 1, right: 2 };

function isVisualMatch(element: any): boolean {
  return element?.isVisualMatch === true;
}

function visualRect(element: any): Rect {
  return element.rect;
}

function visualCenter(element: any): { x: number; y: number } {
  const { x, y, width, height } = element.rect;
  return { x: Math.round(x + width / 2), y: Math.round(y + height / 2) };
}

// Where a pointer goes for either kind of element. A DOM element's getLocation is
// relative to the document, and pointer actions are relative to the viewport.
async function viewportCenter(driver: any, element: any): Promise<{ x: number; y: number }> {
  if (isVisualMatch(element)) return visualCenter(element);
  return driver.execute((el: any) => {
    const bounds = el.getBoundingClientRect();
    return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
  }, element);
}

function createVisualMatch(driver: any, match: Rect & { score: number }) {
  const rect = { x: match.x, y: match.y, width: match.width, height: match.height };
  const nothing = async () => null;
  const element: any = {
    isVisualMatch: true,
    // Callers treat a missing elementId as "not found".
    elementId: "visual-match",
    matchScore: match.score,
    rect,
    getLocation: async () => ({ x: rect.x, y: rect.y }),
    getSize: async () => ({ width: rect.width, height: rect.height }),
    getText: nothing,
    getHTML: nothing,
    getTagName: nothing,
    getValue: nothing,
    isClickable: nothing,
    isEnabled: nothing,
    isSelected: nothing,
    isDisplayed: nothing,
    isExisting: async () => true,
    click: async (options: { button?: string | number } = {}) => {
      const button = typeof options.button === "number" ? options.button : BUTTONS[options.button ?? "left"] ?? 0;
      await driver
        .action("pointer", { parameters: { pointerType: "mouse" } })
        .move(visualCenter(element))
        .down({ button })
        .up({ button })
        .perform();
    },
  };
  return element;
}

// The synthetic cursor mustn't be baked into a capture: it can sit right on the
// icon after a click.
async function captureSurface(driver: any): Promise<Buffer> {
  const recording = isRecordingActive(driver);
  const setCursor = (display: string) =>
    driver.execute((value: string) => {
      const pointer = document.querySelector("dd-mouse-pointer") as any;
      if (pointer) pointer.style.display = value;
    }, display);
  if (recording) await setCursor("none");
  try {
    return Buffer.from(await driver.takeScreenshot(), "base64");
  } finally {
    if (recording) await setCursor("block").catch(() => {});
  }
}

// Looks until a match appears or `timeout` runs out. `scope`, when other criteria
// came with the image, returns the viewport rects a match has to lie inside.
async function findByImage({
  elementImage,
  driver,
  timeout = 5000,
  all = false,
  scope,
  cacheDir,
}: {
  elementImage: any;
  driver: any;
  timeout?: number;
  all?: boolean;
  scope?: () => Promise<Rect[]>;
  cacheDir?: string;
}): Promise<{ element: any; elements: any[]; error: string | null }> {
  const failed = (error: string) => ({ element: null, elements: [], error });
  if (driver.isMobile === true) {
    return failed("`elementImage` isn't supported on mobile browsers yet. Use a desktop browser, or other element criteria.");
  }

  try {
    const reference = await loadImageReference(elementImage, { cacheDir });
    const startTime = Date.now();
    let miss = `Couldn't find ${reference.label}.`;
    let missed: { capture: Buffer; regions: string } | null = null;
    let lookedAt: number;
    // A look can take seconds, so the last one starts at or after the timeout. That
    // way a target that's there by then is seen. `timeout: 0` looks once.
    do {
      lookedAt = Date.now();
      const regions = scope ? await scope() : null;
      if (regions && regions.length === 0) {
        miss = `Couldn't find ${reference.label}: no element meets the other criteria.`;
      } else {
        const capture = await captureSurface(driver);
        const scoped = JSON.stringify(regions);
        // Nothing changed, so the answer can't have.
        if (!missed || missed.regions !== scoped || !missed.capture.equals(capture)) {
          const viewport = await driver.execute(() => ({ width: window.innerWidth }));
          // A PNG stores its width at a fixed offset, which beats a decode.
          const scale = viewport?.width > 0 ? capture.readUInt32BE(16) / viewport.width : 1;
          const { match, matches, best } = await matchImageOnce({ capture, reference, scale, regions, all, cacheDir });
          if (match) {
            const element = createVisualMatch(driver, match);
            const elements = all ? matches.map((m) => (m === match ? element : createVisualMatch(driver, m))) : [element];
            return { element, elements, error: null };
          }
          miss = missMessage(reference, best, scale);
          missed = { capture, regions: scoped };
        }
      }
      const left = timeout - (Date.now() - startTime);
      if (left > 0) await new Promise((resolve) => setTimeout(resolve, Math.min(100, left)));
    } while (lookedAt - startTime < timeout);
    return failed(miss);
  } catch (error: any) {
    // A bad reference won't get better by waiting.
    if (error instanceof ImageReferenceError) return failed(error.message);
    // Anything else, such as a matcher that won't install, fails this step. A throw
    // would crash the context and lose the report of every step in it.
    return failed(`Couldn't match ${referenceLabel(elementImage)}: ${error?.message ?? error}`);
  }
}
