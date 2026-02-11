const { validate } = require("doc-detective-common");
const { Key } = require("webdriverio");
const {
  findElementByCriteria,
} = require("./findStrategies");

exports.typeKeys = typeKeys;

const specialKeyMap = {
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
  $SUBSTRACT$: Key.Subtract,
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

// Type a sequence of keys in the active element.
async function typeKeys({ config, step, driver }) {
  let result = { status: "PASS", description: "Typed keys." };

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
  let element = null;
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
    
    if (!foundElement) {
      result.status = "FAIL";
      result.description = error || `Couldn't find element to type into.`;
      return result;
    }
    element = foundElement;
    
    // Focus on the element before typing
    try {
      await element.click();
    } catch (error) {
      result.status = "FAIL";
      result.description = `Couldn't focus on element: ${error.message}`;
      return result;
    }
  }

  // Split into array of strings, each containing a single key
  if (config.recording) {
    let keys = [];
    step.type.keys.forEach((key) => {
      if (key.startsWith("$") && key.endsWith("$")) {
        // Just push special keys
        keys.push(key);
      } else {
        // Split into array of chars
        let chars = key.split("");
        keys = keys.concat(chars);
      }
    });
    step.type.keys = keys;
  }

  // Substitute special keys
  // 1. For each key, identify if it following the escape pattern of `$...$`.
  // 2. If it does, replace it with the corresponding `Key` object from `specialKeyMap`.
  step.type.keys = step.type.keys.map((key) => {
    if (key.startsWith("$") && key.endsWith("$") && specialKeyMap[key]) {
      return specialKeyMap[key];
    }
    return key;
  });

  // Run action
  try {
    if (config.recording) {
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
  } catch (error) {
    // FAIL: Error typing keys
    result.status = "FAIL";
    result.description = `Couldn't type keys: ${error.message}.`;
    return result;
  }

  // PASS
  return result;
}
