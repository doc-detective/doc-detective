import { validate } from "doc-detective-common";
import { findElement } from "./findElement.js";

export { clickElement };

/**
 * Performs a click on an element described by the provided step and returns an execution result.
 *
 * Validates the `step` against the `step_v3` schema and accepts coerced/defaulted values. Supports `step.click`
 * as either a string selector or an object with an optional `button` property (defaults to `"left"`). Attempts
 * to locate the target element and perform the click, then returns the outcome.
 *
 * @param config - Configuration passed through to the underlying element operation.
 * @param step - The step payload describing the click. Accepts either:
 *   - a string selector (e.g., `"#btn"`), or
 *   - an object of shape `{ click: string | { selector?: string; button?: "left" | "right" | "middle"; ... } }`
 *     where `button` defaults to `"left"`.
 * @param driver - The driver/session object used to interact with the UI.
 * @returns An object containing `status` (`"PASS"` or `"FAIL"`), `description` (human-readable message), and `outputs`
 *          (operation-specific outputs produced during element lookup/click).
 */
async function clickElement({ config, step, driver }: { config: any; step: any; driver: any }) {
  const result: any = {
    status: "PASS",
    description: "Clicked element.",
    outputs: {},
  };

  // Validate step payload
  const isValidStep = validate({ schemaKey: "step_v3", object: step });
  if (!isValidStep.valid) {
    result.status = "FAIL";
    result.description = `Invalid step definition: ${isValidStep.errors}`;
    return result;
  }
  // Accept coerced and defaulted values
  step = isValidStep.object;
  let findStep: any;

  if (typeof step.click === "string") {
    findStep = { find: step.click };
  } else if (typeof step.click === "object") {
    // Set default values
    step.click = {
      ...step.click,
      button: step.click.button || "left",
    };
    findStep = { find: {...step.click, click: { button: step.click.button } } };
    if (findStep.find.button) {
      delete findStep.find.button;
    }
  }

  const findResult = await findElement({
    config,
    step: findStep,
    driver,
    click: true,
  });

  result.outputs = findResult.outputs;
  result.status = findResult.status;
  result.description = findResult.description;

  return result;
}