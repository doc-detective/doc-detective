// Resolving annotation targets to rects in the captured image.
//
// The only thing that differs between a browser viewport, a desktop app
// window, and a mobile device screen is where the rect comes from and what it
// sits relative to — so this collapses to one formula rather than three
// renderers:
//
//   Surface      | Rect source                       | Origin subtracted        | Logical width
//   -------------|-----------------------------------|--------------------------|------------------------
//   Browser      | getBoundingClientRect()           | none (viewport-relative) | window.innerWidth
//   Windows app  | getElementRect() (window-relative)| none (session is rooted  | appWindowRect().w
//                |                                   | at the window)           |
//   macOS app    | getElementRect() (screen coords)  | window origin            | appWindowRect().w
//   Mobile       | getElementRect() (device coords)  | none (in-device capture) | driver.getWindowRect().width
//
// The two desktop platforms genuinely differ; see appWindowOrigin for the
// evidence rather than trusting the intuition that "app drivers report screen
// coordinates" (true of getWindowRect, false of child elements on Windows).
//
// Scale is always capturedImageWidth / logicalWidth, derived from the capture
// itself rather than queried. That means Retina and Windows display scaling
// fall out for free, and it subsumes the devicePixelRatio read the crop path
// does by hand.
//
// Mobile note (not wired up yet, but the reason the table above is safe):
// mobile records and captures IN-DEVICE — resolveRecordPlan picks the `device`
// engine (startRecordingScreen -> adb screenrecord / simctl) and
// appWindowScreenshot falls through to driver.saveScreenshot(), the device
// framebuffer. The emulator's position on the host desktop therefore never
// enters the math. Careful: appWindowRect() deliberately returns null on
// mobile, so a mobile provider must read driver.getWindowRect() directly.

import { findElement } from "../tests/findElement.js";
import { findElementByCriteria } from "../tests/findStrategies.js";
import { anchorPoint } from "./svg.js";
import type { ResolvedAnnotation } from "./model.js";
import type { PlacedAnnotation, Rect } from "./svg.js";

export {
  computeScale,
  toCanvasRect,
  positionTargetRect,
  appCriteriaError,
  allTargetError,
  appWindowOrigin,
  resolveAnnotationRects,
  APP_UNSUPPORTED_CRITERIA,
  APP_SUPPORTED_CRITERIA,
};

type Point = { x: number; y: number };

// Criteria with no native-locator equivalent. appSurface.ts maps the semantic
// fields onto UIA / AX / UiAutomator2 / XCUITest locators, but a CSS selector,
// a DOM class list, and arbitrary DOM attributes have nothing to map to.
//
// Keep this aligned with buildAppLocator in appSurface.ts, which is the real
// gate: it rejects elementClass and elementAttribute outright, and rejects a
// CSS-shaped `selector`. Listing a field here that buildAppLocator accepts
// (or vice versa) doesn't change what resolves — it just means the author gets
// a vaguer error later instead of a precise one here.
const APP_UNSUPPORTED_CRITERIA = [
  "selector",
  "elementClass",
  "elementAttribute",
];
const APP_SUPPORTED_CRITERIA = [
  "elementText",
  "elementId",
  "elementTestId",
  "elementAria",
];

// Derive the capture's pixel scale. A driver that reports a junk logical width
// must not turn every rect into NaN/Infinity, so anything non-positive or
// non-finite falls back to 1:1 — annotations land slightly off rather than the
// step exploding.
function computeScale(imageWidth: number, logicalWidth: unknown): number {
  if (
    typeof logicalWidth !== "number" ||
    !Number.isFinite(logicalWidth) ||
    logicalWidth <= 0
  ) {
    return 1;
  }
  return imageWidth / logicalWidth;
}

// Logical rect (relative to the capture origin) -> image pixels in the final
// canvas. `cropOrigin` is where the crop starts in image pixels; without a
// crop it's the image origin.
function toCanvasRect(
  logical: Rect,
  scale: number,
  cropOrigin: Point = { x: 0, y: 0 }
): Rect {
  return {
    x: logical.x * scale - cropOrigin.x,
    y: logical.y * scale - cropOrigin.y,
    width: logical.width * scale,
    height: logical.height * scale,
  };
}

// A position target resolves against the FINAL canvas, not the page: "put the
// banner in the top-right of this screenshot" should mean the same thing
// whether or not the shot was cropped. Named regions are therefore already in
// image pixels; an absolute point is authored in the capture's logical units,
// so it scales (an author shouldn't have to know the pixel ratio).
function positionTargetRect(
  position: any,
  canvas: { width: number; height: number },
  scale: number
): Rect {
  if (typeof position === "string") {
    // Resolve the region against the canvas by reusing the renderer's own
    // anchor math — a second copy of the nine-region map would be free to
    // drift from the one the shapes are actually drawn against.
    const point = anchorPoint(
      { x: 0, y: 0, width: canvas.width, height: canvas.height },
      position
    );
    return { x: point.x, y: point.y, width: 0, height: 0 };
  }
  return {
    x: (position?.x ?? 0) * scale,
    y: (position?.y ?? 0) * scale,
    width: 0,
    height: 0,
  };
}

/**
 * The origin to rebase native element rects onto, given the captured window.
 *
 * The two desktop platforms differ, and the difference is empirical rather
 * than something to reason out from first principles:
 *
 * - **Windows**: the driver session is ROOTED at the app window (that's why
 *   `appWindowScreenshot` can just call `driver.saveScreenshot()` and get
 *   exactly that window), and `getElementRect` reports window-relative
 *   coordinates to match. The capture and the rects already share an origin,
 *   so rebasing would shift every annotation up-left by the window's desktop
 *   position — verified against Character Map, where subtracting a (25, 115)
 *   window origin moved annotations off their targets by exactly (25, 115).
 * - **macOS**: Mac2 reports SCREEN coordinates — `appWindowRect` reads the
 *   window ELEMENT's rect and hands it to ffmpeg as a display crop, which
 *   only works in screen space. The capture is an element screenshot of the
 *   window, so child rects must be rebased onto the window's origin.
 *
 * Anything else (including mobile, which captures in-device and therefore
 * shares the device origin) needs no rebasing.
 */
function appWindowOrigin(
  platform: string | undefined,
  windowRect: { x: number; y: number } | null | undefined
): Point {
  if (platform === "mac" && windowRect) {
    return { x: windowRect.x, y: windowRect.y };
  }
  return { x: 0, y: 0 };
}

// Why this target can't be resolved on a native app surface, or null if it can.
function appCriteriaError(target: any): string | null {
  const supported = `Supported on app surfaces: ${APP_SUPPORTED_CRITERIA.join(", ")}.`;
  if (typeof target === "string") {
    return `An annotation target on an app surface can't be a bare string ("${target}"): a string is a selector or display text, and app surfaces have no CSS selectors. Name the field explicitly instead (for example, { "elementText": "${target}" }). ${supported}`;
  }
  const offending = APP_UNSUPPORTED_CRITERIA.filter(
    (field) => target?.[field] !== undefined
  );
  if (offending.length > 0) {
    return `${offending.join(" and ")} ${offending.length > 1 ? "aren't" : "isn't"} supported on app surfaces — there's no native equivalent to match against. ${supported}`;
  }
  return null;
}

// Why this target can't be used with `all`, or null if it can. `all` exists so
// a blur redacts every match; matching the wrong element there is a
// disclosure, not a cosmetic bug, so the ambiguity of a selector-or-text
// string isn't acceptable.
//
// `isAppCapture` matters for the same reason: the app find path resolves a
// SINGLE element (findAppElement compiles one native locator and calls
// driver.$), so honoring `all` there would mean annotating the first match and
// silently ignoring the rest — a screenshot that looks fully redacted but
// isn't. Refuse instead of under-redacting; multi-match native finds can lift
// this later.
function allTargetError(
  target: any,
  all: boolean,
  isAppCapture = false
): string | null {
  if (!all) return null;
  if (isAppCapture) {
    return `"all": true isn't supported on app surfaces yet — the app element lookup resolves a single match, so this would annotate only the first one and silently leave the rest. Annotate each element with its own annotation, or capture a browser surface.`;
  }
  if (typeof target === "string") {
    return `"all": true needs an explicit target object, not the string "${target}" (a string could be a selector or display text). For example: { "selector": "${target}" }.`;
  }
  return null;
}

// Turn an annotation target into the criteria object findElement expects.
// A string target passes straight through as find's selector-or-text shorthand.
function criteriaFromTarget(target: any): any {
  if (typeof target === "string") return target;
  return {
    selector: target?.selector,
    elementText: target?.elementText,
    elementId: target?.elementId,
    elementTestId: target?.elementTestId,
    elementClass: target?.elementClass,
    elementAttribute: target?.elementAttribute,
    elementAria: target?.elementAria,
  };
}

// Read a browser element's viewport-relative rect. Mirrors the crop path's
// read so annotations and crops agree on where an element is, down to the
// same post-scroll coordinate space.
async function browserElementRect(driver: any, element: any): Promise<Rect> {
  return await driver.execute((el: any) => {
    const bounds = el.getBoundingClientRect();
    return {
      x: bounds.left,
      y: bounds.top,
      width: bounds.width,
      height: bounds.height,
    };
  }, element);
}

// Read a native element's rect and rebase it onto the captured window.
//
// Whether any rebasing is needed is platform-specific and NOT the blanket "app
// drivers report screen coordinates" it looks like: on Windows the session is
// rooted at the app window, so rects are already window-relative and
// `windowOrigin` is (0, 0) here. appWindowOrigin owns that decision and
// carries the evidence.
async function appElementRect(
  driver: any,
  element: any,
  windowOrigin: Point
): Promise<Rect> {
  const rect = await driver.getElementRect(element.elementId);
  return {
    x: (rect?.x ?? 0) - windowOrigin.x,
    y: (rect?.y ?? 0) - windowOrigin.y,
    width: rect?.width ?? 0,
    height: rect?.height ?? 0,
  };
}

/**
 * Resolve every annotation's target into a rect in the final image.
 *
 * Returns the placed annotations plus a list of human-readable failures. A
 * target that can't be found is reported rather than skipped: an annotation
 * that silently vanishes is a documentation bug, and for `blur` it's a
 * disclosure.
 */
async function resolveAnnotationRects({
  config,
  annotations,
  driver,
  surface,
  appSession,
  isAppCapture,
  appDriver,
  windowOrigin,
  canvas,
  scale,
  cropOrigin,
}: {
  config: any;
  annotations: ResolvedAnnotation[];
  driver: any;
  surface?: any;
  // Required for app captures: findElement resolves the surface reference
  // against the session's open surfaces, so without it an app-targeted find
  // falls through to the browser path and never matches.
  appSession?: any;
  isAppCapture?: boolean;
  appDriver?: any;
  windowOrigin?: Point;
  canvas: { width: number; height: number };
  scale: number;
  cropOrigin?: Point;
}): Promise<{ placed: PlacedAnnotation[]; errors: string[] }> {
  const placed: PlacedAnnotation[] = [];
  const errors: string[] = [];

  for (const annotation of annotations) {
    const { target, all } = annotation;

    // Position targets need no driver at all, so they work identically on
    // every surface — including app captures, where they're the fallback when
    // criteria don't map natively.
    if (target && typeof target === "object" && target.position !== undefined) {
      placed.push({
        ...annotation,
        rect: positionTargetRect(target.position, canvas, scale),
      });
      continue;
    }

    const allError = allTargetError(target, all, isAppCapture);
    if (allError) {
      errors.push(allError);
      continue;
    }

    if (isAppCapture) {
      const criteriaError = appCriteriaError(target);
      if (criteriaError) {
        errors.push(criteriaError);
        continue;
      }
      // App element finding rides the same locator mapping `find` uses, by
      // handing findElement a surface-carrying payload.
      const findResult = await findElement({
        config,
        step: { find: { ...criteriaFromTarget(target), surface } },
        driver,
        appSession,
      });
      const element = findResult.outputs?.rawElement;
      if (findResult.status === "FAIL" || !element) {
        errors.push(
          `Couldn't find the element to annotate: ${JSON.stringify(target)}.`
        );
        continue;
      }
      const logical = await appElementRect(
        appDriver ?? driver,
        element,
        windowOrigin ?? { x: 0, y: 0 }
      );
      placed.push({
        ...annotation,
        rect: toCanvasRect(logical, scale, cropOrigin),
      });
      continue;
    }

    // Browser surfaces.
    let elements: any[] = [];
    if (all) {
      const found = await findElementByCriteria({
        ...criteriaFromTarget(target),
        driver,
        all: true,
      });
      if (found.error || !found.elements?.length) {
        errors.push(
          `Couldn't find any element to annotate: ${JSON.stringify(target)}.`
        );
        continue;
      }
      elements = found.elements;
    } else {
      const findResult = await findElement({
        config,
        step: { find: criteriaFromTarget(target) },
        driver,
      });
      const element = findResult.outputs?.rawElement;
      if (findResult.status === "FAIL" || !element) {
        errors.push(
          `Couldn't find the element to annotate: ${
            typeof target === "string" ? target : JSON.stringify(target)
          }.`
        );
        continue;
      }
      elements = [element];
    }

    for (const element of elements) {
      const logical = await browserElementRect(driver, element);
      placed.push({
        ...annotation,
        rect: toCanvasRect(logical, scale, cropOrigin),
        // The live overlay needs the handle to tag the element for its
        // tracking loop. Carrying it here beats re-finding the element by
        // matching rects, which would scan the document and could tag the
        // wrong node when two elements share a box. The buffer adapter
        // ignores it, and runStep never sees these objects.
        element,
      });
    }
  }

  return { placed, errors };
}
