const { validate } = require("doc-detective-common");
const {
  findElementByShorthand,
  findElementByCriteria,
  setElementOutputs,
} = require("./findStrategies");
const { typeKeys } = require("./typeKeys");
const { moveTo } = require("./moveTo");
const { wait } = require("./wait");

exports.findElement = findElement;

// Find a single element
async function findElement({ config, step, driver, click }) {
  let result = {
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

  // Handle combo selector/text string
  if (typeof step.find === "string") {
    const { element, foundBy } = await findElementByShorthand({
      string: step.find,
      driver,
    });
    if (element) {
      result.description += ` Found element by ${foundBy}.`;
      result.outputs = await setElementOutputs({ element });
      return result;
    } else {
      // No matching elements
      result.status = "FAIL";
      result.description = "No elements matched selector or text.";
      return result;
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
  let element;

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
    result.status = "FAIL";
    result.description = error || "No elements matched criteria.";
    return result;
  }
  element = foundElement;
  result.description += ` Found element by ${foundBy}.`;

  // No matching elements
  if (!element.elementId) {
    result.status = "FAIL";
    result.description = "No elements matched selector and/or text.";
    return result;
  }

  // Set element in outputs
  result.outputs = await setElementOutputs({ element });

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
    } catch (error) {
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
  if (config.recording) {
    await wait({ config: config, step: { wait: 2000 }, driver: driver });
  }
  // PASS
  return result;
}
