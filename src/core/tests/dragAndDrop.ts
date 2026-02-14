import { validate } from "doc-detective-common";
import { findElement } from "./findElement.js";
import { log } from "../utils.js";

export { dragAndDropElement };

/**
 * Performs a drag-and-drop from a source element to a target element using the provided driver.
 *
 * Attempts a native WebDriver.io dragAndDrop with a configurable duration and, if that appears to have no effect,
 * falls back to an HTML5 drag-and-drop simulation executed in the browser. Validates the step payload before execution,
 * locates both source and target elements, and reports success or failure with contextual description text.
 *
 * @param config - Test run configuration and utilities used for logging and environment context
 * @param step - Step payload conforming to `step_v3` containing `dragAndDrop` with `source`, `target`, and optional `duration`
 *               (where `source`/`target` may be a selector string or a find-object)
 * @param driver - WebDriver-compatible driver instance used to execute element commands and in-browser scripts
 * @returns An object with `status` set to `"PASS"` or `"FAIL"`, a human-readable `description`, and an `outputs` map (may include `rawElement` references from lookups)
 */
async function dragAndDropElement({ config, step, driver }: { config: any; step: any; driver: any }) {
  /**
   * Simulates an HTML5 drag-and-drop sequence between two DOM elements inside the browser.
   *
   * Executes a script in the browser context that dispatches `dragstart`, `dragover`, `drop`, and `dragend`
   * events on the provided elements and populates the events' `DataTransfer` with the source element's
   * `textContent` and, if present, a `widget-type` value from `source.dataset.widget`.
   *
   * @param driver - The WebDriver/driver instance used to execute the script in the browser context
   * @param sourceElement - A reference to the source DOM element (as accepted by the driver's execute call)
   * @param targetElement - A reference to the target DOM element (as accepted by the driver's execute call)
   */
  async function HTML5DragDrop({ driver, sourceElement, targetElement }: { driver: any; sourceElement: any; targetElement: any }) {
    await driver.execute(
      (sourceElement: any, targetElement: any) => {
        // Create a helper function to simulate HTML5 drag and drop
        function simulateHTML5DragDrop(source: any, target: any) {
          // Create and dispatch dragstart event
          const dragStartEvent = new DragEvent("dragstart", {
            bubbles: true,
            cancelable: true,
            dataTransfer: new DataTransfer(),
          });

          // Set data transfer data
          dragStartEvent.dataTransfer!.setData("text/plain", source.textContent);
          if (source.dataset.widget) {
            dragStartEvent.dataTransfer!.setData(
              "widget-type",
              source.dataset.widget
            );
          }

          source.dispatchEvent(dragStartEvent);

          // Create and dispatch dragover event on target
          const dragOverEvent = new DragEvent("dragover", {
            bubbles: true,
            cancelable: true,
            dataTransfer: dragStartEvent.dataTransfer,
          });
          target.dispatchEvent(dragOverEvent);

          // Create and dispatch drop event
          const dropEvent = new DragEvent("drop", {
            bubbles: true,
            cancelable: true,
            dataTransfer: dragStartEvent.dataTransfer,
          });
          target.dispatchEvent(dropEvent);

          // Create and dispatch dragend event
          const dragEndEvent = new DragEvent("dragend", {
            bubbles: true,
            cancelable: true,
            dataTransfer: dragStartEvent.dataTransfer,
          });
          source.dispatchEvent(dragEndEvent);

          return true;
        }

        return simulateHTML5DragDrop(sourceElement, targetElement);
      },
      sourceElement,
      targetElement
    );
  }

  const result: any = {
    status: "PASS",
    description: "Dragged and dropped element.",
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

  // Set default duration if not provided
  const duration = step.dragAndDrop.duration || 1000;

  let sourceElement: any, targetElement: any;

  try {
    // Prepare find steps for source and target
    let sourceFindStep: any;
    if (typeof step.dragAndDrop.source === "string") {
      sourceFindStep = { find: step.dragAndDrop.source };
    } else if (typeof step.dragAndDrop.source === "object") {
      sourceFindStep = { find: { ...step.dragAndDrop.source } };
    }

    let targetFindStep: any;
    if (typeof step.dragAndDrop.target === "string") {
      targetFindStep = { find: step.dragAndDrop.target };
    } else if (typeof step.dragAndDrop.target === "object") {
      targetFindStep = { find: { ...step.dragAndDrop.target } };
    }

    // Execute both element searches concurrently
    const [sourceResult, targetResult] = await Promise.all([
      findElement({ config, step: sourceFindStep, driver }),
      findElement({ config, step: targetFindStep, driver }),
    ]);

    // Check if source or target element search failed
    if (sourceResult.status === "FAIL") {
      return sourceResult;
    }
    if (targetResult.status === "FAIL") {
      return targetResult;
    }
    sourceElement = sourceResult.outputs.rawElement;
    targetElement = targetResult.outputs.rawElement;
    result.description = `Found source element. Found target element.`;
  } catch (error: any) {
    result.status = "FAIL";
    result.description = error.message;
    return result;
  }

  try {
    // Check if elements are draggable and try different approaches
    const sourceIsDraggable = await sourceElement.getAttribute("draggable");
    const sourceHasDragEvents = await sourceElement.getProperty("draggable");

    log(
      config,
      "debug",
      `Source element draggable: ${sourceIsDraggable}, has drag events: ${sourceHasDragEvents}`
    );

    // Try WebDriver.io method, but verify it actually worked
    log(config, "debug", "Trying WebDriver.io drag and drop method");

    // Get initial state of target to check if drop worked
    const sourceInitialLocation = await sourceElement.getLocation();
    const sourceInitialSize = await sourceElement.getSize();

    await sourceElement.dragAndDrop(targetElement, { duration });

    // Check if anything actually changed in the target
    const sourceFinalLocation = await sourceElement.getLocation();
    const sourceFinalSize = await sourceElement.getSize();

    const sourceChanged =
      sourceInitialLocation.x !== sourceFinalLocation.x ||
      sourceInitialLocation.y !== sourceFinalLocation.y ||
      sourceInitialSize.width !== sourceFinalSize.width ||
      sourceInitialSize.height !== sourceFinalSize.height;

    if (!sourceChanged) {
      // WebDriver.io method failed silently, try HTML5 simulation
      log(
        config,
        "debug",
        "WebDriver.io drag and drop appeared to fail silently, trying HTML5 simulation"
      );

      try {
        await HTML5DragDrop({ driver, sourceElement, targetElement });
      } catch (error: any) {
        log(
          config,
          "debug",
          `HTML5 drag and drop failed after WebDriver.io failed silently: ${error.message}`
        );
        result.status = "FAIL";
        result.description += ` Drag and drop failed: ${error.message}`;
        return result;
      }
      log(
        config,
        "debug",
        "Performed drag and drop with HTML5 simulation as fallback after WebDriver.io failed silently."
      );
      result.description += " Performed drag and drop.";
    } else {
      log(config, "debug", "Performed drag and drop with WebDriver.io.");
      result.description += " Performed drag and drop.";
    }
  } catch (error: any) {
    result.status = "FAIL";
    result.description = `Couldn't perform drag and drop. ${error.message}`;
    return result;
  }

  // PASS
  return result;
}