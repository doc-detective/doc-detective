/* eslint-disable */
/**
 * Auto-generated from startSurface_v3.schema.json
 * Do not edit manually
 */

export type DeviceByName = string;
/**
 * Wait for a specific element to exist on the app surface. Fields with no accessibility mapping on the target platform fail at runtime with the supported alternative named.
 */
export type ElementCriteria = {
  [k: string]: unknown;
};

/**
 * Open (provision) a surface and register it by name so later steps can target it with `surface`. Phases A1–A2 ship the native app branch: launch a Windows or macOS desktop application by executable path, `.app` path, bundle ID, or UWP AppUserModelID. macOS additionally requires the Accessibility permission for the process that runs Doc Detective (System Settings → Privacy & Security → Accessibility); without it the context lands as SKIPPED with a walkthrough. The mobile fields (`install`, `activity`, `device`) are validated now and land in later phases; browser/process branches and the parallel array form arrive with multi-surface Phase 6. See docs/design/native-app-surfaces.md.
 */
export interface StartSurface {
  /**
   * The app identifier: an executable path (`C:\\Windows\\System32\\notepad.exe`), a `.app` path, a bundle ID (`com.apple.TextEdit`), a package name (`com.example.myapp`), or a UWP AppUserModelID (`Microsoft.WindowsCalculator_8wekyb3d8bbwe!App`). Disambiguated by syntax — never by a type field.
   */
  app: string;
  /**
   * Surface-registry name later steps use in `surface`. Default: the executable basename without extension, or the final dot-segment of an ID.
   */
  name?: string;
  /**
   * Launch arguments (desktop apps). On macOS they pass to the app as a real argument array. On Windows they join into a single shell-style argument string for the driver, so an argument with embedded spaces must carry its own quotes (e.g. "\"My File.txt\"").
   */
  args?: string[];
  /**
   * Working directory for the launched app (Windows desktop apps). Not supported on macOS — the driver launches apps through LaunchServices, which offers no working-directory control, so a non-default value fails with guidance there. Default: the run's working directory.
   */
  workingDirectory?: string;
  /**
   * Extra environment variables for the launched app (desktop apps). Supported on macOS; not supported by the Windows driver, where any value fails with guidance (set variables in the shell that launches Doc Detective instead).
   */
  env?: {
    [k: string]: string;
  };
  /**
   * Path to an installable artifact (`.apk`/`.app`/`.ipa`) to install on the device before launch. Reserved for the mobile phases; validated now, not yet implemented.
   */
  install?: string;
  /**
   * Android main activity override (defaults to the package's launcher activity). Reserved for the Android phase; validated now, not yet implemented.
   */
  activity?: string;
  /**
   * Device the app runs on. Omit for a host desktop app. A string references an already-provisioned device by name; an object provisions one. Reserved for the mobile phases; validated now, not yet implemented.
   */
  device?: DeviceByName | DeviceDescriptor;
  /**
   * Escape-hatch passthrough: merged into the automation session's capabilities after the ones Doc Detective computes (namespaced per driver, e.g. `appium:noReset`). Driver- and version-specific; use sparingly.
   */
  driverOptions?: {
    [k: string]: unknown;
  };
  waitUntil?: AppReadiness;
  /**
   * Startup ceiling in milliseconds (launch + install + readiness).
   */
  timeout?: number;
}
export interface DeviceDescriptor {
  /**
   * Target platform. Selects the mobile driver.
   */
  platform: "android" | "ios";
  /**
   * AVD name (Android) or simulator device name (iOS). Also the device's registry identity: the same name resolves to the same device.
   */
  name?: string;
  /**
   * Platform version. Default: the newest available.
   */
  osVersion?: string;
  /**
   * Run the Android emulator without a window. Ignored where not applicable.
   */
  headless?: boolean;
  /**
   * Initial orientation. Reserved; validated now, not yet implemented.
   */
  orientation?: "portrait" | "landscape";
  /**
   * Device kind. `emulator`/`simulator` (the default, inferred from `platform`) or `device` for real hardware. Reserved; validated now, not yet implemented.
   */
  type?: "emulator" | "simulator" | "device";
  /**
   * Pin a specific device/emulator instance by UDID. Reserved; validated now, not yet implemented.
   */
  udid?: string;
  /**
   * Cloud device farm configuration, keyed by provider. Reserved; validated now, not yet implemented.
   */
  provider?: {
    [k: string]: unknown;
  };
}
/**
 * Startup readiness: a fixed delay and/or an element that must exist before the surface is considered open. No condition applies by default.
 */
export interface AppReadiness {
  /**
   * Fixed delay (ms).
   */
  delayMs?: number;
  find?: ElementCriteria;
}
