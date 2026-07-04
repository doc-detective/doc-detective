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
 * Open (provision) a surface and register it by name so later steps can target it with `surface`. Phases A1–A2 ship the desktop native app branch: launch a Windows or macOS application by executable path, `.app` path, bundle ID, or UWP AppUserModelID. macOS additionally requires the Accessibility permission for the process that runs Doc Detective (System Settings → Privacy & Security → Accessibility); without it the context lands as SKIPPED with a walkthrough. Phase A3 adds Android apps on a managed emulator via the `device`, `install`, and `activity` fields (iOS lands in A4). Browser/process branches and the parallel array form arrive with multi-surface Phase 6. See docs/design/native-app-surfaces.md.
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
   * Path to an installable artifact (`.apk`/`.app`/`.ipa`) to install on the device before launch. Lands with the Android phase (A3); on other platforms it is validated but not yet honored.
   */
  install?: string;
  /**
   * Android main activity override (defaults to the package's launcher activity). Lands with the Android phase (A3).
   */
  activity?: string;
  /**
   * Device the app runs on. Omit for a host desktop app, or (in a mobile context) to use the context's default device. A string references a device by name; an object refines it. Lands with the Android phase (A3).
   */
  device?:
    | DeviceByName
    | (DeviceDescriptor & {
        [k: string]: unknown;
      });
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
   * Target platform. Selects the mobile driver. Required in `startSurface.device`; implied by the context in `context.device`.
   */
  platform?: "android" | "ios";
  /**
   * Device name and registry identity — the same name resolves to the same device. Reference form: names an existing AVD (Android) / simulator (iOS) to reuse. If no device by this name exists, Doc Detective creates one under this name using `deviceType`/`osVersion` (or their defaults), provided the toolchain and a matching system image are installed (`doc-detective install android`).
   */
  name?: string;
  /**
   * Abstract hardware profile used when creating a device (portable across `android`/`ios`). Doc Detective maps it to a built-in profile. Ignored when `name` already matches an existing device. Default: `phone`.
   */
  deviceType?: "phone" | "tablet";
  /**
   * Platform version used when creating a device; must match an installed system image (install more with `doc-detective install android`). Ignored when `name` already matches an existing device. Default: the newest installed version.
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
