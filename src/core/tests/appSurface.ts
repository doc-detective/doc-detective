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
import { execFile, spawnSync } from "node:child_process";
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
import { normalizeDeviceDescriptor } from "./androidEmulator.js";
import { isMobileTargetPlatform } from "./mobilePlatform.js";
import { validate } from "../../common/src/validate.js";

export {
  classifyAppIdentifier,
  defaultAppSurfaceName,
  classifyNativeSelector,
  buildUiaLocator,
  buildAxLocator,
  buildUiAutomator2Locator,
  buildXCUITestLocator,
  createAppSessionState,
  appSurfacePreflight,
  // Exported as a test seam: the JXA probe must return a definitive boolean
  // on a real macOS host (a null there means the AXIsProcessTrusted bind
  // regressed), which the injectable `deps.probeAccessibility` can't catch.
  probeMacAccessibility,
  isAppDriverRequired,
  stepTargetsAppSurface,
  resolveAppSurfaceRef,
  ensureAppForeground,
  startAppSurface,
  findAppElement,
  buildAppLocator,
  closeAppSurface,
  teardownAppSession,
  // Exported as a test seam: the manifest-staleness rules are load-bearing
  // (a stale manifest makes the lazily-installed driver invisible to Appium).
  invalidateStaleAppiumManifest,
  probeIosToolchain,
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

// Map an ARIA-ish role to an Android widget class (the fully-qualified class
// name UiAutomator2 exposes as an element's tag / `class` attribute). Unknown
// roles pass through under the android.widget package, capitalized, so new
// widgets work without a table update.
function androidWidgetClass(role: string): string {
  const known: Record<string, string> = {
    button: "android.widget.Button",
    checkbox: "android.widget.CheckBox",
    combobox: "android.widget.Spinner",
    dialog: "android.app.Dialog",
    image: "android.widget.ImageView",
    link: "android.widget.TextView",
    list: "android.widget.ListView",
    listitem: "android.widget.TextView",
    menu: "android.widget.Menu",
    menuitem: "android.widget.MenuItem",
    radio: "android.widget.RadioButton",
    slider: "android.widget.SeekBar",
    spinner: "android.widget.Spinner",
    switch: "android.widget.Switch",
    tab: "android.widget.TabWidget",
    text: "android.widget.TextView",
    textbox: "android.widget.EditText",
    toolbar: "android.widget.Toolbar",
    window: "android.widget.FrameLayout",
  };
  return (
    known[role.toLowerCase()] ??
    `android.widget.${role.charAt(0).toUpperCase() + role.slice(1)}`
  );
}

// Build an Android (UiAutomator2) locator from the shared semantic element
// fields — the A3 column of the design's mapping table: elementText → @text,
// elementId/elementTestId → resource-id, elementAria → widget class (+
// content-desc), and the accessible name → @content-desc. Returns null when no
// supported field is present.
//
// Two Android-specific rules distinguish this column from the desktop ones:
//   1. A lone elementId/elementTestId uses the driver's `id` strategy
//      (resource-id, auto-prefixed with the current appPackage) — NOT the
//      "accessibility id" strategy, which on UiAutomator2 means content-desc.
//   2. elementText (@text) and elementAria's name (@content-desc) are DISTINCT
//      attributes, so both can apply at once — no name collision (that rule
//      lives per-platform in buildAppLocator and does not fire for android).
function buildUiAutomator2Locator(criteria: {
  elementText?: string;
  elementId?: string;
  elementTestId?: string;
  elementAria?: { role?: string; name?: string } | string;
  [key: string]: any;
}): { strategy: string; value: string } | null {
  const resourceId = criteria.elementId ?? criteria.elementTestId;
  const aria =
    typeof criteria.elementAria === "string"
      ? { name: criteria.elementAria }
      : criteria.elementAria;

  const predicates: string[] = [];
  if (resourceId !== undefined)
    predicates.push(`@resource-id=${xpathLiteral(resourceId)}`);
  if (criteria.elementText !== undefined)
    predicates.push(`@text=${xpathLiteral(criteria.elementText)}`);
  if (aria?.name !== undefined)
    predicates.push(`@content-desc=${xpathLiteral(aria.name)}`);

  const tag = aria?.role ? androidWidgetClass(aria.role) : undefined;

  if (!tag && predicates.length === 0) return null;

  // Fast path: a lone resource-id uses the `id` strategy.
  if (resourceId !== undefined && predicates.length === 1 && !tag) {
    return { strategy: "id", value: resourceId };
  }

  const predicate = predicates.length ? `[${predicates.join(" and ")}]` : "";
  return { strategy: "xpath", value: `//${tag ?? "*"}${predicate}` };
}

// Build an iOS (XCUITest) locator from the shared semantic element fields.
// XCUITest shares the XCUI role taxonomy with Mac2, so this column reuses the
// AX/XCUI mapping semantics for role/name/text while running against iOS.
function buildXCUITestLocator(criteria: {
  elementText?: string;
  elementId?: string;
  elementTestId?: string;
  elementAria?: { role?: string; name?: string } | string;
  [key: string]: any;
}): { strategy: string; value: string } | null {
  return buildAxLocator(criteria);
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
  // The platform's semantic-locator column (UIA on Windows, AX on macOS,
  // UiAutomator2 on Android).
  buildLocator(criteria: {
    [key: string]: any;
  }): { strategy: string; value: string } | null;
  // Session capabilities for launching `appId` with this platform's driver.
  // `extras` carries platform-specific runtime context (e.g. the android
  // device udid); desktop rows ignore it.
  buildCapabilities(
    descriptor: any,
    appId: string,
    extras?: { udid?: string }
  ): Record<string, any>;
  // Whether elementText and elementAria's accessible name map to the SAME
  // underlying attribute (Windows @Name, macOS title/label) — so two different
  // values are an impossible match and should be rejected. False on Android,
  // where @text and @content-desc are distinct attributes that can co-occur.
  nameFieldsCollide: boolean;
  // Descriptor fields this platform's driver cannot honor — FAIL with the
  // alternative named rather than silently ignoring what the author asked
  // for. `isSet` distinguishes an authored value from a schema default.
  unsupportedFields: {
    field: string;
    isSet(value: any): boolean;
    guidance: string;
  }[];
}

// `device`, `install`, and `activity` are Android-only descriptor fields. Now
// that Android ships (phase A3), the desktop rows reject them here — moved out
// of a blanket phase-gate in startAppSurface — so the rejection travels with
// the platform table like every other unsupported field.
const DESKTOP_UNSUPPORTED_MOBILE_FIELDS = ["device", "install", "activity"].map(
  (field) => ({
    field,
    isSet: (value: any) => value !== undefined,
    guidance:
      "It applies to Android app surfaces (native app phase A3); target them with runOn platforms: android.",
  })
);

const APP_DRIVER_PLATFORMS: Record<string, AppDriverPlatform> = {
  windows: {
    driverPackage: "appium-novawindows-driver",
    driverLabel: "Windows app driver",
    platformName: "Windows",
    automationName: "NovaWindows",
    buildLocator: (criteria) => buildUiaLocator(criteria),
    nameFieldsCollide: true,
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
      ...DESKTOP_UNSUPPORTED_MOBILE_FIELDS,
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
    nameFieldsCollide: true,
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
      ...DESKTOP_UNSUPPORTED_MOBILE_FIELDS,
      {
        field: "workingDirectory",
        // "." is the schema's injected default, not an author request.
        isSet: (value) => value !== undefined && value !== ".",
        guidance:
          "The macOS app driver launches apps through LaunchServices, which offers no working-directory control; launch via runShell if the cwd matters.",
      },
    ],
  },
  android: {
    driverPackage: "appium-uiautomator2-driver",
    driverLabel: "Android app driver",
    platformName: "Android",
    automationName: "UiAutomator2",
    buildLocator: (criteria) => buildUiAutomator2Locator(criteria),
    // @text and @content-desc are distinct attributes — they can co-occur.
    nameFieldsCollide: false,
    buildCapabilities(descriptor, appId, extras) {
      const capabilities: Record<string, any> = {
        platformName: "Android",
        "appium:automationName": "UiAutomator2",
        // The app under test is addressed by its package name; the launcher
        // activity is inferred unless `activity` overrides it.
        "appium:appPackage": appId,
        "appium:newCommandTimeout": 600,
        // adb operations (install, activity start) can be slow on a cold
        // emulator — give them room above the driver's default.
        "appium:adbExecTimeout": 120000,
        "wdio:enforceWebDriverClassic": true,
      };
      // Pin the session to the specific booted device/emulator.
      if (extras?.udid) capabilities["appium:udid"] = extras.udid;
      // An `install` artifact means the driver installs the .apk before launch
      // (appium:app); without it the app must already be on the device.
      if (descriptor.install) {
        capabilities["appium:app"] = path.resolve(descriptor.install);
      }
      if (descriptor.activity) {
        capabilities["appium:appActivity"] = descriptor.activity;
      }
      return capabilities;
    },
    unsupportedFields: [
      {
        field: "args",
        isSet: (value) => Array.isArray(value) && value.length > 0,
        guidance:
          "The Android driver launches apps by package/activity, not a command line; pass intent extras or launch flags via driverOptions (e.g. appium:optionalIntentArguments).",
      },
      {
        field: "env",
        isSet: (value) => value !== undefined,
        guidance:
          "The Android driver can't set app environment variables; use driverOptions for driver-specific launch controls.",
      },
      {
        field: "workingDirectory",
        isSet: (value) => value !== undefined && value !== ".",
        guidance:
          "A working directory is meaningless for an Android package launch.",
      },
    ],
  },
  ios: {
    driverPackage: "appium-xcuitest-driver",
    driverLabel: "iOS app driver",
    platformName: "iOS",
    automationName: "XCUITest",
    buildLocator: (criteria) => buildXCUITestLocator(criteria),
    // iOS maps text/name through the same XCUI naming surface as macOS.
    nameFieldsCollide: true,
    buildCapabilities(descriptor, appId, extras) {
      const capabilities: Record<string, any> = {
        platformName: "iOS",
        "appium:automationName": "XCUITest",
        "appium:newCommandTimeout": 600,
        "wdio:enforceWebDriverClassic": true,
      };
      if (classifyAppIdentifier(appId) === "id") {
        capabilities["appium:bundleId"] = appId;
      } else {
        capabilities["appium:app"] = path.resolve(appId);
      }
      // Installable payload overrides app path for install-before-launch.
      if (descriptor.install) {
        capabilities["appium:app"] = path.resolve(descriptor.install);
      }
      if (extras?.udid) capabilities["appium:udid"] = extras.udid;
      const timeout = descriptor.timeout ?? 60000;
      capabilities["appium:wdaLaunchTimeout"] = Math.max(timeout, 120000);
      capabilities["appium:wdaConnectionTimeout"] = Math.max(timeout, 120000);
      return capabilities;
    },
    unsupportedFields: [
      {
        field: "activity",
        isSet: (value) => value !== undefined,
        guidance:
          "`activity` is Android-only; iOS launches by bundle identifier or installed app payload.",
      },
      {
        field: "args",
        isSet: (value) => Array.isArray(value) && value.length > 0,
        guidance:
          "The iOS driver does not honor desktop-style process arguments for AUT launch.",
      },
      {
        field: "workingDirectory",
        isSet: (value) => value !== undefined && value !== ".",
        guidance: "A working directory is not meaningful for iOS app launches.",
      },
      {
        field: "env",
        isSet: (value) => value !== undefined,
        guidance:
          "Use driverOptions for iOS-specific launch controls; app environment overrides are not supported here.",
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
  // Android: the device whose shared driver session this surface rides on
  // (multiple app surfaces on one device share one UiAutomator2 session).
  // Absent for desktop surfaces (one driver per app).
  deviceName?: string;
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
  // Android (phase A3b): one shared driver session per device, keyed by device
  // name. Multiple app surfaces on the same device reuse its session and switch
  // by activateApp. `defaultDevice` is the context's default device descriptor
  // (from runOn `device`), used when a startSurface omits `device`.
  deviceSessions?: Map<
    string,
    { driver: any; udid: string; foregroundApp?: string }
  >;
  defaultDevice?: any;
  // Android device-layer wiring stashed by runContext for runStep's
  // serverDeps.acquireDevice closure: the run-level device registry (shared
  // across contexts), the resolved SDK root (for the Appium server's
  // ANDROID_HOME), and the injected effect bundle acquireDevice runs on.
  androidSdkRoot?: string;
  androidDeviceRegistry?: any;
  androidDeviceDeps?: any;
  // iOS simulator-layer wiring (phase A4), the simctl analogue of the Android
  // fields above: the run-level simulator registry and the injected simctl
  // effect bundle acquireSimulator runs on. iOS shares one XCUITest session per
  // simulator (keyed in deviceSessions like Android), so no SDK-root env is
  // needed — simctl/xcrun are on PATH.
  iosSimulatorRegistry?: any;
  iosSimulatorDeps?: any;
}

function createAppSessionState(): AppSessionState {
  return {
    surfaces: new Map(),
    recordingHost: { state: { recordings: [] } },
    deviceSessions: new Map(),
  };
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
//
// AXIsProcessTrusted is a plain C function, not an Objective-C method, so
// ObjC.import() alone does NOT expose it on `$` — it must be registered with
// ObjC.bindFunction (name + [returnType, [argTypes]]) first. Without the bind
// the call throws inside osascript, which exits non-zero and collapses every
// verdict to null (inconclusive) — making the definitive-denied SKIP path
// unreachable.
async function probeMacAccessibility(): Promise<boolean | null> {
  return await new Promise((resolve) => {
    execFile(
      "osascript",
      [
        "-l",
        "JavaScript",
        "-e",
        "ObjC.import('ApplicationServices'); ObjC.bindFunction('AXIsProcessTrusted', ['bool', []]); $.AXIsProcessTrusted()",
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

// Probe the iOS simulator toolchain: a macOS host, a configured Xcode
// (`xcode-select -p`), and a working `xcrun simctl`. Effects are injected
// (platform + a command runner) so every branch is unit-testable on any host —
// the same seam iosInstaller uses. The default runner gives `xcrun simctl` a
// generous timeout: the FIRST cold `simctl` call on a runner with many Xcodes
// and simulator runtimes launches CoreSimulatorService and can take far longer
// than a warm call (a 20s ceiling spuriously reported it "unavailable" on
// hosted macos-latest). A failure surfaces the selected developer dir and the
// command's own diagnostic so the skip is actionable, not opaque.
function probeIosToolchain(
  deps: {
    platform?: NodeJS.Platform;
    run?: (
      command: string,
      args: string[]
    ) => { status: number | null; stdout?: string; stderr?: string };
  } = {}
): { ok: true } | { ok: false; reason: string } {
  const platform = deps.platform ?? process.platform;
  const run =
    deps.run ??
    ((command: string, args: string[]) => {
      const result = spawnSync(command, args, {
        encoding: "utf8",
        windowsHide: true,
        // xcrun/simctl gets 2 minutes for the cold CoreSimulator warm-up;
        // xcode-select is a cheap path lookup.
        timeout: command === "xcrun" ? 120000 : 15000,
        maxBuffer: 32 * 1024 * 1024,
      });
      return {
        status: result.status,
        stdout: typeof result.stdout === "string" ? result.stdout : "",
        stderr: typeof result.stderr === "string" ? result.stderr : "",
      };
    });

  if (platform !== "darwin") {
    return {
      ok: false,
      reason:
        "Skipping context on 'ios': iOS app surfaces require a macOS host with Xcode and Simulator tooling.",
    };
  }
  const xcodeSelect = run("xcode-select", ["-p"]);
  if (xcodeSelect.status !== 0) {
    return {
      ok: false,
      reason:
        "Skipping context on 'ios': Xcode command-line tools are not configured. Install Xcode and run `xcode-select --install`.",
    };
  }
  const developerDir = String(xcodeSelect.stdout ?? "").trim();
  const simctl = run("xcrun", ["simctl", "list", "devices", "available"]);
  if (simctl.status !== 0) {
    const detail =
      String(simctl.stderr ?? "")
        .trim()
        .split(/\r?\n/)
        .filter(Boolean)
        .pop() ||
      (simctl.status === null
        ? "the command timed out"
        : `exit ${simctl.status}`);
    return {
      ok: false,
      reason: `Skipping context on 'ios': \`xcrun simctl\` is unavailable (developer dir: ${developerDir || "unset"}; ${detail}). If \`xcode-select -p\` points at CommandLineTools, run \`sudo xcode-select -s /Applications/Xcode.app\`; otherwise open Xcode once to finish simulator components and rerun.`,
    };
  }
  return { ok: true };
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
    probeIosToolchain?: () => { ok: true } | { ok: false; reason: string };
  };
}): Promise<
  | { ok: true; appiumEntry: string; appiumHome: string }
  | { ok: false; reason: string }
> {
  const platformDriver = APP_DRIVER_PLATFORMS[platform];
  if (!platformDriver) {
    return {
      ok: false,
      reason: `Skipping context on '${platform}': native app surfaces run on Windows, macOS, Android, and iOS in this phase. Gate the test with runOn platforms so this skip is intentional.`,
    };
  }
  if (platform === "ios") {
    const probe = deps.probeIosToolchain ?? probeIosToolchain;
    const ios = probe();
    if (!ios.ok) {
      return {
        ok: false,
        reason: ios.reason,
      };
    }
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
  const platformDriver =
    APP_DRIVER_PLATFORMS[platform ?? "windows"] ?? APP_DRIVER_PLATFORMS.windows;
  // On platforms where elementText and elementAria's accessible name map to the
  // SAME attribute (@Name on Windows; title/label — and @value for text — on
  // macOS), two different values compile to contradictory predicates that
  // all-but-never co-occur on one element. Surface the conflict instead of
  // failing silently as not-found. Android is exempt: there @text and
  // @content-desc are distinct attributes that legitimately co-occur.
  if (platformDriver.nameFieldsCollide) {
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
        error: `elementText ("${criteria.elementText}") and elementAria ("${ariaName}") give the element two different accessible names, which compile to conflicting predicates on app surfaces. Specify one of them.`,
      };
    }
  }
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
    // Android only (phase A3b): acquire (boot/create-and-boot, or reuse) the
    // device for this surface. Injected so the device layer's effects stay out
    // of appSurface. Absent for desktop platforms.
    acquireDevice?: (
      desc: any
    ) => Promise<{ entry: { name: string; udid: string } } | { skip: string }>;
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

  const platformDriver = APP_DRIVER_PLATFORMS[platform];
  if (!platformDriver) {
    result.status = "FAIL";
    result.description = `startSurface (app) runs on Windows and macOS desktops plus Android and iOS mobile targets in this phase. Gate the test with runOn platforms (["windows"], ["mac"], ["android"], or ["ios"]).`;
    return result;
  }
  // Per-platform unsupported fields (desktop rows reject the mobile-only
  // device/install/activity; Android rejects args/env/workingDirectory) — fail
  // with the alternative named rather than silently ignoring the author's ask.
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

  let driver: any;
  let deviceName: string | undefined;

  if (isMobileTargetPlatform(platform)) {
    // Mobile (Android emulator / iOS simulator): multiple app surfaces on one
    // device share a single driver session (switch by activateApp), so the
    // driver is per-device, not per-app. Resolve the device (context default
    // merged with the step override) and acquire it (boot/create as needed).
    // `targetNoun` keeps guidance honest per platform.
    const targetNoun = platform === "ios" ? "simulator" : "device";
    const desc = normalizeDeviceDescriptor({
      contextDevice: appSession.defaultDevice,
      stepDevice: descriptor.device,
      platform,
    });
    if (!serverDeps.acquireDevice) {
      result.status = "FAIL";
      result.description = `The ${platformDriver.driverLabel} session is missing its ${targetNoun} layer; this is a runner bug (runContext must wire serverDeps.acquireDevice).`;
      return result;
    }
    let acquired: any;
    try {
      acquired = await serverDeps.acquireDevice(desc);
    } catch (error: any) {
      result.status = "FAIL";
      result.description = `Couldn't acquire the ${targetNoun} for "${appId}": ${error?.message ?? error}`;
      return result;
    }
    // The preflight already validated resolvability, so an acquire-time skip is
    // a real runtime failure (e.g. the device died between preflight and now).
    if ("skip" in acquired) {
      result.status = "FAIL";
      result.description = `Couldn't acquire the ${targetNoun} for "${appId}": ${acquired.skip}`;
      return result;
    }
    deviceName = acquired.entry.name;
    const sessions =
      appSession.deviceSessions ?? (appSession.deviceSessions = new Map());
    const deviceSession = sessions.get(deviceName);
    if (!deviceSession) {
      // First app on this device: create the shared session, which launches
      // (and installs, when `install` is set) the app.
      const capabilities = platformDriver.buildCapabilities(descriptor, appId, {
        udid: acquired.entry.udid,
      });
      Object.assign(capabilities, descriptor.driverOptions ?? {});
      try {
        driver = await serverDeps.startDriver(
          capabilities,
          appSession.server.port
        );
      } catch (error: any) {
        result.status = "FAIL";
        result.description = `Couldn't launch app "${appId}" on the ${targetNoun} "${deviceName}": ${error?.message ?? error}.`;
        return result;
      }
      sessions.set(deviceName, {
        driver,
        udid: acquired.entry.udid,
        foregroundApp: appId,
      });
    } else {
      // Subsequent app on the same device: install it if requested, then bring
      // it to the foreground on the existing session. Honor an explicit
      // `activity` here too (activateApp alone launches the default/last
      // activity) — mirroring appActivity in the first app's capabilities.
      driver = deviceSession.driver;
      try {
        if (descriptor.install)
          await driver.installApp(path.resolve(descriptor.install));
        if (descriptor.activity) {
          await driver.execute("mobile: startActivity", {
            appPackage: appId,
            appActivity: descriptor.activity,
          });
        } else {
          await driver.activateApp(appId);
        }
      } catch (error: any) {
        result.status = "FAIL";
        result.description = `Couldn't bring app "${appId}" to the foreground on device "${deviceName}": ${error?.message ?? error}.`;
        return result;
      }
      deviceSession.foregroundApp = appId;
    }
  } else {
    // Desktop (Windows/macOS): one driver session per app.
    const capabilities = platformDriver.buildCapabilities(descriptor, appId);
    Object.assign(capabilities, descriptor.driverOptions ?? {});
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
      // On desktop the session is this app's alone, so end it. On mobile
      // (Android emulator / iOS simulator) the session is shared across the
      // device's apps — deleting it would kill sibling surfaces — so leave it;
      // the run-end device sweep handles the emulator/simulator, and no surface
      // was registered for this failed app.
      if (!isMobileTargetPlatform(platform)) {
        try {
          await driver.deleteSession();
        } catch {
          // best-effort: the launch failed readiness; don't mask that error
        }
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
    deviceName,
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

// Bring an app surface's app to the foreground on its shared Android device
// session before acting on it — the active-surface switch, mirroring browser
// tab focus. No-op for desktop surfaces (one driver per app) and when the app
// is already foreground. Returns an error string if activation fails.
async function ensureAppForeground(
  entry: AppSurfaceEntry,
  appSession?: AppSessionState
): Promise<{ error?: string }> {
  if (!entry.deviceName || !appSession) return {};
  const session = appSession.deviceSessions?.get(entry.deviceName);
  // A surface carrying a deviceName must have a live device session. A missing
  // one is an internal inconsistency — fail loudly instead of skipping the
  // foreground switch and letting the next find/click act on the wrong app.
  if (!session) {
    return {
      error: `Couldn't switch to app surface "${entry.name}" (${entry.appId}): no active session for device "${entry.deviceName}".`,
    };
  }
  if (session.foregroundApp === entry.appId) return {};
  try {
    await session.driver.activateApp(entry.appId);
  } catch (error: any) {
    return {
      error: `Couldn't switch to app surface "${entry.name}" (${entry.appId}) on device "${entry.deviceName}": ${error?.message ?? error}`,
    };
  }
  session.foregroundApp = entry.appId;
  appSession.activeApp = entry.name;
  return {};
}

// Close a registered app surface and deregister it. On desktop, ending the
// driver session terminates the app the driver launched. On Android the driver
// session is shared across the device's apps, so closing one surface only
// terminates THAT app (`terminateApp`) — the shared session and the device live
// until teardown.
async function closeAppSurface({
  entry,
  appSession,
}: {
  entry: AppSurfaceEntry;
  appSession: AppSessionState;
}): Promise<void> {
  appSession.surfaces.delete(entry.name);
  if (appSession.activeApp === entry.name) appSession.activeApp = undefined;
  if (entry.deviceName) {
    // Android: terminate just this app on the shared device session.
    const session = appSession.deviceSessions?.get(entry.deviceName);
    try {
      await entry.driver.terminateApp(entry.appId);
    } catch {
      // Idempotent: the app may already be gone.
    }
    if (session?.foregroundApp === entry.appId) session.foregroundApp = undefined;
    return;
  }
  try {
    await entry.driver.deleteSession();
  } catch {
    // Idempotent: the app/session may already be gone.
  }
}

// Context teardown: close every remaining app surface, end each shared Android
// device session, then stop the app session's Appium server. Killing only what
// we launched is the driver's contract (deleteSession terminates driver-
// launched apps; the run-level device registry sweeps the emulators).
async function teardownAppSession(
  appSession: AppSessionState | undefined,
  killServer: (pid: number | undefined) => Promise<void>
): Promise<void> {
  if (!appSession) return;
  for (const entry of [...appSession.surfaces.values()]) {
    await closeAppSurface({ entry, appSession });
  }
  // End the shared Android device sessions (one per device) after all their
  // surfaces are closed. The emulators themselves are swept at run level.
  for (const session of appSession.deviceSessions?.values() ?? []) {
    try {
      await session.driver.deleteSession();
    } catch {
      // best-effort
    }
  }
  appSession.deviceSessions?.clear();
  if (appSession.server) {
    await killServer(appSession.server.process?.pid);
    appSession.server = undefined;
  }
}
