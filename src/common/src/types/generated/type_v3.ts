/* eslint-disable */
/**
 * Auto-generated from type_v3.schema.json
 * Do not edit manually
 */

/**
 * Type keys. To type special keys, begin and end the string with `$` and use the special key's keyword. For example, to type the Escape key, enter `$ESCAPE$`.
 */
export type TypeKeys = TypeKeysSimple | TypeKeysDetailed;
/**
 * Sequence of keys to enter.
 */
export type TypeKeysSimple = string | string[];
export type TypeKeysDetailed = {
  keys: TypeKeysSimple1;
  /**
   * Delay in milliseconds between each key press during a recording, and between each keystroke sent to a process surface.
   */
  inputDelay?: number;
  surface?: Surface;
  /**
   * After sending the keys, wait until the surface is ready. Requires a `surface`; the allowed conditions depend on the surface kind: a process surface accepts `stdio`/`delayMs`, a browser surface accepts `networkIdleTime`/`domIdleTime`/`find`. No condition applies by default.
   */
  waitUntil?: ProcessReadiness | BrowserReadiness;
  /**
   * Maximum time in milliseconds to wait for `waitUntil` after sending the keys.
   */
  timeout?: number;
  /**
   * Selector for the element to type into. If not specified, the typing occurs in the active element.
   */
  selector?: string;
  /**
   * Display text of the element to type into. If combined with other element finding fields, the element must match all specified criteria.
   */
  elementText?: string;
  /**
   * ID attribute of the element to find. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementId?: string;
  /**
   * data-testid attribute of the element to find. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementTestId?: string;
  /**
   * Class or array of classes that the element must have. Each class supports exact match or regex pattern using /pattern/ syntax. Element must have all specified classes.
   */
  elementClass?: string | string[];
  /**
   * Object of attribute key-value pairs that the element must have. Values can be strings (supporting /pattern/ regex), numbers, or booleans. Boolean true matches attribute presence, false matches absence.
   */
  elementAttribute?: {
    [k: string]: string | number | boolean;
  };
  /**
   * Computed accessible name of the element per ARIA specification. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementAria?: string;
} & WaitUntilRequiresASurface &
  AProcessSurfaceForbidsElementTargeting &
  AProcessSurfaceTakesProcessReadiness &
  ABrowserSurfaceTakesBrowserReadiness;
/**
 * Sequence of keys to enter.
 */
export type TypeKeysSimple1 = string | string[];
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
export interface ProcessReadiness {
  /**
   * Wait until combined stdout+stderr matches. Substring, or /regex/.
   */
  stdio?: string;
  /**
   * Fixed delay (ms).
   */
  delayMs?: number;
}
export interface BrowserReadiness {
  /**
   * Wait for network activity to be idle (no new requests) for this duration in milliseconds.
   */
  networkIdleTime?: number;
  /**
   * Wait for DOM mutations to stop for this duration in milliseconds.
   */
  domIdleTime?: number;
  /**
   * Wait for a specific element to be present in the DOM. At least one finding field must be specified.
   */
  find?: {
    [k: string]: unknown;
  };
}
export interface WaitUntilRequiresASurface {
  [k: string]: unknown;
}
export interface AProcessSurfaceForbidsElementTargeting {
  [k: string]: unknown;
}
export interface AProcessSurfaceTakesProcessReadiness {
  [k: string]: unknown;
}
export interface ABrowserSurfaceTakesBrowserReadiness {
  [k: string]: unknown;
}
