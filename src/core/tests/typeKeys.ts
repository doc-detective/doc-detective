import { validate } from "../../common/src/validate.js";
import {
  findElementByCriteria,
} from "./findStrategies.js";
import { loadHeavyDep } from "../../runtime/loader.js";
import { isRecordingActive } from "./ffmpegRecorder.js";
import { waitForOutputMatch } from "../utils.js";
import {
  parseSurfaceRef,
  reinterpretForSessions,
  switchToSurface,
} from "./browserSurface.js";
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
import {
  APP_GESTURES,
  ANDROID_KEYCODES,
  IOS_BUTTONS,
  IOS_TEXT_KEYS,
  DEVICE_KEYS,
} from "./appGestures.js";
import { waitForNetworkIdle, waitForDOMStable } from "./browserWait.js";
import {
  buildConditionContext,
  evaluateImplicitAssertions,
} from "../routing.js";
import type { ImplicitAssertionSpec } from "../routing.js";

export {
  typeKeys,
  translateProcessKeys,
  splitKeyRuns,
  resolveSurface,
  resolveInputDelay,
};

// Split a `keys` array into ordered runs of literal text and $KEY$ tokens for
// a mobile app surface (phase A6). Adjacent text merges into one run. On iOS,
// text-equivalent tokens ($ENTER$ → "\n", …) fold INTO the text; physical
// buttons and the deliberately-unsupported device keys stay tokens so the
// adapter can press them or explain why it can't. Unknown $…$ sentinels pass
// through verbatim as text — the process-path convention.
function splitKeyRuns(
  keys: string[],
  platform: "android" | "ios"
): Array<{ kind: "text"; text: string } | { kind: "token"; token: string }> {
  const runs: Array<
    { kind: "text"; text: string } | { kind: "token"; token: string }
  > = [];
  const pushText = (text: string) => {
    const last = runs[runs.length - 1];
    if (last?.kind === "text") last.text += text;
    else runs.push({ kind: "text", text });
  };
  for (const key of keys) {
    // Digits included: F-keys and numpad tokens ($F11$, $NUMPAD_0$) are part
    // of the vocabulary too.
    const isSentinel = /^\$[A-Z0-9_]+\$$/.test(key);
    if (!isSentinel) {
      pushText(key);
      continue;
    }
    if (platform === "ios") {
      const folded = IOS_TEXT_KEYS[key];
      if (folded !== undefined) {
        pushText(folded);
        continue;
      }
      if (IOS_BUTTONS[key] !== undefined || DEVICE_KEYS.has(key)) {
        runs.push({ kind: "token", token: key });
        continue;
      }
      pushText(key);
      continue;
    }
    // android
    if (ANDROID_KEYCODES[key] !== undefined) {
      runs.push({ kind: "token", token: key });
    } else {
      pushText(key);
    }
  }
  return runs;
}

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
// Exported AFTER its declaration: a `const` is not hoisted, so naming it in the
// top-of-file export list (before this point) referenced it in the temporal
// dead zone. Exporting here keeps the binding live for tests without the TDZ
// hazard.
export { _processKeyMap };

// Resolve the effective inter-keystroke delay (ms). The schema default is 100,
// but an author may explicitly request 0 ("type as fast as possible"). Use
// nullish coalescing so ONLY an absent value (undefined/null) falls back to the
// default — an explicit 0 is honored rather than being clobbered by `|| 100`.
function resolveInputDelay(inputDelay: unknown): number {
  return typeof inputDelay === "number" ? inputDelay : 100;
}

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
      if (typeof next === "string" && /^[A-Za-z]$/.test(next)) {
        // Ctrl + ASCII letter → control byte (Ctrl+C → \x03). Only valid for
        // A–Z, so the charCode math can't underflow into a garbage code point.
        out.push(String.fromCharCode(next.toUpperCase().charCodeAt(0) - 64));
        i++; // consume the next key
      } else if (
        typeof next === "string" &&
        Object.prototype.hasOwnProperty.call(_processKeyMap, next)
      ) {
        // Ctrl + a known sentinel (e.g. $CTRL$ + $ENTER$): there is no distinct
        // control byte, so emit the sentinel's mapped value rather than deriving
        // a bogus code from the literal "$".
        out.push(_processKeyMap[next]);
        i++; // consume the next key
      } else {
        // No usable next token: leave $CTRL$ as-is (and let the next token, if
        // any, be handled on its own iteration) rather than producing garbage.
        out.push(key);
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

// Resolve a `type.surface` value to a target descriptor. Since Phase 3 this
// is the shared parser from browserSurface.js:
//   { process: "name" }       → { kind: "process", name }
//   "name" (not an engine kw) → { kind: "process", name }
//   "chrome"|… (engine kw)    → { kind: "browser", engine } (active browser)
//   { browser, window?, tab? }→ { kind: "browser", … }
//   { app: … }                → { kind: "unsupported" } (future kind)
//   undefined                 → { kind: "none" } (active-element/element path)
// Kept as a named export — tests exercise the type-step resolution through it.
function resolveSurface(surface: any) {
  return parseSurfaceRef(surface);
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
    // waitForOutputMatch tests the COMBINED stdout+stderr (per the
    // `type.waitUntil.stdio` "combined" schema docs), distinct from
    // waitForReady's stdout-OR-stderr `waitForStdio`.
    matchPromise = waitForOutputMatch(bg, waitUntil.stdio, {
      deadline: Date.now() + timeout,
    });
  }

  // 4. Write keys honoring inputDelay between keystrokes (always — line REPLs
  //    can drop bytes written too fast).
  for (let i = 0; i < bytes.length; i++) {
    bg.write(bytes[i]);
    if (inputDelay > 0 && i < bytes.length - 1) {
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
  appSession,
}: {
  config: any;
  step: any;
  driver: any;
  processRegistry?: Map<string, any>;
  appSession?: any;
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
    inputDelay: resolveInputDelay(step.type.inputDelay),
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
  // App-surface branch (native app phase A1): type into an element on the
  // app session's driver. Element criteria are required — focused-window
  // typing and the device $KEY$ vocabulary land in later phases. Checked
  // before the session reinterpretation below: an app registry hit is
  // authoritative for its name.
  const appRef = resolveAppSurfaceRef(step.type.surface, appSession);
  if (appRef) {
    if (appRef.error) {
      result.status = "FAIL";
      result.description = appRef.error;
      return result;
    }
    // Window selectors (ADR 01036): resolve to a real window before any
    // typing decisions — previously `window` was silently ignored here.
    let windowTarget: any = null;
    if (appRef.window !== undefined) {
      const resolvedWindow = await resolveAppWindow({
        entry: appRef.entry!,
        selector: appRef.window,
        timeoutMs: step.type.timeout ?? 5000,
      });
      if (!resolvedWindow.ok) {
        result.status = "FAIL";
        result.description = resolvedWindow.message;
        return result;
      }
      windowTarget = resolvedWindow.target;
    } else {
      windowTarget = await activeAppWindow(appRef.entry!);
    }
    const wu = step.type.waitUntil;
    if (
      wu &&
      (wu.networkIdleTime !== undefined ||
        wu.domIdleTime !== undefined ||
        wu.stdio !== undefined)
    ) {
      result.status = "FAIL";
      result.description =
        "App surfaces accept only delayMs/find readiness conditions.";
      return result;
    }
    const platform = appRef.entry!.platform ?? "windows";
    const isMobile = platform === "android" || platform === "ios";
    const specialTokens = (step.type.keys as any[]).filter(
      // Digits included so F-key/numpad tokens ($F11$, $NUMPAD_0$) are
      // recognized and rejected on desktop app surfaces like the rest.
      (key) => typeof key === "string" && /^\$[A-Z0-9_]+\$$/.test(key)
    );
    if (specialTokens.length && !isMobile) {
      result.status = "FAIL";
      result.description = `Special key tokens (${specialTokens.join(", ")}) aren't supported on Windows/macOS app surfaces yet — the device key vocabulary is mobile-only in this phase.`;
      return result;
    }
    // Phase A6: mobile surfaces split keys into text/token runs; desktop
    // surfaces keep the single-text path.
    const runs: Array<
      { kind: "text"; text: string } | { kind: "token"; token: string }
    > = isMobile
      ? splitKeyRuns(step.type.keys, platform as "android" | "ios")
      : [{ kind: "text", text: step.type.keys.join("") }];
    const textRuns = runs.filter((run) => run.kind === "text");
    const hasAppElementCriteria =
      step.type.selector ||
      step.type.elementText ||
      step.type.elementId ||
      step.type.elementTestId ||
      step.type.elementAria;
    if (!hasAppElementCriteria && textRuns.length) {
      // Text needs a destination. Android can type into the focused element
      // (mobile: type); iOS can't (XCUITest's mobile: keys is iPad-only), and
      // desktop focused-window typing is a later phase. Device-key-only steps
      // (e.g. ["$BACK$"]) never need criteria.
      if (platform === "ios") {
        result.status = "FAIL";
        result.description =
          "Typing text on an iOS app surface requires element criteria (elementText, elementId, elementAria, or a native selector) — iOS has no focused-element typing. Device keys alone (e.g. [\"$HOME$\"]) don't need criteria.";
        return result;
      }
      if (!isMobile) {
        result.status = "FAIL";
        result.description =
          "Typing on an app surface requires element criteria (elementText, elementId, elementAria, or a native selector) in this phase.";
        return result;
      }
    }
    const switched = await ensureAppForeground(appRef.entry!, appSession);
    if (switched.error) {
      result.status = "FAIL";
      result.description = switched.error;
      return result;
    }
    const appDriver = appRef.entry!.driver;
    const gestures = APP_GESTURES[platform];
    let element: any = null;
    if (hasAppElementCriteria) {
      const found = await findAppElement({
        driver: appDriver,
        criteria: step.type,
        // ?? so an explicit `timeout: 0` (schema minimum) stays an
        // immediate check instead of being clobbered to the default.
        timeout: step.type.timeout ?? 5000,
        platform: appRef.entry!.platform,
        root: scopedFindRoot(appRef.entry!, windowTarget),
      });
      if (found.error) {
        result.status = "FAIL";
        result.description = found.error;
        return result;
      }
      element = found.element;
    }
    try {
      if (element) await element.click();
      // No inputDelay between runs on app surfaces: the schema promises the
      // native driver types atomically ("Not applied on app surfaces in this
      // phase"), and AJV's useDefaults injects inputDelay=100 even when the
      // author omits it — so applying it here would add an unpromised 100ms
      // between every text/token run (e.g. "text" + $ENTER$).
      for (const run of runs) {
        if (run.kind === "text") {
          if (element) {
            await element.addValue(run.text);
          } else {
            // Android focused-element typing (criteria-less, mobile: type).
            await gestures!.typeFocused!(appDriver, run.text);
          }
        } else {
          const pressed = await gestures!.pressKey!(appDriver, run.token);
          if (pressed.error) {
            result.status = "FAIL";
            result.description = pressed.error;
            return result;
          }
        }
      }
    } catch (error: any) {
      result.status = "FAIL";
      result.description = `Couldn't type into the app element: ${error.message}`;
      return result;
    }
    if (wu?.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, wu.delayMs));
    }
    if (wu?.find) {
      const ready = await findAppElement({
        driver: appRef.entry!.driver,
        criteria: wu.find,
        timeout: step.type.timeout ?? 5000,
        platform: appRef.entry!.platform,
        root: scopedFindRoot(appRef.entry!, windowTarget),
      });
      if (ready.error) {
        result.status = "FAIL";
        result.description = `Typed, but the readiness element never appeared: ${ready.error}`;
        return result;
      }
    }
    result.description = `Typed keys into the app surface.`;
    result.outputs = { keys: step.type.keys };
    return result;
  }

  // A bare string is identity-only (Phase 4): when a browser session owns the
  // name, it routes to the browser branch instead of the process lookup.
  const resolved = reinterpretForSessions(
    driver,
    resolveSurface(step.type.surface)
  );
  if (resolved.kind === "unsupported") {
    result.status = "FAIL";
    result.description = "surface kind not yet supported.";
    return result;
  }
  if (resolved.kind === "process") {
    // A bare-string surface can't be kind-checked by the schema; reject
    // browser readiness conditions that slipped through it loudly instead of
    // silently ignoring them.
    const wu = step.type.waitUntil;
    if (wu && (wu.networkIdleTime !== undefined || wu.domIdleTime !== undefined || wu.find !== undefined)) {
      result.status = "FAIL";
      result.description = `Browser readiness conditions (networkIdleTime/domIdleTime/find) don't apply to the process surface "${resolved.name}".`;
      return result;
    }
    return await typeToProcess({ step, name: resolved.name!, processRegistry });
  }
  if (resolved.kind === "browser") {
    // Browser-surface branch (Phase 3/4): focus the requested session +
    // window/tab, then fall through to the unchanged element/active-element
    // typing path — against the resolved session's driver.
    const wu = step.type.waitUntil;
    if (wu && (wu.stdio !== undefined || wu.delayMs !== undefined)) {
      result.status = "FAIL";
      result.description =
        "Process readiness conditions (stdio/delayMs) don't apply to a browser surface.";
      return result;
    }
    const switched = await switchToSurface(driver, step.type.surface);
    if (!switched.ok) {
      result.status = "FAIL";
      result.description = switched.message;
      return result;
    }
    driver = switched.driver ?? driver;
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

  // Browser readiness (Phase 3): after typing into a browser surface, wait on
  // the requested page conditions. Unlike goTo, nothing applies by default —
  // only the conditions the author names run, all bounded by `timeout`.
  if (resolved.kind === "browser" && step.type.waitUntil) {
    const readiness = await waitForBrowserReadiness({
      driver,
      waitUntil: step.type.waitUntil,
      timeout: typeof step.type.timeout === "number" ? step.type.timeout : 5000,
    });
    if (!readiness.ok) {
      result.status = "FAIL";
      result.description = `Typed keys, but readiness conditions weren't met: ${readiness.message}`;
      return result;
    }
    result.description = "Typed keys; readiness conditions met.";
  }

  // PASS
  return result;
}

// Run the browser-surface readiness conditions of a `type` step: network
// idle, DOM stable, and element presence, in parallel, each bounded by the
// shared deadline. Mirrors goTo's post-navigation waits (same probes), minus
// goTo's defaults — absent conditions simply don't run.
async function waitForBrowserReadiness({
  driver,
  waitUntil,
  timeout,
}: {
  driver: any;
  waitUntil: any;
  timeout: number;
}): Promise<{ ok: boolean; message: string }> {
  const failures: string[] = [];
  const checks: Promise<void>[] = [];
  if (typeof waitUntil.networkIdleTime === "number") {
    checks.push(
      waitForNetworkIdle(driver, waitUntil.networkIdleTime, timeout).catch(
        (error: any) => {
          failures.push(`network idle: ${error.message}`);
          throw error;
        }
      )
    );
  }
  if (typeof waitUntil.domIdleTime === "number") {
    checks.push(
      waitForDOMStable(driver, waitUntil.domIdleTime, timeout).catch(
        (error: any) => {
          failures.push(`DOM stable: ${error.message}`);
          throw error;
        }
      )
    );
  }
  if (waitUntil.find) {
    const find = { ...waitUntil.find };
    if (find.elementClass && !Array.isArray(find.elementClass)) {
      find.elementClass = [find.elementClass];
    }
    checks.push(
      (async () => {
        const { element, error } = await findElementByCriteria({
          selector: find.selector,
          elementText: find.elementText,
          elementId: find.elementId,
          elementTestId: find.elementTestId,
          elementClass: find.elementClass,
          elementAttribute: find.elementAttribute,
          elementAria: find.elementAria,
          timeout,
          driver,
        });
        if (!element) {
          const message = `element not found (${JSON.stringify(waitUntil.find)})`;
          failures.push(error ? `${message}: ${error}` : message);
          throw new Error(message);
        }
      })()
    );
  }
  if (!checks.length) return { ok: true, message: "No conditions to wait on." };
  const settled = await Promise.allSettled(checks);
  if (settled.some((r) => r.status === "rejected")) {
    return { ok: false, message: failures.join("; ") };
  }
  return { ok: true, message: "All conditions met." };
}
