// Cache & runtime status collector for the diagnostic dump.
//
// Resolves the directories the lazy installer and runtime depend on
// (cacheDir / runtimeDir / browsersDir / installed.json / APPIUM_HOME)
// and reports, per location, whether it exists, is writable, and how much
// disk space is free. A non-writable cacheDir is a common silent failure
// mode for lazy installs, so surfacing it here lets the Findings layer
// suggest `DOC_DETECTIVE_CACHE_DIR`.
//
// Read-only and crash-proof: every probe is wrapped so a permission error
// on one path degrades to `writable: false` rather than aborting the dump.
// (`getCacheDir` does create the cache root as a side effect — acceptable
// here since the dump is explicitly probing the cache, and it matches how
// every other consumer resolves the dir.)

import fs from "node:fs";
import path from "node:path";
import {
  getCacheDir,
  getRuntimeDir,
  getBrowsersDir,
  getInstalledRecordPath,
} from "../runtime/cacheDir.js";
import { setAppiumHome } from "../core/appium.js";

export interface CacheEntry {
  label: string;
  // null only for APPIUM_HOME when the env var is unset.
  path: string | null;
  exists: boolean;
  // null when not applicable (unset path) — otherwise the result of a
  // W_OK probe against the path (or its nearest existing parent).
  writable: boolean | null;
  // null when free space couldn't be determined (older Node without
  // statfsSync, or a probe error). Bytes otherwise.
  freeBytes: number | null;
}

export interface CacheStatus {
  entries: CacheEntry[];
  error?: string;
}

function safeExists(target: string): boolean {
  try {
    return fs.existsSync(target);
  } catch {
    return false;
  }
}

// The target itself if it exists, otherwise the nearest existing ancestor —
// so probes against a not-yet-created dir (e.g. <cache>/runtime/browsers,
// whose parents may also be missing) answer "could doc-detective create and
// write here?" instead of failing on the first non-existent level.
function nearestExistingPath(target: string): string {
  let current = target;
  // Bounded by the path depth; stops at the filesystem root (dirname of a
  // root returns the root itself).
  for (let i = 0; i < 64; i++) {
    if (safeExists(current)) return current;
    const parent = path.dirname(current);
    if (parent === current) return current;
    current = parent;
  }
  return current;
}

// Probe W_OK on the path (or its nearest existing ancestor).
function isWritable(target: string): boolean {
  try {
    fs.accessSync(nearestExistingPath(target), fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function freeSpaceBytes(target: string): number | null {
  try {
    // statfsSync landed in Node 18.15 / 19.6; older runtimes lack it.
    const statfsSync = (fs as unknown as { statfsSync?: (p: string) => unknown })
      .statfsSync;
    if (typeof statfsSync !== "function") return null;
    const stats = statfsSync(nearestExistingPath(target)) as {
      bavail?: number;
      bsize?: number;
    };
    if (typeof stats?.bavail !== "number" || typeof stats?.bsize !== "number") {
      return null;
    }
    return stats.bavail * stats.bsize;
  } catch {
    return null;
  }
}

function probeDir(label: string, p: string): CacheEntry {
  return {
    label,
    path: p,
    exists: safeExists(p),
    writable: isWritable(p),
    freeBytes: freeSpaceBytes(p),
  };
}

export function collectCacheStatus(config: any): CacheStatus {
  const ctx = { cacheDir: config?.cacheDir };
  const entries: CacheEntry[] = [];
  try {
    entries.push(probeDir("cacheDir", getCacheDir(ctx)));
    entries.push(probeDir("runtimeDir", getRuntimeDir(ctx)));
    entries.push(probeDir("browsersDir", getBrowsersDir(ctx)));

    // installed.json is a file, not a dir — report existence + whether its
    // parent is writable (so "can the installer record here?" is answered),
    // but no free-space figure.
    const recordPath = getInstalledRecordPath(ctx);
    entries.push({
      label: "installed.json",
      path: recordPath,
      exists: safeExists(recordPath),
      writable: isWritable(recordPath),
      freeBytes: null,
    });

    // APPIUM_HOME is resolved by mutating process.env (setAppiumHome returns
    // void), then read back. May be left unset if nothing resolves. This is
    // idempotent and resolved independently here (the appium collector calls
    // it too) so each collector is correct standalone and in any order — the
    // second call in a full dump is a cheap no-op, not an ordering dependency.
    try {
      setAppiumHome(ctx);
    } catch {
      // Best-effort — diagnostics must never crash.
    }
    const appiumHome = process.env.APPIUM_HOME;
    if (typeof appiumHome === "string" && appiumHome.length > 0) {
      entries.push(probeDir("APPIUM_HOME", appiumHome));
    } else {
      entries.push({
        label: "APPIUM_HOME",
        path: null,
        exists: false,
        writable: null,
        freeBytes: null,
      });
    }
  } catch (err: any) {
    return { entries, error: err?.message || String(err) };
  }
  return { entries };
}
