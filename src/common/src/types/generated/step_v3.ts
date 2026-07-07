/* eslint-disable */
/**
 * Auto-generated from step_v3.schema.json
 * Do not edit manually
 */

/**
 * A step in a test.
 */
export type Step =
  | (Common & CheckLink)
  | (Common1 & Click)
  | (Common2 & Find)
  | (Common3 & GoTo)
  | (Common4 & HttpRequest)
  | (Common5 & RunShell)
  | (Common6 & RunCode)
  | (Common7 & RunBrowserScript)
  | (Common8 & Type)
  | (Common9 & Screenshot)
  | (Common10 & SaveCookie)
  | (Common11 & Record)
  | (Common12 & StopRecord)
  | (Common13 & CloseSurface)
  | (Common14 & StartSurface)
  | (Common15 & LoadVariables)
  | (Common16 & DragAndDrop)
  | (Common17 & LoadCookie)
  | (Common18 & Swipe)
  | (Common19 & Wait);
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition = string | [string, ...string[]];
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition1 = string | [string, ...string[]];
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing1 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing2 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing3 = {
  [k: string]: unknown;
};
export type CheckLink1 = CheckLinkDetailed | CheckLinkDetailed1;
/**
 * Check if an HTTP or HTTPS URL returns an acceptable status code from a GET request.
 */
export type CheckLinkDetailed = string;
/**
 * Headers to include in the HTTP request, as newline-separated values. For example, `X-Api-Key: abc123
 * Authorization: Bearer token`.
 */
export type RequestHeadersString = string;
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition2 = string | [string, ...string[]];
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition3 = string | [string, ...string[]];
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing4 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing5 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing6 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing7 = {
  [k: string]: unknown;
};
/**
 * Click or tap an element.
 */
export type Click1 = ClickElementSimple | ClickElementDetailed | boolean;
/**
 * Identifier for the element to click. Can be a selector, element text, ARIA name, ID, or test ID.
 */
export type ClickElementSimple = string;
export type ClickElementDetailed = {
  [k: string]: unknown;
};
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition4 = string | [string, ...string[]];
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition5 = string | [string, ...string[]];
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing8 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing9 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing10 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing11 = {
  [k: string]: unknown;
};
/**
 * Find an element based on display text or a selector, then optionally interact with it.
 */
export type Find1 = FindElementSimple | FindElementDetailed;
/**
 * Identifier for the element to find. Can be a selector, element text, ARIA name, ID, or test ID.
 */
export type FindElementSimple = string;
export type FindElementDetailed = {
  [k: string]: unknown;
};
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition6 = string | [string, ...string[]];
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition7 = string | [string, ...string[]];
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing12 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing13 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing14 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing15 = {
  [k: string]: unknown;
};
export type GoTo1 = GoToURLSimple | GoToURLDetailed;
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
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition8 = string | [string, ...string[]];
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition9 = string | [string, ...string[]];
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing16 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing17 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing18 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing19 = {
  [k: string]: unknown;
};
/**
 * Perform a generic HTTP request, for example to an API.
 */
export type HttpRequest1 = HTTPRequestSimple | HTTPRequestDetailed;
/**
 * URL for the HTTP request.
 */
export type HTTPRequestSimple = string;
export type HTTPRequestDetailed = {
  [k: string]: unknown;
};
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition10 = string | [string, ...string[]];
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition11 = string | [string, ...string[]];
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing20 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing21 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing22 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing23 = {
  [k: string]: unknown;
};
/**
 * Perform a native shell command.
 */
export type RunShell1 = RunShellCommandSimple | RunShellCommandDetailed;
/**
 * Command to perform in the machine's default shell.
 */
export type RunShellCommandSimple = string;
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition12 = string | [string, ...string[]];
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition13 = string | [string, ...string[]];
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing24 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing25 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing26 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing27 = {
  [k: string]: unknown;
};
/**
 * Assemble and run code.
 */
export type RunCode1 = RunCodeDetailed;
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition14 = string | [string, ...string[]];
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition15 = string | [string, ...string[]];
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing28 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing29 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing30 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing31 = {
  [k: string]: unknown;
};
/**
 * Execute arbitrary JavaScript in the browser page context. Runs via the WebDriver `executeScript` endpoint, so it has access to the page's `document`, `window`, and DOM. Doc Detective captures the script's return value in the step's `outputs.result`. Distinct from `runCode`, which runs Node/Python/bash on the host machine.
 */
export type RunBrowserScript1 = RunBrowserScriptSimple | RunBrowserScriptDetailed;
/**
 * JavaScript to evaluate in the browser page context. Supports `return` to capture a value into `outputs.result`.
 */
export type RunBrowserScriptSimple = string;
/**
 * Browser engine keyword. Targets that browser. Steps that can only ever act on a browser (not a background process) restrict the bare-string form to this enum, so a process name here is rejected at validation time instead of failing at runtime.
 */
export type SurfaceByBrowserEngine1 = "chrome" | "firefox" | "safari" | "webkit" | "edge";
/**
 * Which window to act on. Omit to use the active window.
 */
export type WindowTabSelector2 = ByIndex2 | ByName2 | ByCriteria2;
/**
 * Index in creation order. Negative counts from the end; `-1` is the newest.
 */
export type ByIndex2 = number;
/**
 * Name assigned when the window/tab was opened (goTo `newTab`/`newWindow`). The integer branch is listed first because Ajv validates with coerceTypes — string-first would coerce integer indexes into name strings.
 */
export type ByName2 = string;
/**
 * Which tab to act on. Omit to use the active tab. Without `window`, the selector searches every tab in creation order — including tabs the page opened itself.
 */
export type WindowTabSelector3 = ByIndex3 | ByName3 | ByCriteria3;
/**
 * Index in creation order. Negative counts from the end; `-1` is the newest.
 */
export type ByIndex3 = number;
/**
 * Name assigned when the window/tab was opened (goTo `newTab`/`newWindow`). The integer branch is listed first because Ajv validates with coerceTypes — string-first would coerce integer indexes into name strings.
 */
export type ByName3 = string;
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition16 = string | [string, ...string[]];
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition17 = string | [string, ...string[]];
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing32 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing33 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing34 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing35 = {
  [k: string]: unknown;
};
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
   * Delay in milliseconds between each key press during a recording, and between each keystroke sent to a process surface. Not applied on app surfaces in this phase — the native driver types the value atomically.
   */
  inputDelay?: number;
  surface?: Surface;
  /**
   * After sending the keys, wait until the surface is ready. Requires a `surface`; the allowed conditions depend on the surface kind: a process surface accepts `stdio`/`delayMs`, a browser surface accepts `networkIdleTime`/`domIdleTime`/`find`, an app surface accepts `delayMs`/`find`. No condition applies by default.
   */
  waitUntil?: ProcessReadiness | BrowserReadiness | AppReadiness;
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
  ABrowserSurfaceTakesBrowserReadiness &
  AnAppSurfaceTakesAppReadiness &
  ABrowserEngineStringSurfaceTakesBrowserReadiness;
/**
 * Sequence of keys to enter.
 */
export type TypeKeysSimple1 = string | string[];
/**
 * The surface a step acts on. Omit to act on the active surface. Supports background processes, browser windows/tabs, and native app windows.
 */
export type Surface = SurfaceByName | ProcessSurface | BrowserSurface2 | AppSurface;
/**
 * Name of the surface. A browser engine keyword (chrome|firefox|safari|webkit|edge) targets that browser; any other string names a background process. To target a browser window or tab, use the object form ({ "browser": …, "window": …, "tab": … }) — a plain string is never a window/tab name.
 */
export type SurfaceByName = string;
/**
 * Which window to act on. Omit to use the active window.
 */
export type WindowTabSelector4 = ByIndex4 | ByName4 | ByCriteria4;
/**
 * Index in creation order. Negative counts from the end; `-1` is the newest.
 */
export type ByIndex4 = number;
/**
 * Name assigned when the window/tab was opened (goTo `newTab`/`newWindow`). The integer branch is listed first because Ajv validates with coerceTypes — string-first would coerce integer indexes into name strings.
 */
export type ByName4 = string;
/**
 * Which tab to act on. Omit to use the active tab. Without `window`, the selector searches every tab in creation order — including tabs the page opened itself.
 */
export type WindowTabSelector5 = ByIndex5 | ByName5 | ByCriteria5;
/**
 * Index in creation order. Negative counts from the end; `-1` is the newest.
 */
export type ByIndex5 = number;
/**
 * Name assigned when the window/tab was opened (goTo `newTab`/`newWindow`). The integer branch is listed first because Ajv validates with coerceTypes — string-first would coerce integer indexes into name strings.
 */
export type ByName5 = string;
/**
 * Which app window to act on. Omit to use the active window. Apps have windows, no tabs.
 */
export type AppWindowSelector = ByIndex6 | ByName6 | ByCriteria6;
/**
 * Index in creation order. Negative counts from the end; `-1` is the newest (e.g. a dialog the app just opened).
 */
export type ByIndex6 = number;
/**
 * Assigned window name. The integer branch is listed first because Ajv validates with coerceTypes — string-first would coerce integer indexes into name strings.
 */
export type ByName6 = string;
/**
 * Wait for a specific element to be present. At least one finding field must be specified.
 */
export type ElementCriteria = {
  [k: string]: unknown;
};
/**
 * Wait for a specific element to be present. At least one finding field must be specified.
 */
export type ElementCriteria1 = {
  [k: string]: unknown;
};
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition18 = string | [string, ...string[]];
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition19 = string | [string, ...string[]];
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing36 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing37 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing38 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing39 = {
  [k: string]: unknown;
};
/**
 * Takes a screenshot in PNG format.
 */
export type Screenshot1 = ScreenshotSimple | CaptureScreenshotDetailed | CaptureScreenshot;
/**
 * File path of the PNG file. Accepts absolute paths. If not specified, the file name is the ID of the step. If an `http(s)` URL is supplied, the remote image is downloaded and used as a read-only reference for comparison; the new capture is written to a local run-specific folder instead of being uploaded back to the URL.
 */
export type ScreenshotSimple = string;
export type CaptureScreenshotDetailed = CaptureScreenshotFields & AppCapturesDonTSupportCropYet;
/**
 * Browser engine keyword. Targets that browser. Steps that can only ever act on a browser (not a background process) restrict the bare-string form to this enum, so a process name here is rejected at validation time instead of failing at runtime.
 */
export type SurfaceByBrowserEngine2 = "chrome" | "firefox" | "safari" | "webkit" | "edge";
/**
 * Which window to act on. Omit to use the active window.
 */
export type WindowTabSelector6 = ByIndex7 | ByName7 | ByCriteria7;
/**
 * Index in creation order. Negative counts from the end; `-1` is the newest.
 */
export type ByIndex7 = number;
/**
 * Name assigned when the window/tab was opened (goTo `newTab`/`newWindow`). The integer branch is listed first because Ajv validates with coerceTypes — string-first would coerce integer indexes into name strings.
 */
export type ByName7 = string;
/**
 * Which tab to act on. Omit to use the active tab. Without `window`, the selector searches every tab in creation order — including tabs the page opened itself.
 */
export type WindowTabSelector7 = ByIndex8 | ByName8 | ByCriteria8;
/**
 * Index in creation order. Negative counts from the end; `-1` is the newest.
 */
export type ByIndex8 = number;
/**
 * Name assigned when the window/tab was opened (goTo `newTab`/`newWindow`). The integer branch is listed first because Ajv validates with coerceTypes — string-first would coerce integer indexes into name strings.
 */
export type ByName8 = string;
/**
 * Which app window to act on. Omit to use the active window. Apps have windows, no tabs.
 */
export type AppWindowSelector1 = ByIndex9 | ByName9 | ByCriteria9;
/**
 * Index in creation order. Negative counts from the end; `-1` is the newest (e.g. a dialog the app just opened).
 */
export type ByIndex9 = number;
/**
 * Assigned window name. The integer branch is listed first because Ajv validates with coerceTypes — string-first would coerce integer indexes into name strings.
 */
export type ByName9 = string;
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
 * If `true`, captures a screenshot. If `false`, doesn't capture a screenshot.
 */
export type CaptureScreenshot = boolean;
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition20 = string | [string, ...string[]];
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition21 = string | [string, ...string[]];
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing40 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing41 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing42 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing43 = {
  [k: string]: unknown;
};
/**
 * Save a specific browser cookie to a file or environment variable for later reuse.
 */
export type SaveCookie1 = CookieName | SaveCookieDetailed;
/**
 * Name of the specific cookie to save. Will be saved to a default file path or environment variable.
 */
export type CookieName = string;
export type SaveCookieDetailed = {
  [k: string]: unknown;
};
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition22 = string | [string, ...string[]];
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition23 = string | [string, ...string[]];
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing44 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing45 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing46 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing47 = {
  [k: string]: unknown;
};
/**
 * Start recording. Must be followed by a `stopRecord` step. The `browser` engine captures the Chrome viewport (works under concurrency); the `ffmpeg` engine captures the screen and supports any application. On Android/iOS contexts, recording captures the device screen through the device itself — `engine` doesn't apply. Supported extensions: [ '.mp4', '.webm', '.gif' ]
 */
export type Record1 = RecordSimple | RecordDetailed | RecordBoolean;
/**
 * File path of the recording. Supports the `.mp4`, `.webm`, and `.gif` extensions. If not specified, the file name is the ID of the step, and the extension is `.mp4`.
 */
export type RecordSimple = string;
/**
 * Browser engine keyword. Targets that browser. Steps that can only ever act on a browser (not a background process) restrict the bare-string form to this enum, so a process name here is rejected at validation time instead of failing at runtime.
 */
export type SurfaceByBrowserEngine3 = "chrome" | "firefox" | "safari" | "webkit" | "edge";
/**
 * Which window to act on. Omit to use the active window.
 */
export type WindowTabSelector8 = ByIndex10 | ByName10 | ByCriteria10;
/**
 * Index in creation order. Negative counts from the end; `-1` is the newest.
 */
export type ByIndex10 = number;
/**
 * Name assigned when the window/tab was opened (goTo `newTab`/`newWindow`). The integer branch is listed first because Ajv validates with coerceTypes — string-first would coerce integer indexes into name strings.
 */
export type ByName10 = string;
/**
 * Which tab to act on. Omit to use the active tab. Without `window`, the selector searches every tab in creation order — including tabs the page opened itself.
 */
export type WindowTabSelector9 = ByIndex11 | ByName11 | ByCriteria11;
/**
 * Index in creation order. Negative counts from the end; `-1` is the newest.
 */
export type ByIndex11 = number;
/**
 * Name assigned when the window/tab was opened (goTo `newTab`/`newWindow`). The integer branch is listed first because Ajv validates with coerceTypes — string-first would coerce integer indexes into name strings.
 */
export type ByName11 = string;
/**
 * Which app window to act on. Omit to use the active window. Apps have windows, no tabs.
 */
export type AppWindowSelector2 = ByIndex12 | ByName12 | ByCriteria12;
/**
 * Index in creation order. Negative counts from the end; `-1` is the newest (e.g. a dialog the app just opened).
 */
export type ByIndex12 = number;
/**
 * Assigned window name. The integer branch is listed first because Ajv validates with coerceTypes — string-first would coerce integer indexes into name strings.
 */
export type ByName12 = string;
/**
 * Recording engine to use. Either a string shorthand selecting the engine with defaults, or an object for full control. If unset, defaults to the `browser` engine when a visible Chrome context is available and to `ffmpeg` otherwise.
 */
export type RecordingEngine = RecordingEngineSimple | RecordingEngineDetailed;
/**
 * `browser` records the Chrome viewport (concurrency-safe); `ffmpeg` records the screen and supports any application.
 */
export type RecordingEngineSimple = "browser" | "ffmpeg";
/**
 * If `true`, starts recording — auto-selecting the `browser` engine for a visible Chrome context, the device screen on Android/iOS contexts, and the `ffmpeg` engine otherwise. If `false`, doesn't record.
 */
export type RecordBoolean = boolean;
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition24 = string | [string, ...string[]];
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition25 = string | [string, ...string[]];
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing48 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing49 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing50 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing51 = {
  [k: string]: unknown;
};
/**
 * Stop a recording started by an earlier `record` step. With no target (`true`/`null`), stops the most recently started recording that is still active (LIFO). To stop a specific recording when several overlap, target it by name with a string (`stopRecord: "<name>"`) or an object (`stopRecord: { name: "<name>" }`).
 */
export type StopRecord1 = StopRecordBoolean | StopRecordNull | StopRecordName | StopRecordDetailed;
/**
 * If `true`, stops the most recently started active recording (LIFO). If `false`, does nothing — an explicit no-op (mirrors `record: false`).
 */
export type StopRecordBoolean = boolean;
/**
 * Stops the most recently started active recording (LIFO).
 */
export type StopRecordNull = null;
/**
 * Name of the recording to stop. Matches the `name` given to a `record` step.
 */
export type StopRecordName = string;
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition26 = string | [string, ...string[]];
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition27 = string | [string, ...string[]];
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing52 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing53 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing54 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing55 = {
  [k: string]: unknown;
};
/**
 * Close one or more surfaces: background processes, browser windows/tabs or whole browser sessions, and native app surfaces. A browser reference with a `tab` selector closes that tab; with a `window` selector it closes the window and its tabs; with neither it closes the whole browser session. An app reference ({ "app": … }) closes the app surface, terminating the app when Doc Detective launched it. Closing a surface that is not open is a no-op (PASS). Renames `stopProcess`.
 */
export type CloseSurface1 = Surface1 | [Surface2, ...Surface2[]];
/**
 * The surface a step acts on. Omit to act on the active surface. Supports background processes, browser windows/tabs, and native app windows.
 */
export type Surface1 = SurfaceByName1 | ProcessSurface1 | BrowserSurface5 | AppSurface3;
/**
 * Name of the surface. A browser engine keyword (chrome|firefox|safari|webkit|edge) targets that browser; any other string names a background process. To target a browser window or tab, use the object form ({ "browser": …, "window": …, "tab": … }) — a plain string is never a window/tab name.
 */
export type SurfaceByName1 = string;
/**
 * Which window to act on. Omit to use the active window.
 */
export type WindowTabSelector10 = ByIndex13 | ByName13 | ByCriteria13;
/**
 * Index in creation order. Negative counts from the end; `-1` is the newest.
 */
export type ByIndex13 = number;
/**
 * Name assigned when the window/tab was opened (goTo `newTab`/`newWindow`). The integer branch is listed first because Ajv validates with coerceTypes — string-first would coerce integer indexes into name strings.
 */
export type ByName13 = string;
/**
 * Which tab to act on. Omit to use the active tab. Without `window`, the selector searches every tab in creation order — including tabs the page opened itself.
 */
export type WindowTabSelector11 = ByIndex14 | ByName14 | ByCriteria14;
/**
 * Index in creation order. Negative counts from the end; `-1` is the newest.
 */
export type ByIndex14 = number;
/**
 * Name assigned when the window/tab was opened (goTo `newTab`/`newWindow`). The integer branch is listed first because Ajv validates with coerceTypes — string-first would coerce integer indexes into name strings.
 */
export type ByName14 = string;
/**
 * Which app window to act on. Omit to use the active window. Apps have windows, no tabs.
 */
export type AppWindowSelector3 = ByIndex15 | ByName15 | ByCriteria15;
/**
 * Index in creation order. Negative counts from the end; `-1` is the newest (e.g. a dialog the app just opened).
 */
export type ByIndex15 = number;
/**
 * Assigned window name. The integer branch is listed first because Ajv validates with coerceTypes — string-first would coerce integer indexes into name strings.
 */
export type ByName15 = string;
/**
 * The surface a step acts on. Omit to act on the active surface. Supports background processes, browser windows/tabs, and native app windows.
 */
export type Surface2 = SurfaceByName2 | ProcessSurface2 | BrowserSurface6 | AppSurface4;
/**
 * Name of the surface. A browser engine keyword (chrome|firefox|safari|webkit|edge) targets that browser; any other string names a background process. To target a browser window or tab, use the object form ({ "browser": …, "window": …, "tab": … }) — a plain string is never a window/tab name.
 */
export type SurfaceByName2 = string;
/**
 * Which window to act on. Omit to use the active window.
 */
export type WindowTabSelector12 = ByIndex16 | ByName16 | ByCriteria16;
/**
 * Index in creation order. Negative counts from the end; `-1` is the newest.
 */
export type ByIndex16 = number;
/**
 * Name assigned when the window/tab was opened (goTo `newTab`/`newWindow`). The integer branch is listed first because Ajv validates with coerceTypes — string-first would coerce integer indexes into name strings.
 */
export type ByName16 = string;
/**
 * Which tab to act on. Omit to use the active tab. Without `window`, the selector searches every tab in creation order — including tabs the page opened itself.
 */
export type WindowTabSelector13 = ByIndex17 | ByName17 | ByCriteria17;
/**
 * Index in creation order. Negative counts from the end; `-1` is the newest.
 */
export type ByIndex17 = number;
/**
 * Name assigned when the window/tab was opened (goTo `newTab`/`newWindow`). The integer branch is listed first because Ajv validates with coerceTypes — string-first would coerce integer indexes into name strings.
 */
export type ByName17 = string;
/**
 * Which app window to act on. Omit to use the active window. Apps have windows, no tabs.
 */
export type AppWindowSelector4 = ByIndex18 | ByName18 | ByCriteria18;
/**
 * Index in creation order. Negative counts from the end; `-1` is the newest (e.g. a dialog the app just opened).
 */
export type ByIndex18 = number;
/**
 * Assigned window name. The integer branch is listed first because Ajv validates with coerceTypes — string-first would coerce integer indexes into name strings.
 */
export type ByName18 = string;
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition28 = string | [string, ...string[]];
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition29 = string | [string, ...string[]];
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing56 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing57 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing58 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing59 = {
  [k: string]: unknown;
};
/**
 * Open (provision) one or more surfaces and register them by name so later steps can target them with `surface`. Three kinds: a native APP (Windows/macOS desktop by executable path, `.app` path, bundle ID, or UWP AppUserModelID; Android/iOS apps on managed emulators/simulators — macOS desktop additionally requires the Accessibility permission for the process that runs Doc Detective), a BROWSER session (opens blank and ready on the context's automation server; navigate it with a `goTo` step), or a background PROCESS (equivalent to `runShell` with `background` — both forms stay valid). An ARRAY of descriptors opens them all concurrently — the step completes when every one is ready, and device boots overlap. See docs/design/multi-surface-targeting.md and docs/design/native-app-surfaces.md.
 */
export type StartSurface1 = AppDescriptor | BrowserDescriptor | ProcessDescriptor | ParallelSurfaces;
export type DeviceByName = string;
/**
 * Wait for a specific element to be present. At least one finding field must be specified.
 */
export type ElementCriteria2 = {
  [k: string]: unknown;
};
/**
 * Open several surfaces concurrently (any mix of kinds). All descriptors launch in parallel; the step completes when every one is ready. Names must be unique within the array and across the context's open surfaces (checked at runtime). Device boots overlap — worth real wall-clock on 30–60s emulator starts.
 *
 * @minItems 1
 */
export type ParallelSurfaces = [
  AppDescriptor1 | BrowserDescriptor1 | ProcessDescriptor1,
  ...(AppDescriptor1 | BrowserDescriptor1 | ProcessDescriptor1)[],
];
export type DeviceByName1 = string;
/**
 * Wait for a specific element to be present. At least one finding field must be specified.
 */
export type ElementCriteria3 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition30 = string | [string, ...string[]];
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition31 = string | [string, ...string[]];
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing60 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing61 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing62 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing63 = {
  [k: string]: unknown;
};
/**
 * Load environment variables from the specified `.env` file.
 */
export type LoadVariables1 = string;
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition32 = string | [string, ...string[]];
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition33 = string | [string, ...string[]];
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing64 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing65 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing66 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing67 = {
  [k: string]: unknown;
};
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
 * Browser engine keyword. Targets that browser. Steps that can only ever act on a browser (not a background process) restrict the bare-string form to this enum, so a process name here is rejected at validation time instead of failing at runtime.
 */
export type SurfaceByBrowserEngine4 = "chrome" | "firefox" | "safari" | "webkit" | "edge";
/**
 * Which window to act on. Omit to use the active window.
 */
export type WindowTabSelector14 = ByIndex19 | ByName19 | ByCriteria19;
/**
 * Index in creation order. Negative counts from the end; `-1` is the newest.
 */
export type ByIndex19 = number;
/**
 * Name assigned when the window/tab was opened (goTo `newTab`/`newWindow`). The integer branch is listed first because Ajv validates with coerceTypes — string-first would coerce integer indexes into name strings.
 */
export type ByName19 = string;
/**
 * Which tab to act on. Omit to use the active tab. Without `window`, the selector searches every tab in creation order — including tabs the page opened itself.
 */
export type WindowTabSelector15 = ByIndex20 | ByName20 | ByCriteria20;
/**
 * Index in creation order. Negative counts from the end; `-1` is the newest.
 */
export type ByIndex20 = number;
/**
 * Name assigned when the window/tab was opened (goTo `newTab`/`newWindow`). The integer branch is listed first because Ajv validates with coerceTypes — string-first would coerce integer indexes into name strings.
 */
export type ByName20 = string;
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition34 = string | [string, ...string[]];
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition35 = string | [string, ...string[]];
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing68 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing69 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing70 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing71 = {
  [k: string]: unknown;
};
/**
 * Load a specific cookie from a file or environment variable into the browser.
 */
export type LoadCookie1 = CookieNameOrFilePath | LoadCookieDetailed;
/**
 * Name of the specific cookie to load from default location, or file path to cookie file.
 */
export type CookieNameOrFilePath = string;
export type LoadCookieDetailed = {
  [k: string]: unknown;
};
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition36 = string | [string, ...string[]];
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition37 = string | [string, ...string[]];
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing72 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing73 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing74 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing75 = {
  [k: string]: unknown;
};
/**
 * Swipe (or scroll) a surface in a direction or between two points. The direction is the virtual finger's motion: swiping up moves content up, revealing content further down the page. Works on app and browser surfaces.
 */
export type Swipe1 = SwipeSimple | SwipeDirectional | SwipePointToPoint;
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
export type SurfaceByBrowserEngine5 = "chrome" | "firefox" | "safari" | "webkit" | "edge";
/**
 * Which window to act on. Omit to use the active window.
 */
export type WindowTabSelector16 = ByIndex21 | ByName21 | ByCriteria21;
/**
 * Index in creation order. Negative counts from the end; `-1` is the newest.
 */
export type ByIndex21 = number;
/**
 * Name assigned when the window/tab was opened (goTo `newTab`/`newWindow`). The integer branch is listed first because Ajv validates with coerceTypes — string-first would coerce integer indexes into name strings.
 */
export type ByName21 = string;
/**
 * Which tab to act on. Omit to use the active tab. Without `window`, the selector searches every tab in creation order — including tabs the page opened itself.
 */
export type WindowTabSelector17 = ByIndex22 | ByName22 | ByCriteria22;
/**
 * Index in creation order. Negative counts from the end; `-1` is the newest.
 */
export type ByIndex22 = number;
/**
 * Name assigned when the window/tab was opened (goTo `newTab`/`newWindow`). The integer branch is listed first because Ajv validates with coerceTypes — string-first would coerce integer indexes into name strings.
 */
export type ByName22 = string;
/**
 * Which app window to act on. Omit to use the active window. Apps have windows, no tabs.
 */
export type AppWindowSelector5 = ByIndex23 | ByName23 | ByCriteria23;
/**
 * Index in creation order. Negative counts from the end; `-1` is the newest (e.g. a dialog the app just opened).
 */
export type ByIndex23 = number;
/**
 * Assigned window name. The integer branch is listed first because Ajv validates with coerceTypes — string-first would coerce integer indexes into name strings.
 */
export type ByName23 = string;
/**
 * Browser engine keyword. Targets that browser. Steps that can only ever act on a browser (not a background process) restrict the bare-string form to this enum, so a process name here is rejected at validation time instead of failing at runtime.
 */
export type SurfaceByBrowserEngine6 = "chrome" | "firefox" | "safari" | "webkit" | "edge";
/**
 * Which window to act on. Omit to use the active window.
 */
export type WindowTabSelector18 = ByIndex24 | ByName24 | ByCriteria24;
/**
 * Index in creation order. Negative counts from the end; `-1` is the newest.
 */
export type ByIndex24 = number;
/**
 * Name assigned when the window/tab was opened (goTo `newTab`/`newWindow`). The integer branch is listed first because Ajv validates with coerceTypes — string-first would coerce integer indexes into name strings.
 */
export type ByName24 = string;
/**
 * Which tab to act on. Omit to use the active tab. Without `window`, the selector searches every tab in creation order — including tabs the page opened itself.
 */
export type WindowTabSelector19 = ByIndex25 | ByName25 | ByCriteria25;
/**
 * Index in creation order. Negative counts from the end; `-1` is the newest.
 */
export type ByIndex25 = number;
/**
 * Name assigned when the window/tab was opened (goTo `newTab`/`newWindow`). The integer branch is listed first because Ajv validates with coerceTypes — string-first would coerce integer indexes into name strings.
 */
export type ByName25 = string;
/**
 * Which app window to act on. Omit to use the active window. Apps have windows, no tabs.
 */
export type AppWindowSelector6 = ByIndex26 | ByName26 | ByCriteria26;
/**
 * Index in creation order. Negative counts from the end; `-1` is the newest (e.g. a dialog the app just opened).
 */
export type ByIndex26 = number;
/**
 * Assigned window name. The integer branch is listed first because Ajv validates with coerceTypes — string-first would coerce integer indexes into name strings.
 */
export type ByName26 = string;
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition38 = string | [string, ...string[]];
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition39 = string | [string, ...string[]];
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing76 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing77 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing78 = {
  [k: string]: unknown;
};
/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). For step-level handlers, `continue`, `stop`, `retry`, and `goToStep` are evaluated at runtime; `goToTest` is validated but not yet executed (deferred at step scope). For test-level handlers, `continue`, `stop`, and `goToTest` are evaluated at runtime (test scope; `goToTest` jumps to a test within the spec), while `retry` and `goToStep` are not applicable at test scope.
 */
export type Routing79 = {
  [k: string]: unknown;
};
/**
 * Pause (in milliseconds) before performing the next action.
 */
export type Wait1 = WaitSimple | WaitEnvironmentVariable | WaitBoolean;
export type WaitSimple = number;
export type WaitEnvironmentVariable = string;
export type WaitBoolean = boolean;

export interface Common {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep;
  variables?: VariablesStep;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  if?: Condition;
  /**
   * Assertions for this step. As authored input, a custom condition expression (or array of expressions, combined with logical AND). In a test result, the runner replaces this with the array of articulated assertion records it evaluated (implicit then custom).
   */
  assertions?: Condition1 | Assertion[];
  /**
   * Routing entries evaluated when this step passes. The first entry whose `if` matches applies. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onPass?: Routing[];
  /**
   * Routing entries evaluated when this step fails. The first entry whose `if` matches applies; the default when none is set stops the test. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onFail?: Routing1[];
  /**
   * Routing entries evaluated when this step produces a warning. The first entry whose `if` matches applies. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onWarning?: Routing2[];
  /**
   * Routing entries evaluated when this step is skipped (reached but not run — unsafe-blocked or guard-`if` false). The first entry whose `if` matches applies. `continue`, `stop`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed. (`retry` is a no-op here — a step that never ran cannot be re-run.)
   */
  onSkip?: Routing3[];
  location?: SourceLocation;
  /**
   * Path, relative to the run's artifact directory (the report's `runDir`), of the screenshot captured automatically after this step. Always a non-empty, forward-slash, relative path. Present only in test results, when `autoScreenshot` is enabled and the capture succeeded. This is system-populated metadata and should not be set manually.
   */
  autoScreenshot?: string;
  /**
   * Total number of times this step ran (the initial attempt plus retries) when a routing `retry` action re-ran it. Present only in test results, and only when the step was retried at least once (so the value is always >= 2). This is system-populated metadata and should not be set manually.
   */
  attempts?: number;
  /**
   * Which visit of this step produced this report, when a routing goToStep re-ran it (the first visit omits this field). Present only in test results; system-populated.
   */
  visit?: number;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * An articulated assertion record produced by the runner for a step result. Each record names a single verification check, whether it passed, and the values it compared. The step's result is the roll-up of its assertion results (FAIL > WARNING > all-SKIPPED > PASS). System-populated; appears in test results, not in authored specs.
 */
export interface Assertion {
  /**
   * Human-readable articulation of the check, e.g. `exitCode in [0]`.
   */
  statement: string;
  /**
   * Who defined the assertion: `implicit` (runner-defined) or `custom` (user-defined).
   */
  source: "implicit" | "custom";
  /**
   * Outcome of evaluating the assertion.
   */
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  /**
   * The value (or values) the assertion expected. Optional.
   */
  expected?:
    | unknown[]
    | boolean
    | number
    | null
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * The value actually observed. Optional.
   */
  actual?:
    | unknown[]
    | boolean
    | number
    | null
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * Human-readable explanation of the outcome. Optional.
   */
  description?: string;
}
/**
 * Source location where this step was detected in the original file. This is system-populated metadata and should not be set manually.
 */
export interface SourceLocation {
  /**
   * 1-indexed line number in the source file where the step was detected.
   */
  line: number;
  /**
   * 0-indexed character offset from the start of the source file where the step begins.
   */
  startIndex: number;
  /**
   * 0-indexed character offset from the start of the source file where the step ends (exclusive).
   */
  endIndex: number;
}
export interface CheckLink {
  checkLink: CheckLink1;
  [k: string]: unknown;
}
/**
 * Check if an HTTP or HTTPS URL returns an acceptable status code from a GET request.
 */
export interface CheckLinkDetailed1 {
  /**
   * URL to check. Can be a full URL or a path. If a path is provided, `origin` must be specified.
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
   * Accepted status codes. If the specified URL returns a code other than what is specified here, the action fails.
   */
  statusCodes?: number | number[];
  /**
   * Additional HTTP headers to include in the request. Merged on top of Doc Detective's default browser-mimicking headers. Useful for sites behind bot protection or WAFs that allowlist specific headers (for example, a Cloudflare Access service token or a `Cookie` with a `cf_clearance` value).
   */
  headers?: RequestHeadersObject | RequestHeadersString;
}
/**
 * Headers to include in the HTTP request, in key/value format. Values must be strings.
 */
export interface RequestHeadersObject {
  [k: string]: string;
}
export interface Common1 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep1;
  variables?: VariablesStep1;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  if?: Condition2;
  /**
   * Assertions for this step. As authored input, a custom condition expression (or array of expressions, combined with logical AND). In a test result, the runner replaces this with the array of articulated assertion records it evaluated (implicit then custom).
   */
  assertions?: Condition3 | Assertion1[];
  /**
   * Routing entries evaluated when this step passes. The first entry whose `if` matches applies. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onPass?: Routing4[];
  /**
   * Routing entries evaluated when this step fails. The first entry whose `if` matches applies; the default when none is set stops the test. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onFail?: Routing5[];
  /**
   * Routing entries evaluated when this step produces a warning. The first entry whose `if` matches applies. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onWarning?: Routing6[];
  /**
   * Routing entries evaluated when this step is skipped (reached but not run — unsafe-blocked or guard-`if` false). The first entry whose `if` matches applies. `continue`, `stop`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed. (`retry` is a no-op here — a step that never ran cannot be re-run.)
   */
  onSkip?: Routing7[];
  location?: SourceLocation1;
  /**
   * Path, relative to the run's artifact directory (the report's `runDir`), of the screenshot captured automatically after this step. Always a non-empty, forward-slash, relative path. Present only in test results, when `autoScreenshot` is enabled and the capture succeeded. This is system-populated metadata and should not be set manually.
   */
  autoScreenshot?: string;
  /**
   * Total number of times this step ran (the initial attempt plus retries) when a routing `retry` action re-ran it. Present only in test results, and only when the step was retried at least once (so the value is always >= 2). This is system-populated metadata and should not be set manually.
   */
  attempts?: number;
  /**
   * Which visit of this step produced this report, when a routing goToStep re-ran it (the first visit omits this field). Present only in test results; system-populated.
   */
  visit?: number;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep1 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep1`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep1 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep1`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * An articulated assertion record produced by the runner for a step result. Each record names a single verification check, whether it passed, and the values it compared. The step's result is the roll-up of its assertion results (FAIL > WARNING > all-SKIPPED > PASS). System-populated; appears in test results, not in authored specs.
 */
export interface Assertion1 {
  /**
   * Human-readable articulation of the check, e.g. `exitCode in [0]`.
   */
  statement: string;
  /**
   * Who defined the assertion: `implicit` (runner-defined) or `custom` (user-defined).
   */
  source: "implicit" | "custom";
  /**
   * Outcome of evaluating the assertion.
   */
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  /**
   * The value (or values) the assertion expected. Optional.
   */
  expected?:
    | unknown[]
    | boolean
    | number
    | null
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * The value actually observed. Optional.
   */
  actual?:
    | unknown[]
    | boolean
    | number
    | null
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * Human-readable explanation of the outcome. Optional.
   */
  description?: string;
}
/**
 * Source location where this step was detected in the original file. This is system-populated metadata and should not be set manually.
 */
export interface SourceLocation1 {
  /**
   * 1-indexed line number in the source file where the step was detected.
   */
  line: number;
  /**
   * 0-indexed character offset from the start of the source file where the step begins.
   */
  startIndex: number;
  /**
   * 0-indexed character offset from the start of the source file where the step ends (exclusive).
   */
  endIndex: number;
}
export interface Click {
  click: Click1;
  [k: string]: unknown;
}
export interface Common2 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep2;
  variables?: VariablesStep2;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  if?: Condition4;
  /**
   * Assertions for this step. As authored input, a custom condition expression (or array of expressions, combined with logical AND). In a test result, the runner replaces this with the array of articulated assertion records it evaluated (implicit then custom).
   */
  assertions?: Condition5 | Assertion2[];
  /**
   * Routing entries evaluated when this step passes. The first entry whose `if` matches applies. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onPass?: Routing8[];
  /**
   * Routing entries evaluated when this step fails. The first entry whose `if` matches applies; the default when none is set stops the test. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onFail?: Routing9[];
  /**
   * Routing entries evaluated when this step produces a warning. The first entry whose `if` matches applies. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onWarning?: Routing10[];
  /**
   * Routing entries evaluated when this step is skipped (reached but not run — unsafe-blocked or guard-`if` false). The first entry whose `if` matches applies. `continue`, `stop`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed. (`retry` is a no-op here — a step that never ran cannot be re-run.)
   */
  onSkip?: Routing11[];
  location?: SourceLocation2;
  /**
   * Path, relative to the run's artifact directory (the report's `runDir`), of the screenshot captured automatically after this step. Always a non-empty, forward-slash, relative path. Present only in test results, when `autoScreenshot` is enabled and the capture succeeded. This is system-populated metadata and should not be set manually.
   */
  autoScreenshot?: string;
  /**
   * Total number of times this step ran (the initial attempt plus retries) when a routing `retry` action re-ran it. Present only in test results, and only when the step was retried at least once (so the value is always >= 2). This is system-populated metadata and should not be set manually.
   */
  attempts?: number;
  /**
   * Which visit of this step produced this report, when a routing goToStep re-ran it (the first visit omits this field). Present only in test results; system-populated.
   */
  visit?: number;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep2 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep2`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep2 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep2`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * An articulated assertion record produced by the runner for a step result. Each record names a single verification check, whether it passed, and the values it compared. The step's result is the roll-up of its assertion results (FAIL > WARNING > all-SKIPPED > PASS). System-populated; appears in test results, not in authored specs.
 */
export interface Assertion2 {
  /**
   * Human-readable articulation of the check, e.g. `exitCode in [0]`.
   */
  statement: string;
  /**
   * Who defined the assertion: `implicit` (runner-defined) or `custom` (user-defined).
   */
  source: "implicit" | "custom";
  /**
   * Outcome of evaluating the assertion.
   */
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  /**
   * The value (or values) the assertion expected. Optional.
   */
  expected?:
    | unknown[]
    | boolean
    | number
    | null
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * The value actually observed. Optional.
   */
  actual?:
    | unknown[]
    | boolean
    | number
    | null
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * Human-readable explanation of the outcome. Optional.
   */
  description?: string;
}
/**
 * Source location where this step was detected in the original file. This is system-populated metadata and should not be set manually.
 */
export interface SourceLocation2 {
  /**
   * 1-indexed line number in the source file where the step was detected.
   */
  line: number;
  /**
   * 0-indexed character offset from the start of the source file where the step begins.
   */
  startIndex: number;
  /**
   * 0-indexed character offset from the start of the source file where the step ends (exclusive).
   */
  endIndex: number;
}
export interface Find {
  find: Find1;
  [k: string]: unknown;
}
export interface Common3 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep3;
  variables?: VariablesStep3;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  if?: Condition6;
  /**
   * Assertions for this step. As authored input, a custom condition expression (or array of expressions, combined with logical AND). In a test result, the runner replaces this with the array of articulated assertion records it evaluated (implicit then custom).
   */
  assertions?: Condition7 | Assertion3[];
  /**
   * Routing entries evaluated when this step passes. The first entry whose `if` matches applies. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onPass?: Routing12[];
  /**
   * Routing entries evaluated when this step fails. The first entry whose `if` matches applies; the default when none is set stops the test. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onFail?: Routing13[];
  /**
   * Routing entries evaluated when this step produces a warning. The first entry whose `if` matches applies. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onWarning?: Routing14[];
  /**
   * Routing entries evaluated when this step is skipped (reached but not run — unsafe-blocked or guard-`if` false). The first entry whose `if` matches applies. `continue`, `stop`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed. (`retry` is a no-op here — a step that never ran cannot be re-run.)
   */
  onSkip?: Routing15[];
  location?: SourceLocation3;
  /**
   * Path, relative to the run's artifact directory (the report's `runDir`), of the screenshot captured automatically after this step. Always a non-empty, forward-slash, relative path. Present only in test results, when `autoScreenshot` is enabled and the capture succeeded. This is system-populated metadata and should not be set manually.
   */
  autoScreenshot?: string;
  /**
   * Total number of times this step ran (the initial attempt plus retries) when a routing `retry` action re-ran it. Present only in test results, and only when the step was retried at least once (so the value is always >= 2). This is system-populated metadata and should not be set manually.
   */
  attempts?: number;
  /**
   * Which visit of this step produced this report, when a routing goToStep re-ran it (the first visit omits this field). Present only in test results; system-populated.
   */
  visit?: number;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep3 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep3`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep3 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep3`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * An articulated assertion record produced by the runner for a step result. Each record names a single verification check, whether it passed, and the values it compared. The step's result is the roll-up of its assertion results (FAIL > WARNING > all-SKIPPED > PASS). System-populated; appears in test results, not in authored specs.
 */
export interface Assertion3 {
  /**
   * Human-readable articulation of the check, e.g. `exitCode in [0]`.
   */
  statement: string;
  /**
   * Who defined the assertion: `implicit` (runner-defined) or `custom` (user-defined).
   */
  source: "implicit" | "custom";
  /**
   * Outcome of evaluating the assertion.
   */
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  /**
   * The value (or values) the assertion expected. Optional.
   */
  expected?:
    | unknown[]
    | boolean
    | number
    | null
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * The value actually observed. Optional.
   */
  actual?:
    | unknown[]
    | boolean
    | number
    | null
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * Human-readable explanation of the outcome. Optional.
   */
  description?: string;
}
/**
 * Source location where this step was detected in the original file. This is system-populated metadata and should not be set manually.
 */
export interface SourceLocation3 {
  /**
   * 1-indexed line number in the source file where the step was detected.
   */
  line: number;
  /**
   * 0-indexed character offset from the start of the source file where the step begins.
   */
  startIndex: number;
  /**
   * 0-indexed character offset from the start of the source file where the step ends (exclusive).
   */
  endIndex: number;
}
export interface GoTo {
  goTo: GoTo1;
  [k: string]: unknown;
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
export interface NewTabAndNewWindowAreMutuallyExclusive {
  [k: string]: unknown;
}
export interface NewTabConflictsWithASurfaceTabSelector {
  [k: string]: unknown;
}
export interface NewWindowConflictsWithASurfaceWindowOrTabSelector {
  [k: string]: unknown;
}
export interface Common4 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep4;
  variables?: VariablesStep4;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  if?: Condition8;
  /**
   * Assertions for this step. As authored input, a custom condition expression (or array of expressions, combined with logical AND). In a test result, the runner replaces this with the array of articulated assertion records it evaluated (implicit then custom).
   */
  assertions?: Condition9 | Assertion4[];
  /**
   * Routing entries evaluated when this step passes. The first entry whose `if` matches applies. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onPass?: Routing16[];
  /**
   * Routing entries evaluated when this step fails. The first entry whose `if` matches applies; the default when none is set stops the test. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onFail?: Routing17[];
  /**
   * Routing entries evaluated when this step produces a warning. The first entry whose `if` matches applies. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onWarning?: Routing18[];
  /**
   * Routing entries evaluated when this step is skipped (reached but not run — unsafe-blocked or guard-`if` false). The first entry whose `if` matches applies. `continue`, `stop`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed. (`retry` is a no-op here — a step that never ran cannot be re-run.)
   */
  onSkip?: Routing19[];
  location?: SourceLocation4;
  /**
   * Path, relative to the run's artifact directory (the report's `runDir`), of the screenshot captured automatically after this step. Always a non-empty, forward-slash, relative path. Present only in test results, when `autoScreenshot` is enabled and the capture succeeded. This is system-populated metadata and should not be set manually.
   */
  autoScreenshot?: string;
  /**
   * Total number of times this step ran (the initial attempt plus retries) when a routing `retry` action re-ran it. Present only in test results, and only when the step was retried at least once (so the value is always >= 2). This is system-populated metadata and should not be set manually.
   */
  attempts?: number;
  /**
   * Which visit of this step produced this report, when a routing goToStep re-ran it (the first visit omits this field). Present only in test results; system-populated.
   */
  visit?: number;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep4 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep4`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep4 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep4`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * An articulated assertion record produced by the runner for a step result. Each record names a single verification check, whether it passed, and the values it compared. The step's result is the roll-up of its assertion results (FAIL > WARNING > all-SKIPPED > PASS). System-populated; appears in test results, not in authored specs.
 */
export interface Assertion4 {
  /**
   * Human-readable articulation of the check, e.g. `exitCode in [0]`.
   */
  statement: string;
  /**
   * Who defined the assertion: `implicit` (runner-defined) or `custom` (user-defined).
   */
  source: "implicit" | "custom";
  /**
   * Outcome of evaluating the assertion.
   */
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  /**
   * The value (or values) the assertion expected. Optional.
   */
  expected?:
    | unknown[]
    | boolean
    | number
    | null
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * The value actually observed. Optional.
   */
  actual?:
    | unknown[]
    | boolean
    | number
    | null
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * Human-readable explanation of the outcome. Optional.
   */
  description?: string;
}
/**
 * Source location where this step was detected in the original file. This is system-populated metadata and should not be set manually.
 */
export interface SourceLocation4 {
  /**
   * 1-indexed line number in the source file where the step was detected.
   */
  line: number;
  /**
   * 0-indexed character offset from the start of the source file where the step begins.
   */
  startIndex: number;
  /**
   * 0-indexed character offset from the start of the source file where the step ends (exclusive).
   */
  endIndex: number;
}
export interface HttpRequest {
  httpRequest: HttpRequest1;
  [k: string]: unknown;
}
export interface Common5 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep5;
  variables?: VariablesStep5;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  if?: Condition10;
  /**
   * Assertions for this step. As authored input, a custom condition expression (or array of expressions, combined with logical AND). In a test result, the runner replaces this with the array of articulated assertion records it evaluated (implicit then custom).
   */
  assertions?: Condition11 | Assertion5[];
  /**
   * Routing entries evaluated when this step passes. The first entry whose `if` matches applies. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onPass?: Routing20[];
  /**
   * Routing entries evaluated when this step fails. The first entry whose `if` matches applies; the default when none is set stops the test. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onFail?: Routing21[];
  /**
   * Routing entries evaluated when this step produces a warning. The first entry whose `if` matches applies. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onWarning?: Routing22[];
  /**
   * Routing entries evaluated when this step is skipped (reached but not run — unsafe-blocked or guard-`if` false). The first entry whose `if` matches applies. `continue`, `stop`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed. (`retry` is a no-op here — a step that never ran cannot be re-run.)
   */
  onSkip?: Routing23[];
  location?: SourceLocation5;
  /**
   * Path, relative to the run's artifact directory (the report's `runDir`), of the screenshot captured automatically after this step. Always a non-empty, forward-slash, relative path. Present only in test results, when `autoScreenshot` is enabled and the capture succeeded. This is system-populated metadata and should not be set manually.
   */
  autoScreenshot?: string;
  /**
   * Total number of times this step ran (the initial attempt plus retries) when a routing `retry` action re-ran it. Present only in test results, and only when the step was retried at least once (so the value is always >= 2). This is system-populated metadata and should not be set manually.
   */
  attempts?: number;
  /**
   * Which visit of this step produced this report, when a routing goToStep re-ran it (the first visit omits this field). Present only in test results; system-populated.
   */
  visit?: number;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep5 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep5`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep5 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep5`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * An articulated assertion record produced by the runner for a step result. Each record names a single verification check, whether it passed, and the values it compared. The step's result is the roll-up of its assertion results (FAIL > WARNING > all-SKIPPED > PASS). System-populated; appears in test results, not in authored specs.
 */
export interface Assertion5 {
  /**
   * Human-readable articulation of the check, e.g. `exitCode in [0]`.
   */
  statement: string;
  /**
   * Who defined the assertion: `implicit` (runner-defined) or `custom` (user-defined).
   */
  source: "implicit" | "custom";
  /**
   * Outcome of evaluating the assertion.
   */
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  /**
   * The value (or values) the assertion expected. Optional.
   */
  expected?:
    | unknown[]
    | boolean
    | number
    | null
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * The value actually observed. Optional.
   */
  actual?:
    | unknown[]
    | boolean
    | number
    | null
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * Human-readable explanation of the outcome. Optional.
   */
  description?: string;
}
/**
 * Source location where this step was detected in the original file. This is system-populated metadata and should not be set manually.
 */
export interface SourceLocation5 {
  /**
   * 1-indexed line number in the source file where the step was detected.
   */
  line: number;
  /**
   * 0-indexed character offset from the start of the source file where the step begins.
   */
  startIndex: number;
  /**
   * 0-indexed character offset from the start of the source file where the step ends (exclusive).
   */
  endIndex: number;
}
export interface RunShell {
  runShell: RunShell1;
  [k: string]: unknown;
}
export interface RunShellCommandDetailed {
  /**
   * Command to perform in the machine's default shell.
   */
  command: string;
  /**
   * Arguments for the command.
   */
  args?: string[];
  /**
   * Working directory for the command.
   */
  workingDirectory?: string;
  /**
   * Expected exit codes of the command. If the command's actual exit code isn't in this list, the step fails.
   */
  exitCodes?: number[];
  /**
   * Content expected in the command's stdout or stderr. If the expected content can't be found in the command's stdout or stderr, the step fails. Supports strings and regular expressions. To use a regular expression, the string must start and end with a forward slash, like in `/^hello-world.* /`.
   */
  stdio?: string;
  /**
   * File path to save the command's output, relative to `directory`.
   */
  path?: string;
  /**
   * Directory to save the command's output. If the directory doesn't exist, creates the directory. If not specified, the directory is your media directory.
   */
  directory?: string;
  /**
   * Allowed variation as a fraction (0 to 1) of text different between the current output and previously saved output. For example, 0.1 means 10%. If the difference between the current output and the previous output is greater than `maxVariation`, the step fails. If output doesn't exist at `path`, this value is ignored.
   */
  maxVariation?: number;
  /**
   * If `true`, overwrites the existing output at `path` if it exists.
   * If `aboveVariation`, overwrites the existing output at `path` if the difference between the new output and the existing output is greater than `maxVariation`.
   */
  overwrite?: "true" | "false" | "aboveVariation";
  /**
   * Max time in milliseconds the command is allowed to run. If the command runs longer than this, the step fails. When `background` is set, this is instead the max time to wait for `background.waitUntil` to be satisfied before the step fails.
   */
  timeout?: number;
  /**
   * Start the command as a long-running background process and return as soon as it is ready, instead of waiting for it to exit. When set, `exitCodes`, `stdio`, and output saving (`path`, `directory`, `maxVariation`, `overwrite`) are ignored, and `timeout` is the max time to wait for `waitUntil`. The process is owned by the run and is stopped by a `closeSurface` step or automatically when the run finishes.
   */
  background?: {
    /**
     * Unique identifier for this background process within the run. Reference it from a `closeSurface` step to stop it.
     */
    name: string;
    /**
     * Conditions that must all be met before the process is considered ready and the step proceeds. Omit to consider the process ready as soon as it is spawned. Specify any combination; every condition given must pass before `timeout` elapses. Note: a process that forks a daemon and then exits (common for some Docker images and databases) is treated as having exited before becoming ready and the step fails — use `port`, `httpGet`, or `delayMs` for those rather than a condition that depends on the foreground process staying alive.
     */
    waitUntil?: {
      /**
       * Wait until this TCP port accepts connections on localhost.
       */
      port?: number;
      /**
       * Wait until the process's output contains this content. Searches both stdout and stderr. Supports strings and regular expressions. To use a regular expression, the string must start and end with a forward slash, like in `/ready on \d+/`.
       */
      stdio?: string;
      /**
       * Wait until an HTTP GET request to this URL returns a 2xx status.
       */
      httpGet?: string;
      /**
       * Wait at least this many milliseconds.
       */
      delayMs?: number;
    };
    /**
     * Run the process in a pseudo-terminal (PTY) instead of a pipe, so full-screen/interactive TUIs (those that check `isTTY`) render and accept keystrokes. Requires the PTY backend `@homebridge/node-pty-prebuilt-multiarch` to be installed (`npm install @homebridge/node-pty-prebuilt-multiarch`); it is not bundled, and if it is unavailable the step is skipped. `stdout` and `stderr` are merged into one stream in PTY mode. PTY output includes raw ANSI escape sequences (colors, cursor movement); `waitUntil.stdio` patterns should target text that renders without interleaved control codes, or use a regex that tolerates them.
     */
    tty?: boolean;
  };
}
export interface Common6 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep6;
  variables?: VariablesStep6;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  if?: Condition12;
  /**
   * Assertions for this step. As authored input, a custom condition expression (or array of expressions, combined with logical AND). In a test result, the runner replaces this with the array of articulated assertion records it evaluated (implicit then custom).
   */
  assertions?: Condition13 | Assertion6[];
  /**
   * Routing entries evaluated when this step passes. The first entry whose `if` matches applies. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onPass?: Routing24[];
  /**
   * Routing entries evaluated when this step fails. The first entry whose `if` matches applies; the default when none is set stops the test. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onFail?: Routing25[];
  /**
   * Routing entries evaluated when this step produces a warning. The first entry whose `if` matches applies. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onWarning?: Routing26[];
  /**
   * Routing entries evaluated when this step is skipped (reached but not run — unsafe-blocked or guard-`if` false). The first entry whose `if` matches applies. `continue`, `stop`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed. (`retry` is a no-op here — a step that never ran cannot be re-run.)
   */
  onSkip?: Routing27[];
  location?: SourceLocation6;
  /**
   * Path, relative to the run's artifact directory (the report's `runDir`), of the screenshot captured automatically after this step. Always a non-empty, forward-slash, relative path. Present only in test results, when `autoScreenshot` is enabled and the capture succeeded. This is system-populated metadata and should not be set manually.
   */
  autoScreenshot?: string;
  /**
   * Total number of times this step ran (the initial attempt plus retries) when a routing `retry` action re-ran it. Present only in test results, and only when the step was retried at least once (so the value is always >= 2). This is system-populated metadata and should not be set manually.
   */
  attempts?: number;
  /**
   * Which visit of this step produced this report, when a routing goToStep re-ran it (the first visit omits this field). Present only in test results; system-populated.
   */
  visit?: number;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep6 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep6`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep6 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep6`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * An articulated assertion record produced by the runner for a step result. Each record names a single verification check, whether it passed, and the values it compared. The step's result is the roll-up of its assertion results (FAIL > WARNING > all-SKIPPED > PASS). System-populated; appears in test results, not in authored specs.
 */
export interface Assertion6 {
  /**
   * Human-readable articulation of the check, e.g. `exitCode in [0]`.
   */
  statement: string;
  /**
   * Who defined the assertion: `implicit` (runner-defined) or `custom` (user-defined).
   */
  source: "implicit" | "custom";
  /**
   * Outcome of evaluating the assertion.
   */
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  /**
   * The value (or values) the assertion expected. Optional.
   */
  expected?:
    | unknown[]
    | boolean
    | number
    | null
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * The value actually observed. Optional.
   */
  actual?:
    | unknown[]
    | boolean
    | number
    | null
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * Human-readable explanation of the outcome. Optional.
   */
  description?: string;
}
/**
 * Source location where this step was detected in the original file. This is system-populated metadata and should not be set manually.
 */
export interface SourceLocation6 {
  /**
   * 1-indexed line number in the source file where the step was detected.
   */
  line: number;
  /**
   * 0-indexed character offset from the start of the source file where the step begins.
   */
  startIndex: number;
  /**
   * 0-indexed character offset from the start of the source file where the step ends (exclusive).
   */
  endIndex: number;
}
export interface RunCode {
  runCode: RunCode1;
  [k: string]: unknown;
}
export interface RunCodeDetailed {
  /**
   * Language of the code to run.
   */
  language: "python" | "bash" | "javascript";
  /**
   * Code to run.
   */
  code: string;
  /**
   * Arguments for the command.
   */
  args?: string[];
  /**
   * Working directory for the command.
   */
  workingDirectory?: string;
  /**
   * Expected exit codes of the command. If the command's actual exit code isn't in this list, the step fails.
   */
  exitCodes?: number[];
  /**
   * Content expected in the command's output. If the expected content can't be found in the command's output (either stdout or stderr), the step fails. Supports strings and regular expressions. To use a regular expression, the string must start and end with a forward slash, like in `/^hello-world.* /`.
   */
  stdio?: string;
  /**
   * File path to save the command's output, relative to `directory`.
   */
  path?: string;
  /**
   * Directory to save the command's output. If the directory doesn't exist, creates the directory. If not specified, the directory is your media directory.
   */
  directory?: string;
  /**
   * Allowed variation as a fraction (0 to 1) of text different between the current output and previously saved output. For example, 0.1 means 10%. If the difference between the current output and the previous output is greater than `maxVariation`, the step fails. If output doesn't exist at `path`, this value is ignored.
   */
  maxVariation?: number;
  /**
   * If `true`, overwrites the existing output at `path` if it exists.
   * If `aboveVariation`, overwrites the existing output at `path` if the difference between the new output and the existing output is greater than `maxVariation`.
   */
  overwrite?: "true" | "false" | "aboveVariation";
  /**
   * Max time in milliseconds the command is allowed to run. If the command runs longer than this, the step fails. When `background` is set, this is instead the max time to wait for `background.waitUntil` to be satisfied before the step fails.
   */
  timeout?: number;
  /**
   * Start the code as a long-running background process and return as soon as it is ready, instead of waiting for it to exit. When set, `exitCodes`, `stdio`, and output saving (`path`, `directory`, `maxVariation`, `overwrite`) are ignored, and `timeout` is the max time to wait for `waitUntil`. The process is owned by the run and is stopped by a `closeSurface` step or automatically when the run finishes.
   */
  background?: {
    /**
     * Unique identifier for this background process within the run. Reference it from a `closeSurface` step to stop it.
     */
    name: string;
    /**
     * Conditions that must all be met before the process is considered ready and the step proceeds. Omit to consider the process ready as soon as it is spawned. Specify any combination; every condition given must pass before `timeout` elapses. Note: a process that forks a daemon and then exits (common for some Docker images and databases) is treated as having exited before becoming ready and the step fails — use `port`, `httpGet`, or `delayMs` for those rather than a condition that depends on the foreground process staying alive.
     */
    waitUntil?: {
      /**
       * Wait until this TCP port accepts connections on localhost.
       */
      port?: number;
      /**
       * Wait until the process's output contains this content. Searches both stdout and stderr. Supports strings and regular expressions. To use a regular expression, the string must start and end with a forward slash, like in `/ready on \d+/`.
       */
      stdio?: string;
      /**
       * Wait until an HTTP GET request to this URL returns a 2xx status.
       */
      httpGet?: string;
      /**
       * Wait at least this many milliseconds.
       */
      delayMs?: number;
    };
    /**
     * Run the process in a pseudo-terminal (PTY) instead of a pipe, so full-screen/interactive TUIs (those that check `isTTY`) render and accept keystrokes. Requires the PTY backend `@homebridge/node-pty-prebuilt-multiarch` to be installed (`npm install @homebridge/node-pty-prebuilt-multiarch`); it is not bundled, and if it is unavailable the step is skipped. `stdout` and `stderr` are merged into one stream in PTY mode. PTY output includes raw ANSI escape sequences (colors, cursor movement); `waitUntil.stdio` patterns should target text that renders without interleaved control codes, or use a regex that tolerates them.
     */
    tty?: boolean;
  };
  [k: string]: unknown;
}
export interface Common7 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep7;
  variables?: VariablesStep7;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  if?: Condition14;
  /**
   * Assertions for this step. As authored input, a custom condition expression (or array of expressions, combined with logical AND). In a test result, the runner replaces this with the array of articulated assertion records it evaluated (implicit then custom).
   */
  assertions?: Condition15 | Assertion7[];
  /**
   * Routing entries evaluated when this step passes. The first entry whose `if` matches applies. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onPass?: Routing28[];
  /**
   * Routing entries evaluated when this step fails. The first entry whose `if` matches applies; the default when none is set stops the test. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onFail?: Routing29[];
  /**
   * Routing entries evaluated when this step produces a warning. The first entry whose `if` matches applies. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onWarning?: Routing30[];
  /**
   * Routing entries evaluated when this step is skipped (reached but not run — unsafe-blocked or guard-`if` false). The first entry whose `if` matches applies. `continue`, `stop`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed. (`retry` is a no-op here — a step that never ran cannot be re-run.)
   */
  onSkip?: Routing31[];
  location?: SourceLocation7;
  /**
   * Path, relative to the run's artifact directory (the report's `runDir`), of the screenshot captured automatically after this step. Always a non-empty, forward-slash, relative path. Present only in test results, when `autoScreenshot` is enabled and the capture succeeded. This is system-populated metadata and should not be set manually.
   */
  autoScreenshot?: string;
  /**
   * Total number of times this step ran (the initial attempt plus retries) when a routing `retry` action re-ran it. Present only in test results, and only when the step was retried at least once (so the value is always >= 2). This is system-populated metadata and should not be set manually.
   */
  attempts?: number;
  /**
   * Which visit of this step produced this report, when a routing goToStep re-ran it (the first visit omits this field). Present only in test results; system-populated.
   */
  visit?: number;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep7 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep7`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep7 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep7`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * An articulated assertion record produced by the runner for a step result. Each record names a single verification check, whether it passed, and the values it compared. The step's result is the roll-up of its assertion results (FAIL > WARNING > all-SKIPPED > PASS). System-populated; appears in test results, not in authored specs.
 */
export interface Assertion7 {
  /**
   * Human-readable articulation of the check, e.g. `exitCode in [0]`.
   */
  statement: string;
  /**
   * Who defined the assertion: `implicit` (runner-defined) or `custom` (user-defined).
   */
  source: "implicit" | "custom";
  /**
   * Outcome of evaluating the assertion.
   */
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  /**
   * The value (or values) the assertion expected. Optional.
   */
  expected?:
    | unknown[]
    | boolean
    | number
    | null
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * The value actually observed. Optional.
   */
  actual?:
    | unknown[]
    | boolean
    | number
    | null
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * Human-readable explanation of the outcome. Optional.
   */
  description?: string;
}
/**
 * Source location where this step was detected in the original file. This is system-populated metadata and should not be set manually.
 */
export interface SourceLocation7 {
  /**
   * 1-indexed line number in the source file where the step was detected.
   */
  line: number;
  /**
   * 0-indexed character offset from the start of the source file where the step begins.
   */
  startIndex: number;
  /**
   * 0-indexed character offset from the start of the source file where the step ends (exclusive).
   */
  endIndex: number;
}
export interface RunBrowserScript {
  runBrowserScript: RunBrowserScript1;
  [k: string]: unknown;
}
export interface RunBrowserScriptDetailed {
  /**
   * The browser window/tab the script runs in. Omit to run in the active tab. The targeted tab stays focused afterward.
   */
  surface?: SurfaceByBrowserEngine1 | BrowserSurface1;
  /**
   * JavaScript to evaluate in the browser page context. Supports `return` to capture a value into `outputs.result`. The script reads arguments supplied in `args` through the `arguments` object (`arguments[0]`, `arguments[1]`, and so on).
   */
  script: string;
  /**
   * Arguments passed positionally to the script and exposed through the `arguments` object. Each item may be any JSON-serializable value (string, number, boolean, null, object, or array), matching what `executeScript` accepts.
   */
  args?: unknown[];
  /**
   * Content expected in the script's serialized return value. Doc Detective serializes non-string return values to JSON before matching. If the serialized return value doesn't contain the expected content, the step fails. Supports strings and regular expressions. To use a regular expression, the string must start and end with a forward slash, like in `/^hello-world.* /`.
   */
  output?: string;
  /**
   * File path to save the script's serialized return value, relative to `directory`.
   */
  path?: string;
  /**
   * Directory to save the script's return value. If the directory doesn't exist, creates the directory. If not specified, the directory is your media directory.
   */
  directory?: string;
  /**
   * Allowed variation as a fraction (0 to 1) of text different between the current return value and previously saved value. For example, 0.1 means 10%. If the difference between the current value and the previous value is greater than `maxVariation`, the step returns a warning. If no output exists at `path`, Doc Detective ignores this value.
   */
  maxVariation?: number;
  /**
   * If `true`, overwrites the existing output at `path` if it exists.
   * If `aboveVariation`, overwrites the existing output at `path` if the difference between the new output and the existing output is greater than `maxVariation`.
   */
  overwrite?: "true" | "false" | "aboveVariation";
  /**
   * Maximum time in milliseconds the script may run. If the script runs longer than this, the step fails.
   */
  timeout?: number;
}
export interface BrowserSurface1 {
  /**
   * Browser engine. Selects the browser surface with that engine (or the one named by `name`). A goTo step opens the browser if it isn't open yet — you can also open one explicitly with `startSurface`; other steps require it to already be open.
   */
  browser: "chrome" | "firefox" | "safari" | "webkit" | "edge";
  /**
   * Name of the browser surface. Defaults to the engine name (the context's default browser registers under its engine). Assign distinct names to drive multiple browsers at once, including several of the same engine.
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
export interface Common8 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep8;
  variables?: VariablesStep8;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  if?: Condition16;
  /**
   * Assertions for this step. As authored input, a custom condition expression (or array of expressions, combined with logical AND). In a test result, the runner replaces this with the array of articulated assertion records it evaluated (implicit then custom).
   */
  assertions?: Condition17 | Assertion8[];
  /**
   * Routing entries evaluated when this step passes. The first entry whose `if` matches applies. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onPass?: Routing32[];
  /**
   * Routing entries evaluated when this step fails. The first entry whose `if` matches applies; the default when none is set stops the test. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onFail?: Routing33[];
  /**
   * Routing entries evaluated when this step produces a warning. The first entry whose `if` matches applies. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onWarning?: Routing34[];
  /**
   * Routing entries evaluated when this step is skipped (reached but not run — unsafe-blocked or guard-`if` false). The first entry whose `if` matches applies. `continue`, `stop`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed. (`retry` is a no-op here — a step that never ran cannot be re-run.)
   */
  onSkip?: Routing35[];
  location?: SourceLocation8;
  /**
   * Path, relative to the run's artifact directory (the report's `runDir`), of the screenshot captured automatically after this step. Always a non-empty, forward-slash, relative path. Present only in test results, when `autoScreenshot` is enabled and the capture succeeded. This is system-populated metadata and should not be set manually.
   */
  autoScreenshot?: string;
  /**
   * Total number of times this step ran (the initial attempt plus retries) when a routing `retry` action re-ran it. Present only in test results, and only when the step was retried at least once (so the value is always >= 2). This is system-populated metadata and should not be set manually.
   */
  attempts?: number;
  /**
   * Which visit of this step produced this report, when a routing goToStep re-ran it (the first visit omits this field). Present only in test results; system-populated.
   */
  visit?: number;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep8 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep8`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep8 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep8`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * An articulated assertion record produced by the runner for a step result. Each record names a single verification check, whether it passed, and the values it compared. The step's result is the roll-up of its assertion results (FAIL > WARNING > all-SKIPPED > PASS). System-populated; appears in test results, not in authored specs.
 */
export interface Assertion8 {
  /**
   * Human-readable articulation of the check, e.g. `exitCode in [0]`.
   */
  statement: string;
  /**
   * Who defined the assertion: `implicit` (runner-defined) or `custom` (user-defined).
   */
  source: "implicit" | "custom";
  /**
   * Outcome of evaluating the assertion.
   */
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  /**
   * The value (or values) the assertion expected. Optional.
   */
  expected?:
    | unknown[]
    | boolean
    | number
    | null
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * The value actually observed. Optional.
   */
  actual?:
    | unknown[]
    | boolean
    | number
    | null
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * Human-readable explanation of the outcome. Optional.
   */
  description?: string;
}
/**
 * Source location where this step was detected in the original file. This is system-populated metadata and should not be set manually.
 */
export interface SourceLocation8 {
  /**
   * 1-indexed line number in the source file where the step was detected.
   */
  line: number;
  /**
   * 0-indexed character offset from the start of the source file where the step begins.
   */
  startIndex: number;
  /**
   * 0-indexed character offset from the start of the source file where the step ends (exclusive).
   */
  endIndex: number;
}
export interface Type {
  type: TypeKeys;
  [k: string]: unknown;
}
export interface ProcessSurface {
  /**
   * Name of a background process started by a runShell/runCode `background` step.
   */
  process: string;
}
export interface BrowserSurface2 {
  /**
   * Browser engine. Selects the browser surface with that engine (or the one named by `name`). A goTo step opens the browser if it isn't open yet — you can also open one explicitly with `startSurface`; other steps require it to already be open.
   */
  browser: "chrome" | "firefox" | "safari" | "webkit" | "edge";
  /**
   * Name of the browser surface. Defaults to the engine name (the context's default browser registers under its engine). Assign distinct names to drive multiple browsers at once, including several of the same engine.
   */
  name?: string;
  window?: WindowTabSelector4;
  tab?: WindowTabSelector5;
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
export interface ByCriteria5 {
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
export interface ByCriteria6 {
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
  find?: ElementCriteria;
}
export interface AppReadiness {
  /**
   * Fixed delay (ms).
   */
  delayMs?: number;
  find?: ElementCriteria1;
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
export interface AnAppSurfaceTakesAppReadiness {
  [k: string]: unknown;
}
export interface ABrowserEngineStringSurfaceTakesBrowserReadiness {
  [k: string]: unknown;
}
export interface Common9 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep9;
  variables?: VariablesStep9;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  if?: Condition18;
  /**
   * Assertions for this step. As authored input, a custom condition expression (or array of expressions, combined with logical AND). In a test result, the runner replaces this with the array of articulated assertion records it evaluated (implicit then custom).
   */
  assertions?: Condition19 | Assertion9[];
  /**
   * Routing entries evaluated when this step passes. The first entry whose `if` matches applies. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onPass?: Routing36[];
  /**
   * Routing entries evaluated when this step fails. The first entry whose `if` matches applies; the default when none is set stops the test. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onFail?: Routing37[];
  /**
   * Routing entries evaluated when this step produces a warning. The first entry whose `if` matches applies. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onWarning?: Routing38[];
  /**
   * Routing entries evaluated when this step is skipped (reached but not run — unsafe-blocked or guard-`if` false). The first entry whose `if` matches applies. `continue`, `stop`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed. (`retry` is a no-op here — a step that never ran cannot be re-run.)
   */
  onSkip?: Routing39[];
  location?: SourceLocation9;
  /**
   * Path, relative to the run's artifact directory (the report's `runDir`), of the screenshot captured automatically after this step. Always a non-empty, forward-slash, relative path. Present only in test results, when `autoScreenshot` is enabled and the capture succeeded. This is system-populated metadata and should not be set manually.
   */
  autoScreenshot?: string;
  /**
   * Total number of times this step ran (the initial attempt plus retries) when a routing `retry` action re-ran it. Present only in test results, and only when the step was retried at least once (so the value is always >= 2). This is system-populated metadata and should not be set manually.
   */
  attempts?: number;
  /**
   * Which visit of this step produced this report, when a routing goToStep re-ran it (the first visit omits this field). Present only in test results; system-populated.
   */
  visit?: number;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep9 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep9`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep9 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep9`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * An articulated assertion record produced by the runner for a step result. Each record names a single verification check, whether it passed, and the values it compared. The step's result is the roll-up of its assertion results (FAIL > WARNING > all-SKIPPED > PASS). System-populated; appears in test results, not in authored specs.
 */
export interface Assertion9 {
  /**
   * Human-readable articulation of the check, e.g. `exitCode in [0]`.
   */
  statement: string;
  /**
   * Who defined the assertion: `implicit` (runner-defined) or `custom` (user-defined).
   */
  source: "implicit" | "custom";
  /**
   * Outcome of evaluating the assertion.
   */
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  /**
   * The value (or values) the assertion expected. Optional.
   */
  expected?:
    | unknown[]
    | boolean
    | number
    | null
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * The value actually observed. Optional.
   */
  actual?:
    | unknown[]
    | boolean
    | number
    | null
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * Human-readable explanation of the outcome. Optional.
   */
  description?: string;
}
/**
 * Source location where this step was detected in the original file. This is system-populated metadata and should not be set manually.
 */
export interface SourceLocation9 {
  /**
   * 1-indexed line number in the source file where the step was detected.
   */
  line: number;
  /**
   * 0-indexed character offset from the start of the source file where the step begins.
   */
  startIndex: number;
  /**
   * 0-indexed character offset from the start of the source file where the step ends (exclusive).
   */
  endIndex: number;
}
export interface Screenshot {
  screenshot: Screenshot1;
  [k: string]: unknown;
}
export interface CaptureScreenshotFields {
  /**
   * The browser window/tab or app window to capture. Omit to capture the active tab. The targeted surface stays focused afterward. App surfaces use the object form ({ "app": … }). App captures don't support `crop` yet.
   */
  surface?: SurfaceByBrowserEngine2 | BrowserSurface3 | AppSurface1;
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
  sourceIntegration?: SourceIntegration;
}
export interface BrowserSurface3 {
  /**
   * Browser engine. Selects the browser surface with that engine (or the one named by `name`). A goTo step opens the browser if it isn't open yet — you can also open one explicitly with `startSurface`; other steps require it to already be open.
   */
  browser: "chrome" | "firefox" | "safari" | "webkit" | "edge";
  /**
   * Name of the browser surface. Defaults to the engine name (the context's default browser registers under its engine). Assign distinct names to drive multiple browsers at once, including several of the same engine.
   */
  name?: string;
  window?: WindowTabSelector6;
  tab?: WindowTabSelector7;
}
export interface ByCriteria7 {
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
export interface ByCriteria8 {
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
export interface ByCriteria9 {
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
export interface Common10 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep10;
  variables?: VariablesStep10;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  if?: Condition20;
  /**
   * Assertions for this step. As authored input, a custom condition expression (or array of expressions, combined with logical AND). In a test result, the runner replaces this with the array of articulated assertion records it evaluated (implicit then custom).
   */
  assertions?: Condition21 | Assertion10[];
  /**
   * Routing entries evaluated when this step passes. The first entry whose `if` matches applies. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onPass?: Routing40[];
  /**
   * Routing entries evaluated when this step fails. The first entry whose `if` matches applies; the default when none is set stops the test. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onFail?: Routing41[];
  /**
   * Routing entries evaluated when this step produces a warning. The first entry whose `if` matches applies. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onWarning?: Routing42[];
  /**
   * Routing entries evaluated when this step is skipped (reached but not run — unsafe-blocked or guard-`if` false). The first entry whose `if` matches applies. `continue`, `stop`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed. (`retry` is a no-op here — a step that never ran cannot be re-run.)
   */
  onSkip?: Routing43[];
  location?: SourceLocation10;
  /**
   * Path, relative to the run's artifact directory (the report's `runDir`), of the screenshot captured automatically after this step. Always a non-empty, forward-slash, relative path. Present only in test results, when `autoScreenshot` is enabled and the capture succeeded. This is system-populated metadata and should not be set manually.
   */
  autoScreenshot?: string;
  /**
   * Total number of times this step ran (the initial attempt plus retries) when a routing `retry` action re-ran it. Present only in test results, and only when the step was retried at least once (so the value is always >= 2). This is system-populated metadata and should not be set manually.
   */
  attempts?: number;
  /**
   * Which visit of this step produced this report, when a routing goToStep re-ran it (the first visit omits this field). Present only in test results; system-populated.
   */
  visit?: number;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep10 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep10`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep10 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep10`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * An articulated assertion record produced by the runner for a step result. Each record names a single verification check, whether it passed, and the values it compared. The step's result is the roll-up of its assertion results (FAIL > WARNING > all-SKIPPED > PASS). System-populated; appears in test results, not in authored specs.
 */
export interface Assertion10 {
  /**
   * Human-readable articulation of the check, e.g. `exitCode in [0]`.
   */
  statement: string;
  /**
   * Who defined the assertion: `implicit` (runner-defined) or `custom` (user-defined).
   */
  source: "implicit" | "custom";
  /**
   * Outcome of evaluating the assertion.
   */
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  /**
   * The value (or values) the assertion expected. Optional.
   */
  expected?:
    | unknown[]
    | boolean
    | number
    | null
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * The value actually observed. Optional.
   */
  actual?:
    | unknown[]
    | boolean
    | number
    | null
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * Human-readable explanation of the outcome. Optional.
   */
  description?: string;
}
/**
 * Source location where this step was detected in the original file. This is system-populated metadata and should not be set manually.
 */
export interface SourceLocation10 {
  /**
   * 1-indexed line number in the source file where the step was detected.
   */
  line: number;
  /**
   * 0-indexed character offset from the start of the source file where the step begins.
   */
  startIndex: number;
  /**
   * 0-indexed character offset from the start of the source file where the step ends (exclusive).
   */
  endIndex: number;
}
export interface SaveCookie {
  saveCookie: SaveCookie1;
  [k: string]: unknown;
}
export interface Common11 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep11;
  variables?: VariablesStep11;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  if?: Condition22;
  /**
   * Assertions for this step. As authored input, a custom condition expression (or array of expressions, combined with logical AND). In a test result, the runner replaces this with the array of articulated assertion records it evaluated (implicit then custom).
   */
  assertions?: Condition23 | Assertion11[];
  /**
   * Routing entries evaluated when this step passes. The first entry whose `if` matches applies. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onPass?: Routing44[];
  /**
   * Routing entries evaluated when this step fails. The first entry whose `if` matches applies; the default when none is set stops the test. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onFail?: Routing45[];
  /**
   * Routing entries evaluated when this step produces a warning. The first entry whose `if` matches applies. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onWarning?: Routing46[];
  /**
   * Routing entries evaluated when this step is skipped (reached but not run — unsafe-blocked or guard-`if` false). The first entry whose `if` matches applies. `continue`, `stop`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed. (`retry` is a no-op here — a step that never ran cannot be re-run.)
   */
  onSkip?: Routing47[];
  location?: SourceLocation11;
  /**
   * Path, relative to the run's artifact directory (the report's `runDir`), of the screenshot captured automatically after this step. Always a non-empty, forward-slash, relative path. Present only in test results, when `autoScreenshot` is enabled and the capture succeeded. This is system-populated metadata and should not be set manually.
   */
  autoScreenshot?: string;
  /**
   * Total number of times this step ran (the initial attempt plus retries) when a routing `retry` action re-ran it. Present only in test results, and only when the step was retried at least once (so the value is always >= 2). This is system-populated metadata and should not be set manually.
   */
  attempts?: number;
  /**
   * Which visit of this step produced this report, when a routing goToStep re-ran it (the first visit omits this field). Present only in test results; system-populated.
   */
  visit?: number;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep11 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep11`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep11 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep11`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * An articulated assertion record produced by the runner for a step result. Each record names a single verification check, whether it passed, and the values it compared. The step's result is the roll-up of its assertion results (FAIL > WARNING > all-SKIPPED > PASS). System-populated; appears in test results, not in authored specs.
 */
export interface Assertion11 {
  /**
   * Human-readable articulation of the check, e.g. `exitCode in [0]`.
   */
  statement: string;
  /**
   * Who defined the assertion: `implicit` (runner-defined) or `custom` (user-defined).
   */
  source: "implicit" | "custom";
  /**
   * Outcome of evaluating the assertion.
   */
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  /**
   * The value (or values) the assertion expected. Optional.
   */
  expected?:
    | unknown[]
    | boolean
    | number
    | null
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * The value actually observed. Optional.
   */
  actual?:
    | unknown[]
    | boolean
    | number
    | null
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * Human-readable explanation of the outcome. Optional.
   */
  description?: string;
}
/**
 * Source location where this step was detected in the original file. This is system-populated metadata and should not be set manually.
 */
export interface SourceLocation11 {
  /**
   * 1-indexed line number in the source file where the step was detected.
   */
  line: number;
  /**
   * 0-indexed character offset from the start of the source file where the step begins.
   */
  startIndex: number;
  /**
   * 0-indexed character offset from the start of the source file where the step ends (exclusive).
   */
  endIndex: number;
}
export interface Record {
  record: Record1;
  [k: string]: unknown;
}
export interface RecordDetailed {
  /**
   * The browser window/tab or app window to record. Omit to record the active surface. The targeted surface stays focused afterward. App surfaces use the object form ({ "app": … }) and are captured via the `ffmpeg` engine, cropped to the app window by default.
   */
  surface?: SurfaceByBrowserEngine3 | BrowserSurface4 | AppSurface2;
  /**
   * File path of the recording. Supports the `.mp4`, `.webm`, and `.gif` extensions. If not specified, the file name is the ID of the step, and the extension is `.mp4`.
   */
  path?: string;
  /**
   * Directory of the file. If the directory doesn't exist, creates the directory.
   */
  directory?: string;
  /**
   * If `true`, overwrites the existing recording at `path` if it exists.
   */
  overwrite?: "true" | "false";
  /**
   * Identifier for this recording. A later `stopRecord` step can target it by name (`stopRecord: "<name>"`), which is how you stop a specific recording when several overlap. Names must be unique among recordings that are active at the same time. If omitted, the recording is anonymous and is stopped LIFO by an untargeted `stopRecord`.
   */
  name?: string;
  engine?: RecordingEngine;
  [k: string]: unknown;
}
export interface BrowserSurface4 {
  /**
   * Browser engine. Selects the browser surface with that engine (or the one named by `name`). A goTo step opens the browser if it isn't open yet — you can also open one explicitly with `startSurface`; other steps require it to already be open.
   */
  browser: "chrome" | "firefox" | "safari" | "webkit" | "edge";
  /**
   * Name of the browser surface. Defaults to the engine name (the context's default browser registers under its engine). Assign distinct names to drive multiple browsers at once, including several of the same engine.
   */
  name?: string;
  window?: WindowTabSelector8;
  tab?: WindowTabSelector9;
}
export interface ByCriteria10 {
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
export interface ByCriteria11 {
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
export interface AppSurface2 {
  /**
   * Name of an app surface opened by `startSurface` (its `name`, or the default derived from the app identifier).
   */
  app: string;
  window?: AppWindowSelector2;
}
export interface ByCriteria12 {
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
export interface RecordingEngineDetailed {
  /**
   * Recording engine. `browser` records the Chrome viewport (concurrency-safe); `ffmpeg` records the screen and supports any application.
   */
  name: "browser" | "ffmpeg";
  /**
   * What the `ffmpeg` engine captures. `display` records the full screen, `window` the active window, `viewport` the browser content area. Ignored by the `browser` engine, which always captures its tab. `window` and `viewport` are best-effort (captured full-screen, then cropped). If unset, defaults to `window` when the recording's `surface` is an app surface and to `display` otherwise. `viewport` doesn't apply to app surfaces (they have no browser viewport).
   */
  target?: "display" | "window" | "viewport";
  /**
   * Capture frame rate for the `ffmpeg` engine.
   */
  fps?: number;
}
export interface Common12 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep12;
  variables?: VariablesStep12;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  if?: Condition24;
  /**
   * Assertions for this step. As authored input, a custom condition expression (or array of expressions, combined with logical AND). In a test result, the runner replaces this with the array of articulated assertion records it evaluated (implicit then custom).
   */
  assertions?: Condition25 | Assertion12[];
  /**
   * Routing entries evaluated when this step passes. The first entry whose `if` matches applies. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onPass?: Routing48[];
  /**
   * Routing entries evaluated when this step fails. The first entry whose `if` matches applies; the default when none is set stops the test. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onFail?: Routing49[];
  /**
   * Routing entries evaluated when this step produces a warning. The first entry whose `if` matches applies. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onWarning?: Routing50[];
  /**
   * Routing entries evaluated when this step is skipped (reached but not run — unsafe-blocked or guard-`if` false). The first entry whose `if` matches applies. `continue`, `stop`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed. (`retry` is a no-op here — a step that never ran cannot be re-run.)
   */
  onSkip?: Routing51[];
  location?: SourceLocation12;
  /**
   * Path, relative to the run's artifact directory (the report's `runDir`), of the screenshot captured automatically after this step. Always a non-empty, forward-slash, relative path. Present only in test results, when `autoScreenshot` is enabled and the capture succeeded. This is system-populated metadata and should not be set manually.
   */
  autoScreenshot?: string;
  /**
   * Total number of times this step ran (the initial attempt plus retries) when a routing `retry` action re-ran it. Present only in test results, and only when the step was retried at least once (so the value is always >= 2). This is system-populated metadata and should not be set manually.
   */
  attempts?: number;
  /**
   * Which visit of this step produced this report, when a routing goToStep re-ran it (the first visit omits this field). Present only in test results; system-populated.
   */
  visit?: number;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep12 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep12`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep12 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep12`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * An articulated assertion record produced by the runner for a step result. Each record names a single verification check, whether it passed, and the values it compared. The step's result is the roll-up of its assertion results (FAIL > WARNING > all-SKIPPED > PASS). System-populated; appears in test results, not in authored specs.
 */
export interface Assertion12 {
  /**
   * Human-readable articulation of the check, e.g. `exitCode in [0]`.
   */
  statement: string;
  /**
   * Who defined the assertion: `implicit` (runner-defined) or `custom` (user-defined).
   */
  source: "implicit" | "custom";
  /**
   * Outcome of evaluating the assertion.
   */
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  /**
   * The value (or values) the assertion expected. Optional.
   */
  expected?:
    | unknown[]
    | boolean
    | number
    | null
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * The value actually observed. Optional.
   */
  actual?:
    | unknown[]
    | boolean
    | number
    | null
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * Human-readable explanation of the outcome. Optional.
   */
  description?: string;
}
/**
 * Source location where this step was detected in the original file. This is system-populated metadata and should not be set manually.
 */
export interface SourceLocation12 {
  /**
   * 1-indexed line number in the source file where the step was detected.
   */
  line: number;
  /**
   * 0-indexed character offset from the start of the source file where the step begins.
   */
  startIndex: number;
  /**
   * 0-indexed character offset from the start of the source file where the step ends (exclusive).
   */
  endIndex: number;
}
export interface StopRecord {
  stopRecord: StopRecord1;
  [k: string]: unknown;
}
export interface StopRecordDetailed {
  /**
   * Name of the recording to stop. Matches the `name` given to a `record` step.
   */
  name: string;
}
export interface Common13 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep13;
  variables?: VariablesStep13;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  if?: Condition26;
  /**
   * Assertions for this step. As authored input, a custom condition expression (or array of expressions, combined with logical AND). In a test result, the runner replaces this with the array of articulated assertion records it evaluated (implicit then custom).
   */
  assertions?: Condition27 | Assertion13[];
  /**
   * Routing entries evaluated when this step passes. The first entry whose `if` matches applies. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onPass?: Routing52[];
  /**
   * Routing entries evaluated when this step fails. The first entry whose `if` matches applies; the default when none is set stops the test. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onFail?: Routing53[];
  /**
   * Routing entries evaluated when this step produces a warning. The first entry whose `if` matches applies. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onWarning?: Routing54[];
  /**
   * Routing entries evaluated when this step is skipped (reached but not run — unsafe-blocked or guard-`if` false). The first entry whose `if` matches applies. `continue`, `stop`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed. (`retry` is a no-op here — a step that never ran cannot be re-run.)
   */
  onSkip?: Routing55[];
  location?: SourceLocation13;
  /**
   * Path, relative to the run's artifact directory (the report's `runDir`), of the screenshot captured automatically after this step. Always a non-empty, forward-slash, relative path. Present only in test results, when `autoScreenshot` is enabled and the capture succeeded. This is system-populated metadata and should not be set manually.
   */
  autoScreenshot?: string;
  /**
   * Total number of times this step ran (the initial attempt plus retries) when a routing `retry` action re-ran it. Present only in test results, and only when the step was retried at least once (so the value is always >= 2). This is system-populated metadata and should not be set manually.
   */
  attempts?: number;
  /**
   * Which visit of this step produced this report, when a routing goToStep re-ran it (the first visit omits this field). Present only in test results; system-populated.
   */
  visit?: number;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep13 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep13`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep13 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep13`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * An articulated assertion record produced by the runner for a step result. Each record names a single verification check, whether it passed, and the values it compared. The step's result is the roll-up of its assertion results (FAIL > WARNING > all-SKIPPED > PASS). System-populated; appears in test results, not in authored specs.
 */
export interface Assertion13 {
  /**
   * Human-readable articulation of the check, e.g. `exitCode in [0]`.
   */
  statement: string;
  /**
   * Who defined the assertion: `implicit` (runner-defined) or `custom` (user-defined).
   */
  source: "implicit" | "custom";
  /**
   * Outcome of evaluating the assertion.
   */
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  /**
   * The value (or values) the assertion expected. Optional.
   */
  expected?:
    | unknown[]
    | boolean
    | number
    | null
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * The value actually observed. Optional.
   */
  actual?:
    | unknown[]
    | boolean
    | number
    | null
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * Human-readable explanation of the outcome. Optional.
   */
  description?: string;
}
/**
 * Source location where this step was detected in the original file. This is system-populated metadata and should not be set manually.
 */
export interface SourceLocation13 {
  /**
   * 1-indexed line number in the source file where the step was detected.
   */
  line: number;
  /**
   * 0-indexed character offset from the start of the source file where the step begins.
   */
  startIndex: number;
  /**
   * 0-indexed character offset from the start of the source file where the step ends (exclusive).
   */
  endIndex: number;
}
export interface CloseSurface {
  closeSurface: CloseSurface1;
  [k: string]: unknown;
}
export interface ProcessSurface1 {
  /**
   * Name of a background process started by a runShell/runCode `background` step.
   */
  process: string;
}
export interface BrowserSurface5 {
  /**
   * Browser engine. Selects the browser surface with that engine (or the one named by `name`). A goTo step opens the browser if it isn't open yet — you can also open one explicitly with `startSurface`; other steps require it to already be open.
   */
  browser: "chrome" | "firefox" | "safari" | "webkit" | "edge";
  /**
   * Name of the browser surface. Defaults to the engine name (the context's default browser registers under its engine). Assign distinct names to drive multiple browsers at once, including several of the same engine.
   */
  name?: string;
  window?: WindowTabSelector10;
  tab?: WindowTabSelector11;
}
export interface ByCriteria13 {
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
export interface ByCriteria14 {
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
export interface AppSurface3 {
  /**
   * Name of an app surface opened by `startSurface` (its `name`, or the default derived from the app identifier).
   */
  app: string;
  window?: AppWindowSelector3;
}
export interface ByCriteria15 {
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
export interface ProcessSurface2 {
  /**
   * Name of a background process started by a runShell/runCode `background` step.
   */
  process: string;
}
export interface BrowserSurface6 {
  /**
   * Browser engine. Selects the browser surface with that engine (or the one named by `name`). A goTo step opens the browser if it isn't open yet — you can also open one explicitly with `startSurface`; other steps require it to already be open.
   */
  browser: "chrome" | "firefox" | "safari" | "webkit" | "edge";
  /**
   * Name of the browser surface. Defaults to the engine name (the context's default browser registers under its engine). Assign distinct names to drive multiple browsers at once, including several of the same engine.
   */
  name?: string;
  window?: WindowTabSelector12;
  tab?: WindowTabSelector13;
}
export interface ByCriteria16 {
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
export interface ByCriteria17 {
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
export interface AppSurface4 {
  /**
   * Name of an app surface opened by `startSurface` (its `name`, or the default derived from the app identifier).
   */
  app: string;
  window?: AppWindowSelector4;
}
export interface ByCriteria18 {
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
export interface Common14 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep14;
  variables?: VariablesStep14;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  if?: Condition28;
  /**
   * Assertions for this step. As authored input, a custom condition expression (or array of expressions, combined with logical AND). In a test result, the runner replaces this with the array of articulated assertion records it evaluated (implicit then custom).
   */
  assertions?: Condition29 | Assertion14[];
  /**
   * Routing entries evaluated when this step passes. The first entry whose `if` matches applies. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onPass?: Routing56[];
  /**
   * Routing entries evaluated when this step fails. The first entry whose `if` matches applies; the default when none is set stops the test. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onFail?: Routing57[];
  /**
   * Routing entries evaluated when this step produces a warning. The first entry whose `if` matches applies. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onWarning?: Routing58[];
  /**
   * Routing entries evaluated when this step is skipped (reached but not run — unsafe-blocked or guard-`if` false). The first entry whose `if` matches applies. `continue`, `stop`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed. (`retry` is a no-op here — a step that never ran cannot be re-run.)
   */
  onSkip?: Routing59[];
  location?: SourceLocation14;
  /**
   * Path, relative to the run's artifact directory (the report's `runDir`), of the screenshot captured automatically after this step. Always a non-empty, forward-slash, relative path. Present only in test results, when `autoScreenshot` is enabled and the capture succeeded. This is system-populated metadata and should not be set manually.
   */
  autoScreenshot?: string;
  /**
   * Total number of times this step ran (the initial attempt plus retries) when a routing `retry` action re-ran it. Present only in test results, and only when the step was retried at least once (so the value is always >= 2). This is system-populated metadata and should not be set manually.
   */
  attempts?: number;
  /**
   * Which visit of this step produced this report, when a routing goToStep re-ran it (the first visit omits this field). Present only in test results; system-populated.
   */
  visit?: number;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep14 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep14`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep14 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep14`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * An articulated assertion record produced by the runner for a step result. Each record names a single verification check, whether it passed, and the values it compared. The step's result is the roll-up of its assertion results (FAIL > WARNING > all-SKIPPED > PASS). System-populated; appears in test results, not in authored specs.
 */
export interface Assertion14 {
  /**
   * Human-readable articulation of the check, e.g. `exitCode in [0]`.
   */
  statement: string;
  /**
   * Who defined the assertion: `implicit` (runner-defined) or `custom` (user-defined).
   */
  source: "implicit" | "custom";
  /**
   * Outcome of evaluating the assertion.
   */
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  /**
   * The value (or values) the assertion expected. Optional.
   */
  expected?:
    | unknown[]
    | boolean
    | number
    | null
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * The value actually observed. Optional.
   */
  actual?:
    | unknown[]
    | boolean
    | number
    | null
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * Human-readable explanation of the outcome. Optional.
   */
  description?: string;
}
/**
 * Source location where this step was detected in the original file. This is system-populated metadata and should not be set manually.
 */
export interface SourceLocation14 {
  /**
   * 1-indexed line number in the source file where the step was detected.
   */
  line: number;
  /**
   * 0-indexed character offset from the start of the source file where the step begins.
   */
  startIndex: number;
  /**
   * 0-indexed character offset from the start of the source file where the step ends (exclusive).
   */
  endIndex: number;
}
export interface StartSurface {
  startSurface: StartSurface1;
  [k: string]: unknown;
}
export interface AppDescriptor {
  /**
   * The app identifier: an executable path (`C:\\Windows\\System32\\notepad.exe`), a `.app` path, a bundle ID (`com.apple.TextEdit`), a package name (`com.example.myapp`), or a UWP AppUserModelID (`Microsoft.WindowsCalculator_8wekyb3d8bbwe!App`). Disambiguated by syntax — never by a type field.
   */
  app: string;
  /**
   * Surface-registry name later steps use in `surface`. Default: the executable basename without extension, or the final dot-segment of an ID.
   */
  name?: string;
  /**
   * Launch arguments (desktop apps). On macOS they pass to the app as a real argument array. On Windows they join into a single shell-style argument string for the driver, so an argument with embedded spaces must carry its own quotes (e.g. "\"My File.txt\"").
   */
  args?: string[];
  /**
   * Working directory for the launched app (Windows desktop apps). Not supported on macOS — the driver launches apps through LaunchServices, which offers no working-directory control, so a non-default value fails with guidance there. Default: the run's working directory.
   */
  workingDirectory?: string;
  /**
   * Extra environment variables for the launched app (desktop apps). Supported on macOS; not supported by the Windows driver, where any value fails with guidance (set variables in the shell that launches Doc Detective instead).
   */
  env?: {
    [k: string]: string;
  };
  /**
   * Path to an installable artifact (`.apk`/`.app`/`.ipa`) to install on the device before launch. Supported on Android and iOS app surfaces.
   */
  install?: string;
  /**
   * Android main activity override (defaults to the package's launcher activity). Android-only.
   */
  activity?: string;
  /**
   * Device the app runs on. Omit for a host desktop app, or (in a mobile context) to use the context's default device. A string references a device by name; an object refines it. Supported on Android and iOS mobile targets.
   */
  device?:
    | DeviceByName
    | (DeviceDescriptor & {
        [k: string]: unknown;
      });
  /**
   * Escape-hatch passthrough: merged into the automation session's capabilities after the ones Doc Detective computes (namespaced per driver, e.g. `appium:noReset`). Driver- and version-specific; use sparingly.
   */
  driverOptions?: {
    [k: string]: unknown;
  };
  waitUntil?: AppReadiness1;
  /**
   * Startup ceiling in milliseconds (launch + install + readiness).
   */
  timeout?: number;
}
export interface DeviceDescriptor {
  /**
   * Target platform. Selects the mobile driver. Required in `startSurface.device`; implied by the context in `context.device`.
   */
  platform?: "android" | "ios";
  /**
   * Device name and registry identity — the same name resolves to the same device. Reference form: names an existing AVD (Android) / simulator (iOS) to reuse. If no device by this name exists, Doc Detective creates one under this name using `deviceType`/`osVersion` (or their defaults), provided the toolchain is installed (`doc-detective install android` or `doc-detective install ios`).
   */
  name?: string;
  /**
   * Abstract hardware profile used when creating a device (portable across `android`/`ios`). Doc Detective maps it to a built-in profile. Ignored when `name` already matches an existing device. Default: `phone`.
   */
  deviceType?: "phone" | "tablet";
  /**
   * Platform version used when creating a device; must match an installed image/runtime for the target platform (install more with `doc-detective install android` or `doc-detective install ios`). Ignored when `name` already matches an existing device. Default: the newest installed version.
   */
  osVersion?: string;
  /**
   * Run the Android emulator without a window. No-op on iOS (simulators boot without the Simulator UI on CI) and ignored where not applicable.
   */
  headless?: boolean;
  /**
   * Initial orientation. Reserved; validated now, not yet implemented.
   */
  orientation?: "portrait" | "landscape";
  /**
   * Pin a specific device/emulator instance by UDID. Reserved; validated now, not yet implemented.
   */
  udid?: string;
  /**
   * Cloud device farm configuration, keyed by provider. Reserved; validated now, not yet implemented.
   */
  provider?: {
    [k: string]: unknown;
  };
}
/**
 * Startup readiness: a fixed delay and/or an element that must exist before the surface is considered open. No condition applies by default.
 */
export interface AppReadiness1 {
  /**
   * Fixed delay (ms).
   */
  delayMs?: number;
  find?: ElementCriteria2;
}
export interface BrowserDescriptor {
  /**
   * Browser engine to open. The session opens on the context's automation server with a blank page and registers as a surface; use a goTo step (with `surface`) to navigate it. Exactly the requested engine — no cross-engine fallback.
   */
  browser: "chrome" | "firefox" | "safari" | "webkit" | "edge";
  /**
   * Surface-registry name later steps use in `surface`. Default: the engine name. Must be unique across all open surfaces — the context's default browser already owns its engine name, so name a second same-engine session explicitly. An engine keyword may only name a session of that engine.
   */
  name?: string;
  /**
   * Run this session headless. Default: the context's browser headless setting.
   */
  headless?: boolean;
  size?: BrowserWindowSize;
  viewport?: BrowserViewportSize;
  /**
   * Escape-hatch passthrough: merged into the session's capabilities after the ones Doc Detective computes. Driver- and version-specific; use sparingly.
   */
  driverOptions?: {
    [k: string]: unknown;
  };
}
/**
 * Outer window dimensions for this session. Default: the context's browser window size.
 */
export interface BrowserWindowSize {
  /**
   * Outer window width in pixels.
   */
  width?: number;
  /**
   * Outer window height in pixels.
   */
  height?: number;
}
/**
 * Viewport (page-content) dimensions for this session; the window is resized so the content area matches. Takes precedence over `size` when both are set.
 */
export interface BrowserViewportSize {
  /**
   * Viewport width in pixels.
   */
  width?: number;
  /**
   * Viewport height in pixels.
   */
  height?: number;
}
export interface ProcessDescriptor {
  /**
   * Shell command to start as a long-running background process (same shell semantics as runShell: pipes, `&&`, globbing, environment-variable expansion). Equivalent to a `runShell` step with `background` — both forms remain valid.
   */
  process: string;
  /**
   * Surface-registry name later steps use in `surface`, and the handle a closeSurface step stops. Unique across all open surfaces.
   */
  name: string;
  /**
   * Arguments for the command.
   */
  args?: string[];
  /**
   * Working directory for the process.
   */
  workingDirectory?: string;
  /**
   * Run the process in a pseudo-terminal (PTY) instead of a pipe, so full-screen/interactive TUIs (those that check `isTTY`) render and accept keystrokes. Requires the PTY backend `@homebridge/node-pty-prebuilt-multiarch` to be installed (`npm install @homebridge/node-pty-prebuilt-multiarch`); it is not bundled, and if it is unavailable the descriptor is skipped. `stdout` and `stderr` are merged into one stream in PTY mode. PTY output includes raw ANSI escape sequences (colors, cursor movement); `waitUntil.stdio` patterns should target text that renders without interleaved control codes, or use a regex that tolerates them.
   */
  tty?: boolean;
  /**
   * Conditions that must all be met before the process is considered ready and the descriptor completes. Omit to consider the process ready as soon as it is spawned. Specify any combination; every condition given must pass before `timeout` elapses. Note: a process that forks a daemon and then exits (common for some Docker images and databases) is treated as having exited before becoming ready and the descriptor fails — use `port`, `httpGet`, or `delayMs` for those rather than a condition that depends on the foreground process staying alive.
   */
  waitUntil?: {
    /**
     * Wait until this TCP port accepts connections on localhost.
     */
    port?: number;
    /**
     * Wait until the process's output contains this content. Searches both stdout and stderr. Supports strings and regular expressions. To use a regular expression, the string must start and end with a forward slash, like in `/ready on \d+/`.
     */
    stdio?: string;
    /**
     * Wait until an HTTP GET request to this URL returns a 2xx status.
     */
    httpGet?: string;
    /**
     * Wait at least this many milliseconds.
     */
    delayMs?: number;
  };
  /**
   * Max time in milliseconds to wait for `waitUntil` before the descriptor fails.
   */
  timeout?: number;
}
export interface AppDescriptor1 {
  /**
   * The app identifier: an executable path (`C:\\Windows\\System32\\notepad.exe`), a `.app` path, a bundle ID (`com.apple.TextEdit`), a package name (`com.example.myapp`), or a UWP AppUserModelID (`Microsoft.WindowsCalculator_8wekyb3d8bbwe!App`). Disambiguated by syntax — never by a type field.
   */
  app: string;
  /**
   * Surface-registry name later steps use in `surface`. Default: the executable basename without extension, or the final dot-segment of an ID.
   */
  name?: string;
  /**
   * Launch arguments (desktop apps). On macOS they pass to the app as a real argument array. On Windows they join into a single shell-style argument string for the driver, so an argument with embedded spaces must carry its own quotes (e.g. "\"My File.txt\"").
   */
  args?: string[];
  /**
   * Working directory for the launched app (Windows desktop apps). Not supported on macOS — the driver launches apps through LaunchServices, which offers no working-directory control, so a non-default value fails with guidance there. Default: the run's working directory.
   */
  workingDirectory?: string;
  /**
   * Extra environment variables for the launched app (desktop apps). Supported on macOS; not supported by the Windows driver, where any value fails with guidance (set variables in the shell that launches Doc Detective instead).
   */
  env?: {
    [k: string]: string;
  };
  /**
   * Path to an installable artifact (`.apk`/`.app`/`.ipa`) to install on the device before launch. Supported on Android and iOS app surfaces.
   */
  install?: string;
  /**
   * Android main activity override (defaults to the package's launcher activity). Android-only.
   */
  activity?: string;
  /**
   * Device the app runs on. Omit for a host desktop app, or (in a mobile context) to use the context's default device. A string references a device by name; an object refines it. Supported on Android and iOS mobile targets.
   */
  device?:
    | DeviceByName1
    | (DeviceDescriptor1 & {
        [k: string]: unknown;
      });
  /**
   * Escape-hatch passthrough: merged into the automation session's capabilities after the ones Doc Detective computes (namespaced per driver, e.g. `appium:noReset`). Driver- and version-specific; use sparingly.
   */
  driverOptions?: {
    [k: string]: unknown;
  };
  waitUntil?: AppReadiness2;
  /**
   * Startup ceiling in milliseconds (launch + install + readiness).
   */
  timeout?: number;
}
export interface DeviceDescriptor1 {
  /**
   * Target platform. Selects the mobile driver. Required in `startSurface.device`; implied by the context in `context.device`.
   */
  platform?: "android" | "ios";
  /**
   * Device name and registry identity — the same name resolves to the same device. Reference form: names an existing AVD (Android) / simulator (iOS) to reuse. If no device by this name exists, Doc Detective creates one under this name using `deviceType`/`osVersion` (or their defaults), provided the toolchain is installed (`doc-detective install android` or `doc-detective install ios`).
   */
  name?: string;
  /**
   * Abstract hardware profile used when creating a device (portable across `android`/`ios`). Doc Detective maps it to a built-in profile. Ignored when `name` already matches an existing device. Default: `phone`.
   */
  deviceType?: "phone" | "tablet";
  /**
   * Platform version used when creating a device; must match an installed image/runtime for the target platform (install more with `doc-detective install android` or `doc-detective install ios`). Ignored when `name` already matches an existing device. Default: the newest installed version.
   */
  osVersion?: string;
  /**
   * Run the Android emulator without a window. No-op on iOS (simulators boot without the Simulator UI on CI) and ignored where not applicable.
   */
  headless?: boolean;
  /**
   * Initial orientation. Reserved; validated now, not yet implemented.
   */
  orientation?: "portrait" | "landscape";
  /**
   * Pin a specific device/emulator instance by UDID. Reserved; validated now, not yet implemented.
   */
  udid?: string;
  /**
   * Cloud device farm configuration, keyed by provider. Reserved; validated now, not yet implemented.
   */
  provider?: {
    [k: string]: unknown;
  };
}
/**
 * Startup readiness: a fixed delay and/or an element that must exist before the surface is considered open. No condition applies by default.
 */
export interface AppReadiness2 {
  /**
   * Fixed delay (ms).
   */
  delayMs?: number;
  find?: ElementCriteria3;
}
export interface BrowserDescriptor1 {
  /**
   * Browser engine to open. The session opens on the context's automation server with a blank page and registers as a surface; use a goTo step (with `surface`) to navigate it. Exactly the requested engine — no cross-engine fallback.
   */
  browser: "chrome" | "firefox" | "safari" | "webkit" | "edge";
  /**
   * Surface-registry name later steps use in `surface`. Default: the engine name. Must be unique across all open surfaces — the context's default browser already owns its engine name, so name a second same-engine session explicitly. An engine keyword may only name a session of that engine.
   */
  name?: string;
  /**
   * Run this session headless. Default: the context's browser headless setting.
   */
  headless?: boolean;
  size?: BrowserWindowSize1;
  viewport?: BrowserViewportSize1;
  /**
   * Escape-hatch passthrough: merged into the session's capabilities after the ones Doc Detective computes. Driver- and version-specific; use sparingly.
   */
  driverOptions?: {
    [k: string]: unknown;
  };
}
/**
 * Outer window dimensions for this session. Default: the context's browser window size.
 */
export interface BrowserWindowSize1 {
  /**
   * Outer window width in pixels.
   */
  width?: number;
  /**
   * Outer window height in pixels.
   */
  height?: number;
}
/**
 * Viewport (page-content) dimensions for this session; the window is resized so the content area matches. Takes precedence over `size` when both are set.
 */
export interface BrowserViewportSize1 {
  /**
   * Viewport width in pixels.
   */
  width?: number;
  /**
   * Viewport height in pixels.
   */
  height?: number;
}
export interface ProcessDescriptor1 {
  /**
   * Shell command to start as a long-running background process (same shell semantics as runShell: pipes, `&&`, globbing, environment-variable expansion). Equivalent to a `runShell` step with `background` — both forms remain valid.
   */
  process: string;
  /**
   * Surface-registry name later steps use in `surface`, and the handle a closeSurface step stops. Unique across all open surfaces.
   */
  name: string;
  /**
   * Arguments for the command.
   */
  args?: string[];
  /**
   * Working directory for the process.
   */
  workingDirectory?: string;
  /**
   * Run the process in a pseudo-terminal (PTY) instead of a pipe, so full-screen/interactive TUIs (those that check `isTTY`) render and accept keystrokes. Requires the PTY backend `@homebridge/node-pty-prebuilt-multiarch` to be installed (`npm install @homebridge/node-pty-prebuilt-multiarch`); it is not bundled, and if it is unavailable the descriptor is skipped. `stdout` and `stderr` are merged into one stream in PTY mode. PTY output includes raw ANSI escape sequences (colors, cursor movement); `waitUntil.stdio` patterns should target text that renders without interleaved control codes, or use a regex that tolerates them.
   */
  tty?: boolean;
  /**
   * Conditions that must all be met before the process is considered ready and the descriptor completes. Omit to consider the process ready as soon as it is spawned. Specify any combination; every condition given must pass before `timeout` elapses. Note: a process that forks a daemon and then exits (common for some Docker images and databases) is treated as having exited before becoming ready and the descriptor fails — use `port`, `httpGet`, or `delayMs` for those rather than a condition that depends on the foreground process staying alive.
   */
  waitUntil?: {
    /**
     * Wait until this TCP port accepts connections on localhost.
     */
    port?: number;
    /**
     * Wait until the process's output contains this content. Searches both stdout and stderr. Supports strings and regular expressions. To use a regular expression, the string must start and end with a forward slash, like in `/ready on \d+/`.
     */
    stdio?: string;
    /**
     * Wait until an HTTP GET request to this URL returns a 2xx status.
     */
    httpGet?: string;
    /**
     * Wait at least this many milliseconds.
     */
    delayMs?: number;
  };
  /**
   * Max time in milliseconds to wait for `waitUntil` before the descriptor fails.
   */
  timeout?: number;
}
export interface Common15 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep15;
  variables?: VariablesStep15;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  if?: Condition30;
  /**
   * Assertions for this step. As authored input, a custom condition expression (or array of expressions, combined with logical AND). In a test result, the runner replaces this with the array of articulated assertion records it evaluated (implicit then custom).
   */
  assertions?: Condition31 | Assertion15[];
  /**
   * Routing entries evaluated when this step passes. The first entry whose `if` matches applies. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onPass?: Routing60[];
  /**
   * Routing entries evaluated when this step fails. The first entry whose `if` matches applies; the default when none is set stops the test. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onFail?: Routing61[];
  /**
   * Routing entries evaluated when this step produces a warning. The first entry whose `if` matches applies. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onWarning?: Routing62[];
  /**
   * Routing entries evaluated when this step is skipped (reached but not run — unsafe-blocked or guard-`if` false). The first entry whose `if` matches applies. `continue`, `stop`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed. (`retry` is a no-op here — a step that never ran cannot be re-run.)
   */
  onSkip?: Routing63[];
  location?: SourceLocation15;
  /**
   * Path, relative to the run's artifact directory (the report's `runDir`), of the screenshot captured automatically after this step. Always a non-empty, forward-slash, relative path. Present only in test results, when `autoScreenshot` is enabled and the capture succeeded. This is system-populated metadata and should not be set manually.
   */
  autoScreenshot?: string;
  /**
   * Total number of times this step ran (the initial attempt plus retries) when a routing `retry` action re-ran it. Present only in test results, and only when the step was retried at least once (so the value is always >= 2). This is system-populated metadata and should not be set manually.
   */
  attempts?: number;
  /**
   * Which visit of this step produced this report, when a routing goToStep re-ran it (the first visit omits this field). Present only in test results; system-populated.
   */
  visit?: number;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep15 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep15`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep15 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep15`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * An articulated assertion record produced by the runner for a step result. Each record names a single verification check, whether it passed, and the values it compared. The step's result is the roll-up of its assertion results (FAIL > WARNING > all-SKIPPED > PASS). System-populated; appears in test results, not in authored specs.
 */
export interface Assertion15 {
  /**
   * Human-readable articulation of the check, e.g. `exitCode in [0]`.
   */
  statement: string;
  /**
   * Who defined the assertion: `implicit` (runner-defined) or `custom` (user-defined).
   */
  source: "implicit" | "custom";
  /**
   * Outcome of evaluating the assertion.
   */
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  /**
   * The value (or values) the assertion expected. Optional.
   */
  expected?:
    | unknown[]
    | boolean
    | number
    | null
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * The value actually observed. Optional.
   */
  actual?:
    | unknown[]
    | boolean
    | number
    | null
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * Human-readable explanation of the outcome. Optional.
   */
  description?: string;
}
/**
 * Source location where this step was detected in the original file. This is system-populated metadata and should not be set manually.
 */
export interface SourceLocation15 {
  /**
   * 1-indexed line number in the source file where the step was detected.
   */
  line: number;
  /**
   * 0-indexed character offset from the start of the source file where the step begins.
   */
  startIndex: number;
  /**
   * 0-indexed character offset from the start of the source file where the step ends (exclusive).
   */
  endIndex: number;
}
export interface LoadVariables {
  loadVariables: LoadVariables1;
  [k: string]: unknown;
}
export interface Common16 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep16;
  variables?: VariablesStep16;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  if?: Condition32;
  /**
   * Assertions for this step. As authored input, a custom condition expression (or array of expressions, combined with logical AND). In a test result, the runner replaces this with the array of articulated assertion records it evaluated (implicit then custom).
   */
  assertions?: Condition33 | Assertion16[];
  /**
   * Routing entries evaluated when this step passes. The first entry whose `if` matches applies. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onPass?: Routing64[];
  /**
   * Routing entries evaluated when this step fails. The first entry whose `if` matches applies; the default when none is set stops the test. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onFail?: Routing65[];
  /**
   * Routing entries evaluated when this step produces a warning. The first entry whose `if` matches applies. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onWarning?: Routing66[];
  /**
   * Routing entries evaluated when this step is skipped (reached but not run — unsafe-blocked or guard-`if` false). The first entry whose `if` matches applies. `continue`, `stop`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed. (`retry` is a no-op here — a step that never ran cannot be re-run.)
   */
  onSkip?: Routing67[];
  location?: SourceLocation16;
  /**
   * Path, relative to the run's artifact directory (the report's `runDir`), of the screenshot captured automatically after this step. Always a non-empty, forward-slash, relative path. Present only in test results, when `autoScreenshot` is enabled and the capture succeeded. This is system-populated metadata and should not be set manually.
   */
  autoScreenshot?: string;
  /**
   * Total number of times this step ran (the initial attempt plus retries) when a routing `retry` action re-ran it. Present only in test results, and only when the step was retried at least once (so the value is always >= 2). This is system-populated metadata and should not be set manually.
   */
  attempts?: number;
  /**
   * Which visit of this step produced this report, when a routing goToStep re-ran it (the first visit omits this field). Present only in test results; system-populated.
   */
  visit?: number;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep16 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep16`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep16 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep16`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * An articulated assertion record produced by the runner for a step result. Each record names a single verification check, whether it passed, and the values it compared. The step's result is the roll-up of its assertion results (FAIL > WARNING > all-SKIPPED > PASS). System-populated; appears in test results, not in authored specs.
 */
export interface Assertion16 {
  /**
   * Human-readable articulation of the check, e.g. `exitCode in [0]`.
   */
  statement: string;
  /**
   * Who defined the assertion: `implicit` (runner-defined) or `custom` (user-defined).
   */
  source: "implicit" | "custom";
  /**
   * Outcome of evaluating the assertion.
   */
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  /**
   * The value (or values) the assertion expected. Optional.
   */
  expected?:
    | unknown[]
    | boolean
    | number
    | null
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * The value actually observed. Optional.
   */
  actual?:
    | unknown[]
    | boolean
    | number
    | null
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * Human-readable explanation of the outcome. Optional.
   */
  description?: string;
}
/**
 * Source location where this step was detected in the original file. This is system-populated metadata and should not be set manually.
 */
export interface SourceLocation16 {
  /**
   * 1-indexed line number in the source file where the step was detected.
   */
  line: number;
  /**
   * 0-indexed character offset from the start of the source file where the step begins.
   */
  startIndex: number;
  /**
   * 0-indexed character offset from the start of the source file where the step ends (exclusive).
   */
  endIndex: number;
}
export interface DragAndDrop {
  dragAndDrop: DragAndDrop1;
  [k: string]: unknown;
}
/**
 * Drag and drop an element from source to target.
 */
export interface DragAndDrop1 {
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
  surface?: SurfaceByBrowserEngine4 | BrowserSurface7;
  [k: string]: unknown;
}
export interface BrowserSurface7 {
  /**
   * Browser engine. Selects the browser surface with that engine (or the one named by `name`). A goTo step opens the browser if it isn't open yet — you can also open one explicitly with `startSurface`; other steps require it to already be open.
   */
  browser: "chrome" | "firefox" | "safari" | "webkit" | "edge";
  /**
   * Name of the browser surface. Defaults to the engine name (the context's default browser registers under its engine). Assign distinct names to drive multiple browsers at once, including several of the same engine.
   */
  name?: string;
  window?: WindowTabSelector14;
  tab?: WindowTabSelector15;
}
export interface ByCriteria19 {
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
export interface ByCriteria20 {
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
export interface Common17 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep17;
  variables?: VariablesStep17;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  if?: Condition34;
  /**
   * Assertions for this step. As authored input, a custom condition expression (or array of expressions, combined with logical AND). In a test result, the runner replaces this with the array of articulated assertion records it evaluated (implicit then custom).
   */
  assertions?: Condition35 | Assertion17[];
  /**
   * Routing entries evaluated when this step passes. The first entry whose `if` matches applies. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onPass?: Routing68[];
  /**
   * Routing entries evaluated when this step fails. The first entry whose `if` matches applies; the default when none is set stops the test. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onFail?: Routing69[];
  /**
   * Routing entries evaluated when this step produces a warning. The first entry whose `if` matches applies. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onWarning?: Routing70[];
  /**
   * Routing entries evaluated when this step is skipped (reached but not run — unsafe-blocked or guard-`if` false). The first entry whose `if` matches applies. `continue`, `stop`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed. (`retry` is a no-op here — a step that never ran cannot be re-run.)
   */
  onSkip?: Routing71[];
  location?: SourceLocation17;
  /**
   * Path, relative to the run's artifact directory (the report's `runDir`), of the screenshot captured automatically after this step. Always a non-empty, forward-slash, relative path. Present only in test results, when `autoScreenshot` is enabled and the capture succeeded. This is system-populated metadata and should not be set manually.
   */
  autoScreenshot?: string;
  /**
   * Total number of times this step ran (the initial attempt plus retries) when a routing `retry` action re-ran it. Present only in test results, and only when the step was retried at least once (so the value is always >= 2). This is system-populated metadata and should not be set manually.
   */
  attempts?: number;
  /**
   * Which visit of this step produced this report, when a routing goToStep re-ran it (the first visit omits this field). Present only in test results; system-populated.
   */
  visit?: number;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep17 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep17`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep17 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep17`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * An articulated assertion record produced by the runner for a step result. Each record names a single verification check, whether it passed, and the values it compared. The step's result is the roll-up of its assertion results (FAIL > WARNING > all-SKIPPED > PASS). System-populated; appears in test results, not in authored specs.
 */
export interface Assertion17 {
  /**
   * Human-readable articulation of the check, e.g. `exitCode in [0]`.
   */
  statement: string;
  /**
   * Who defined the assertion: `implicit` (runner-defined) or `custom` (user-defined).
   */
  source: "implicit" | "custom";
  /**
   * Outcome of evaluating the assertion.
   */
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  /**
   * The value (or values) the assertion expected. Optional.
   */
  expected?:
    | unknown[]
    | boolean
    | number
    | null
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * The value actually observed. Optional.
   */
  actual?:
    | unknown[]
    | boolean
    | number
    | null
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * Human-readable explanation of the outcome. Optional.
   */
  description?: string;
}
/**
 * Source location where this step was detected in the original file. This is system-populated metadata and should not be set manually.
 */
export interface SourceLocation17 {
  /**
   * 1-indexed line number in the source file where the step was detected.
   */
  line: number;
  /**
   * 0-indexed character offset from the start of the source file where the step begins.
   */
  startIndex: number;
  /**
   * 0-indexed character offset from the start of the source file where the step ends (exclusive).
   */
  endIndex: number;
}
export interface LoadCookie {
  loadCookie: LoadCookie1;
  [k: string]: unknown;
}
export interface Common18 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep18;
  variables?: VariablesStep18;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  if?: Condition36;
  /**
   * Assertions for this step. As authored input, a custom condition expression (or array of expressions, combined with logical AND). In a test result, the runner replaces this with the array of articulated assertion records it evaluated (implicit then custom).
   */
  assertions?: Condition37 | Assertion18[];
  /**
   * Routing entries evaluated when this step passes. The first entry whose `if` matches applies. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onPass?: Routing72[];
  /**
   * Routing entries evaluated when this step fails. The first entry whose `if` matches applies; the default when none is set stops the test. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onFail?: Routing73[];
  /**
   * Routing entries evaluated when this step produces a warning. The first entry whose `if` matches applies. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onWarning?: Routing74[];
  /**
   * Routing entries evaluated when this step is skipped (reached but not run — unsafe-blocked or guard-`if` false). The first entry whose `if` matches applies. `continue`, `stop`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed. (`retry` is a no-op here — a step that never ran cannot be re-run.)
   */
  onSkip?: Routing75[];
  location?: SourceLocation18;
  /**
   * Path, relative to the run's artifact directory (the report's `runDir`), of the screenshot captured automatically after this step. Always a non-empty, forward-slash, relative path. Present only in test results, when `autoScreenshot` is enabled and the capture succeeded. This is system-populated metadata and should not be set manually.
   */
  autoScreenshot?: string;
  /**
   * Total number of times this step ran (the initial attempt plus retries) when a routing `retry` action re-ran it. Present only in test results, and only when the step was retried at least once (so the value is always >= 2). This is system-populated metadata and should not be set manually.
   */
  attempts?: number;
  /**
   * Which visit of this step produced this report, when a routing goToStep re-ran it (the first visit omits this field). Present only in test results; system-populated.
   */
  visit?: number;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep18 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep18`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep18 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep18`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * An articulated assertion record produced by the runner for a step result. Each record names a single verification check, whether it passed, and the values it compared. The step's result is the roll-up of its assertion results (FAIL > WARNING > all-SKIPPED > PASS). System-populated; appears in test results, not in authored specs.
 */
export interface Assertion18 {
  /**
   * Human-readable articulation of the check, e.g. `exitCode in [0]`.
   */
  statement: string;
  /**
   * Who defined the assertion: `implicit` (runner-defined) or `custom` (user-defined).
   */
  source: "implicit" | "custom";
  /**
   * Outcome of evaluating the assertion.
   */
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  /**
   * The value (or values) the assertion expected. Optional.
   */
  expected?:
    | unknown[]
    | boolean
    | number
    | null
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * The value actually observed. Optional.
   */
  actual?:
    | unknown[]
    | boolean
    | number
    | null
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * Human-readable explanation of the outcome. Optional.
   */
  description?: string;
}
/**
 * Source location where this step was detected in the original file. This is system-populated metadata and should not be set manually.
 */
export interface SourceLocation18 {
  /**
   * 1-indexed line number in the source file where the step was detected.
   */
  line: number;
  /**
   * 0-indexed character offset from the start of the source file where the step begins.
   */
  startIndex: number;
  /**
   * 0-indexed character offset from the start of the source file where the step ends (exclusive).
   */
  endIndex: number;
}
export interface Swipe {
  swipe: Swipe1;
  [k: string]: unknown;
}
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
  surface?: SurfaceByBrowserEngine5 | BrowserSurface8 | AppSurface5;
}
export interface BrowserSurface8 {
  /**
   * Browser engine. Selects the browser surface with that engine (or the one named by `name`). A goTo step opens the browser if it isn't open yet — you can also open one explicitly with `startSurface`; other steps require it to already be open.
   */
  browser: "chrome" | "firefox" | "safari" | "webkit" | "edge";
  /**
   * Name of the browser surface. Defaults to the engine name (the context's default browser registers under its engine). Assign distinct names to drive multiple browsers at once, including several of the same engine.
   */
  name?: string;
  window?: WindowTabSelector16;
  tab?: WindowTabSelector17;
}
export interface ByCriteria21 {
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
export interface ByCriteria22 {
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
export interface AppSurface5 {
  /**
   * Name of an app surface opened by `startSurface` (its `name`, or the default derived from the app identifier).
   */
  app: string;
  window?: AppWindowSelector5;
}
export interface ByCriteria23 {
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
  surface?: SurfaceByBrowserEngine6 | BrowserSurface9 | AppSurface6;
}
/**
 * A pixel coordinate on the surface, measured from its top-left corner (0, 0).
 */
export interface Point {
  /**
   * Horizontal position in pixels from the left edge of the surface (the app window, or the browser viewport).
   */
  x: number;
  /**
   * Vertical position in pixels from the top edge of the surface (the app window, or the browser viewport).
   */
  y: number;
}
/**
 * A pixel coordinate on the surface, measured from its top-left corner (0, 0).
 */
export interface Point1 {
  /**
   * Horizontal position in pixels from the left edge of the surface (the app window, or the browser viewport).
   */
  x: number;
  /**
   * Vertical position in pixels from the top edge of the surface (the app window, or the browser viewport).
   */
  y: number;
}
export interface BrowserSurface9 {
  /**
   * Browser engine. Selects the browser surface with that engine (or the one named by `name`). A goTo step opens the browser if it isn't open yet — you can also open one explicitly with `startSurface`; other steps require it to already be open.
   */
  browser: "chrome" | "firefox" | "safari" | "webkit" | "edge";
  /**
   * Name of the browser surface. Defaults to the engine name (the context's default browser registers under its engine). Assign distinct names to drive multiple browsers at once, including several of the same engine.
   */
  name?: string;
  window?: WindowTabSelector18;
  tab?: WindowTabSelector19;
}
export interface ByCriteria24 {
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
export interface ByCriteria25 {
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
export interface AppSurface6 {
  /**
   * Name of an app surface opened by `startSurface` (its `name`, or the default derived from the app identifier).
   */
  app: string;
  window?: AppWindowSelector6;
}
export interface ByCriteria26 {
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
export interface Common19 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep19;
  variables?: VariablesStep19;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  if?: Condition38;
  /**
   * Assertions for this step. As authored input, a custom condition expression (or array of expressions, combined with logical AND). In a test result, the runner replaces this with the array of articulated assertion records it evaluated (implicit then custom).
   */
  assertions?: Condition39 | Assertion19[];
  /**
   * Routing entries evaluated when this step passes. The first entry whose `if` matches applies. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onPass?: Routing76[];
  /**
   * Routing entries evaluated when this step fails. The first entry whose `if` matches applies; the default when none is set stops the test. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onFail?: Routing77[];
  /**
   * Routing entries evaluated when this step produces a warning. The first entry whose `if` matches applies. `continue`, `stop`, `retry`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed.
   */
  onWarning?: Routing78[];
  /**
   * Routing entries evaluated when this step is skipped (reached but not run — unsafe-blocked or guard-`if` false). The first entry whose `if` matches applies. `continue`, `stop`, and `goToStep` are honored at runtime; `goToTest` is validated but not yet executed. (`retry` is a no-op here — a step that never ran cannot be re-run.)
   */
  onSkip?: Routing79[];
  location?: SourceLocation19;
  /**
   * Path, relative to the run's artifact directory (the report's `runDir`), of the screenshot captured automatically after this step. Always a non-empty, forward-slash, relative path. Present only in test results, when `autoScreenshot` is enabled and the capture succeeded. This is system-populated metadata and should not be set manually.
   */
  autoScreenshot?: string;
  /**
   * Total number of times this step ran (the initial attempt plus retries) when a routing `retry` action re-ran it. Present only in test results, and only when the step was retried at least once (so the value is always >= 2). This is system-populated metadata and should not be set manually.
   */
  attempts?: number;
  /**
   * Which visit of this step produced this report, when a routing goToStep re-ran it (the first visit omits this field). Present only in test results; system-populated.
   */
  visit?: number;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep19 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep19`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep19 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep19`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * An articulated assertion record produced by the runner for a step result. Each record names a single verification check, whether it passed, and the values it compared. The step's result is the roll-up of its assertion results (FAIL > WARNING > all-SKIPPED > PASS). System-populated; appears in test results, not in authored specs.
 */
export interface Assertion19 {
  /**
   * Human-readable articulation of the check, e.g. `exitCode in [0]`.
   */
  statement: string;
  /**
   * Who defined the assertion: `implicit` (runner-defined) or `custom` (user-defined).
   */
  source: "implicit" | "custom";
  /**
   * Outcome of evaluating the assertion.
   */
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  /**
   * The value (or values) the assertion expected. Optional.
   */
  expected?:
    | unknown[]
    | boolean
    | number
    | null
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * The value actually observed. Optional.
   */
  actual?:
    | unknown[]
    | boolean
    | number
    | null
    | {
        [k: string]: unknown;
      }
    | string;
  /**
   * Human-readable explanation of the outcome. Optional.
   */
  description?: string;
}
/**
 * Source location where this step was detected in the original file. This is system-populated metadata and should not be set manually.
 */
export interface SourceLocation19 {
  /**
   * 1-indexed line number in the source file where the step was detected.
   */
  line: number;
  /**
   * 0-indexed character offset from the start of the source file where the step begins.
   */
  startIndex: number;
  /**
   * 0-indexed character offset from the start of the source file where the step ends (exclusive).
   */
  endIndex: number;
}
export interface Wait {
  wait: Wait1;
  [k: string]: unknown;
}
