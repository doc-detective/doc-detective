/* eslint-disable */
/**
 * Auto-generated from waitUntil_v3.schema.json
 * Do not edit manually
 */

/**
 * Shared readiness conditions, shaped by the kind of surface a step targets. Browser surfaces wait on page conditions; process surfaces wait on stdio output or a fixed delay; app surfaces wait on an element or a fixed delay. Unlike goTo's navigation readiness, no condition applies by default — a step waits only on the conditions it names.
 */
export type WaitUntil = BrowserReadiness | ProcessReadiness | AppReadiness;
/**
 * Wait for a specific element to be present. At least one finding field must be specified.
 */
export type ElementCriteria = {
  /**
   * Selector for the element to wait for. On browser surfaces, a CSS selector. On app surfaces, a native selector — an XPath (`//`), or `~` for an accessibility id; CSS is rejected at runtime.
   */
  selector?: string;
  /**
   * Text content the element must contain. Supports exact match or regex pattern using /pattern/ syntax.
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
} & {
  [k: string]: unknown;
};
/**
 * Wait for a specific element to exist on the app surface. Fields with no accessibility mapping on the target platform fail at runtime with the supported alternative named.
 */
export type ElementCriteria1 = {
  /**
   * Selector for the element to wait for. On browser surfaces, a CSS selector. On app surfaces, a native selector — an XPath (`//`), or `~` for an accessibility id; CSS is rejected at runtime.
   */
  selector?: string;
  /**
   * Text content the element must contain. Supports exact match or regex pattern using /pattern/ syntax.
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
} & {
  [k: string]: unknown;
};

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
export interface AppReadiness {
  /**
   * Fixed delay (ms).
   */
  delayMs?: number;
  find?: ElementCriteria1;
}
