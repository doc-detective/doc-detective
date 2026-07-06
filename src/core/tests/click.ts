import { validate } from "../../common/src/validate.js";
import { findElement } from "./findElement.js";

export { clickElement };

// Click an element.
async function clickElement({ config, step, driver, appSession }: { config: any; step: any; driver: any; appSession?: any }) {
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
    // `button` and `duration` describe the click itself, not the element
    // search — move them into the click sub-effect.
    findStep = {
      find: {
        ...step.click,
        click: {
          button: step.click.button,
          ...(step.click.duration !== undefined && {
            duration: step.click.duration,
          }),
        },
      },
    };
    if (findStep.find.button) {
      delete findStep.find.button;
    }
    if (findStep.find.duration !== undefined) {
      delete findStep.find.duration;
    }
  }

  const findResult = await findElement({
    config,
    step: findStep,
    driver,
    click: true,
    appSession,
  });

  // Unified model: click delegates element EXISTENCE (the implicit verification)
  // to find, and the actual click is performed inside find as a sub-effect =
  // EXECUTION. So click owns no spec of its own; it PROPAGATES find's computed
  // outputs (incl. `found`), its existence assertion(s), and the rolled-up
  // status verbatim. found→PASS, not-found→FAIL, click-fails→FAIL all carry
  // through unchanged.
  result.outputs = findResult.outputs;
  result.assertions = findResult.assertions;
  result.status = findResult.status;
  result.description = findResult.description;

  return result;
}
