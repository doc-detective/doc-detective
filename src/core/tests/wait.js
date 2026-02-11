const { validate } = require("doc-detective-common");

exports.wait = wait;

// Wait for a specified duration
// Uses driver.pause() when a driver is available for proper browser synchronization
async function wait({ step, driver }) {
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
  } catch (error) {
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
