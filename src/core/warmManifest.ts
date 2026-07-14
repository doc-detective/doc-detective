// The warm ownership-handoff manifest (docs/design/warm-phase.md, phase B3).
//
// `doc-detective warm` provisions ahead of a run and EXITS with devices left
// up; ownership is handed to the next run through a manifest in the cache
// root:
//
//   <cacheDir>/warm-manifest.json                    unclaimed handoff
//   <cacheDir>/warm-manifest.claimed-<runId>.json    claimed by one run
//
// The claim is an atomic rename IN THE SAME DIRECTORY, so exactly one of N
// concurrent runners adopts, and the claimed state stays durable and
// discoverable — a rename-to-nowhere would leave a crash window (adopter
// dies post-claim, pre-adoption) with devices up and no record. The adopter
// merges the devices into its run registries as `bootedByUs: true` (the
// existing run-end sweep then reclaims them) and deletes the claimed file
// only after that sweep. Staleness is a guard, not an error: a manifest
// older than the TTL, or a device whose recorded pid is dead, is swept —
// never adopted. Effects (fs, clock, pid liveness) are injected so every
// branch is hermetically unit-testable.

import fsDefault from "node:fs";
import path from "node:path";

export const WARM_MANIFEST_NAME = "warm-manifest.json";
const CLAIMED_PREFIX = "warm-manifest.claimed-";

// A warm handoff is only useful to a run that starts soon after the warm —
// past this, emulator/simulator state (and the assumption that nothing else
// claimed the host's resources) is too stale to trust; sweep instead.
export const DEFAULT_WARM_MANIFEST_TTL_MS = 60 * 60 * 1000;

export type WarmDeviceHandoff = {
  platform: "android" | "ios";
  name: string;
  udid: string;
  // Android emulators are killed by process tree; simulators shut down by
  // udid and carry no pid.
  pid?: number;
  sdkRoot?: string;
  headless?: boolean;
};

type WarmManifestFile = {
  version: 1;
  createdAt: string;
  devices: WarmDeviceHandoff[];
  claimedBy?: { runId: string; pid: number; claimedAt: string };
};

// The minimal fs surface the manifest ops use — node:fs in production,
// injected in unit tests.
export interface WarmManifestFs {
  existsSync(p: string): boolean;
  readFileSync(p: string): string | Buffer;
  writeFileSync(p: string, data: string): void;
  renameSync(from: string, to: string): void;
  unlinkSync(p: string): void;
  readdirSync(p: string): string[];
  mkdirSync(p: string, opts?: { recursive?: boolean }): unknown;
}

export type WarmManifestDeps = {
  fs?: WarmManifestFs;
  now?: () => number;
  isPidAlive?: (pid: number) => boolean;
  // The claiming process's own pid, recorded so a later scan can tell a live
  // adopter from a crashed one.
  pid?: number;
};

function resolveDeps(deps: WarmManifestDeps = {}) {
  return {
    fs: deps.fs ?? (fsDefault as unknown as WarmManifestFs),
    now: deps.now ?? Date.now,
    isPidAlive: deps.isPidAlive ?? defaultIsPidAlive,
    pid: deps.pid ?? process.pid,
  };
}

/* c8 ignore start — real signal probe; unit tests inject isPidAlive. */
function defaultIsPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: any) {
    // Dead ONLY on ESRCH (no such process). Any other error — EPERM
    // (exists, different user) or something unexpected — reads as alive:
    // this check licenses SWEEPING (killing) a recorded device, so
    // uncertainty must never count as dead. Matches the lock lease's
    // liveness probe (src/runtime/lock.ts).
    return error?.code !== "ESRCH";
  }
}
/* c8 ignore stop */

function manifestPath(cacheDir: string): string {
  return path.join(cacheDir, WARM_MANIFEST_NAME);
}

function claimedPath(cacheDir: string, runId: string): string {
  return path.join(cacheDir, `${CLAIMED_PREFIX}${runId}.json`);
}

function parseManifest(text: string | Buffer): WarmManifestFile | null {
  try {
    const parsed = JSON.parse(String(text));
    if (
      !parsed ||
      typeof parsed !== "object" ||
      parsed.version !== 1 ||
      typeof parsed.createdAt !== "string" ||
      !Array.isArray(parsed.devices)
    ) {
      return null;
    }
    return parsed as WarmManifestFile;
  } catch {
    return null;
  }
}

/**
 * Atomically publish the handoff manifest (write-to-tmp + rename, the
 * installed.json pattern) so a concurrent claimer never observes a
 * half-written file. Returns the manifest path, or null when there are no
 * devices to hand off (an empty manifest would only make the next run pay a
 * claim/release round-trip for nothing).
 */
export function writeWarmManifest({
  cacheDir,
  devices,
  deps,
}: {
  cacheDir: string;
  devices: WarmDeviceHandoff[];
  deps?: WarmManifestDeps;
}): string | null {
  const { fs, now, pid } = resolveDeps(deps);
  if (!devices.length) return null;
  // A warm on a pristine host can reach here before anything else created
  // the cache root (getCacheDir only resolves the path).
  fs.mkdirSync(cacheDir, { recursive: true });
  const target = manifestPath(cacheDir);
  const record: WarmManifestFile = {
    version: 1,
    createdAt: new Date(now()).toISOString(),
    devices,
  };
  const tmp = path.join(cacheDir, `${WARM_MANIFEST_NAME}.${pid}.${now()}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(record, null, 2));
  try {
    fs.renameSync(tmp, target);
  } catch {
    // Windows can refuse an overwrite-rename; remove-then-rename, same
    // degradation as writeInstalledRecord.
    try {
      fs.unlinkSync(target);
    } catch {
      // best-effort
    }
    fs.renameSync(tmp, target);
  }
  return target;
}

/**
 * Atomically claim the handoff for `runId`: rename the manifest to the
 * claimed name (exactly one concurrent runner wins the rename), stamp the
 * claimer's identity into the claimed file, and partition the devices into
 * `adopt` (fresh, live) and `sweep` (past the TTL, or a dead recorded pid —
 * cleaned, never adopted). Null when there is no manifest, it is corrupt
 * (deleted), or another runner won the race.
 */
export function claimWarmManifest({
  cacheDir,
  runId,
  ttlMs = DEFAULT_WARM_MANIFEST_TTL_MS,
  deps,
}: {
  cacheDir: string;
  runId: string;
  ttlMs?: number;
  deps?: WarmManifestDeps;
}): {
  adopt: WarmDeviceHandoff[];
  sweep: WarmDeviceHandoff[];
  claimedPath: string;
} | null {
  const { fs, now, isPidAlive, pid } = resolveDeps(deps);
  const source = manifestPath(cacheDir);
  if (!fs.existsSync(source)) return null;
  let manifest: WarmManifestFile | null;
  try {
    manifest = parseManifest(fs.readFileSync(source));
  } catch {
    return null;
  }
  if (!manifest) {
    // Corrupt: a half-written or foreign file. Remove it so it stops
    // shadowing future handoffs; there is nothing safe to adopt.
    try {
      fs.unlinkSync(source);
    } catch {
      // best-effort
    }
    return null;
  }
  const target = claimedPath(cacheDir, runId);
  try {
    fs.renameSync(source, target);
  } catch {
    // Another runner claimed between our read and rename.
    return null;
  }
  // Durable claim record: a later scan can tell whether the adopter is
  // still alive (releaseWarmClaim deletes this after the run-end sweep).
  const claimed: WarmManifestFile = {
    ...manifest,
    claimedBy: { runId, pid, claimedAt: new Date(now()).toISOString() },
  };
  try {
    fs.writeFileSync(target, JSON.stringify(claimed, null, 2));
  } catch {
    // The rename already succeeded; a failed stamp only degrades the
    // orphan scan (the file falls back to the TTL heuristic).
  }
  const expired = now() - Date.parse(manifest.createdAt) > ttlMs;
  const adopt: WarmDeviceHandoff[] = [];
  const sweep: WarmDeviceHandoff[] = [];
  for (const device of manifest.devices) {
    const dead =
      expired || (typeof device.pid === "number" && !isPidAlive(device.pid));
    (dead ? sweep : adopt).push(device);
  }
  return { adopt, sweep, claimedPath: target };
}

/**
 * Delete the claimed file — called only after the adopter's run-end sweep
 * has reclaimed the devices, so the record outlives the resources it
 * describes, never the other way around. Idempotent and best-effort.
 */
export function releaseWarmClaim({
  cacheDir,
  runId,
  deps,
}: {
  cacheDir: string;
  runId: string;
  deps?: WarmManifestDeps;
}): void {
  const { fs } = resolveDeps(deps);
  try {
    fs.unlinkSync(claimedPath(cacheDir, runId));
  } catch {
    // Already gone (or never stamped) — fine either way.
  }
}

function listClaimedFiles(
  cacheDir: string,
  fs: WarmManifestFs
): Array<{ path: string; manifest: WarmManifestFile }> {
  let names: string[];
  try {
    names = fs.readdirSync(cacheDir);
  } catch {
    return [];
  }
  const out: Array<{ path: string; manifest: WarmManifestFile }> = [];
  for (const name of names) {
    if (!name.startsWith(CLAIMED_PREFIX) || !name.endsWith(".json")) continue;
    const filePath = path.join(cacheDir, name);
    try {
      const manifest = parseManifest(fs.readFileSync(filePath));
      if (manifest) out.push({ path: filePath, manifest });
    } catch {
      // Unreadable claim files are left for --down.
    }
  }
  return out;
}

/**
 * Claimed files whose owning run is dead (recorded adopter pid no longer
 * alive, or an unstamped claim older than the TTL): their devices were
 * adopted but never swept — the caller sweeps them and deletes the file.
 */
export function listOrphanedClaims({
  cacheDir,
  ttlMs = DEFAULT_WARM_MANIFEST_TTL_MS,
  deps,
}: {
  cacheDir: string;
  ttlMs?: number;
  deps?: WarmManifestDeps;
}): Array<{ path: string; devices: WarmDeviceHandoff[] }> {
  const { fs, now, isPidAlive } = resolveDeps(deps);
  const orphans: Array<{ path: string; devices: WarmDeviceHandoff[] }> = [];
  for (const { path: filePath, manifest } of listClaimedFiles(cacheDir, fs)) {
    const ownerDead = manifest.claimedBy
      ? !isPidAlive(manifest.claimedBy.pid)
      : now() - Date.parse(manifest.createdAt) > ttlMs;
    if (ownerDead) orphans.push({ path: filePath, devices: manifest.devices });
  }
  return orphans;
}

/**
 * Everything `doc-detective warm --down` tears down: the unclaimed manifest
 * plus every claimed file, with their devices deduped by udid. Manual
 * teardown is deliberately indiscriminate — it is the operator's "leave
 * nothing running" switch.
 */
export function collectWarmLeftovers({
  cacheDir,
  deps,
}: {
  cacheDir: string;
  deps?: WarmManifestDeps;
}): { files: string[]; devices: WarmDeviceHandoff[] } {
  const { fs } = resolveDeps(deps);
  const files: string[] = [];
  const byUdid = new Map<string, WarmDeviceHandoff>();
  const source = manifestPath(cacheDir);
  if (fs.existsSync(source)) {
    try {
      const manifest = parseManifest(fs.readFileSync(source));
      files.push(source);
      for (const device of manifest?.devices ?? []) {
        byUdid.set(device.udid, device);
      }
    } catch {
      files.push(source);
    }
  }
  for (const { path: filePath, manifest } of listClaimedFiles(cacheDir, fs)) {
    files.push(filePath);
    for (const device of manifest.devices) byUdid.set(device.udid, device);
  }
  return { files, devices: [...byUdid.values()] };
}
