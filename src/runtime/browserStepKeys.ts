/**
 * Single source of truth for step keys that require a real browser — i.e. a
 * WebDriver/Appium driver and a browser binary. A test that contains any of
 * these steps needs a driver spun up; one that contains none can run
 * driver-free (pure HTTP/CLI steps like `httpRequest`, `runShell`, `runCode`,
 * `checkLink`).
 *
 * This list was previously duplicated in three places (`driverActions` in
 * `core/resolveTests.ts` and `core/tests.ts`, and `BROWSER_STEP_KEYS` in
 * `runtime/inferRuntimeNeeds.ts`) which had already drifted. It lives in the
 * runtime layer because `core/*` imports from `runtime/*` (never the reverse),
 * so this is the only place all three consumers can share it without a cycle.
 *
 * `scroll`/`moveMouse` aren't wired v3 step keys today (absent from `step_v3`
 * and the `runStep` dispatch), so they match no real step — they're kept for
 * forward-compatibility and are inert.
 */
export const BROWSER_STEP_KEYS = [
  "annotate",
  "click",
  "dragAndDrop",
  "find",
  "goTo",
  "loadCookie",
  "moveMouse",
  "record",
  "runBrowserScript",
  "saveCookie",
  "screenshot",
  "scroll",
  "stopRecord",
  "swipe",
  "type",
] as const;

/**
 * True when any action payload in the step names an app surface with the
 * object form (`surface: { app: … }`). Such a step drives a native app
 * driver, not a browser, so browser-need classification must exclude it even
 * though its step key (`click`/`swipe`/`find`/`type`/`screenshot`) is one of
 * the shared BROWSER_STEP_KEYS above. The bare-string surface form is
 * identity-only and resolves against the surface registries at runtime, so it
 * isn't treated as app-targeting here.
 *
 * This lives in the runtime layer beside BROWSER_STEP_KEYS so the runtime
 * inference (`inferRuntimeNeeds`) and core's per-context predicate
 * (`isBrowserRequired`, `isAppDriverRequired` in core/tests/appSurface.ts,
 * which re-exports this) share one definition — core imports from runtime,
 * never the reverse, so this is the only place both can agree without a cycle.
 */
export function stepTargetsAppSurface(step: any): boolean {
  if (!step || typeof step !== "object") return false;
  return Object.values(step).some(
    (payload: any) =>
      payload &&
      typeof payload === "object" &&
      payload.surface &&
      typeof payload.surface === "object" &&
      typeof payload.surface.app === "string"
  );
}

/**
 * A step's startSurface descriptors as a flat list (multi-surface Phase 6):
 * the object form yields one, the parallel array form yields each item, and
 * a step without startSurface yields none. Kind is decided by each
 * descriptor's discriminating key (`app` | `browser` | `process`) — the
 * three schema branches are mutually exclusive by construction.
 */
export function startSurfaceDescriptors(step: any): any[] {
  const raw = step?.startSurface;
  if (raw === undefined || raw === null) return [];
  return Array.isArray(raw) ? raw : [raw];
}

/**
 * True when the step's startSurface opens at least one BROWSER surface.
 * Such a step needs a WebDriver session + browser binary even though
 * `startSurface` isn't one of the BROWSER_STEP_KEYS — it's the Phase 6
 * sibling of the goTo opener. Used by driver/browser-need classification
 * (isDriverRequired / isBrowserRequired / inferRuntimeNeeds).
 */
export function stepOpensBrowserSurface(step: any): boolean {
  return startSurfaceDescriptors(step).some(
    (d: any) => d && typeof d === "object" && typeof d.browser === "string"
  );
}

/**
 * True when the step's startSurface opens at least one APP surface. The app
 * preflight (per-context Appium server + native driver probe) keys off this
 * — a browser/process-only startSurface must not trigger it.
 */
export function stepOpensAppSurface(step: any): boolean {
  return startSurfaceDescriptors(step).some(
    (d: any) => d && typeof d === "object" && typeof d.app === "string"
  );
}

/**
 * True when the step's startSurface opens at least one background PROCESS
 * surface. Part of the non-browser-surface signal below (ADR 01081).
 */
export function stepOpensProcessSurface(step: any): boolean {
  return startSurfaceDescriptors(step).some(
    (d: any) => d && typeof d === "object" && typeof d.process === "string"
  );
}

/**
 * True when any action payload in the step names a background process with
 * the object form (`surface: { process: … }`). Such a step writes to the
 * process's stdin — it never needs a browser. The bare-string form stays
 * identity-only, same as stepTargetsAppSurface.
 */
export function stepTargetsProcessSurface(step: any): boolean {
  if (!step || typeof step !== "object") return false;
  return Object.values(step).some(
    (payload: any) =>
      payload &&
      typeof payload === "object" &&
      payload.surface &&
      typeof payload.surface === "object" &&
      typeof payload.surface.process === "string"
  );
}

/**
 * The step keys whose actions act on a surface and route through the
 * active-surface resolver (ADR 01081): omitted `surface` targets the most
 * recently active surface of ANY kind. Deliberately narrower than
 * BROWSER_STEP_KEYS — `annotate`, cookies, `goTo`, `record`, etc. are
 * browser-only by design and always imply a browser.
 */
export const SURFACE_SENSITIVE_STEP_KEYS = [
  "click",
  "find",
  "screenshot",
  "swipe",
  "type",
] as const;

/**
 * True when the step performs a surface-sensitive action WITHOUT an explicit
 * `surface` reference — the payload shapes without one include the string /
 * boolean / array shorthands (`find: "text"`, `screenshot: true`,
 * `type: ["hi"]`). Such a step routes to the active surface at runtime, so
 * browser-need classification must not unconditionally count it as a browser
 * step (see testHasNonBrowserSurfaceSignal).
 */
export function stepIsSurfacelessInteraction(step: any): boolean {
  if (!step || typeof step !== "object") return false;
  return SURFACE_SENSITIVE_STEP_KEYS.some((key) => {
    if (typeof step[key] === "undefined") return false;
    const payload = step[key];
    const hasExplicitSurface =
      payload &&
      typeof payload === "object" &&
      !Array.isArray(payload) &&
      payload.surface !== undefined;
    return !hasExplicitSurface;
  });
}

/**
 * True when any step in the test opens or explicitly targets a NON-browser
 * surface (an app or a background process). In such a test, a surface-less
 * interaction step is routed to the active surface at runtime and must not
 * force browser provisioning; a test with no such signal keeps the browser
 * default (byte-compatible with pre-ADR-01081 classification).
 */
export function testHasNonBrowserSurfaceSignal(steps: any): boolean {
  if (!Array.isArray(steps)) return false;
  return steps.some(
    (step: any) =>
      stepOpensAppSurface(step) ||
      stepOpensProcessSurface(step) ||
      stepTargetsAppSurface(step) ||
      stepTargetsProcessSurface(step)
  );
}
