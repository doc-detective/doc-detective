/* eslint-disable */
/**
 * Auto-generated from routing_v3.schema.json
 * Do not edit manually
 */

/**
 * A single routing entry on a test handler (`onPass`, `onFail`, `onWarning`, `onSkip`): an optional condition (`if`) plus exactly one of `continue`, `stop` (`test` or `spec`), or `goToTest`. Step handlers take a step routing entry instead.
 */
export type Routing = {
  if?: Condition;
  /**
   * Continue with the next test. Use to explicitly suppress a default handler behavior.
   */
  continue?: true;
  /**
   * Stop at the given scope. `test` does nothing, because the test already finished. `spec` skips the spec's remaining tests.
   */
  stop?: "test" | "spec";
  /**
   * Identifier of the test to jump to, within the same spec.
   */
  goToTest?: string;
} & {
  [k: string]: unknown;
};
/**
 * A condition expression, or an array of expressions combined with logical AND.
 */
export type Condition = string | [string, ...string[]];
