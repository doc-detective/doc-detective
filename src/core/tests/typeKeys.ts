import { validate } from "../../common/src/validate.js";
import {
  findElementByCriteria,
} from "./findStrategies.js";
import { loadHeavyDep } from "../../runtime/loader.js";
import { isRecordingActive } from "./ffmpegRecorder.js";
import { waitForOutputMatch } from "../utils.js";
import {
  buildConditionContext,
  evaluateImplicitAssertions,
} from "../routing.js";
import type { ImplicitAssertionSpec } from "../routing.js";

export { typeKeys, translateProcessKeys, resolveSurface, _processKeyMap };

// Browser engine keywords reserved for the (later-phase) browser surface kind.
// A bare-string surface that matches one of these targets a browser, which is
// not yet supported as a `type` target — so it FAILs at runtime in Phase 1.
const RESERVED_ENGINE_KEYWORDS = new Set([
  "chrome",
  "firefox",
  "safari",
  "webkit",
  "edge",
]);

// Control-byte map for keystrokes sent to a PROCESS surface (stdin pipe). Kept
// module-level and webdriverio-free so the process path never loads the heavy
// browser dep. Sends the raw bytes a line-oriented REPL/CLI expects.
const _processKeyMap: Record<string, string> = {
  $ENTER$: "\r",
  $RETURN$: "\r",
  $TAB$: "\t",
  $ESCAPE$: "\x1b",
  $BACKSPACE$: "\x7f",
  $SPACE$: " ",
  $ARROW_UP$: "\x1b[A",
  $ARROW_DOWN$: "\x1b[B",
  $ARROW_RIGHT$: "\x1b[C",
  $ARROW_LEFT$: "\x1b[D",
  $DELETE$: "\x1b[3~",
};

// Translate an authored keys array into the raw bytes written to a process's
// stdin. Plain strings pass through verbatim. A `$…$` sentinel maps via
// `_processKeyMap`; `$CTRL$` consumes the NEXT key and emits its control byte
// (e.g. $CTRL$ + "c" → \x03). Unknown `$…$` tokens pass through verbatim.
function translateProcessKeys(keys: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (key === "$CTRL$") {
      const next = keys[i + 1];
      if (typeof next === "string" && next.length > 0) {
        const c = next[0];
        out.push(String.fromCharCode(c.toUpperCase().charCodeAt(0) - 64));
        i++; // consume the next key
      }
      continue;
    }
    if (
      typeof key === "string" &&
      key.startsWith("$") &&
      key.endsWith("$") &&
      Object.prototype.hasOwnProperty.call(_processKeyMap, key)
    ) {
      out.push(_processKeyMap[key]);
      continue;
    }
    out.push(key);
  }
  return out;
}

// Resolve a `type.surface` value to a target descriptor. Phase 1 only resolves
// the PROCESS kind:
//   { process: "name" }       → { kind: "process", name }
//   "name" (not an engine kw) → { kind: "process", name }
//   "chrome"|… (engine kw)    → { kind: "unsupported" } (browser, later phase)
//   { browser|app: … }        → { kind: "unsupported" }
//   undefined                 → { kind: "none" } (active-element/element path)
function resolveSurface(
  surface: any
): { kind: "process" | "none" | "unsupported"; name?: string } {
  if (surface === undefined || surface === null) return { kind: "none" };
  if (typeof surface === "string") {
    const name = surface.trim();
    if (RESERVED_ENGINE_KEYWORDS.has(name.toLowerCase()))
      return { kind: "unsupported" };
    return { kind: "process", name };
  }
  if (typeof surface === "object" && typeof surface.process === "string") {
    return { kind: "process", name: surface.process.trim() };
  }
  // Any other object shape (browser/app) is a future surface kind.
  return { kind: "unsupported" };
}

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

// Send keystrokes to a background process's stdin. Mirrors runShell's outputs
// and assertion model: `outputs.stdio` carries the captured stdout/stderr, and
// `outputs.stdioMatched` (when waitUntil.stdio is set) is asserted via the
// shared expression engine — so the engine, not this function, decides PASS/FAIL.
async function typeToProcess({
  step,
  name,
  processRegistry,
}: {
  step: any;
  name: string;
  processRegistry?: Map<string, any>;
}) {
  const result: any = {
    status: "PASS",
    description: `Typed keys to process "${name}".`,
    outputs: {},
    assertions: [],
  };

  // 1. Look up the background process. Missing registry/entry → FAIL naming it,
  //    with NO assertion records (this is a targeting failure, not an assertion).
  const entry = processRegistry?.get(name);
  const bg = entry?.bg;
  if (!bg) {
    result.status = "FAIL";
    result.description = `No background process named "${name}" is running to type into.`;
    return result;
  }

  const waitUntil = step.type.waitUntil;
  const timeout =
    typeof step.type.timeout === "number" ? step.type.timeout : 5000;
  const inputDelay = step.type.inputDelay;

  // 2. Translate keys to raw stdin bytes (plain verbatim; `$…$` via the process
  //    key map; `$CTRL$` consumes the next key).
  const bytes = translateProcessKeys(step.type.keys);

  // 3. Subscribe-before-write: build the output-match promise BEFORE writing so
  //    a match emitted between write and subscribe isn't missed.
  let matchPromise: Promise<boolean> | null = null;
  if (waitUntil && typeof waitUntil.stdio === "string") {
    matchPromise = waitForOutputMatch(bg, waitUntil.stdio, {
      deadline: Date.now() + timeout,
    });
  }

  // 4. Write keys honoring inputDelay between keystrokes (always — line REPLs
  //    can drop bytes written too fast).
  for (let i = 0; i < bytes.length; i++) {
    bg.write(bytes[i]);
    if (inputDelay && i < bytes.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, inputDelay));
    }
  }

  // 5. Outputs mirror runShell.
  result.outputs.process = name;
  result.outputs.stdio = {
    stdout: bg.getStdout(),
    stderr: bg.getStderr(),
  };

  // 6. Readiness / assertions.
  if (matchPromise) {
    const matched = await matchPromise;
    result.outputs.stdioMatched = matched;
    // Re-snapshot stdio after waiting so the captured output reflects the match.
    result.outputs.stdio = { stdout: bg.getStdout(), stderr: bg.getStderr() };
    const specs: ImplicitAssertionSpec[] = [
      { statement: "$$outputs.stdioMatched == true", severity: "fail" },
    ];
    const { assertions, status } = await evaluateImplicitAssertions(
      specs,
      buildConditionContext({ outputs: result.outputs })
    );
    result.assertions = assertions;
    result.status = status;
    result.description = matched
      ? `Typed keys to process "${name}"; output matched (${waitUntil.stdio}).`
      : `Typed keys to process "${name}"; output did not match (${waitUntil.stdio}) within ${timeout}ms.`;
    return result;
  }

  if (waitUntil && typeof waitUntil.delayMs === "number") {
    // delayMs-only readiness: sleep, then PASS with no assertion records.
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(waitUntil.delayMs, timeout))
    );
    return result;
  }

  // No waitUntil → PASS with empty assertions.
  return result;
}

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
async function typeKeys({
  config,
  step,
  driver,
  processRegistry,
}: {
  config: any;
  step: any;
  driver: any;
  processRegistry?: Map<string, any>;
}) {
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

  // Process-surface branch: when `surface` targets a background process, send
  // the keystrokes to its stdin instead of the browser/active element. Runs
  // BEFORE the element/active-element path (which stays untouched). This path is
  // webdriverio-free — it never loads the heavy browser dep.
  const resolved = resolveSurface(step.type.surface);
  if (resolved.kind === "unsupported") {
    result.status = "FAIL";
    result.description = "surface kind not yet supported.";
    return result;
  }
  if (resolved.kind === "process") {
    return await typeToProcess({ step, name: resolved.name!, processRegistry });
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
