import { validate } from "../../common/src/validate.js";
import {
  findElementByCriteria,
} from "./findStrategies.js";
import { loadHeavyDep } from "../../runtime/loader.js";
import { isRecordingActive } from "./ffmpegRecorder.js";
import {
  buildConditionContext,
  evaluateImplicitAssertions,
} from "../routing.js";
import type { ImplicitAssertionSpec } from "../routing.js";

export { typeKeys };

// webdriverio is a heavy runtime dep that a lean install does not ship (it is
// lazy-installed on first browser use). Importing `Key` statically would drag
// webdriverio into the module graph at load time, breaking even `--version` on
// a lean install. So lazy-load it the first time a typeKeys step runs, mirroring
// saveScreenshot.ts. The modifier entries (Ctrl/Command/…) are webdriverio
// sentinels that driver.keys() interprets per-platform — we must use the real
// export, not hardcoded WebDriver code points.
//
// The type is a minimal LOCAL declaration (see wdioTypes.ts), not
// `typeof import("webdriverio")`, so `tsc` does not require the optional package
// on disk — the runtime still loads the real module via loadHeavyDep.
import type { WdioModule } from "./wdioTypes.js";

let _specialKeyMap: Record<string, string> | null = null;

async function getSpecialKeyMap(
  ctx: { cacheDir?: string } = {}
): Promise<Record<string, string>> {
  if (_specialKeyMap) return _specialKeyMap;
  const wdio = await loadHeavyDep<WdioModule>("webdriverio", { ctx });
  const { Key } = wdio;
  _specialKeyMap = {
    $CTRL$: Key.Ctrl,
    $NULL$: Key.NULL,
    $CANCEL$: Key.Cancel,
    $HELP$: Key.Help,
    $BACKSPACE$: Key.Backspace,
    $TAB$: Key.Tab,
    $CLEAR$: Key.Clear,
    $RETURN$: Key.Return,
    $ENTER$: Key.Enter,
    $SHIFT$: Key.Shift,
    $CONTROL$: Key.Control,
    $ALT$: Key.Alt,
    $PAUSE$: Key.Pause,
    $ESCAPE$: Key.Escape,
    $SPACE$: Key.Space,
    $PAGE_UP$: Key.PageUp,
    $PAGE_DOWN$: Key.PageDown,
    $END$: Key.End,
    $HOME$: Key.Home,
    $ARROW_LEFT$: Key.ArrowLeft,
    $ARROW_UP$: Key.ArrowUp,
    $ARROW_RIGHT$: Key.ArrowRight,
    $ARROW_DOWN$: Key.ArrowDown,
    $INSERT$: Key.Insert,
    $DELETE$: Key.Delete,
    $SEMICOLON$: Key.Semicolon,
    $EQUALS$: Key.Equals,
    $NUMPAD_0$: Key.Numpad0,
    $NUMPAD_1$: Key.Numpad1,
    $NUMPAD_2$: Key.Numpad2,
    $NUMPAD_3$: Key.Numpad3,
    $NUMPAD_4$: Key.Numpad4,
    $NUMPAD_5$: Key.Numpad5,
    $NUMPAD_6$: Key.Numpad6,
    $NUMPAD_7$: Key.Numpad7,
    $NUMPAD_8$: Key.Numpad8,
    $NUMPAD_9$: Key.Numpad9,
    $MULTIPLY$: Key.Multiply,
    $ADD$: Key.Add,
    $SEPARATOR$: Key.Separator,
    // `$SUBSTRACT$` is a long-standing misspelling kept for backwards
    // compatibility; `$SUBTRACT$` is the correctly-spelled alias.
    $SUBSTRACT$: Key.Subtract,
    $SUBTRACT$: Key.Subtract,
    $DECIMAL$: Key.Decimal,
    $DIVIDE$: Key.Divide,
    $F1$: Key.F1,
    $F2$: Key.F2,
    $F3$: Key.F3,
    $F4$: Key.F4,
    $F5$: Key.F5,
    $F6$: Key.F6,
    $F7$: Key.F7,
    $F8$: Key.F8,
    $F9$: Key.F9,
    $F10$: Key.F10,
    $F11$: Key.F11,
    $F12$: Key.F12,
    $COMMAND$: Key.Command,
    $ZANKAKU_HANDKAKU$: Key.ZenkakuHankaku,
  };
  return _specialKeyMap;
}

// Type a sequence of keys in the active element.
//
// Unified assertion model: when the step targets a specific element (any
// element criterion present), element EXISTENCE is the single implicit
// verification — exposed as `outputs.found` and asserted via the trivial
// `$$outputs.found == true` expression through the shared engine. The focus
// (`element.click`) + `driver.keys` typing are EXECUTION: a failure there sets
// FAIL with NO extra assertion record. When NO element criteria are present the
// step types into the ACTIVE element, so there is no existence check at all —
// zero applicable specs roll up to PASS with empty `assertions`.
async function typeKeys({ config, step, driver }: { config: any; step: any; driver: any }) {
  // `assertions` starts empty: the no-criteria (active-element) path types into
  // the focused element with no existence check, so zero applicable specs roll
  // up to PASS with an empty assertions array. The criteria path overwrites it.
  let result: any = {
    status: "PASS",
    description: "Typed keys.",
    outputs: {},
    assertions: [],
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

  // Convert to array
  if (typeof step.type === "string") {
    step.type = [step.type];
  }
  // Convert to object
  if (Array.isArray(step.type)) {
    step.type = { keys: step.type };
  }
  // Convert keys property to object
  if (typeof step.type.keys === "string") {
    step.type.keys = [step.type.keys];
  }
  // Set default values
  step.type = {
    ...step.type,
    keys: step.type.keys || [],
    inputDelay: step.type.inputDelay || 100,
  };

  // Skip if no keys to type
  if (!step.type.keys.length) {
    result.status = "SKIPPED";
    result.description = "No keys to type.";
    return result;
  }

  // Find element to type into if any criteria are specified
  let element: any = null;
  const hasElementCriteria = step.type.selector || step.type.elementText ||
                             step.type.elementId || step.type.elementTestId ||
                             step.type.elementClass || step.type.elementAttribute ||
                             step.type.elementAria;

  if (hasElementCriteria) {
    const { element: foundElement, error } = await findElementByCriteria({
      selector: step.type.selector,
      elementText: step.type.elementText,
      elementId: step.type.elementId,
      elementTestId: step.type.elementTestId,
      elementClass: step.type.elementClass,
      elementAttribute: step.type.elementAttribute,
      elementAria: step.type.elementAria,
      timeout: 5000,
      driver,
    });

    // Compute the existence output and evaluate the implicit assertion through
    // the shared engine: found→PASS, not-found→FAIL.
    result.outputs.found = !!foundElement;
    const specs: ImplicitAssertionSpec[] = [
      { statement: "$$outputs.found == true", severity: "fail" },
    ];
    const { assertions, status } = await evaluateImplicitAssertions(
      specs,
      buildConditionContext({ outputs: result.outputs })
    );
    result.assertions = assertions;
    result.status = status;

    if (!foundElement) {
      result.description = error || `Couldn't find element to type into.`;
      return result;
    }
    element = foundElement;

    // Focus on the element before typing. This is EXECUTION: a failure sets
    // FAIL with no extra assertion record (the found assertion stays PASS).
    try {
      await element.click();
    } catch (error: any) {
      result.status = "FAIL";
      result.description = `Couldn't focus on element: ${error.message}`;
      return result;
    }
  }

  // Split into array of strings, each containing a single key
  if (isRecordingActive(driver)) {
    let keys: any[] = [];
    step.type.keys.forEach((key: any) => {
      if (key.startsWith("$") && key.endsWith("$")) {
        // Just push special keys
        keys.push(key);
      } else {
        // Split into array of chars
        const chars = key.split("");
        keys = keys.concat(chars);
      }
    });
    step.type.keys = keys;
  }

  // Substitute special keys
  // 1. For each key, identify if it follows the escape pattern of `$...$`.
  // 2. If it does, replace it with the corresponding `Key` value from `specialKeyMap`.
  // Only load the map (and thus webdriverio) when a sentinel token is actually
  // present — plain-text typing must not pull in the heavy dep or risk a
  // load-time FAIL. Loading webdriverio can throw (e.g. the runtime dep isn't
  // installed yet); return a step-level FAIL rather than aborting the whole run,
  // matching how other heavy-dep-backed steps behave.
  const hasSpecialTokens = step.type.keys.some(
    (key: any) => key.startsWith("$") && key.endsWith("$")
  );
  if (hasSpecialTokens) {
    let specialKeyMap: Record<string, string>;
    try {
      specialKeyMap = await getSpecialKeyMap({ cacheDir: config?.cacheDir });
    } catch (error: any) {
      result.status = "FAIL";
      result.description = `Couldn't load key definitions: ${error.message}`;
      return result;
    }
    step.type.keys = step.type.keys.map((key: any) => {
      if (key.startsWith("$") && key.endsWith("$") && specialKeyMap[key]) {
        return specialKeyMap[key];
      }
      return key;
    });
  }

  // Run action
  try {
    if (isRecordingActive(driver)) {
      // Type keys one at a time
      for (let i = 0; i < step.type.keys.length; i++) {
        await driver.keys(step.type.keys[i]);
        await new Promise((resolve) =>
          setTimeout(resolve, step.type.inputDelay)
        ); // Add a delay between keystrokes
      }
    } else {
      // Type all keys at once
      await driver.keys(step.type.keys);
    }
  } catch (error: any) {
    // FAIL: Error typing keys
    result.status = "FAIL";
    result.description = `Couldn't type keys: ${error.message}.`;
    return result;
  }

  // PASS
  return result;
}
