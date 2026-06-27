// Appium registration collector for the diagnostic dump.
//
// Reconciles the two ways an Appium driver can be "there":
//   - npm-resolvable: the driver package resolves from the shim node_modules
//     or the runtime cache (resolveHeavyDepPath).
//   - registered: Appium has it recorded in its extensions manifest
//     (<APPIUM_HOME>/node_modules/.cache/appium/extensions.yaml) under the
//     active APPIUM_HOME.
// The mismatch ("I npm-installed it but Appium doesn't see it") is a real
// support case, usually an APPIUM_HOME pointing at the wrong node_modules.
//
// Registration is read straight from extensions.yaml — the same manifest
// Appium itself reads — rather than spawning `appium driver list`. That
// command cold-loads Appium and does an npm update-check (network), so it's
// slow and variable (8s+ cold vs <1s warm); a bounded probe would
// intermittently time out and then mislabel every registered driver as
// "not registered". The manifest is authoritative, offline, and instant, so
// the dump has no subprocess at all.

import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { setAppiumHome } from "../core/appium.js";
import { resolveHeavyDepPath } from "../runtime/loader.js";

// The driver packages doc-detective installs. Order matches the browsers we
// support (Chrome via chromium, Firefox via gecko).
const KNOWN_DRIVERS = ["appium-chromium-driver", "appium-geckodriver"];

export interface AppiumDriverStatus {
  // npm package name.
  name: string;
  // Whether pkgName appears in extensions.yaml under `drivers:`. `null` when
  // the manifest wasn't read (absent / unreadable / APPIUM_HOME unset) — i.e.
  // registration is genuinely unknown, NOT confirmed-absent. Kept tri-state
  // so the JSON dump can't be misread as "confirmed not registered".
  registered: boolean | null;
  // resolveHeavyDepPath finds the package (shim or cache).
  npmResolvable: boolean;
}

export interface AppiumDiagnostics {
  appiumHome: string | null;
  appiumInstalled: boolean;
  extensionsManifestPath: string | null;
  extensionsManifestPresent: boolean;
  // Set when the manifest exists but couldn't be read/parsed — registration
  // is then unknown rather than known-empty.
  manifestError?: string;
  // The driver package names Appium has registered, straight from the
  // manifest (surfaced for transparency).
  registeredDrivers: string[];
  drivers: AppiumDriverStatus[];
}

// Parse the `pkgName` of every driver recorded in an extensions.yaml
// document. Falls back to the short driver key when an entry omits pkgName.
// Pure (takes the YAML text) so it's unit-testable without a filesystem.
export function registeredDriverPkgNames(manifestText: string): string[] {
  const doc = YAML.parse(manifestText);
  const drivers = doc?.drivers;
  if (!drivers || typeof drivers !== "object") return [];
  const names: string[] = [];
  for (const key of Object.keys(drivers)) {
    const entry = (drivers as Record<string, any>)[key];
    const pkg = entry?.pkgName;
    names.push(typeof pkg === "string" && pkg.length > 0 ? pkg : key);
  }
  return names;
}

export function collectAppiumDiagnostics(config: any): AppiumDiagnostics {
  const ctx = { cacheDir: config?.cacheDir };
  // Resolve APPIUM_HOME independently (the cache collector also does this in a
  // full dump). Idempotent, so order doesn't matter — this collector is
  // correct whether called standalone or after collectCacheStatus.
  try {
    setAppiumHome(ctx);
  } catch {
    // Best-effort — diagnostics must never crash.
  }
  const appiumHome = process.env.APPIUM_HOME || null;

  // Appium records registered extensions in
  // <APPIUM_HOME>/node_modules/.cache/appium/extensions.yaml.
  const extensionsManifestPath = appiumHome
    ? path.join(appiumHome, "node_modules", ".cache", "appium", "extensions.yaml")
    : null;

  let extensionsManifestPresent = false;
  let manifestError: string | undefined;
  let registeredDrivers: string[] = [];
  if (extensionsManifestPath) {
    try {
      extensionsManifestPresent = fs.existsSync(extensionsManifestPath);
    } catch {
      extensionsManifestPresent = false;
    }
    if (extensionsManifestPresent) {
      try {
        registeredDrivers = registeredDriverPkgNames(
          fs.readFileSync(extensionsManifestPath, "utf8")
        );
      } catch (err: any) {
        manifestError = err?.message || String(err);
      }
    }
  }

  // Registration is only KNOWN when the manifest was read successfully;
  // otherwise every driver's `registered` is null (unknown), not false.
  const registrationKnown = extensionsManifestPresent && !manifestError;
  const registeredSet = new Set(registeredDrivers);
  const drivers: AppiumDriverStatus[] = KNOWN_DRIVERS.map((name) => ({
    name,
    npmResolvable: Boolean(resolveHeavyDepPath(name, ctx)),
    registered: registrationKnown ? registeredSet.has(name) : null,
  }));

  return {
    appiumHome,
    appiumInstalled: Boolean(resolveHeavyDepPath("appium", ctx)),
    extensionsManifestPath,
    extensionsManifestPresent,
    manifestError,
    registeredDrivers,
    drivers,
  };
}
