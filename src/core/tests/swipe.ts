// The swipe step (phase A6): the movement subset of dragAndDrop — a pointer
// movement between two points, authored directly (from/to pixels relative to
// the surface's top-left) or via the direction shorthand (fractions). Valid
// on app and browser surfaces; a process has no screen to swipe. Pure
// execution: no implicit assertions, like goTo.
import { validate } from "../../common/src/validate.js";
import { switchToSurface } from "./browserSurface.js";
import { ensureAppForeground } from "./appSurface.js";
import {
  resolveTargetSurface,
  type ActiveSurfaceTracker,
} from "./activeSurface.js";
import {
  resolveAppWindow,
  activeAppWindow,
  appWindowRect,
} from "./appWindows.js";
import { APP_GESTURES } from "./appGestures.js";
import {
  directionToPoints,
  performMovement,
  getBrowserViewportRect,
  DEFAULT_SWIPE_DISTANCE,
  DEFAULT_SWIPE_DURATION,
} from "./movement.js";

export { swipeSurface };

// Normalize the three schema forms into one gesture shape. The directional
// forms keep `direction`/`distance` (adapters with a native directional
// gesture use them as-is); point-to-point carries `from`/`to`.
function normalizeSwipe(swipe: any): {
  direction?: string;
  distance?: number;
  from?: { x: number; y: number };
  to?: { x: number; y: number };
  duration: number;
} {
  if (typeof swipe === "string") {
    return {
      direction: swipe,
      distance: DEFAULT_SWIPE_DISTANCE,
      duration: DEFAULT_SWIPE_DURATION,
    };
  }
  if (swipe.from && swipe.to) {
    return {
      from: swipe.from,
      to: swipe.to,
      duration: swipe.duration ?? DEFAULT_SWIPE_DURATION,
    };
  }
  return {
    direction: swipe.direction,
    distance: swipe.distance ?? DEFAULT_SWIPE_DISTANCE,
    duration: swipe.duration ?? DEFAULT_SWIPE_DURATION,
  };
}

async function swipeSurface({
  config,
  step,
  driver,
  appSession,
  processRegistry,
  surfaceTracker,
}: {
  config: any;
  step: any;
  driver: any;
  appSession?: any;
  processRegistry?: Map<string, any>;
  surfaceTracker?: ActiveSurfaceTracker;
}) {
  const result: any = {
    status: "PASS",
    description: "Swiped the surface.",
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
  step = isValidStep.object;

  const surface =
    typeof step.swipe === "object" ? step.swipe.surface : undefined;
  const gesture = normalizeSwipe(step.swipe);
  result.outputs = {
    ...(gesture.direction !== undefined && { direction: gesture.direction }),
    ...(gesture.distance !== undefined && { distance: gesture.distance }),
    ...(gesture.from !== undefined && { from: gesture.from, to: gesture.to }),
    duration: gesture.duration,
  };

  // Uniform surface routing (ADR 01081): classify the step's target — the
  // explicit `surface` reference, or the context's active surface — then
  // dispatch to the kind's execution path.
  const target = resolveTargetSurface({
    surface,
    tracker: surfaceTracker,
    driver,
    appSession,
    processRegistry,
  });
  if (target.kind === "error") {
    result.status = "FAIL";
    result.description = target.message;
    return result;
  }
  if (target.kind === "process") {
    // A background process has no screen to swipe — a capability gap, not a
    // reroute.
    result.status = "FAIL";
    result.description = `The resolved surface is the background process "${target.name}", which doesn't support swipe steps. Target a browser or app surface with \`surface\`.`;
    return result;
  }
  if (target.kind === "app") {
    const appRef = { entry: target.entry, window: target.window };
    // Window selectors (ADR 01036): resolve to a real window; the gesture's
    // coordinate math then uses THAT window's rect (macOS especially — Mac2's
    // getWindowRect is the whole main screen).
    let windowTarget: any = null;
    if (appRef.window !== undefined) {
      const resolvedWindow = await resolveAppWindow({
        entry: appRef.entry!,
        selector: appRef.window,
        timeoutMs: 5000,
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
    const switched = await ensureAppForeground(appRef.entry!, appSession);
    if (switched.error) {
      result.status = "FAIL";
      result.description = switched.error;
      return result;
    }
    const platform = appRef.entry!.platform ?? "windows";
    const gestures = APP_GESTURES[platform];
    if (!gestures) {
      result.status = "FAIL";
      result.description = `swipe isn't implemented for the "${platform}" app platform.`;
      return result;
    }
    try {
      const rect = await appWindowRect(appRef.entry!, windowTarget);
      // When a specific window was resolved but its bounds can't be read (a
      // transient enumeration/rect failure), don't fall through to the
      // driver's default rect — on Mac2 getWindowRect reports the whole main
      // screen, which would place the swipe in the wrong region. FAIL instead.
      if (!rect && windowTarget) {
        result.status = "FAIL";
        result.description = `Couldn't determine the bounds of the targeted window on app surface "${appRef.entry!.name}"; the swipe was not attempted.`;
        return result;
      }
      await gestures.swipe(appRef.entry!.driver, gesture as any, rect ?? undefined);
    } catch (error: any) {
      result.status = "FAIL";
      result.description = `Couldn't swipe the app surface: ${error?.message ?? error}`;
      return result;
    }
    result.description = `Swiped the app surface "${appRef.entry!.name}".`;
    return result;
  }

  // Browser execution path: an explicit reference focuses the requested
  // session + window/tab first; a surface-less swipe acts on the active
  // browser surface's driver.
  if (target.surface !== undefined) {
    const switched = await switchToSurface(driver, target.surface);
    if (!switched.ok) {
      result.status = "FAIL";
      result.description = switched.message;
      return result;
    }
    driver = switched.driver ?? driver;
  }
  if (!driver) {
    // Defense-in-depth: the resolver should never route here without a
    // driver, but a missing one must be a clean FAIL, not a TypeError.
    result.status = "FAIL";
    result.description =
      "No active surface to act on. Open one first with a startSurface step (or a goTo step for a browser), or target a surface explicitly with `surface`.";
    return result;
  }

  try {
    if (gesture.from && gesture.to) {
      // Point-to-point: a real pointer drag (sliders, canvases, maps).
      // Authored pixels are viewport-relative, which is what the W3C
      // viewport-origin actions expect — no conversion needed.
      await performMovement({
        driver,
        from: gesture.from,
        to: gesture.to,
        duration: gesture.duration,
        pointerType: "mouse",
      });
    } else {
      // Directional: scroll the page. A mouse drag on a web page selects text
      // instead of scrolling, so the finger-motion semantics map onto
      // scrollBy: swiping up moves content up, revealing content below.
      const rect = await getBrowserViewportRect(driver);
      const { from, to } = directionToPoints(
        gesture.direction as any,
        gesture.distance
      );
      const dx = Math.round((from.x - to.x) * rect.width);
      const dy = Math.round((from.y - to.y) * rect.height);
      await driver.execute(
        /* c8 ignore next 3 - runs inside the browser via driver.execute() */
        (x: number, y: number) => {
          window.scrollBy({ left: x, top: y, behavior: "auto" as any });
        },
        dx,
        dy
      );
    }
  } catch (error: any) {
    result.status = "FAIL";
    result.description = `Couldn't swipe the browser surface: ${error?.message ?? error}`;
    return result;
  }
  result.description = "Swiped the browser surface.";
  return result;
}
