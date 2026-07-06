// The swipe step (phase A6): the movement subset of dragAndDrop — a pointer
// movement between two points, authored directly (from/to pixels relative to
// the surface's top-left) or via the direction shorthand (fractions). Valid
// on app and browser surfaces; a process has no screen to swipe. Pure
// execution: no implicit assertions, like goTo.
import { validate } from "../../common/src/validate.js";
import {
  parseSurfaceRef,
  reinterpretForSessions,
  switchToSurface,
} from "./browserSurface.js";
import { resolveAppSurfaceRef, ensureAppForeground } from "./appSurface.js";
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
}: {
  config: any;
  step: any;
  driver: any;
  appSession?: any;
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

  // App-surface branch: an app registry hit is authoritative for its name.
  const appRef = resolveAppSurfaceRef(surface, appSession);
  if (appRef) {
    if (appRef.error) {
      result.status = "FAIL";
      result.description = appRef.error;
      return result;
    }
    if (appRef.window !== undefined) {
      result.status = "FAIL";
      result.description =
        "Window selectors on app surfaces land in a later part of this phase; act on the app's active window for now (omit `window`).";
      return result;
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
      await gestures.swipe(appRef.entry!.driver, gesture as any);
    } catch (error: any) {
      result.status = "FAIL";
      result.description = `Couldn't swipe the app surface: ${error?.message ?? error}`;
      return result;
    }
    result.description = `Swiped the app surface "${appRef.entry!.name}".`;
    return result;
  }

  // Everything else resolves to a browser surface: swipe's schema restricts
  // bare strings to engine keywords and has NO process branch (a background
  // process has no screen to swipe — the kind is unrepresentable, per the
  // byEngineName precedent), so the process kind can't reach this point.
  const resolved = reinterpretForSessions(driver, parseSurfaceRef(surface));
  if (resolved.kind === "unsupported") {
    // An { app: … } reference in a context with no app session lands here.
    result.status = "FAIL";
    result.description = `The surface names an app, but no app session is active in this context. Open the app first with startSurface.`;
    return result;
  }
  if (resolved.kind === "browser") {
    const switched = await switchToSurface(driver, surface);
    if (!switched.ok) {
      result.status = "FAIL";
      result.description = switched.message;
      return result;
    }
    driver = switched.driver ?? driver;
  }
  if (!driver) {
    result.status = "FAIL";
    result.description = `swipe needs a surface to act on in an app-only context. Name the app surface: { "swipe": { "direction": "up", "surface": { "app": "…" } } }.`;
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
