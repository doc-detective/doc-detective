/* eslint-disable */
/**
 * Auto-generated from dragAndDrop_v3.schema.json
 * Do not edit manually
 */

/**
 * Display text, selector, or regex pattern (enclosed in forward slashes) of the element.
 */
export type ElementSimple = string;
export type ElementDetailed = {
  [k: string]: unknown;
};
/**
 * Display text, selector, or regex pattern (enclosed in forward slashes) of the element.
 */
export type ElementSimple1 = string;
export type ElementDetailed1 = {
  [k: string]: unknown;
};
/**
 * Name of the surface. A browser engine keyword (chrome|firefox|safari|webkit|edge) targets that browser; any other string names an existing surface, with its kind resolved at runtime.
 */
export type SurfaceByName = string;
/**
 * Which window to act on. Omit to use the active window.
 */
export type WindowTabSelector = ByName | ByIndex | ByCriteria;
/**
 * Name assigned when the window/tab was opened (goTo `newTab`/`newWindow`).
 */
export type ByName = string;
/**
 * Index in creation order. Negative counts from the end; `-1` is the newest.
 */
export type ByIndex = number;
/**
 * Which tab to act on. Omit to use the active tab. Without `window`, the selector searches every tab in creation order — including tabs the page opened itself.
 */
export type WindowTabSelector1 = ByName1 | ByIndex1 | ByCriteria1;
/**
 * Name assigned when the window/tab was opened (goTo `newTab`/`newWindow`).
 */
export type ByName1 = string;
/**
 * Index in creation order. Negative counts from the end; `-1` is the newest.
 */
export type ByIndex1 = number;

/**
 * Drag and drop an element from source to target.
 */
export interface DragAndDrop {
  /**
   * The element to drag.
   */
  source: ElementSimple | ElementDetailed;
  /**
   * The target location to drop the element.
   */
  target: ElementSimple1 | ElementDetailed1;
  /**
   * Duration of the drag operation in milliseconds.
   */
  duration?: number;
  /**
   * The browser window/tab the source and target elements live in. Omit to act on the active tab. The targeted tab stays focused afterward.
   */
  surface?: SurfaceByName | BrowserSurface;
  [k: string]: unknown;
}
export interface BrowserSurface {
  /**
   * Browser engine. Must be the context's active browser; targeting a different browser at the same time lands in a later phase.
   */
  browser: "chrome" | "firefox" | "safari" | "webkit" | "edge";
  /**
   * Name of the browser surface. Reserved for multi-browser targeting (later phase).
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
