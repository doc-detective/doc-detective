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
} from "./imageMatch.js";

export { findByImage, isVisualMatch, visualRect, visualCenter };

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
    // do/while so `timeout: 0` means "check once, now".
    do {
      const regions = scope ? await scope() : null;
      if (regions && regions.length === 0) {
        miss = `Couldn't find ${reference.label}: no element meets the other criteria.`;
      } else {
        const capture = await captureSurface(driver);
        const viewport = await driver.execute(() => ({ width: window.innerWidth }));
        // A PNG stores its width at a fixed offset, which beats a decode.
        const scale = viewport?.width > 0 ? capture.readUInt32BE(16) / viewport.width : 1;
        const { match, matches, best } = await matchImageOnce({ capture, reference, scale, regions, cacheDir });
        if (match) {
          const element = createVisualMatch(driver, match);
          const elements = all ? matches.map((m) => (m === match ? element : createVisualMatch(driver, m))) : [element];
          return { element, elements, error: null };
        }
        miss = missMessage(reference, best, scale);
      }
      if (Date.now() - startTime >= timeout) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    } while (Date.now() - startTime < timeout);
    return failed(miss);
  } catch (error: any) {
    // A bad reference won't get better by waiting.
    if (error instanceof ImageReferenceError) return failed(error.message);
    throw error;
  }
}
