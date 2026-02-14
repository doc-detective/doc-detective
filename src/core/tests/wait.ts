import { validate } from "doc-detective-common";

export { wait };

// Wait for a specified duration
/**
 * Waits for the duration specified by `step.wait`, validating the step first, and returns a result describing success, skip, or failure.
 *
 * The `step` payload must conform to the `step_v3` schema. `step.wait` may be:
 * - boolean `true` or string `"true"` → treated as 5000 milliseconds
 * - boolean `false` or string `"false"` → the wait is skipped and the step returns `SKIPPED`
 * - a numeric string → parsed to an integer number of milliseconds (invalid numeric strings cause failure)
 * - a number → used directly as milliseconds
 *
 * If `driver` is provided, it will be used to pause (via `driver.pause(milliseconds)`) for proper browser synchronization; otherwise a timer-based delay is used.
 *
 * @param step - The step payload; must conform to the `step_v3` schema and include a `wait` value as described above.
 * @param driver - Optional WebDriver-like object. When present, `driver.pause(milliseconds)` is used to perform the wait.
 * @returns An object with `status` and `description`:
 * - `status` is `"PASS"` when the wait completes successfully,
 * - `"SKIPPED"` when the step indicates the wait should be skipped,
 * - `"FAIL"` when validation fails, the wait value is invalid, or an error occurs during waiting.
 */
async function wait({ config, step, driver }: { config?: any; step: any; driver: any }) {
  let result = { status: "PASS", description: "Waited." };

  // Validate step payload
  const isValidStep = validate({schemaKey: "step_v3", object: step});
  if (!isValidStep.valid) {
    result.status = "FAIL";
    result.description = `Invalid step definition: ${isValidStep.errors}`;
    return result;
  }

  // Resolve wait value
  if (step.wait === true || step.wait === "true") {
    // True boolean
    step.wait = 5000;
  } else if (step.wait === false || step.wait === "false") {
    result.status = "SKIPPED";
    result.description = "Wait skipped.";
    return result;
  } else if (typeof step.wait === "string") {
    // Convert to number
    const waitValue = parseInt(step.wait, 10);
    if (isNaN(waitValue)) {
      result.status = "FAIL";
      result.description = `Invalid wait value: ${step.wait}. Must be a number or boolean.`;
      return result;
    }
    // Set wait value
    step.wait = waitValue;
  }

  // Run action
  try {
    // Use driver.pause() when a driver is available for proper browser synchronization.
    // This ensures the WebDriver session stays in sync with the browser's actual state,
    // which is critical for finding elements that are dynamically rendered by JavaScript.
    // A simple setTimeout() only pauses Node.js and can leave the WebDriver session stale.
    if (driver) {
      await driver.pause(step.wait);
    } else {
      await new Promise((r) => setTimeout(r, step.wait));
    }
  } catch (error: any) {
    // FAIL: Error waiting
    result.status = "FAIL";
    result.description = `Couldn't wait. ${error.message}`;
    return result;
  }

  // PASS
  result.status = "PASS";
  result.description = "Wait completed successfully.";
  return result;
}