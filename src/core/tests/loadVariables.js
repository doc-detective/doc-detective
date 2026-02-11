const { validate } = require("doc-detective-common");
const { loadEnvs } = require("../utils");

exports.loadVariables = loadVariables;

/**
 * Loads variables defined in a step object into the environment.
 * @async
 * @param {Object} step - The step object containing variable definitions.
 * @param {Object} step.loadVariables - The variables to be loaded.
 * @returns {Promise<Object>} A result object indicating success or failure.
 * @returns {string} result.status - "PASS" if successful, "FAIL" otherwise.
 * @returns {string} result.description - Description of the result or error message.
 */
async function loadVariables({ step }) {
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
