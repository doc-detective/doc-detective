/* eslint-disable */
/**
 * Auto-generated from routing_v3.schema.json
 * Do not edit manually
 */

/**
 * A single dynamic-routing entry: an optional condition (`if`) plus exactly one routing action. Attached to a step or test handler (`onPass`, `onFail`, `onWarning`, `onSkip`). Phase 1: validated everywhere, ignored at runtime.
 */
export type Routing = {
  if?: Condition;
  /**
   * Continue execution with the next step. Use to explicitly suppress a default handler behavior.
   */
  continue?: true;
  /**
   * Stop execution at the given scope.
   */
  stop?: "test" | "spec" | "run";
  retry?: Retry;
  /**
   * Identifier of the step to jump to.
   */
  goToStep?: string;
  /**
   * Identifier of the test to jump to.
   */
  goToTest?: string;
} & {
  [k: string]: unknown;
};
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition = string | [string, ...string[]];

/**
 * Retry the current step.
 */
export interface Retry {
  /**
   * Maximum number of retry attempts.
   */
  limit: number;
  /**
   * Delay in milliseconds before each retry.
   */
  delay?: number;
  /**
   * Backoff strategy applied to the delay between retries.
   */
  backoff?: "fixed" | "exponential";
}
