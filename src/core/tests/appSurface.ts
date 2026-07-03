// Native app surfaces (phase A1 of docs/design/native-app-surfaces.md).
// The top half is pure helpers — identifier classification, default surface
// naming, native-selector escape-hatch classification, and the per-platform
// semantic-locator mappings (A1 ships the Windows/UIA column) — unit-testable
// without a Windows host. The bottom half is the runtime: the per-context app
// session (its own Appium server, homed where the native driver is
// installed), the preflight that converts environment gaps into SKIPs, and
// the app-side implementations of startSurface / find / click / type /
// screenshot / closeSurface.

import fs from "node:fs";
import path from "node:path";
import {
  resolveHeavyDepPath,
  resolveHeavyDepPathInCache,
  resolveHeavyDepSource,
  ensureRuntimeInstalled,
} from "../../runtime/loader.js";
import { appiumHomeForDriverPath } from "../appium.js";
import { getRuntimeDir } from "../../runtime/cacheDir.js";
import { log } from "../utils.js";
import { resolveCropGeometry } from "./ffmpegRecorder.js";

export {
  classifyAppIdentifier,
  defaultAppSurfaceName,
  classifyNativeSelector,
  buildUiaLocator,
  createAppSessionState,
  appSurfacePreflight,
  isAppDriverRequired,
  stepTargetsAppSurface,
  resolveAppSurfaceRef,
  startAppSurface,
  findAppElement,
  buildAppLocator,
  closeAppSurface,
  teardownAppSession,
};
export type { AppSessionState, AppSurfaceEntry };

type AppIdentifierKind = "path" | "aumid" | "id";

// Classify an `app` identifier by syntax — never by a user-supplied type enum:
// a `!` marks a UWP AppUserModelID, a path separator (or drive prefix) marks a
// filesystem path, a reverse-DNS token marks a bundle/package/desktop-file id,
// and anything else is treated as a (relative) executable path.
function classifyAppIdentifier(app: string): AppIdentifierKind {
  if (app.includes("!")) return "aumid";
  if (/[\\/]/.test(app) || /^[A-Za-z]:/.test(app)) return "path";
  if (/^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+){2,}$/.test(app)) return "id";
  return "path";
}

// The default surface-registry name for an app: the executable basename
// without extension for paths (`notepad.exe` → `notepad`,
// `Calculator.app` → `Calculator`), the final dot-segment for reverse-DNS ids
// (`com.apple.TextEdit` → `TextEdit`), and the package family name's app token
// (before the publisher-hash suffix) for AUMIDs
// (`Microsoft.WindowsCalculator_8wekyb3d8bbwe!App` → `WindowsCalculator`).
function defaultAppSurfaceName(app: string): string {
  const kind = classifyAppIdentifier(app);
  if (kind === "aumid") {
    const familyName = app.split("!")[0];
    const lastSegment = familyName.split(".").pop() ?? familyName;
    return lastSegment.split("_")[0] || app;
  }
  if (kind === "id") {
    return app.split(".").pop() || app;
  }
  const basename = app.split(/[\\/]/).pop() ?? app;
  const withoutExtension = basename.replace(/\.[A-Za-z0-9]+$/, "");
  return withoutExtension || basename;
}

type NativeSelectorKind = "xpath" | "accessibilityId" | "css";

// The `selector` escape hatch on app surfaces accepts platform-native
// locators, detected by syntax: `//…`/`(…` is XPath (every native driver
// speaks it), `~…` is an accessibility id. Anything else is CSS — browser-only,
// so callers reject it on app surfaces with a pointer to these forms.
function classifyNativeSelector(selector: string): NativeSelectorKind {
  if (selector.startsWith("//") || selector.startsWith("(")) return "xpath";
  if (selector.startsWith("~")) return "accessibilityId";
  return "css";
}

// Escape a value for embedding in an XPath string literal. Values without
// double quotes embed directly; values with them use concat() (XPath 1.0 has
// no character escaping inside literals).
function xpathLiteral(value: string): string {
  if (!value.includes('"')) return `"${value}"`;
  const parts = value
    .split('"')
    .map((part) => `"${part}"`)
    .join(`, '"', `);
  return `concat(${parts})`;
}

// Map an ARIA-ish role to a UIA ControlType tag (XPath element name in the
// Windows driver's XML view). Unknown roles pass through capitalized so new
// control types work without a table update.
function uiaControlType(role: string): string {
  const known: Record<string, string> = {
    button: "Button",
    checkbox: "CheckBox",
    combobox: "ComboBox",
    dialog: "Window",
    document: "Document",
    link: "Hyperlink",
    list: "List",
    listitem: "ListItem",
    menu: "Menu",
    menuitem: "MenuItem",
    radio: "RadioButton",
    slider: "Slider",
    tab: "TabItem",
    table: "Table",
    text: "Text",
    textbox: "Edit",
    toolbar: "ToolBar",
    tree: "Tree",
    treeitem: "TreeItem",
    window: "Window",
  };
  return (
    known[role.toLowerCase()] ?? role.charAt(0).toUpperCase() + role.slice(1)
  );
}

// Build a Windows (UIA) locator from the shared semantic element fields —
// the A1 column of the design's mapping table: elementText → @Name,
// elementId → AutomationId, elementAria → ControlType (+ @Name),
// elementTestId → AutomationId. Returns null when no supported field is
// present (the caller reports which fields ARE supported on app surfaces).
// A lone elementId/elementTestId uses the driver's "accessibility id"
// strategy (the AutomationId fast path); anything combined compiles to XPath.
function buildUiaLocator(criteria: {
  elementText?: string;
  elementId?: string;
  elementTestId?: string;
  elementAria?: { role?: string; name?: string } | string;
  [key: string]: any;
}): { strategy: string; value: string } | null {
  const automationId = criteria.elementId ?? criteria.elementTestId;
  const aria =
    typeof criteria.elementAria === "string"
      ? { name: criteria.elementAria }
      : criteria.elementAria;

  const predicates: string[] = [];
  if (automationId !== undefined)
    predicates.push(`@AutomationId=${xpathLiteral(automationId)}`);
  if (criteria.elementText !== undefined)
    predicates.push(`@Name=${xpathLiteral(criteria.elementText)}`);
  if (aria?.name !== undefined)
    predicates.push(`@Name=${xpathLiteral(aria.name)}`);

  const tag = aria?.role ? uiaControlType(aria.role) : undefined;

  if (!tag && predicates.length === 0) return null;

  // Fast path: a lone AutomationId maps to the accessibility id strategy.
  if (
    automationId !== undefined &&
    predicates.length === 1 &&
    !tag &&
    criteria.elementText === undefined
  ) {
    return { strategy: "accessibility id", value: automationId };
  }

  const predicate = predicates.length ? `[${predicates.join(" and ")}]` : "";
  return { strategy: "xpath", value: `//${tag ?? "*"}${predicate}` };
}

// ---------------------------------------------------------------------------
// Runtime: app sessions, preflight, and app-side step implementations.
// ---------------------------------------------------------------------------

const APP_DRIVER_PACKAGE = "appium-novawindows-driver";

interface AppSurfaceEntry {
  name: string;
  appId: string;
  driver: any;
  launchedByUs: boolean;
}

// Per-context app-session state, created by runContext and threaded through
// runStep. The app session owns its own Appium server because the native
// driver may be lazy-installed into the runtime cache, whose APPIUM_HOME
// differs from the browser pool's (shim) home. `recordingHost` gives
// recordings a `driver.state.recordings`-shaped home in app-only contexts
// (no browser driver), so ffmpeg captures — including autoRecord — ride the
// existing per-session recording machinery unchanged.
interface AppSessionState {
  server?: { port: number; process: any };
  appiumEntry?: string;
  appiumHome?: string;
  surfaces: Map<string, AppSurfaceEntry>;
  activeApp?: string;
  recordingHost: { state: { recordings: any[] } };
}

function createAppSessionState(): AppSessionState {
  return { surfaces: new Map(), recordingHost: { state: { recordings: [] } } };
}

// Steps that provision or (by object form) target an app surface. Used by
// runContext to decide whether the app preflight must run for this test.
function isAppDriverRequired({ test }: { test: any }): boolean {
  if (!Array.isArray(test?.steps)) return false;
  return test.steps.some(
    (step: any) =>
      typeof step?.startSurface !== "undefined" || stepTargetsAppSurface(step)
  );
}

// True when any action payload in the step names an app surface with the
// object form ({ app: … }). The bare-string form is identity-only and
// resolves against the registries at runtime instead.
function stepTargetsAppSurface(step: any): boolean {
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

// Resolve a step's `surface` reference to a registered app surface, or null
// when the reference isn't an app reference (browser/process/engine) or names
// nothing in the registry. Object form is authoritative; a bare string only
// matches when the registry actually holds that name.
function resolveAppSurfaceRef(
  surface: any,
  appSession?: AppSessionState
): { entry?: AppSurfaceEntry; window?: any; error?: string } | null {
  if (!appSession) return null;
  if (surface && typeof surface === "object" && typeof surface.app === "string") {
    const entry = appSession.surfaces.get(surface.app.trim());
    if (!entry) {
      return {
        error: `No app surface named "${surface.app}" is open. Open it first with startSurface.`,
      };
    }
    return { entry, window: surface.window };
  }
  if (typeof surface === "string") {
    const entry = appSession.surfaces.get(surface.trim());
    if (entry) return { entry };
  }
  return null;
}

// Appium discovers extensions by scanning <APPIUM_HOME>/node_modules — but
// only when its manifest cache (node_modules/.cache/appium/extensions.yaml)
// doesn't exist yet; an existing manifest is trusted as-is. A driver
// lazy-installed into a home whose manifest predates it is therefore
// invisible ("Could not find a driver for automationName …") even though the
// package is right there. Deleting the manifest cache makes the next server
// start rebuild it from what's actually installed. No-op when the manifest
// is absent or already lists the driver.
function invalidateStaleAppiumManifest(home: string): void {
  const cacheDir = path.join(home, "node_modules", ".cache", "appium");
  try {
    const manifest = fs.readFileSync(
      path.join(cacheDir, "extensions.yaml"),
      "utf8"
    );
    if (!manifest.includes(APP_DRIVER_PACKAGE)) {
      fs.rmSync(cacheDir, { recursive: true, force: true });
    }
  } catch {
    // Manifest absent/unreadable — appium builds it fresh on start.
  }
}

// Preflight for app surfaces: platform support and driver availability.
// Returns { ok: true } or a skip reason — an unmet environment is a gating
// fact (SKIPPED), never a FAIL, matching the `requires` gate semantics.
// Installing the driver (and, when needed, an Appium copy in the same home)
// happens here so the failure mode is a clean skip before any step runs.
async function appSurfacePreflight({
  config,
  platform,
  deps = {},
}: {
  config: any;
  platform: string;
  deps?: {
    resolveSource?: typeof resolveHeavyDepSource;
    resolvePath?: typeof resolveHeavyDepPath;
    resolvePathInCache?: typeof resolveHeavyDepPathInCache;
    ensureInstalled?: typeof ensureRuntimeInstalled;
  };
}): Promise<
  | { ok: true; appiumEntry: string; appiumHome: string }
  | { ok: false; reason: string }
> {
  if (platform !== "windows") {
    return {
      ok: false,
      reason: `Skipping context on '${platform}': native app surfaces run on Windows only in this phase. Gate the test with runOn platforms (["windows"]) so this skip is intentional.`,
    };
  }
  const ctx = { cacheDir: config?.cacheDir };
  const resolveSource = deps.resolveSource ?? resolveHeavyDepSource;
  const resolvePath = deps.resolvePath ?? resolveHeavyDepPath;
  const resolvePathInCache =
    deps.resolvePathInCache ?? resolveHeavyDepPathInCache;
  const ensureInstalled = deps.ensureInstalled ?? ensureRuntimeInstalled;

  let source = resolveSource(APP_DRIVER_PACKAGE, ctx);
  if (!source) {
    try {
      await ensureInstalled([APP_DRIVER_PACKAGE], { ctx });
    } catch (error: any) {
      return {
        ok: false,
        reason: `Skipping context: the Windows app driver (${APP_DRIVER_PACKAGE}) is not installed and could not be installed (${error?.message ?? error}). Install it with \`doc-detective install runtime ${APP_DRIVER_PACKAGE}\` or check network access.`,
      };
    }
    source = resolveSource(APP_DRIVER_PACKAGE, ctx);
    if (!source) {
      return {
        ok: false,
        reason: `Skipping context: the Windows app driver (${APP_DRIVER_PACKAGE}) did not resolve after install. Inspect the runtime cache and reinstall with \`doc-detective install runtime ${APP_DRIVER_PACKAGE}\`.`,
      };
    }
  }

  // Appium discovers drivers in <APPIUM_HOME>/node_modules, so the server
  // must be homed where the driver actually lives. A shim-resolved driver
  // shares the shim's home with appium; a cache-resolved driver needs an
  // appium copy in the cache too (a one-time install).
  if (source === "shim") {
    const driverEntry = resolvePath(APP_DRIVER_PACKAGE, ctx);
    const home = driverEntry ? appiumHomeForDriverPath(driverEntry) : null;
    const appiumEntry = resolvePath("appium", ctx);
    if (home && appiumEntry) {
      invalidateStaleAppiumManifest(home);
      return { ok: true, appiumEntry, appiumHome: home };
    }
    // Fall through to the cache path when the shim layout is unexpected.
  }
  if (!resolvePathInCache("appium", ctx)) {
    try {
      await ensureInstalled(["appium"], { ctx, force: true });
    } catch (error: any) {
      return {
        ok: false,
        reason: `Skipping context: Appium could not be installed alongside the Windows app driver (${error?.message ?? error}).`,
      };
    }
  }
  const appiumEntry = resolvePathInCache("appium", ctx);
  if (!appiumEntry) {
    return {
      ok: false,
      reason: `Skipping context: Appium did not resolve from the runtime cache after install.`,
    };
  }
  const appiumHome = getRuntimeDir(ctx);
  invalidateStaleAppiumManifest(appiumHome);
  return { ok: true, appiumEntry, appiumHome };
}

// Build a driver locator from a step's element criteria (the shared semantic
// fields) or the native `selector` escape hatch. Returns the locator or an
// error message naming what is unsupported on app surfaces.
function buildAppLocator(criteria: {
  selector?: string;
  [key: string]: any;
}): { strategy: string; value: string } | { error: string } {
  if (typeof criteria.selector === "string") {
    const kind = classifyNativeSelector(criteria.selector);
    if (kind === "xpath") return { strategy: "xpath", value: criteria.selector };
    if (kind === "accessibilityId")
      return {
        strategy: "accessibility id",
        value: criteria.selector.slice(1),
      };
    return {
      error: `CSS selectors are browser-only. On app surfaces, use the semantic fields (elementText, elementId, elementAria) or a native locator: an XPath (//Button[@Name="Save"]) or an accessibility id (~SaveButton).`,
    };
  }
  const unsupported = ["elementClass", "elementAttribute"].filter(
    (field) => criteria[field] !== undefined
  );
  if (unsupported.length) {
    return {
      error: `${unsupported.join(" and ")} ${unsupported.length > 1 ? "are" : "is"} not supported on app surfaces; use elementText, elementId, elementAria, or a native selector.`,
    };
  }
  const locator = buildUiaLocator(criteria);
  if (!locator) {
    return {
      error:
        "No app-mappable element criteria specified. Use elementText, elementId, elementTestId, elementAria, or a native selector.",
    };
  }
  return locator;
}

// Locate an element on an app surface's driver session. Waits up to `timeout`
// for existence. Returns the wdio element or an error string.
async function findAppElement({
  driver,
  criteria,
  timeout = 5000,
}: {
  driver: any;
  criteria: any;
  timeout?: number;
}): Promise<{ element?: any; error?: string }> {
  const locator = buildAppLocator(criteria);
  if ("error" in locator) return { error: locator.error };
  const selector =
    locator.strategy === "accessibility id"
      ? `~${locator.value}`
      : locator.value;
  try {
    const element = await driver.$(selector);
    await element.waitForExist({ timeout });
    return { element };
  } catch {
    return {
      error: `No element matched ${JSON.stringify(criteria)} on the app surface within ${timeout}ms (locator: ${selector}).`,
    };
  }
}

// The startSurface step (app branch): launch the app through the native
// driver, wait for readiness, and register the surface. Starts the app
// session's Appium server on first use.
async function startAppSurface({
  config,
  step,
  appSession,
  platform,
  serverDeps,
}: {
  config: any;
  step: any;
  appSession: AppSessionState;
  platform: string;
  // Injected by tests.ts: starts an Appium server with an APPIUM_HOME
  // override and creates a wdio session on it (reuses the existing
  // startAppiumServer/driverStart machinery).
  serverDeps: {
    startServer: (
      appiumEntry: string,
      appiumHome: string
    ) => Promise<{ port: number; process: any }>;
    startDriver: (capabilities: any, port: number) => Promise<any>;
  };
}): Promise<any> {
  const result: any = { status: "PASS", description: "", outputs: {} };
  const descriptor = step.startSurface;

  // Reserved fields land in later phases — fail with the roadmap named
  // rather than silently ignoring what the author asked for.
  for (const field of ["device", "install", "activity"]) {
    if (descriptor[field] !== undefined) {
      result.status = "FAIL";
      result.description = `startSurface.${field} is reserved for the mobile phases of the native app roadmap (docs/design/native-app-surfaces.md) and is not implemented yet.`;
      return result;
    }
  }
  if (descriptor.env !== undefined) {
    result.status = "FAIL";
    result.description = `startSurface.env is not supported by the Windows app driver. Set environment variables in the shell that launches Doc Detective, or launch the app via runShell instead.`;
    return result;
  }
  if (platform !== "windows") {
    result.status = "FAIL";
    result.description = `startSurface (app) runs on Windows only in this phase. Gate the test with runOn platforms (["windows"]).`;
    return result;
  }

  const appId = descriptor.app.trim();
  const name = (descriptor.name ?? defaultAppSurfaceName(appId)).trim();
  if (appSession.surfaces.has(name)) {
    result.status = "FAIL";
    result.description = `An app surface named "${name}" is already open. Pass a distinct startSurface.name.`;
    return result;
  }

  // First app surface in this context: bring up the app Appium server.
  if (!appSession.server) {
    if (!appSession.appiumEntry || !appSession.appiumHome) {
      result.status = "FAIL";
      result.description =
        "App session is not preflighted; this is a runner bug (runContext must run appSurfacePreflight before app steps).";
      return result;
    }
    appSession.server = await serverDeps.startServer(
      appSession.appiumEntry,
      appSession.appiumHome
    );
  }

  const capabilities: Record<string, any> = {
    platformName: "Windows",
    "appium:automationName": "NovaWindows",
    "appium:app": appId,
    "appium:newCommandTimeout": 600,
    "wdio:enforceWebDriverClassic": true,
  };
  if (Array.isArray(descriptor.args) && descriptor.args.length) {
    // NovaWindows (like WinAppDriver) takes appArguments as a single string.
    capabilities["appium:appArguments"] = descriptor.args.join(" ");
  }
  if (descriptor.workingDirectory && descriptor.workingDirectory !== ".") {
    capabilities["appium:appWorkingDir"] = path.resolve(
      descriptor.workingDirectory
    );
  }
  Object.assign(capabilities, descriptor.driverOptions ?? {});

  let driver: any;
  try {
    driver = await serverDeps.startDriver(
      capabilities,
      appSession.server.port
    );
  } catch (error: any) {
    result.status = "FAIL";
    result.description = `Couldn't launch app "${appId}": ${error?.message ?? error}. Check the path/AUMID and that the session is interactive.`;
    return result;
  }

  // Startup readiness: fixed delay and/or an element that must exist.
  const timeout = descriptor.timeout ?? 60000;
  if (descriptor.waitUntil?.delayMs) {
    await new Promise((resolve) =>
      setTimeout(resolve, descriptor.waitUntil.delayMs)
    );
  }
  if (descriptor.waitUntil?.find) {
    const found = await findAppElement({
      driver,
      criteria: descriptor.waitUntil.find,
      timeout,
    });
    if (found.error) {
      try {
        await driver.deleteSession();
      } catch {
        // best-effort: the launch failed readiness; don't mask that error
      }
      result.status = "FAIL";
      result.description = `App "${appId}" launched but never became ready: ${found.error}`;
      return result;
    }
  }

  appSession.surfaces.set(name, {
    name,
    appId,
    driver,
    launchedByUs: true,
  });
  appSession.activeApp = name;

  // Late-bind window crops: an autoRecord capture in an app-only context
  // starts before any app window exists, so it records the full display with
  // a pending marker. The first app surface to open supplies its window rect
  // as the crop — scoping the recording to the app under test — which the
  // stop-side transcode then applies.
  const pendingHandles = (
    appSession.recordingHost?.state?.recordings ?? []
  ).filter((handle: any) => handle?.pendingAppWindowCrop && !handle.crop);
  for (const handle of pendingHandles) {
    try {
      handle.crop = await resolveCropGeometry({ driver, target: "window" });
      handle.pendingAppWindowCrop = false;
    } catch (error: any) {
      log(
        config,
        "warning",
        `Couldn't resolve the app window geometry for the active recording; it stays full-display. ${error?.message ?? error}`
      );
    }
  }

  log(config, "debug", `Opened app surface "${name}" (${appId}).`);
  result.description = `Opened app surface "${name}" (${appId}).`;
  result.outputs = { name, app: appId };
  return result;
}

// Close a registered app surface: end its driver session (which terminates
// the app when the driver launched it) and deregister it.
async function closeAppSurface({
  entry,
  appSession,
}: {
  entry: AppSurfaceEntry;
  appSession: AppSessionState;
}): Promise<void> {
  appSession.surfaces.delete(entry.name);
  if (appSession.activeApp === entry.name) appSession.activeApp = undefined;
  try {
    await entry.driver.deleteSession();
  } catch {
    // Idempotent: the app/session may already be gone.
  }
}

// Context teardown: close every remaining app surface, then stop the app
// session's Appium server. Killing only what we launched is the driver's
// contract (deleteSession terminates driver-launched apps).
async function teardownAppSession(
  appSession: AppSessionState | undefined,
  killServer: (pid: number | undefined) => Promise<void>
): Promise<void> {
  if (!appSession) return;
  for (const entry of [...appSession.surfaces.values()]) {
    await closeAppSurface({ entry, appSession });
  }
  if (appSession.server) {
    await killServer(appSession.server.process?.pid);
    appSession.server = undefined;
  }
}
