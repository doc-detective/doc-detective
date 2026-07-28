/* eslint-disable */
/**
 * Auto-generated from screenshot_v3.schema.json
 * Do not edit manually
 */

/**
 * Takes a screenshot in PNG format.
 */
export type Screenshot = ScreenshotSimple | CaptureScreenshotDetailed | CaptureScreenshot;
/**
 * File path of the PNG file. Accepts absolute paths. If not specified, the file name is the ID of the step. If an `http(s)` URL is supplied, the remote image is downloaded and used as a read-only reference for comparison; the new capture is written to a local run-specific folder instead of being uploaded back to the URL.
 */
export type ScreenshotSimple = string;
export type CaptureScreenshotDetailed = CaptureScreenshotFields & AppCapturesDonTSupportCropYet;
/**
 * Browser engine keyword. Targets that browser. Steps that can only ever act on a browser (not a background process) restrict the bare-string form to this enum, so a process name here is rejected at validation time instead of failing at runtime.
 */
export type SurfaceByBrowserEngine = "chrome" | "firefox" | "safari" | "webkit" | "edge";
/**
 * Which window to act on. Omit to use the active window.
 */
export type WindowTabSelector = ByIndex | ByName | ByCriteria;
/**
 * Index in creation order. Negative counts from the end; `-1` is the newest.
 */
export type ByIndex = number;
/**
 * Name assigned when the window/tab was opened (goTo `newTab`/`newWindow`). The integer branch is listed first because Ajv validates with coerceTypes — string-first would coerce integer indexes into name strings.
 */
export type ByName = string;
/**
 * Which tab to act on. Omit to use the active tab. Without `window`, the selector searches every tab in creation order — including tabs the page opened itself.
 */
export type WindowTabSelector1 = ByIndex1 | ByName1 | ByCriteria1;
/**
 * Index in creation order. Negative counts from the end; `-1` is the newest.
 */
export type ByIndex1 = number;
/**
 * Name assigned when the window/tab was opened (goTo `newTab`/`newWindow`). The integer branch is listed first because Ajv validates with coerceTypes — string-first would coerce integer indexes into name strings.
 */
export type ByName1 = string;
/**
 * Which app window to act on. Omit to use the active window. Apps have windows, no tabs.
 */
export type AppWindowSelector = ByIndex2 | ByName2 | ByCriteria2;
/**
 * Index in creation order. Negative counts from the end; `-1` is the newest (e.g. a dialog the app just opened).
 */
export type ByIndex2 = number;
/**
 * Assigned window name. The integer branch is listed first because Ajv validates with coerceTypes — string-first would coerce integer indexes into name strings.
 */
export type ByName2 = string;
/**
 * File path of the PNG file. Accepts absolute paths. If not specified, the file name is the ID of the step. If an `http(s)` URL is supplied, the remote image is downloaded and used as a read-only reference for comparison; the new capture is written to a local run-specific folder instead of being uploaded back to the URL.
 */
export type ScreenshotSimple1 = string;
/**
 * Display text or selector of the element to screenshot.
 */
export type CropByElementSimple = string;
/**
 * Crop the screenshot to a specific element.
 */
export type CropByElementDetailed = {
  [k: string]: unknown;
};
/**
 * A visual annotation drawn onto a screenshot or recording. Each annotation names exactly one type (`outline`, `arrow`, `badge`, `callout`, `blur`, or `text`), and the type's value is the target it points at: an element (a selector/display-text string or a detailed find object) or a fixed `position` in the capture. `id`, `track`, `transition`, and `duration` describe behavior over time — they apply to recordings and are inert in still screenshots, so the same annotation means the same thing in both.
 */
export type Annotation = AnnotationFields & ExactlyOneAnnotationType;
/**
 * Display text or selector of the element to annotate.
 */
export type TargetByElementSimple = string;
/**
 * Element to annotate. Mirrors the element-finding fields used elsewhere. On app surfaces only the natively-mappable fields are supported (`elementText`, `elementId`, `elementTestId`, `elementAria`); `selector`, `elementClass`, and `elementAttribute` have no native equivalent.
 */
export type TargetByElementDetailed = ElementFindingFields & AtLeastOneElementFindingField;
/**
 * Locate the element visually by template image. Doc Detective screenshots the surface and finds the region matching the template via OpenCV template matching, auto-scaling the template across display scales (Retina, Windows scaling). Combine with other element criteria to disambiguate identical-looking targets; on browser surfaces the matched region resolves to the real element under its center.
 */
export type Image = ImageSimple | ImageDetailed;
/**
 * Template image: a PNG/JPEG file path (resolved relative to the spec like other paths) or an inline data URI (data:image/png;base64,…).
 */
export type ImageSimple = string;
export type RegionElementCriteria = {
  [k: string]: unknown;
};
export type AtLeastOneElementFindingField = {
  [k: string]: unknown;
};
/**
 * A named spot, relative to the target element when the annotation has one, or to the capture when it doesn't.
 */
export type NamedRegion =
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "center"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";
/**
 * Display text or selector of the element to annotate.
 */
export type TargetByElementSimple1 = string;
/**
 * Element to annotate. Mirrors the element-finding fields used elsewhere. On app surfaces only the natively-mappable fields are supported (`elementText`, `elementId`, `elementTestId`, `elementAria`); `selector`, `elementClass`, and `elementAttribute` have no native equivalent.
 */
export type TargetByElementDetailed1 = ElementFindingFields1 & AtLeastOneElementFindingField1;
/**
 * Locate the element visually by template image. Doc Detective screenshots the surface and finds the region matching the template via OpenCV template matching, auto-scaling the template across display scales (Retina, Windows scaling). Combine with other element criteria to disambiguate identical-looking targets; on browser surfaces the matched region resolves to the real element under its center.
 */
export type Image1 = ImageSimple1 | ImageDetailed1;
/**
 * Template image: a PNG/JPEG file path (resolved relative to the spec like other paths) or an inline data URI (data:image/png;base64,…).
 */
export type ImageSimple1 = string;
export type RegionElementCriteria1 = {
  [k: string]: unknown;
};
export type AtLeastOneElementFindingField1 = {
  [k: string]: unknown;
};
/**
 * A named spot, relative to the target element when the annotation has one, or to the capture when it doesn't.
 */
export type NamedRegion1 =
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "center"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";
/**
 * Display text or selector of the element to annotate.
 */
export type TargetByElementSimple2 = string;
/**
 * Element to annotate. Mirrors the element-finding fields used elsewhere. On app surfaces only the natively-mappable fields are supported (`elementText`, `elementId`, `elementTestId`, `elementAria`); `selector`, `elementClass`, and `elementAttribute` have no native equivalent.
 */
export type TargetByElementDetailed2 = ElementFindingFields2 & AtLeastOneElementFindingField2;
/**
 * Locate the element visually by template image. Doc Detective screenshots the surface and finds the region matching the template via OpenCV template matching, auto-scaling the template across display scales (Retina, Windows scaling). Combine with other element criteria to disambiguate identical-looking targets; on browser surfaces the matched region resolves to the real element under its center.
 */
export type Image2 = ImageSimple2 | ImageDetailed2;
/**
 * Template image: a PNG/JPEG file path (resolved relative to the spec like other paths) or an inline data URI (data:image/png;base64,…).
 */
export type ImageSimple2 = string;
export type RegionElementCriteria2 = {
  [k: string]: unknown;
};
export type AtLeastOneElementFindingField2 = {
  [k: string]: unknown;
};
/**
 * A named spot, relative to the target element when the annotation has one, or to the capture when it doesn't.
 */
export type NamedRegion2 =
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "center"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";
/**
 * Display text or selector of the element to annotate.
 */
export type TargetByElementSimple3 = string;
/**
 * Element to annotate. Mirrors the element-finding fields used elsewhere. On app surfaces only the natively-mappable fields are supported (`elementText`, `elementId`, `elementTestId`, `elementAria`); `selector`, `elementClass`, and `elementAttribute` have no native equivalent.
 */
export type TargetByElementDetailed3 = ElementFindingFields3 & AtLeastOneElementFindingField3;
/**
 * Locate the element visually by template image. Doc Detective screenshots the surface and finds the region matching the template via OpenCV template matching, auto-scaling the template across display scales (Retina, Windows scaling). Combine with other element criteria to disambiguate identical-looking targets; on browser surfaces the matched region resolves to the real element under its center.
 */
export type Image3 = ImageSimple3 | ImageDetailed3;
/**
 * Template image: a PNG/JPEG file path (resolved relative to the spec like other paths) or an inline data URI (data:image/png;base64,…).
 */
export type ImageSimple3 = string;
export type RegionElementCriteria3 = {
  [k: string]: unknown;
};
export type AtLeastOneElementFindingField3 = {
  [k: string]: unknown;
};
/**
 * A named spot, relative to the target element when the annotation has one, or to the capture when it doesn't.
 */
export type NamedRegion3 =
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "center"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";
/**
 * Display text or selector of the element to annotate.
 */
export type TargetByElementSimple4 = string;
/**
 * Element to annotate. Mirrors the element-finding fields used elsewhere. On app surfaces only the natively-mappable fields are supported (`elementText`, `elementId`, `elementTestId`, `elementAria`); `selector`, `elementClass`, and `elementAttribute` have no native equivalent.
 */
export type TargetByElementDetailed4 = ElementFindingFields4 & AtLeastOneElementFindingField4;
/**
 * Locate the element visually by template image. Doc Detective screenshots the surface and finds the region matching the template via OpenCV template matching, auto-scaling the template across display scales (Retina, Windows scaling). Combine with other element criteria to disambiguate identical-looking targets; on browser surfaces the matched region resolves to the real element under its center.
 */
export type Image4 = ImageSimple4 | ImageDetailed4;
/**
 * Template image: a PNG/JPEG file path (resolved relative to the spec like other paths) or an inline data URI (data:image/png;base64,…).
 */
export type ImageSimple4 = string;
export type RegionElementCriteria4 = {
  [k: string]: unknown;
};
export type AtLeastOneElementFindingField4 = {
  [k: string]: unknown;
};
/**
 * A named spot, relative to the target element when the annotation has one, or to the capture when it doesn't.
 */
export type NamedRegion4 =
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "center"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";
/**
 * Display text or selector of the element to annotate.
 */
export type TargetByElementSimple5 = string;
/**
 * Element to annotate. Mirrors the element-finding fields used elsewhere. On app surfaces only the natively-mappable fields are supported (`elementText`, `elementId`, `elementTestId`, `elementAria`); `selector`, `elementClass`, and `elementAttribute` have no native equivalent.
 */
export type TargetByElementDetailed5 = ElementFindingFields5 & AtLeastOneElementFindingField5;
/**
 * Locate the element visually by template image. Doc Detective screenshots the surface and finds the region matching the template via OpenCV template matching, auto-scaling the template across display scales (Retina, Windows scaling). Combine with other element criteria to disambiguate identical-looking targets; on browser surfaces the matched region resolves to the real element under its center.
 */
export type Image5 = ImageSimple5 | ImageDetailed5;
/**
 * Template image: a PNG/JPEG file path (resolved relative to the spec like other paths) or an inline data URI (data:image/png;base64,…).
 */
export type ImageSimple5 = string;
export type RegionElementCriteria5 = {
  [k: string]: unknown;
};
export type AtLeastOneElementFindingField5 = {
  [k: string]: unknown;
};
/**
 * A named spot, relative to the target element when the annotation has one, or to the capture when it doesn't.
 */
export type NamedRegion5 =
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "center"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";
/**
 * A named spot, relative to the target element when the annotation has one, or to the capture when it doesn't.
 */
export type NamedRegion6 =
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "center"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";
export type ExactlyOneAnnotationType = {
  [k: string]: unknown;
};
/**
 * If `true`, captures a screenshot. If `false`, doesn't capture a screenshot.
 */
export type CaptureScreenshot = boolean;

export interface CaptureScreenshotFields {
  /**
   * The browser window/tab or app window to capture. Omit to capture the active surface — the most recently opened, focused, or explicitly targeted surface, whatever its kind (a background process can't be captured). Specifying a surface switches the active surface for the steps that follow. App surfaces use the object form ({ "app": … }). App captures don't support `crop` yet.
   */
  surface?: SurfaceByBrowserEngine | BrowserSurface | AppSurface;
  path?: ScreenshotSimple1;
  /**
   * Directory of the PNG file. If the directory doesn't exist, creates the directory.
   */
  directory?: string;
  /**
   * Allowed variation in percentage of pixels between the new screenshot and the existing screenshot at `path`. If the difference between the new screenshot and the existing screenshot is greater than `maxVariation`, the step fails. If a screenshot doesn't exist at `path`, this value is ignored.
   */
  maxVariation?: number;
  /**
   * If `true`, overwrites the existing screenshot at `path` if it exists.
   * If `aboveVariation`, overwrites the existing screenshot at `path` if the difference between the new screenshot and the existing screenshot is greater than `maxVariation`.
   */
  overwrite?: "true" | "false" | "aboveVariation";
  crop?: CropByElementSimple | CropByElementDetailed;
  /**
   * Visual annotations to draw onto the screenshot. Annotations are composited into the image and never touch the page, so they can't disturb the page under test or appear in a recording that's running at the same time. Each annotation is resolved against the capture after any `crop`. To keep annotations on screen across steps and in recordings, use an `annotate` step instead.
   */
  annotations?: Annotation[];
  sourceIntegration?: SourceIntegration;
}
export interface BrowserSurface {
  /**
   * Browser engine. Selects the browser surface with that engine (or the one named by `name`). A goTo step opens the browser if it isn't open yet — you can also open one explicitly with `startSurface`; other steps require it to already be open.
   */
  browser: "chrome" | "firefox" | "safari" | "webkit" | "edge";
  /**
   * Name of the browser surface. Defaults to the engine name (the context's default browser registers under its engine). Assign distinct names to drive multiple browsers at once, including several of the same engine.
   */
  name?: string;
  window?: WindowTabSelector;
  tab?: WindowTabSelector1;
}
export interface ByCriteria {
  /**
   * Name assigned when the window/tab was opened.
   */
  name?: string;
  /**
   * Index in creation order. Negative counts from the end.
   */
  index?: number;
  /**
   * Page title to match. Substring, or /regex/.
   */
  title?: string;
  /**
   * Page URL to match. Substring, or /regex/.
   */
  url?: string;
}
export interface ByCriteria1 {
  /**
   * Name assigned when the window/tab was opened.
   */
  name?: string;
  /**
   * Index in creation order. Negative counts from the end.
   */
  index?: number;
  /**
   * Page title to match. Substring, or /regex/.
   */
  title?: string;
  /**
   * Page URL to match. Substring, or /regex/.
   */
  url?: string;
}
export interface AppSurface {
  /**
   * Name of an app surface opened by `startSurface` (its `name`, or the default derived from the app identifier).
   */
  app: string;
  window?: AppWindowSelector;
}
export interface ByCriteria2 {
  /**
   * Assigned window name.
   */
  name?: string;
  /**
   * Index in creation order. Negative counts from the end.
   */
  index?: number;
  /**
   * Window title to match. Substring, or /regex/.
   */
  title?: string;
}
export interface AnnotationFields {
  /**
   * Draw a box around the target.
   */
  outline?: TargetByElementSimple | TargetByElementDetailed | TargetByPosition;
  /**
   * Point an arrow at the target.
   */
  arrow?: TargetByElementSimple1 | TargetByElementDetailed1 | TargetByPosition1;
  /**
   * Mark the target with a small numbered or lettered marker. Set the marker's characters with `label`.
   */
  badge?: TargetByElementSimple2 | TargetByElementDetailed2 | TargetByPosition2;
  /**
   * Label the target with a text box and a leader line. Set the text with `label`.
   */
  callout?: TargetByElementSimple3 | TargetByElementDetailed3 | TargetByPosition3;
  /**
   * Obscure the target to redact sensitive information. Pair with `all` to redact every match rather than the first.
   */
  blur?: TargetByElementSimple4 | TargetByElementDetailed4 | TargetByPosition4;
  /**
   * Place a standalone text box. Set the text with `label`.
   */
  text?: TargetByElementSimple5 | TargetByElementDetailed5 | TargetByPosition5;
  /**
   * Text to display. Required by `badge`, `callout`, and `text`; ignored by the other types.
   */
  label?: string;
  /**
   * Handle for this annotation, so a later `annotate` step can update or clear it. Only meaningful for annotations added by an `annotate` step; ignored on screenshot annotations, which live only for the capture.
   */
  id?: string;
  style?: AnnotationStyle;
  /**
   * Where to place the annotation relative to its target. Accepts a named region, an absolute point, or an offset that nudges the default placement.
   */
  position?: NamedRegion6 | AnnotationPoint6 | AnnotationOffset;
  /**
   * If `true`, the annotation follows its element as the page scrolls or reflows. Applies to recordings; inert in still screenshots, which capture a single moment.
   */
  track?: boolean;
  transition?: AnnotationTransition;
  /**
   * Milliseconds to display the annotation before it clears itself. Omit to display it until an `annotate` step clears it. Applies to recordings; inert in still screenshots.
   */
  duration?: number;
  /**
   * If `true`, annotates every element matching the target instead of only the first. Most useful with `blur`, where redacting only the first match can leave sensitive content visible.
   */
  all?: boolean;
}
export interface ElementFindingFields {
  /**
   * Selector of the element to annotate. Browser surfaces only.
   */
  selector?: string;
  /**
   * Display text of the element to annotate. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementText?: string;
  /**
   * ID attribute of the element to annotate. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementId?: string;
  /**
   * data-testid attribute of the element to annotate. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementTestId?: string;
  /**
   * Class or array of classes that the element must have. Each class supports exact match or regex pattern using /pattern/ syntax. Element must have all specified classes. Browser surfaces only.
   */
  elementClass?: string | string[];
  /**
   * Object of attribute key-value pairs that the element must have. Values can be strings (supporting /pattern/ regex), numbers, or booleans. Boolean true matches attribute presence, false matches absence.
   */
  elementAttribute?: {
    [k: string]: number | boolean | string;
  };
  /**
   * Computed accessible name of the element per ARIA specification. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementAria?: string;
  image?: Image;
  /**
   * Max duration in milliseconds to wait for the element to exist.
   */
  timeout?: number;
}
export interface ImageDetailed {
  /**
   * Template image: a PNG/JPEG file path (resolved relative to the spec like other paths) or an inline data URI (data:image/png;base64,…).
   */
  path: string;
  /**
   * Minimum normalized match score (0–1) to accept a match. Higher is stricter: 1 demands a near pixel-perfect match, lower values tolerate more rendering variation but risk matching lookalikes. Defaults to the config-level `imageMatching.matchThreshold` (0.8).
   */
  matchThreshold?: number;
  /**
   * Restrict the search area: a rect in logical units ({x, y, width, height}), or element-finding criteria whose matched element's bounds become the search area. Use it to speed up matching or to disambiguate multiple identical-looking targets.
   */
  region?: RegionRect | RegionElementCriteria;
}
export interface RegionRect {
  /**
   * Left edge of the search area in logical units.
   */
  x: number;
  /**
   * Top edge of the search area in logical units.
   */
  y: number;
  /**
   * Width of the search area in logical units.
   */
  width: number;
  /**
   * Height of the search area in logical units.
   */
  height: number;
}
/**
 * A fixed spot in the capture, for annotations that aren't anchored to an element.
 */
export interface TargetByPosition {
  position: NamedRegion | AnnotationPoint;
}
/**
 * An absolute coordinate in the capture, in pixels from the top-left.
 */
export interface AnnotationPoint {
  /**
   * Horizontal position in pixels from the left edge of the capture.
   */
  x: number;
  /**
   * Vertical position in pixels from the top edge of the capture.
   */
  y: number;
}
export interface ElementFindingFields1 {
  /**
   * Selector of the element to annotate. Browser surfaces only.
   */
  selector?: string;
  /**
   * Display text of the element to annotate. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementText?: string;
  /**
   * ID attribute of the element to annotate. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementId?: string;
  /**
   * data-testid attribute of the element to annotate. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementTestId?: string;
  /**
   * Class or array of classes that the element must have. Each class supports exact match or regex pattern using /pattern/ syntax. Element must have all specified classes. Browser surfaces only.
   */
  elementClass?: string | string[];
  /**
   * Object of attribute key-value pairs that the element must have. Values can be strings (supporting /pattern/ regex), numbers, or booleans. Boolean true matches attribute presence, false matches absence.
   */
  elementAttribute?: {
    [k: string]: number | boolean | string;
  };
  /**
   * Computed accessible name of the element per ARIA specification. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementAria?: string;
  image?: Image1;
  /**
   * Max duration in milliseconds to wait for the element to exist.
   */
  timeout?: number;
}
export interface ImageDetailed1 {
  /**
   * Template image: a PNG/JPEG file path (resolved relative to the spec like other paths) or an inline data URI (data:image/png;base64,…).
   */
  path: string;
  /**
   * Minimum normalized match score (0–1) to accept a match. Higher is stricter: 1 demands a near pixel-perfect match, lower values tolerate more rendering variation but risk matching lookalikes. Defaults to the config-level `imageMatching.matchThreshold` (0.8).
   */
  matchThreshold?: number;
  /**
   * Restrict the search area: a rect in logical units ({x, y, width, height}), or element-finding criteria whose matched element's bounds become the search area. Use it to speed up matching or to disambiguate multiple identical-looking targets.
   */
  region?: RegionRect1 | RegionElementCriteria1;
}
export interface RegionRect1 {
  /**
   * Left edge of the search area in logical units.
   */
  x: number;
  /**
   * Top edge of the search area in logical units.
   */
  y: number;
  /**
   * Width of the search area in logical units.
   */
  width: number;
  /**
   * Height of the search area in logical units.
   */
  height: number;
}
/**
 * A fixed spot in the capture, for annotations that aren't anchored to an element.
 */
export interface TargetByPosition1 {
  position: NamedRegion1 | AnnotationPoint1;
}
/**
 * An absolute coordinate in the capture, in pixels from the top-left.
 */
export interface AnnotationPoint1 {
  /**
   * Horizontal position in pixels from the left edge of the capture.
   */
  x: number;
  /**
   * Vertical position in pixels from the top edge of the capture.
   */
  y: number;
}
export interface ElementFindingFields2 {
  /**
   * Selector of the element to annotate. Browser surfaces only.
   */
  selector?: string;
  /**
   * Display text of the element to annotate. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementText?: string;
  /**
   * ID attribute of the element to annotate. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementId?: string;
  /**
   * data-testid attribute of the element to annotate. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementTestId?: string;
  /**
   * Class or array of classes that the element must have. Each class supports exact match or regex pattern using /pattern/ syntax. Element must have all specified classes. Browser surfaces only.
   */
  elementClass?: string | string[];
  /**
   * Object of attribute key-value pairs that the element must have. Values can be strings (supporting /pattern/ regex), numbers, or booleans. Boolean true matches attribute presence, false matches absence.
   */
  elementAttribute?: {
    [k: string]: number | boolean | string;
  };
  /**
   * Computed accessible name of the element per ARIA specification. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementAria?: string;
  image?: Image2;
  /**
   * Max duration in milliseconds to wait for the element to exist.
   */
  timeout?: number;
}
export interface ImageDetailed2 {
  /**
   * Template image: a PNG/JPEG file path (resolved relative to the spec like other paths) or an inline data URI (data:image/png;base64,…).
   */
  path: string;
  /**
   * Minimum normalized match score (0–1) to accept a match. Higher is stricter: 1 demands a near pixel-perfect match, lower values tolerate more rendering variation but risk matching lookalikes. Defaults to the config-level `imageMatching.matchThreshold` (0.8).
   */
  matchThreshold?: number;
  /**
   * Restrict the search area: a rect in logical units ({x, y, width, height}), or element-finding criteria whose matched element's bounds become the search area. Use it to speed up matching or to disambiguate multiple identical-looking targets.
   */
  region?: RegionRect2 | RegionElementCriteria2;
}
export interface RegionRect2 {
  /**
   * Left edge of the search area in logical units.
   */
  x: number;
  /**
   * Top edge of the search area in logical units.
   */
  y: number;
  /**
   * Width of the search area in logical units.
   */
  width: number;
  /**
   * Height of the search area in logical units.
   */
  height: number;
}
/**
 * A fixed spot in the capture, for annotations that aren't anchored to an element.
 */
export interface TargetByPosition2 {
  position: NamedRegion2 | AnnotationPoint2;
}
/**
 * An absolute coordinate in the capture, in pixels from the top-left.
 */
export interface AnnotationPoint2 {
  /**
   * Horizontal position in pixels from the left edge of the capture.
   */
  x: number;
  /**
   * Vertical position in pixels from the top edge of the capture.
   */
  y: number;
}
export interface ElementFindingFields3 {
  /**
   * Selector of the element to annotate. Browser surfaces only.
   */
  selector?: string;
  /**
   * Display text of the element to annotate. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementText?: string;
  /**
   * ID attribute of the element to annotate. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementId?: string;
  /**
   * data-testid attribute of the element to annotate. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementTestId?: string;
  /**
   * Class or array of classes that the element must have. Each class supports exact match or regex pattern using /pattern/ syntax. Element must have all specified classes. Browser surfaces only.
   */
  elementClass?: string | string[];
  /**
   * Object of attribute key-value pairs that the element must have. Values can be strings (supporting /pattern/ regex), numbers, or booleans. Boolean true matches attribute presence, false matches absence.
   */
  elementAttribute?: {
    [k: string]: number | boolean | string;
  };
  /**
   * Computed accessible name of the element per ARIA specification. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementAria?: string;
  image?: Image3;
  /**
   * Max duration in milliseconds to wait for the element to exist.
   */
  timeout?: number;
}
export interface ImageDetailed3 {
  /**
   * Template image: a PNG/JPEG file path (resolved relative to the spec like other paths) or an inline data URI (data:image/png;base64,…).
   */
  path: string;
  /**
   * Minimum normalized match score (0–1) to accept a match. Higher is stricter: 1 demands a near pixel-perfect match, lower values tolerate more rendering variation but risk matching lookalikes. Defaults to the config-level `imageMatching.matchThreshold` (0.8).
   */
  matchThreshold?: number;
  /**
   * Restrict the search area: a rect in logical units ({x, y, width, height}), or element-finding criteria whose matched element's bounds become the search area. Use it to speed up matching or to disambiguate multiple identical-looking targets.
   */
  region?: RegionRect3 | RegionElementCriteria3;
}
export interface RegionRect3 {
  /**
   * Left edge of the search area in logical units.
   */
  x: number;
  /**
   * Top edge of the search area in logical units.
   */
  y: number;
  /**
   * Width of the search area in logical units.
   */
  width: number;
  /**
   * Height of the search area in logical units.
   */
  height: number;
}
/**
 * A fixed spot in the capture, for annotations that aren't anchored to an element.
 */
export interface TargetByPosition3 {
  position: NamedRegion3 | AnnotationPoint3;
}
/**
 * An absolute coordinate in the capture, in pixels from the top-left.
 */
export interface AnnotationPoint3 {
  /**
   * Horizontal position in pixels from the left edge of the capture.
   */
  x: number;
  /**
   * Vertical position in pixels from the top edge of the capture.
   */
  y: number;
}
export interface ElementFindingFields4 {
  /**
   * Selector of the element to annotate. Browser surfaces only.
   */
  selector?: string;
  /**
   * Display text of the element to annotate. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementText?: string;
  /**
   * ID attribute of the element to annotate. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementId?: string;
  /**
   * data-testid attribute of the element to annotate. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementTestId?: string;
  /**
   * Class or array of classes that the element must have. Each class supports exact match or regex pattern using /pattern/ syntax. Element must have all specified classes. Browser surfaces only.
   */
  elementClass?: string | string[];
  /**
   * Object of attribute key-value pairs that the element must have. Values can be strings (supporting /pattern/ regex), numbers, or booleans. Boolean true matches attribute presence, false matches absence.
   */
  elementAttribute?: {
    [k: string]: number | boolean | string;
  };
  /**
   * Computed accessible name of the element per ARIA specification. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementAria?: string;
  image?: Image4;
  /**
   * Max duration in milliseconds to wait for the element to exist.
   */
  timeout?: number;
}
export interface ImageDetailed4 {
  /**
   * Template image: a PNG/JPEG file path (resolved relative to the spec like other paths) or an inline data URI (data:image/png;base64,…).
   */
  path: string;
  /**
   * Minimum normalized match score (0–1) to accept a match. Higher is stricter: 1 demands a near pixel-perfect match, lower values tolerate more rendering variation but risk matching lookalikes. Defaults to the config-level `imageMatching.matchThreshold` (0.8).
   */
  matchThreshold?: number;
  /**
   * Restrict the search area: a rect in logical units ({x, y, width, height}), or element-finding criteria whose matched element's bounds become the search area. Use it to speed up matching or to disambiguate multiple identical-looking targets.
   */
  region?: RegionRect4 | RegionElementCriteria4;
}
export interface RegionRect4 {
  /**
   * Left edge of the search area in logical units.
   */
  x: number;
  /**
   * Top edge of the search area in logical units.
   */
  y: number;
  /**
   * Width of the search area in logical units.
   */
  width: number;
  /**
   * Height of the search area in logical units.
   */
  height: number;
}
/**
 * A fixed spot in the capture, for annotations that aren't anchored to an element.
 */
export interface TargetByPosition4 {
  position: NamedRegion4 | AnnotationPoint4;
}
/**
 * An absolute coordinate in the capture, in pixels from the top-left.
 */
export interface AnnotationPoint4 {
  /**
   * Horizontal position in pixels from the left edge of the capture.
   */
  x: number;
  /**
   * Vertical position in pixels from the top edge of the capture.
   */
  y: number;
}
export interface ElementFindingFields5 {
  /**
   * Selector of the element to annotate. Browser surfaces only.
   */
  selector?: string;
  /**
   * Display text of the element to annotate. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementText?: string;
  /**
   * ID attribute of the element to annotate. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementId?: string;
  /**
   * data-testid attribute of the element to annotate. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementTestId?: string;
  /**
   * Class or array of classes that the element must have. Each class supports exact match or regex pattern using /pattern/ syntax. Element must have all specified classes. Browser surfaces only.
   */
  elementClass?: string | string[];
  /**
   * Object of attribute key-value pairs that the element must have. Values can be strings (supporting /pattern/ regex), numbers, or booleans. Boolean true matches attribute presence, false matches absence.
   */
  elementAttribute?: {
    [k: string]: number | boolean | string;
  };
  /**
   * Computed accessible name of the element per ARIA specification. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementAria?: string;
  image?: Image5;
  /**
   * Max duration in milliseconds to wait for the element to exist.
   */
  timeout?: number;
}
export interface ImageDetailed5 {
  /**
   * Template image: a PNG/JPEG file path (resolved relative to the spec like other paths) or an inline data URI (data:image/png;base64,…).
   */
  path: string;
  /**
   * Minimum normalized match score (0–1) to accept a match. Higher is stricter: 1 demands a near pixel-perfect match, lower values tolerate more rendering variation but risk matching lookalikes. Defaults to the config-level `imageMatching.matchThreshold` (0.8).
   */
  matchThreshold?: number;
  /**
   * Restrict the search area: a rect in logical units ({x, y, width, height}), or element-finding criteria whose matched element's bounds become the search area. Use it to speed up matching or to disambiguate multiple identical-looking targets.
   */
  region?: RegionRect5 | RegionElementCriteria5;
}
export interface RegionRect5 {
  /**
   * Left edge of the search area in logical units.
   */
  x: number;
  /**
   * Top edge of the search area in logical units.
   */
  y: number;
  /**
   * Width of the search area in logical units.
   */
  width: number;
  /**
   * Height of the search area in logical units.
   */
  height: number;
}
/**
 * A fixed spot in the capture, for annotations that aren't anchored to an element.
 */
export interface TargetByPosition5 {
  position: NamedRegion5 | AnnotationPoint5;
}
/**
 * An absolute coordinate in the capture, in pixels from the top-left.
 */
export interface AnnotationPoint5 {
  /**
   * Horizontal position in pixels from the left edge of the capture.
   */
  x: number;
  /**
   * Vertical position in pixels from the top edge of the capture.
   */
  y: number;
}
/**
 * Visual overrides for this annotation. Anything unset falls back to the resolved `annotationDefaults` theme (test, then spec, then config), then to the built-in theme.
 */
export interface AnnotationStyle {
  /**
   * Foreground color — strokes, arrowheads, and text (hex, rgb, or named color).
   */
  color?: string;
  /**
   * Background color for text-bearing annotations (hex, rgb, or named color). Use `transparent` for none.
   */
  background?: string;
  /**
   * Line width in pixels.
   */
  strokeWidth?: number;
  /**
   * Font size in pixels.
   */
  fontSize?: number;
  /**
   * Font family. Falls back through the list as in CSS.
   */
  fontFamily?: string;
  /**
   * Opacity, from 0 (invisible) to 1 (opaque).
   */
  opacity?: number;
  /**
   * Corner radius in pixels, for boxes and text backgrounds.
   */
  radius?: number;
  /**
   * Padding in pixels inside text boxes, and between an outline and its element.
   */
  padding?: number;
  /**
   * Maximum width in pixels for text before it wraps.
   */
  maxWidth?: number;
  /**
   * Blur strength. Higher values obscure more.
   */
  intensity?: number;
}
/**
 * An absolute coordinate in the capture, in pixels from the top-left.
 */
export interface AnnotationPoint6 {
  /**
   * Horizontal position in pixels from the left edge of the capture.
   */
  x: number;
  /**
   * Vertical position in pixels from the top edge of the capture.
   */
  y: number;
}
/**
 * A nudge in pixels from the annotation's default placement.
 */
export interface AnnotationOffset {
  /**
   * Pixels to shift the annotation by.
   */
  offset: {
    /**
     * Pixels to shift right. Negative values shift left.
     */
    x: number;
    /**
     * Pixels to shift down. Negative values shift up.
     */
    y: number;
  };
}
/**
 * How the annotation enters and leaves. Applies to recordings; inert in still screenshots, which render the settled state.
 */
export interface AnnotationTransition {
  /**
   * How the annotation appears. Use `none` for annotations that must never reveal what they cover — a `blur` that fades in shows the sensitive content underneath while it does.
   */
  enter?: "none" | "fade" | "pop" | "draw";
  /**
   * How the annotation disappears.
   */
  exit?: "none" | "fade";
  /**
   * Length of the enter and exit animations, in milliseconds.
   */
  durationMs?: number;
}
/**
 * Information about the source integration for this screenshot, enabling upload of changed files back to the source CMS. Set automatically during test resolution for files from integrations.
 */
export interface SourceIntegration {
  /**
   * The type of integration. Currently supported: 'heretto'. Additional types may be added in the future.
   */
  type: "heretto";
  /**
   * The name of the integration configuration in the config file. Used to look up authentication credentials.
   */
  integrationName: string;
  /**
   * The unique identifier (UUID) of the file in the source CMS. If not provided, the file will be looked up by path.
   */
  fileId?: string;
  /**
   * The path of the file in the source CMS. Used for lookup if fileId is not available.
   */
  filePath?: string;
  /**
   * The local path to the file that references this source. Used for resolving relative paths.
   */
  contentPath?: string;
}
export interface AppCapturesDonTSupportCropYet {
  [k: string]: unknown;
}
