/* eslint-disable */
/**
 * Auto-generated from swipe_v3.schema.json
 * Do not edit manually
 */

/**
 * Swipe (or scroll) a surface in a direction or between two points. The direction is the virtual finger's motion: swiping up moves content up, revealing content further down the page. Works on app and browser surfaces.
 */
export type Swipe = SwipeSimple | SwipeDirectional | SwipePointToPoint;
/**
 * Direction the virtual finger moves. `up` reveals content below; `left` reveals content to the right (for example, the next carousel card).
 */
export type SwipeSimple = "up" | "down" | "left" | "right";
/**
 * Direction the virtual finger moves. `up` reveals content below; `left` reveals content to the right (for example, the next carousel card).
 */
export type SwipeSimple1 = "up" | "down" | "left" | "right";
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
 * Browser engine keyword. Targets that browser. Steps that can only ever act on a browser (not a background process) restrict the bare-string form to this enum, so a process name here is rejected at validation time instead of failing at runtime.
 */
export type SurfaceByBrowserEngine1 = "chrome" | "firefox" | "safari" | "webkit" | "edge";
/**
 * Which window to act on. Omit to use the active window.
 */
export type WindowTabSelector2 = ByIndex3 | ByName3 | ByCriteria3;
/**
 * Index in creation order. Negative counts from the end; `-1` is the newest.
 */
export type ByIndex3 = number;
/**
 * Name assigned when the window/tab was opened (goTo `newTab`/`newWindow`). The integer branch is listed first because Ajv validates with coerceTypes — string-first would coerce integer indexes into name strings.
 */
export type ByName3 = string;
/**
 * Which tab to act on. Omit to use the active tab. Without `window`, the selector searches every tab in creation order — including tabs the page opened itself.
 */
export type WindowTabSelector3 = ByIndex4 | ByName4 | ByCriteria4;
/**
 * Index in creation order. Negative counts from the end; `-1` is the newest.
 */
export type ByIndex4 = number;
/**
 * Name assigned when the window/tab was opened (goTo `newTab`/`newWindow`). The integer branch is listed first because Ajv validates with coerceTypes — string-first would coerce integer indexes into name strings.
 */
export type ByName4 = string;
/**
 * Which app window to act on. Omit to use the active window. Apps have windows, no tabs.
 */
export type AppWindowSelector1 = ByIndex5 | ByName5 | ByCriteria5;
/**
 * Index in creation order. Negative counts from the end; `-1` is the newest (e.g. a dialog the app just opened).
 */
export type ByIndex5 = number;
/**
 * Assigned window name. The integer branch is listed first because Ajv validates with coerceTypes — string-first would coerce integer indexes into name strings.
 */
export type ByName5 = string;

export interface SwipeDirectional {
  direction: SwipeSimple1;
  /**
   * How far to swipe, as a fraction of the surface's height (for up/down) or width (for left/right).
   */
  distance?: number;
  /**
   * Duration of the swipe movement in milliseconds.
   */
  duration?: number;
  /**
   * The browser window/tab or app window this step acts on. Omit to act on the active tab. The targeted surface stays focused afterward. App surfaces use the object form ({ "app": … }).
   */
  surface?: SurfaceByBrowserEngine | BrowserSurface | AppSurface;
}
export interface BrowserSurface {
  /**
   * Browser engine. Selects the browser surface with that engine (or the one named by `name`). A goTo step opens the browser if it isn't open yet; other steps require it to already be open.
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
export interface SwipePointToPoint {
  from: Point;
  to: Point1;
  /**
   * Duration of the swipe movement in milliseconds.
   */
  duration?: number;
  /**
   * The browser window/tab or app window this step acts on. Omit to act on the active tab. The targeted surface stays focused afterward. App surfaces use the object form ({ "app": … }).
   */
  surface?: SurfaceByBrowserEngine1 | BrowserSurface1 | AppSurface1;
}
/**
 * Where the virtual finger presses down, as fractions of the surface's width and height.
 */
export interface Point {
  /**
   * Horizontal position as a fraction of the surface's width (0 = left edge, 1 = right edge).
   */
  x: number;
  /**
   * Vertical position as a fraction of the surface's height (0 = top edge, 1 = bottom edge).
   */
  y: number;
}
/**
 * Where the virtual finger releases, as fractions of the surface's width and height.
 */
export interface Point1 {
  /**
   * Horizontal position as a fraction of the surface's width (0 = left edge, 1 = right edge).
   */
  x: number;
  /**
   * Vertical position as a fraction of the surface's height (0 = top edge, 1 = bottom edge).
   */
  y: number;
}
export interface BrowserSurface1 {
  /**
   * Browser engine. Selects the browser surface with that engine (or the one named by `name`). A goTo step opens the browser if it isn't open yet; other steps require it to already be open.
   */
  browser: "chrome" | "firefox" | "safari" | "webkit" | "edge";
  /**
   * Name of the browser surface. Defaults to the engine name (the context's default browser registers under its engine). Assign distinct names to drive multiple browsers at once, including several of the same engine.
   */
  name?: string;
  window?: WindowTabSelector2;
  tab?: WindowTabSelector3;
}
export interface ByCriteria3 {
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
export interface ByCriteria4 {
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
export interface AppSurface1 {
  /**
   * Name of an app surface opened by `startSurface` (its `name`, or the default derived from the app identifier).
   */
  app: string;
  window?: AppWindowSelector1;
}
export interface ByCriteria5 {
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
