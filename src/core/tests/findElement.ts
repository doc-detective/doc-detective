import { validate } from "../../common/src/validate.js";
import { switchToSurface } from "./browserSurface.js";
import {
  findElementByShorthand,
  findElementByCriteria,
  setElementOutputs,
} from "./findStrategies.js";
import { typeKeys } from "./typeKeys.js";
import { moveTo } from "./moveTo.js";
import { wait } from "./wait.js";
import { isRecordingActive } from "./ffmpegRecorder.js";
import {
  buildConditionContext,
  evaluateImplicitAssertions,
} from "../routing.js";
import type { ImplicitAssertionSpec } from "../routing.js";

export { findElement };

// Unified assertion model: element EXISTENCE is the single implicit
// verification. Whether an element matching ALL of the requested criteria
// (selector/text/id/testId/class/attribute/aria AND-logic, or the shorthand
// string path) was located is computed and EXPOSED as `outputs.found`, so the
// implicit check is a trivial expression over it (`$$outputs.found == true`).
// `outputs.found` and `result.assertions` are part of find's CONTRACT for
// downstream consumers (conditions / custom assertions). `outputs.element.*`
// and `outputs.rawElement` are preserved exactly as before. The interactions
// the action performs (`moveTo` / `click` / `type` sub-effects) remain
// EXECUTION, not assertions: a failure there sets FAIL with NO extra assertion
// record, preserving prior behavior.
//
// Evaluate the single existence spec through the shared engine and set
// `result.assertions` + `result.status`. On the success path this runs once,
// after which sub-effects can still flip the status to FAIL (execution error).
async function finalizeFound({ result }: { result: any }) {
  const specs: ImplicitAssertionSpec[] = [
    { statement: "$$outputs.found == true", severity: "fail" },
  ];
  const ctx = buildConditionContext({ outputs: result.outputs });
  const { assertions, status } = await evaluateImplicitAssertions(specs, ctx);
  result.assertions = assertions;
  result.status = status;
  return result;
}

// Find a single element
async function findElement({ config, step, driver, click }: { config: any; step: any; driver: any; click?: any }) {
  let result: any = {
    status: "PASS",
    description: "Found an element matching selector.",
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

  // Multi-surface Phase 3/4: focus the requested session + window/tab first.
  // The surface stays active afterward (active = most recently focused).
  // click delegates here, so its `surface` rides along in the constructed
  // find step. A cross-session reference resolves to that session's driver.
  if (typeof step.find === "object" && step.find.surface !== undefined) {
    const switched = await switchToSurface(driver, step.find.surface);
    if (!switched.ok) {
      result.status = "FAIL";
      result.description = switched.message;
      return result;
    }
    driver = switched.driver ?? driver;
  }

  // Handle combo selector/text string
  if (typeof step.find === "string") {
    const { element, foundBy } = await findElementByShorthand({
      string: step.find,
      driver,
    });
    if (element) {
      result.description += ` Found element by ${foundBy}.`;
      result.outputs = await setElementOutputs({ element });
      result.outputs.found = true;
      await finalizeFound({ result });
      // Shorthand carries no sub-effect fields, so button defaults to left.
      if (click) {
        try {
          await element.click({ button: "left" });
          result.description += " Clicked element.";
        } catch (error: any) {
          result.status = "FAIL";
          result.description += ` Couldn't click element. Error: ${error.message}`;
          return result;
        }
      }
      if (isRecordingActive(driver)) {
        await wait({ config: config, step: { wait: 2000 }, driver: driver });
      }
      return result;
    } else {
      // No matching elements: expose found=false and still evaluate so the
      // existence assertion FAILs (don't early-return before the spec).
      result.description = "No elements matched selector or text.";
      result.outputs.found = false;
      return await finalizeFound({ result });
    }
  }
  // Apply default values
  step.find = {
    ...step.find,
    selector: step.find.selector || "",
    timeout: step.find.timeout || 5000,
    elementText: step.find.elementText || "",
    moveTo: step.find.moveTo || false,
    click: step.find.click || false,
    type: step.find.type || false,
  };
  // Normalize elementClass to array
  if (step.find.elementClass && !Array.isArray(step.find.elementClass)) {
    step.find.elementClass = [step.find.elementClass];
  }

  // Find element (and match text and other criteria)
  let element: any;

  // Use the new comprehensive finding function
  const {
    element: foundElement,
    foundBy,
    error,
  } = await findElementByCriteria({
    selector: step.find.selector || undefined,
    elementText: step.find.elementText || undefined,
    elementId: step.find.elementId,
    elementTestId: step.find.elementTestId,
    elementClass: step.find.elementClass,
    elementAttribute: step.find.elementAttribute,
    elementAria: step.find.elementAria,
    timeout: step.find.timeout,
    driver,
  });

  if (!foundElement) {
    result.description = error || "No elements matched criteria.";
    result.outputs.found = false;
    return await finalizeFound({ result });
  }
  element = foundElement;
  result.description += ` Found element by ${foundBy}.`;

  // No matching elements
  if (!element.elementId) {
    result.description = "No elements matched selector and/or text.";
    result.outputs.found = false;
    return await finalizeFound({ result });
  }

  // Set element in outputs
  result.outputs = await setElementOutputs({ element });
  result.outputs.found = true;
  // Evaluate the existence assertion now (PASS). Sub-effects below remain
  // EXECUTION and may still set FAIL with no extra record.
  await finalizeFound({ result });

  // Move to element
  if (step.find.moveTo) {
    let moveToStep = {
      action: "moveTo",
      selector: step.find.selector,
      alignment: "center",
      offset: {
        x: 0,
        y: 0,
      },
    };

    await moveTo({ config, step: moveToStep, driver, element });
    result.description = result.description + " Moved to element.";
  }

  // Click element
  if (step.find.click || click) {
    try {
      await element.click({
        button: step.find.click?.button || "left",
      });
      result.description += " Clicked element.";
    } catch (error: any) {
      result.status = "FAIL";
      result.description += ` Couldn't click element. Error: ${error.message}`;
      return result;
    }
  }

  // Type keys
  if (step.find.type) {
    const typeStep = {
      type: step.find.type,
    };
    const typeResult = await typeKeys({
      config: config,
      step: typeStep,
      driver: driver,
    });
    if (typeResult.status === "FAIL") {
      result.status = "FAIL";
      result.description = `${result.description} ${typeResult.description}`;
    } else {
      result.description += " Typed keys.";
    }
  }

  // If recording, wait until page is loaded and instantiate cursor
  if (isRecordingActive(driver)) {
    await wait({ config: config, step: { wait: 2000 }, driver: driver });
  }
  // PASS
  return result;
}
