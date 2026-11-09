import { validate } from "../../common/src/validate.js";

export { wait };

// Wait for a specified duration
// Uses driver.pause() when a driver is available for proper browser synchronization
async function wait({ config, step, driver }: { config?: any; step: any; driver: any }) {
  let result = { status: "PASS", description: "Waited." };

  // Validate step payload
  const isValidStep = validate({schemaKey: "step_v3", object: step});
  if (!isValidStep.valid) {
    result.status = "FAIL";
    result.description = `Invalid step definition: ${isValidStep.errors}`;
    return result;
  }

  // The effective step holds milliseconds, `false` to skip, or a $VAR that
  // didn't resolve (ADR 01167).
  const duration = isValidStep.object.wait;
  if (duration === false) {
    result.status = "SKIPPED";
    result.description = "Skipped: `wait` is `false`.";
    return result;
  }
  // Only a valid string reaches here: a $VAR that substitution left in place.
  if (typeof duration !== "number") {
    result.status = "FAIL";
    result.description = `Couldn't wait: the variable '${duration}' in \`wait\` isn't set. Set it to a number of milliseconds.`;
    return result;
  }

  // Run action
  try {
    // Use driver.pause() when a driver is available for proper browser synchronization.
    // This ensures the WebDriver session stays in sync with the browser's actual state,
    // which is critical for finding elements that are dynamically rendered by JavaScript.
    // A simple setTimeout() only pauses Node.js and can leave the WebDriver session stale.
    if (driver) {
      await driver.pause(duration);
    } else {
      await new Promise((r) => setTimeout(r, duration));
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
