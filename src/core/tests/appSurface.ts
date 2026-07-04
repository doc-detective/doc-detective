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
import { execFile } from "node:child_process";
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
import { validate } from "../../common/src/validate.js";

export {
  classifyAppIdentifier,
  defaultAppSurfaceName,
  classifyNativeSelector,
  buildUiaLocator,
  buildAxLocator,
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
  // Exported as a test seam: the manifest-staleness rules are load-bearing
  // (a stale manifest makes the lazily-installed driver invisible to Appium).
  invalidateStaleAppiumManifest,
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
  // elementText and elementAria's name both map to @Name on Windows; when
  // they carry the same value, one predicate suffices (two would be
  // redundant; two DIFFERENT values are rejected upstream in buildAppLocator
  // as an impossible match).
  if (aria?.name !== undefined && aria.name !== criteria.elementText)
    predicates.push(`@Name=${xpathLiteral(aria.name)}`);

  const tag = aria?.role ? uiaControlType(aria.role) : undefined;

  if (!tag && predicates.length === 0) return null;

  // Fast path: a lone AutomationId maps to the accessibility id strategy.
  // (predicates.length === 1 with automationId set already implies no
  // elementText/aria-name predicate joined it.)
  if (automationId !== undefined && predicates.length === 1 && !tag) {
    return { strategy: "accessibility id", value: automationId };
  }

  const predicate = predicates.length ? `[${predicates.join(" and ")}]` : "";
  return { strategy: "xpath", value: `//${tag ?? "*"}${predicate}` };
}

// Map an ARIA-ish role to an XCUIElementType tag (XPath element name in the
// Mac2 driver's XML view). Unknown roles pass through capitalized so new
// element types work without a table update (image → XCUIElementTypeImage).
function xcuiElementType(role: string): string {
  const known: Record<string, string> = {
    button: "Button",
    checkbox: "CheckBox",
    combobox: "ComboBox",
    dialog: "Dialog",
    link: "Link",
    list: "Table",
    listitem: "Cell",
    menu: "Menu",
    menuitem: "MenuItem",
    radio: "RadioButton",
    slider: "Slider",
    tab: "TabGroup",
    table: "Table",
    text: "StaticText",
    textbox: "TextField",
    toolbar: "Toolbar",
    tree: "Outline",
    treeitem: "OutlineRow",
    window: "Window",
  };
  const tag =
    known[role.toLowerCase()] ?? role.charAt(0).toUpperCase() + role.slice(1);
  return `XCUIElementType${tag}`;
}

// Build a macOS (AX) locator from the shared semantic element fields — the A2
// column of the design's mapping table: elementText → AXTitle, elementId →
// AXIdentifier, elementAria → AXRole (+ AXTitle), elementTestId →
// AXIdentifier. Returns null when no supported field is present. A lone
// elementId/elementTestId uses the driver's "accessibility id" strategy (the
// AXIdentifier fast path); anything combined compiles to XPath. Accessible
// names deviate from the pure-AXTitle column on purpose: macOS controls split
// their name across the Mac2 view's `title` and `label` attributes (buttons
// carry title, static text carries label), so name predicates match either.
function buildAxLocator(criteria: {
  elementText?: string;
  elementId?: string;
  elementTestId?: string;
  elementAria?: { role?: string; name?: string } | string;
  [key: string]: any;
}): { strategy: string; value: string } | null {
  const identifier = criteria.elementId ?? criteria.elementTestId;
  const aria =
    typeof criteria.elementAria === "string"
      ? { name: criteria.elementAria }
      : criteria.elementAria;

  const namePredicate = (value: string) =>
    `(@title=${xpathLiteral(value)} or @label=${xpathLiteral(value)})`;
  // elementText means "the element's visible text", which macOS controls
  // expose as AXTitle (buttons), label (static text), or AXValue (text
  // views, value displays) — so text matching also covers @value, while
  // elementAria's accessible-NAME matching deliberately does not.
  const textPredicate = (value: string) =>
    `(@title=${xpathLiteral(value)} or @label=${xpathLiteral(value)} or @value=${xpathLiteral(value)})`;

  const predicates: string[] = [];
  if (identifier !== undefined)
    predicates.push(`@identifier=${xpathLiteral(identifier)}`);
  if (criteria.elementText !== undefined)
    predicates.push(textPredicate(criteria.elementText));
  // elementText and elementAria's name both map to the accessible name on
  // macOS; when they carry the same value, one predicate suffices (two
  // DIFFERENT values are rejected upstream in buildAppLocator as an
  // impossible match).
  if (aria?.name !== undefined && aria.name !== criteria.elementText)
    predicates.push(namePredicate(aria.name));

  const tag = aria?.role ? xcuiElementType(aria.role) : undefined;

  if (!tag && predicates.length === 0) return null;

  // Fast path: a lone AXIdentifier maps to the accessibility id strategy.
  if (identifier !== undefined && predicates.length === 1 && !tag) {
    return { strategy: "accessibility id", value: identifier };
  }

  const joined = predicates
    .map((p, i) =>
      // The or-group already carries its own parens; a lone or-group drops
      // the redundant outer pair when it is the only predicate.
      predicates.length === 1 && p.startsWith("(") && i === 0
        ? p.slice(1, -1)
        : p
    )
    .join(" and ");
  const predicate = predicates.length ? `[${joined}]` : "";
  return { strategy: "xpath", value: `//${tag ?? "*"}${predicate}` };
}

// ---------------------------------------------------------------------------
// Runtime: app sessions, preflight, and app-side step implementations.
// ---------------------------------------------------------------------------

// Per-platform native-driver table — the adapter seam from
// docs/design/native-app-surfaces.md §Driver architecture. Driver choice is
// an implementation detail behind this table: descriptors never name a
// driver, so swapping one is a code change here, not a schema change. Each
// platform phase adds its row (A1 windows/NovaWindows, A2 mac/Mac2).
interface AppDriverPlatform {
  driverPackage: string;
  // Human label for skip/fail guidance ("the Windows app driver (…)").
  driverLabel: string;
  platformName: string;
  automationName: string;
  // The platform's semantic-locator column (UIA on Windows, AX on macOS).
  buildLocator(criteria: {
    [key: string]: any;
  }): { strategy: string; value: string } | null;
  // Session capabilities for launching `appId` with this platform's driver.
  buildCapabilities(descriptor: any, appId: string): Record<string, any>;
  // Descriptor fields this platform's driver cannot honor — FAIL with the
  // alternative named rather than silently ignoring what the author asked
  // for. `isSet` distinguishes an authored value from a schema default.
  unsupportedFields: {
    field: string;
    isSet(value: any): boolean;
    guidance: string;
  }[];
}

const APP_DRIVER_PLATFORMS: Record<string, AppDriverPlatform> = {
  windows: {
    driverPackage: "appium-novawindows-driver",
    driverLabel: "Windows app driver",
    platformName: "Windows",
    automationName: "NovaWindows",
    buildLocator: (criteria) => buildUiaLocator(criteria),
    buildCapabilities(descriptor, appId) {
      const capabilities: Record<string, any> = {
        platformName: "Windows",
        "appium:automationName": "NovaWindows",
        "appium:app": appId,
        "appium:newCommandTimeout": 600,
        "wdio:enforceWebDriverClassic": true,
      };
      if (Array.isArray(descriptor.args) && descriptor.args.length) {
        // NovaWindows (like WinAppDriver) takes appArguments as one string.
        capabilities["appium:appArguments"] = descriptor.args.join(" ");
      }
      if (descriptor.workingDirectory && descriptor.workingDirectory !== ".") {
        capabilities["appium:appWorkingDir"] = path.resolve(
          descriptor.workingDirectory
        );
      }
      return capabilities;
    },
    unsupportedFields: [
      {
        field: "env",
        isSet: (value) => value !== undefined,
        guidance:
          "Set environment variables in the shell that launches Doc Detective, or launch the app via runShell instead.",
      },
    ],
  },
  mac: {
    driverPackage: "appium-mac2-driver",
    driverLabel: "macOS app driver",
    platformName: "mac",
    automationName: "Mac2",
    buildLocator: (criteria) => buildAxLocator(criteria),
    buildCapabilities(descriptor, appId) {
      const capabilities: Record<string, any> = {
        platformName: "mac",
        "appium:automationName": "Mac2",
        "appium:newCommandTimeout": 600,
        "wdio:enforceWebDriverClassic": true,
      };
      // Reverse-DNS identifiers launch by bundle id; everything else is a
      // filesystem path to the .app (or its executable).
      if (classifyAppIdentifier(appId) === "id") {
        capabilities["appium:bundleId"] = appId;
      } else {
        capabilities["appium:appPath"] = appId;
      }
      if (Array.isArray(descriptor.args) && descriptor.args.length) {
        // Mac2 takes launch arguments as an array (unlike NovaWindows).
        capabilities["appium:arguments"] = descriptor.args;
      }
      if (descriptor.env && Object.keys(descriptor.env).length) {
        capabilities["appium:environment"] = descriptor.env;
      }
      // The first-ever session builds WebDriverAgentMac via xcodebuild —
      // minutes on a cold CI runner — so the WDA startup ceiling gets a
      // floor above the driver's default even when the descriptor keeps
      // its 60s step timeout.
      const timeout = descriptor.timeout ?? 60000;
      capabilities["appium:serverStartupTimeout"] = Math.max(timeout, 120000);
      return capabilities;
    },
    unsupportedFields: [
      {
        field: "workingDirectory",
        // "." is the schema's injected default, not an author request.
        isSet: (value) => value !== undefined && value !== ".",
        guidance:
          "The macOS app driver launches apps through LaunchServices, which offers no working-directory control; launch via runShell if the cwd matters.",
      },
    ],
  },
};

// The System Settings walkthrough for macOS Accessibility (TCC) — used by
// both the preflight probe and accessibility-shaped launch failures.
const MAC_TCC_WALKTHROUGH =
  "Open System Settings → Privacy & Security → Accessibility and enable the app that launches Doc Detective (your terminal, IDE, or CI runner process), then rerun.";

interface AppSurfaceEntry {
  name: string;
  appId: string;
  driver: any;
  launchedByUs: boolean;
  // Which platform column the entry's locators compile against. Optional for
  // pre-A2 callers/tests; absent means the Windows/UIA column.
  platform?: string;
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
function invalidateStaleAppiumManifest(
  home: string,
  driverPackage: string
): void {
  const cacheDir = path.join(home, "node_modules", ".cache", "appium");
  try {
    const manifest = fs.readFileSync(
      path.join(cacheDir, "extensions.yaml"),
      "utf8"
    );
    if (!manifest.includes(driverPackage)) {
      fs.rmSync(cacheDir, { recursive: true, force: true });
    }
  } catch {
    // Manifest absent/unreadable — appium builds it fresh on start.
  }
}

// Probe macOS Accessibility (TCC) without prompting: JXA can reach
// AXIsProcessTrusted through the ObjC bridge. The verdict applies to the
// probing process's TCC attribution (usually the launching terminal/runner),
// which approximates — but does not guarantee — what WebDriverAgentMac gets;
// an inconclusive or wrong-way-trusted probe is therefore never fatal, and
// the session-start error path carries the same walkthrough as a backstop.
async function probeMacAccessibility(): Promise<boolean | null> {
  return await new Promise((resolve) => {
    execFile(
      "osascript",
      [
        "-l",
        "JavaScript",
        "-e",
        "ObjC.import('ApplicationServices'); $.AXIsProcessTrusted()",
      ],
      { timeout: 10000 },
      (error, stdout) => {
        if (error) return resolve(null);
        const verdict = String(stdout).trim();
        resolve(verdict === "true" ? true : verdict === "false" ? false : null);
      }
    );
  });
}

// Preflight for app surfaces: platform support, driver availability, and (on
// macOS) the Accessibility permission. Returns { ok: true } or a skip reason
// — an unmet environment is a gating fact (SKIPPED), never a FAIL, matching
// the `requires` gate semantics. Installing the driver (and, when needed, an
// Appium copy in the same home) happens here so the failure mode is a clean
// skip before any step runs.
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
    probeAccessibility?: () => Promise<boolean | null>;
  };
}): Promise<
  | { ok: true; appiumEntry: string; appiumHome: string }
  | { ok: false; reason: string }
> {
  const platformDriver = APP_DRIVER_PLATFORMS[platform];
  if (!platformDriver) {
    return {
      ok: false,
      reason: `Skipping context on '${platform}': native app surfaces run on Windows and macOS in this phase. Gate the test with runOn platforms (["windows"] or ["mac"]) so this skip is intentional.`,
    };
  }
  if (platform === "mac") {
    const probe = deps.probeAccessibility ?? probeMacAccessibility;
    let trusted: boolean | null = null;
    try {
      trusted = await probe();
    } catch {
      // Inconclusive probes never skip — a real TCC gap still surfaces at
      // session start with the same walkthrough.
      trusted = null;
    }
    if (trusted === false) {
      return {
        ok: false,
        reason: `Skipping context: macOS Accessibility (TCC) permission is not granted, so the macOS app driver cannot control apps. ${MAC_TCC_WALKTHROUGH}`,
      };
    }
  }
  const driverPackage = platformDriver.driverPackage;
  const driverLabel = platformDriver.driverLabel;
  const ctx = { cacheDir: config?.cacheDir };
  const resolveSource = deps.resolveSource ?? resolveHeavyDepSource;
  const resolvePath = deps.resolvePath ?? resolveHeavyDepPath;
  const resolvePathInCache =
    deps.resolvePathInCache ?? resolveHeavyDepPathInCache;
  const ensureInstalled = deps.ensureInstalled ?? ensureRuntimeInstalled;

  let source = resolveSource(driverPackage, ctx);
  if (!source) {
    try {
      await ensureInstalled([driverPackage], { ctx });
    } catch (error: any) {
      return {
        ok: false,
        reason: `Skipping context: the ${driverLabel} (${driverPackage}) is not installed and could not be installed (${error?.message ?? error}). Install it with \`doc-detective install runtime ${driverPackage}\` or check network access.`,
      };
    }
    source = resolveSource(driverPackage, ctx);
    if (!source) {
      return {
        ok: false,
        reason: `Skipping context: the ${driverLabel} (${driverPackage}) did not resolve after install. Inspect the runtime cache and reinstall with \`doc-detective install runtime ${driverPackage}\`.`,
      };
    }
  }

  // Appium discovers drivers in <APPIUM_HOME>/node_modules, so the server
  // must be homed where the driver actually lives. A shim-resolved driver
  // shares the shim's home with appium; a cache-resolved driver needs an
  // appium copy in the cache too (a one-time install).
  if (source === "shim") {
    const driverEntry = resolvePath(driverPackage, ctx);
    const home = driverEntry ? appiumHomeForDriverPath(driverEntry) : null;
    const appiumEntry = resolvePath("appium", ctx);
    if (home && appiumEntry) {
      invalidateStaleAppiumManifest(home, driverPackage);
      return { ok: true, appiumEntry, appiumHome: home };
    }
    // Fall through to the cache path when the shim layout is unexpected —
    // logged so a spurious cache-side Appium install is diagnosable.
    log(
      config,
      "debug",
      `The ${driverLabel} resolved from the shim but its Appium home/entry did not (home: ${home}, appium: ${appiumEntry}); falling back to a cache-side Appium install.`
    );
  }
  if (!resolvePathInCache("appium", ctx)) {
    try {
      await ensureInstalled(["appium"], { ctx, force: true });
    } catch (error: any) {
      return {
        ok: false,
        reason: `Skipping context: Appium could not be installed alongside the ${driverLabel} (${error?.message ?? error}).`,
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
  invalidateStaleAppiumManifest(appiumHome, driverPackage);
  return { ok: true, appiumEntry, appiumHome };
}

// Build a driver locator from a step's element criteria (the shared semantic
// fields) or the native `selector` escape hatch, compiled against the
// platform's locator column (UIA on Windows, AX on macOS; Windows when
// unspecified, the pre-A2 behavior). Returns the locator or an error message
// naming what is unsupported on app surfaces.
function buildAppLocator(
  criteria: {
    selector?: string;
    [key: string]: any;
  },
  platform?: string
): { strategy: string; value: string } | { error: string } {
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
  // elementText and elementAria's accessible name both map to the SAME
  // property (@Name on Windows, title/label on macOS), so two different
  // values can never match one element — surface the conflict instead of
  // failing silently as not-found.
  const ariaName =
    typeof criteria.elementAria === "string"
      ? criteria.elementAria
      : criteria.elementAria?.name;
  if (
    criteria.elementText !== undefined &&
    ariaName !== undefined &&
    criteria.elementText !== ariaName
  ) {
    return {
      error: `elementText ("${criteria.elementText}") and elementAria ("${ariaName}") both map to the accessible Name on app surfaces but have different values — no element can match both. Specify one of them.`,
    };
  }
  const platformDriver =
    APP_DRIVER_PLATFORMS[platform ?? "windows"] ?? APP_DRIVER_PLATFORMS.windows;
  const locator = platformDriver.buildLocator(criteria);
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
  platform,
}: {
  driver: any;
  criteria: any;
  timeout?: number;
  platform?: string;
}): Promise<{ element?: any; error?: string }> {
  const locator = buildAppLocator(criteria, platform);
  if ("error" in locator) return { error: locator.error };
  const selector =
    locator.strategy === "accessibility id"
      ? `~${locator.value}`
      : locator.value;
  // Locate and wait in separate try blocks: driver.$() normally returns a
  // lazy handle without touching the session, so a throw there means the
  // session itself is broken (app crash, dead server) — a driver error, not
  // a criteria miss. Only the waitForExist timeout is the not-found path.
  let element: any;
  try {
    element = await driver.$(selector);
  } catch (error: any) {
    return {
      error: `App driver error while locating an element (locator: ${selector}): ${error?.message ?? error}`,
    };
  }
  try {
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

  // Validate the step payload like every other handler, so a malformed
  // descriptor (e.g. missing `app`) fails cleanly instead of throwing.
  const isValidStep = validate({ schemaKey: "step_v3", object: step });
  if (!isValidStep.valid) {
    result.status = "FAIL";
    result.description = `Invalid step definition: ${isValidStep.errors}`;
    return result;
  }
  step = isValidStep.object;
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
  const platformDriver = APP_DRIVER_PLATFORMS[platform];
  if (!platformDriver) {
    result.status = "FAIL";
    result.description = `startSurface (app) runs on Windows and macOS in this phase. Gate the test with runOn platforms (["windows"] or ["mac"]).`;
    return result;
  }
  for (const { field, isSet, guidance } of platformDriver.unsupportedFields) {
    if (isSet(descriptor[field])) {
      result.status = "FAIL";
      result.description = `startSurface.${field} is not supported by the ${platformDriver.driverLabel}. ${guidance}`;
      return result;
    }
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
    try {
      appSession.server = await serverDeps.startServer(
        appSession.appiumEntry,
        appSession.appiumHome
      );
    } catch (error: any) {
      // Post-preflight server-start failures (port race, resource pressure)
      // become a clean step FAIL instead of a context-level exception.
      result.status = "FAIL";
      result.description = `Couldn't start the app automation server: ${error?.message ?? error}`;
      return result;
    }
  }

  const capabilities = platformDriver.buildCapabilities(descriptor, appId);
  Object.assign(capabilities, descriptor.driverOptions ?? {});

  let driver: any;
  try {
    driver = await serverDeps.startDriver(
      capabilities,
      appSession.server.port
    );
  } catch (error: any) {
    const message = `${error?.message ?? error}`;
    result.status = "FAIL";
    result.description = `Couldn't launch app "${appId}": ${message}. Check the app identifier and that the session is interactive.`;
    // A TCC-shaped launch failure on macOS gets the settings walkthrough —
    // the probe can miss (it reports on the probing process, not
    // WebDriverAgentMac), so the session error is the backstop.
    if (platform === "mac" && /accessib|trusted|tcc/i.test(message)) {
      result.description += ` ${MAC_TCC_WALKTHROUGH}`;
    }
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
      platform,
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
    platform,
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
