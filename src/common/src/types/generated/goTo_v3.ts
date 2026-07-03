/* eslint-disable */
/**
 * Auto-generated from goTo_v3.schema.json
 * Do not edit manually
 */

export type GoTo = GoToURLSimple | GoToURLDetailed;
/**
 * Navigate to an HTTP or HTTPS URL. Can be a full URL or a path. If a path is provided, navigates relative to the current URL, if any.
 */
export type GoToURLSimple = string;
/**
 * Navigate to an HTTP or HTTPS URL.
 */
export type GoToURLDetailed = {
  /**
   * The browser window/tab to navigate. Omit to navigate the active tab. With `newTab`, selects the window the tab opens in.
   */
  surface?: SurfaceByBrowserEngine | BrowserSurface;
  /**
   * Open the URL in a new tab of the target window and make it active. `true` opens an anonymous tab; a string (or `{ name }`) names the tab so later steps can select it with a `tab` selector. `false` disables. Mutually exclusive with `newWindow`.
   */
  newTab?:
    | boolean
    | string
    | {
        /**
         * Name for the new tab.
         */
        name?: string;
      };
  /**
   * Open the URL in a new window and make it active. `true` opens an anonymous window; a string (or `{ name, tab }`) names the window — `tab` names the window's first tab. `false` disables. Mutually exclusive with `newTab`.
   */
  newWindow?:
    | boolean
    | string
    | {
        /**
         * Name for the new window.
         */
        name?: string;
        /**
         * Name for the new window's first tab.
         */
        tab?: string;
      };
  /**
   * URL to navigate to. Can be a full URL or a path. If a path is provided and `origin` is specified, prepends `origin` to `url`. If a path is provided but `origin` isn't specified, attempts to navigate relative to the current URL, if any.
   */
  url: string;
  /**
   * Protocol and domain to navigate to. Prepended to `url`.
   */
  origin?: string;
  /**
   * Query parameters to append to the resolved URL. Merged on top of `originParams` from config; step keys win on collision. If `url` already contains a colliding query key, the value here replaces it. Values support environment variable substitution via `$VAR` syntax. WARNING: values are embedded in the request URL and appear in test results, logs, and reports.
   */
  params?: {
    [k: string]: string;
  };
  /**
   * Maximum time in milliseconds to wait for the page to be ready. If exceeded, the goTo action fails.
   */
  timeout?: number;
  /**
   * Configuration for waiting conditions after navigation.
   */
  waitUntil?: {
    /**
     * Wait for network activity to be idle (no new requests) for this duration in milliseconds. Set to `null` to skip this check.
     */
    networkIdleTime?: number | null;
    /**
     * Wait for DOM mutations to stop for this duration in milliseconds. Set to `null` to skip this check.
     */
    domIdleTime?: number | null;
    /**
     * Wait for a specific element to be present in the DOM. At least one of selector or elementText must be specified.
     */
    find?: {
      [k: string]: unknown;
    };
  };
} & NewTabAndNewWindowAreMutuallyExclusive &
  NewTabConflictsWithASurfaceTabSelector &
  NewWindowConflictsWithASurfaceWindowOrTabSelector;
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
export interface NewTabAndNewWindowAreMutuallyExclusive {
  [k: string]: unknown;
}
export interface NewTabConflictsWithASurfaceTabSelector {
  [k: string]: unknown;
}
export interface NewWindowConflictsWithASurfaceWindowOrTabSelector {
  [k: string]: unknown;
}
