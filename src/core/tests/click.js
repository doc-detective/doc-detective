const { validate } = require("doc-detective-common");
const { findElement } = require("./findElement");

exports.clickElement = clickElement;

// Click an element.
async function clickElement({ config, step, driver }) {
  const result = {
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
  let findStep;

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
