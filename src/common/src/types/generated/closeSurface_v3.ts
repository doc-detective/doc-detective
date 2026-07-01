/* eslint-disable */
/**
 * Auto-generated from closeSurface_v3.schema.json
 * Do not edit manually
 */

/**
 * Close one or more surfaces: background processes, or browser windows/tabs. A browser reference with a `tab` selector closes that tab; with a `window` selector it closes the window and its tabs. Closing a surface that is not open is a no-op (PASS). Renames `stopProcess`.
 */
export type CloseSurface = Surface | [Surface1, ...Surface1[]];
/**
 * The surface a step acts on. Omit to act on the active surface. Supports background processes and browser windows/tabs; app surfaces are added in a later phase.
 */
export type Surface = SurfaceByName | ProcessSurface | BrowserSurface;
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
 * The surface a step acts on. Omit to act on the active surface. Supports background processes and browser windows/tabs; app surfaces are added in a later phase.
 */
export type Surface1 = SurfaceByName1 | ProcessSurface1 | BrowserSurface1;
/**
 * Name of the surface. A browser engine keyword (chrome|firefox|safari|webkit|edge) targets that browser; any other string names an existing surface, with its kind resolved at runtime.
 */
export type SurfaceByName1 = string;
/**
 * Which window to act on. Omit to use the active window.
 */
export type WindowTabSelector2 = ByName2 | ByIndex2 | ByCriteria2;
/**
 * Name assigned when the window/tab was opened (goTo `newTab`/`newWindow`).
 */
export type ByName2 = string;
/**
 * Index in creation order. Negative counts from the end; `-1` is the newest.
 */
export type ByIndex2 = number;
/**
 * Which tab to act on. Omit to use the active tab. Without `window`, the selector searches every tab in creation order — including tabs the page opened itself.
 */
export type WindowTabSelector3 = ByName3 | ByIndex3 | ByCriteria3;
/**
 * Name assigned when the window/tab was opened (goTo `newTab`/`newWindow`).
 */
export type ByName3 = string;
/**
 * Index in creation order. Negative counts from the end; `-1` is the newest.
 */
export type ByIndex3 = number;

export interface ProcessSurface {
  /**
   * Name of a background process started by a runShell/runCode `background` step.
   */
  process: string;
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
export interface ProcessSurface1 {
  /**
   * Name of a background process started by a runShell/runCode `background` step.
   */
  process: string;
}
export interface BrowserSurface1 {
  /**
   * Browser engine. Must be the context's active browser; targeting a different browser at the same time lands in a later phase.
   */
  browser: "chrome" | "firefox" | "safari" | "webkit" | "edge";
  /**
   * Name of the browser surface. Reserved for multi-browser targeting (later phase).
   */
  name?: string;
  window?: WindowTabSelector2;
  tab?: WindowTabSelector3;
}
export interface ByCriteria2 {
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
