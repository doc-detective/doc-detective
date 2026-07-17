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
