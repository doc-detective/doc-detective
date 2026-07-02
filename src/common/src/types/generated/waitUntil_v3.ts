/* eslint-disable */
/**
 * Auto-generated from waitUntil_v3.schema.json
 * Do not edit manually
 */

/**
 * Shared readiness conditions, shaped by the kind of surface a step targets. Browser surfaces wait on page conditions; process surfaces wait on stdio output or a fixed delay. Unlike goTo's navigation readiness, no condition applies by default — a step waits only on the conditions it names.
 */
export type WaitUntil = BrowserReadiness | ProcessReadiness;

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
