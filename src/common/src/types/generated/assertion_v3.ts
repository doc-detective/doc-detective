/* eslint-disable */
/**
 * Auto-generated from assertion_v3.schema.json
 * Do not edit manually
 */

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
  expected?: {
    [k: string]: unknown;
  };
  /**
   * The value actually observed. Optional.
   */
  actual?: {
    [k: string]: unknown;
  };
  /**
   * Human-readable explanation of the outcome. Optional.
   */
  description?: string;
}
