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
  "type",
] as const;
