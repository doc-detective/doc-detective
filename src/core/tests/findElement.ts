import { validate } from "../../common/src/validate.js";
import { switchToSurface } from "./browserSurface.js";
import {
  resolveAppSurfaceRef,
  findAppElement,
  ensureAppForeground,
} from "./appSurface.js";
import {
  resolveAppWindow,
  activeAppWindow,
  scopedFindRoot,
} from "./appWindows.js";
import { APP_GESTURES } from "./appGestures.js";
import { performElementPress } from "./movement.js";
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
async function findElement({ config, step, driver, click, appSession }: { config: any; step: any; driver: any; click?: any; appSession?: any }) {
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

  // Native app surfaces (phase A1): a find whose surface names an app runs on
  // the app session's driver via the platform's semantic-locator mapping.
  // click delegates here, so app clicks ride the same path.
  if (typeof step.find === "object" && step.find.surface !== undefined) {
    const appRef = resolveAppSurfaceRef(step.find.surface, appSession);
    if (appRef) {
      if (appRef.error) {
        result.status = "FAIL";
        result.description = appRef.error;
        return result;
      }
      // Window selectors (ADR 01036): resolve to a real window — Windows
      // re-roots the session (sticky), macOS holds the window element and
      // scopes the find under it. Without a selector, macOS steps keep
      // acting on the sticky active window.
      let windowTarget: any = null;
      if (appRef.window !== undefined) {
        const resolved = await resolveAppWindow({
          entry: appRef.entry!,
          selector: appRef.window,
          timeoutMs: step.find.timeout ?? 5000,
        });
        if (!resolved.ok) {
          result.status = "FAIL";
          result.description = resolved.message;
          return result;
        }
        windowTarget = resolved.target;
      } else {
        windowTarget = await activeAppWindow(appRef.entry!);
      }
      // Activate this app on its shared Android device session (no-op on
      // desktop / when already foreground) before locating.
      const switched = await ensureAppForeground(appRef.entry!, appSession);
      if (switched.error) {
        result.status = "FAIL";
        result.description = switched.error;
        return result;
      }
      const appDriver = appRef.entry!.driver;
      const found = await findAppElement({
        driver: appDriver,
        criteria: step.find,
        // ?? so an explicit `timeout: 0` (schema minimum) stays an
        // immediate check instead of being clobbered to the default.
        timeout: step.find.timeout ?? 5000,
        platform: appRef.entry!.platform,
        root: scopedFindRoot(appRef.entry!, windowTarget),
      });
      if (found.error) {
        result.description = found.error;
        result.outputs.found = false;
        return await finalizeFound({ result });
      }
      result.outputs.found = true;
      try {
        result.outputs.element = { text: await found.element.getText() };
      } catch {
        // Text extraction is best-effort on native elements.
      }
      await finalizeFound({ result });
      if (step.find.moveTo || step.find.type) {
        result.status = "FAIL";
        result.description +=
          " The moveTo/type sub-effects aren't supported on app surfaces; use a separate `type` step targeting the app surface.";
        return result;
      }
      if (click || step.find.click) {
        const clickSpec = step.find.click;
        const button =
          typeof clickSpec === "string" &&
          ["left", "right", "middle"].includes(clickSpec)
            ? clickSpec
            : clickSpec?.button || "left";
        const duration = step.find.click?.duration;
        const gestures =
          APP_GESTURES[appRef.entry!.platform ?? "windows"];
        if (duration && button !== "left") {
          // A long-press on an app surface is a primary-button press-and-hold;
          // the adapters don't hold a non-left button. Reject the combination
          // rather than silently long-pressing the left button.
          result.status = "FAIL";
          result.description += ` A long-press on an app surface uses the primary button; drop \`button: "${button}"\` or the \`duration\`.`;
          return result;
        }
        if (duration) {
          // Long-press (phase A6): dispatch to the platform's gesture adapter
          // (longClickGesture / touchAndHold / windows: click durationMs /
          // Mac2 W3C mouse chain). Press-and-hold is the primary button.
          try {
            await gestures.longPress(appDriver, found.element, duration);
            result.description += ` Long-pressed element (${duration}ms).`;
          } catch (error: any) {
            result.status = "FAIL";
            result.description += ` Couldn't long-press element (duration ${duration}ms). Error: ${error.message}`;
          }
        } else if (button !== "left") {
          // Non-left click: the drivers that can do it honor the button
          // (NovaWindows windows: click, Mac2 macos: rightClick); touch
          // surfaces and Mac2's absent middle-click return an actionable error.
          try {
            const clicked = await gestures.clickButton(
              appDriver,
              found.element,
              button
            );
            if (clicked.error) {
              result.status = "FAIL";
              result.description += ` ${clicked.error}`;
            } else {
              result.description += ` ${button}-clicked element.`;
            }
          } catch (error: any) {
            result.status = "FAIL";
            result.description += ` Couldn't ${button}-click element. Error: ${error.message}`;
          }
        } else {
          try {
            await found.element.click();
            result.description += " Clicked element.";
          } catch (error: any) {
            result.status = "FAIL";
            result.description += ` Couldn't click element. Error: ${error.message}`;
          }
        }
      }
      return result;
    }
  }

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
      // Argument-less click() maps to the classic element-click endpoint;
      // passing options makes wdio emit W3C pointer actions, which device
      // browsers (XCUITest web context, phase A5) reject.
      if (click) {
        try {
          await element.click();
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

  // Click element. A left/default click is argument-less: with options wdio
  // emits W3C pointer actions, which device browsers (XCUITest web context,
  // phase A5) reject — the bare form maps to the classic element-click
  // endpoint and works everywhere. Non-left buttons genuinely need the
  // actions path, so they keep the options form (desktop-only).
  if (step.find.click || click) {
    try {
      // The sub-effect's string shorthand names the button ("right"), per the
      // docs; other strings (element identifiers in click_v3's string form)
      // and `true` mean a default left click.
      const clickSpec = step.find.click;
      const button =
        typeof clickSpec === "string" &&
        ["left", "right", "middle"].includes(clickSpec)
          ? clickSpec
          : clickSpec?.button || "left";
      const duration =
        typeof clickSpec === "object" ? clickSpec?.duration : undefined;
      if (duration) {
        // Long-press (phase A6): a W3C press-pause-release chain. Like
        // non-left buttons, this needs the actions path, so it's
        // desktop-browser-only (device web contexts reject it).
        await performElementPress({ driver, element, button, duration });
        result.description += ` Long-pressed element (${duration}ms).`;
      } else if (button === "left") {
        await element.click();
        result.description += " Clicked element.";
      } else {
        await element.click({ button });
        result.description += " Clicked element.";
      }
    } catch (error: any) {
      result.status = "FAIL";
      // Name the operation that actually failed so a long-press failure
      // doesn't masquerade as a plain click.
      const failed =
        typeof step.find.click === "object" && step.find.click?.duration
          ? `long-press element (${step.find.click.duration}ms)`
          : "click element";
      result.description += ` Couldn't ${failed}. Error: ${error.message}`;
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
