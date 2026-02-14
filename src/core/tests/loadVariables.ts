import { validate } from "doc-detective-common";
import { loadEnvs } from "../utils.js";

export { loadVariables };

/**
 * Load variables from a step into the environment.
 *
 * @param step - Step object containing a `loadVariables` property with variables to set
 * @returns An object with `status` set to `"PASS"` if variables were set successfully or `"FAIL"` otherwise, and `description` with a human-readable message
 */
async function loadVariables({ step }: { step: any }) {
  let result = { status: "PASS", description: "Set variables." };

  // Validate step payload
  const isValidStep = validate({ schemaKey: "step_v3", object: step });
  if (!isValidStep.valid) {
    result.status = "FAIL";
    result.description = `Invalid step definition: ${isValidStep.errors}`;
    return result;
  }

  // Run action
  const setResult = await loadEnvs(step.loadVariables);
  if (setResult.status === "FAIL") {
    // FAIL: Error setting variables
    result.status = "FAIL";
    result.description = `Couldn't set variables. ${setResult.description}`;
    return result;
  }

  // PASS
  return result;
}