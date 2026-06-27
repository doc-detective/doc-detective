// Install-status collector for the diagnostic dump.
//
// Diffs <cacheDir>/installed.json against the declared/expected versions via
// the installer's own status() — the same matrix `doc-detective install`
// reports (installed vs expected vs outdated, for npm packages and
// browsers). Wrapped so a missing/corrupt cache degrades to an `error`
// marker instead of crashing the dump.

import {
  getInstalledRecordPath,
  type CacheDirContext,
} from "../runtime/cacheDir.js";
import { status, type StatusRow } from "../runtime/installer.js";

export interface InstallData {
  recordPath?: string;
  rows?: StatusRow[];
  error?: string;
}

export function collectInstallStatus(config: any): InstallData {
  try {
    const ctx: CacheDirContext = { cacheDir: config?.cacheDir };
    return { recordPath: getInstalledRecordPath(ctx), rows: status(ctx) };
  } catch (err: any) {
    return { error: err?.message || String(err) };
  }
}
