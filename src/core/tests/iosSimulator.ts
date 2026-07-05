// Native app surfaces phase A4: the managed iOS simulator layer, the simctl
// analogue of androidEmulator.ts. The top half is pure — `simctl … --json`
// parsers, runtime/device-type selection, and the reuse-or-create decision —
// so it's unit-testable without Xcode. The bottom half is the effectful
// registry and `acquireSimulator`, whose effects (simctl spawns, boot polling)
// are all injected so the orchestration is testable with fakes.
//
// Unlike Android emulators (addressed by an even console port → `emulator-5554`
// serial), simulators are addressed by their UDID, and the XCUITest driver
// attaches to whichever simulator we boot via `appium:udid`. simctl owns the
// heavy lifting (boot/create), so this layer just decides WHICH simulator and
// tracks launch-ownership for the run-end sweep.

import { execFile } from "node:child_process";
import { normalizeDeviceDescriptor } from "./mobileDevice.js";
import type { DeviceDescriptor } from "./mobileDevice.js";

export {
  parseSimctlDevices,
  parseSimctlRuntimes,
  parseSimctlDeviceTypes,
  compareVersions,
  newestRuntime,
  productFamilyForDeviceType,
  newestDeviceType,
  planSimulatorAcquisition,
  createSimulatorRegistry,
  acquireSimulator,
  teardownSimulatorRegistry,
  normalizeDeviceDescriptor,
  // Effectful helpers + the deps builder that wires them.
  buildAcquireSimulatorDeps,
};
export type {
  DeviceDescriptor,
  SimDevice,
  SimRuntime,
  SimDeviceType,
  SimulatorRegistry,
  SimulatorEntry,
  SimulatorAcquisition,
};

// --- simctl JSON shapes ---

interface SimDevice {
  udid: string;
  name: string;
  state: string; // "Booted" | "Shutdown" | "Booting" | "Creating" | …
  runtime: string; // the runtime identifier the device lives under
  isAvailable?: boolean;
  deviceTypeIdentifier?: string;
}

interface SimRuntime {
  identifier: string;
  version: string; // e.g. "17.5"
  name: string; // e.g. "iOS 17.5"
  isAvailable: boolean;
  platform?: string; // "iOS" | "watchOS" | …
}

interface SimDeviceType {
  identifier: string;
  name: string; // e.g. "iPhone 15 Pro"
  productFamily?: string; // "iPhone" | "iPad" | …
}

// --- Output parsers (pure) ---

// Parse `xcrun simctl list devices --json`. The `devices` object is keyed by
// runtime identifier; each value is an array of devices under that runtime. We
// flatten it, stamping each device with its runtime, and (defensively) keep
// only entries that carry a udid + name.
function parseSimctlDevices(text: string): SimDevice[] {
  let data: any;
  try {
    data = JSON.parse(String(text));
  } catch {
    return [];
  }
  const byRuntime = data?.devices;
  if (!byRuntime || typeof byRuntime !== "object") return [];
  const out: SimDevice[] = [];
  for (const [runtime, list] of Object.entries(byRuntime)) {
    if (!Array.isArray(list)) continue;
    for (const d of list) {
      if (!d || typeof d.udid !== "string" || typeof d.name !== "string")
        continue;
      out.push({
        udid: d.udid,
        name: d.name,
        state: typeof d.state === "string" ? d.state : "Unknown",
        runtime,
        isAvailable: d.isAvailable !== false,
        deviceTypeIdentifier:
          typeof d.deviceTypeIdentifier === "string"
            ? d.deviceTypeIdentifier
            : undefined,
      });
    }
  }
  return out;
}

// Parse `xcrun simctl list runtimes --json`.
function parseSimctlRuntimes(text: string): SimRuntime[] {
  let data: any;
  try {
    data = JSON.parse(String(text));
  } catch {
    return [];
  }
  const list = data?.runtimes;
  if (!Array.isArray(list)) return [];
  const out: SimRuntime[] = [];
  for (const r of list) {
    if (!r || typeof r.identifier !== "string") continue;
    out.push({
      identifier: r.identifier,
      version: typeof r.version === "string" ? r.version : "",
      name: typeof r.name === "string" ? r.name : r.identifier,
      isAvailable: r.isAvailable !== false,
      platform: typeof r.platform === "string" ? r.platform : undefined,
    });
  }
  return out;
}

// Parse `xcrun simctl list devicetypes --json`.
function parseSimctlDeviceTypes(text: string): SimDeviceType[] {
  let data: any;
  try {
    data = JSON.parse(String(text));
  } catch {
    return [];
  }
  const list = data?.devicetypes;
  if (!Array.isArray(list)) return [];
  const out: SimDeviceType[] = [];
  for (const t of list) {
    if (!t || typeof t.identifier !== "string" || typeof t.name !== "string")
      continue;
    out.push({
      identifier: t.identifier,
      name: t.name,
      productFamily:
        typeof t.productFamily === "string" ? t.productFamily : undefined,
    });
  }
  return out;
}

// --- Runtime / device-type selection (pure) ---

// Compare dotted version strings numerically ("17.5" < "18.0", "17.10" >
// "17.9"). Missing components read as 0. Returns negative/0/positive like a
// comparator.
function compareVersions(a: string, b: string): number {
  const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

// Whether a runtime is an iOS runtime (vs. watchOS/tvOS/visionOS). Prefers the
// `platform` field; a runtime with no platform is treated as iOS only when its
// identifier/name names iOS — hosted images sometimes omit the field. This is
// load-bearing: the hosted runners ship visionOS/watchOS/tvOS runtimes and
// devices too, and booting an Apple Vision Pro for an `ios` context builds a
// (different, slow-to-fail) WebDriverAgent — so every device/runtime selection
// gates on this.
function isIosRuntime(r: SimRuntime): boolean {
  if (r.platform) return r.platform === "iOS";
  return /\.iOS-/i.test(r.identifier) || /^iOS\b/i.test(r.name);
}

// The newest available iOS runtime (highest version). Returns null when none is
// installed/available.
function newestRuntime(runtimes: SimRuntime[]): SimRuntime | null {
  const ios = runtimes.filter((r) => r.isAvailable && isIosRuntime(r));
  if (!ios.length) return null;
  return ios.reduce((best, r) =>
    compareVersions(r.version, best.version) > 0 ? r : best
  );
}

// The product family a device descriptor's `deviceType` maps to: "tablet" →
// iPad, everything else (incl. the default "phone") → iPhone.
function productFamilyForDeviceType(deviceType?: string): "iPhone" | "iPad" {
  return deviceType === "tablet" ? "iPad" : "iPhone";
}

// Extract a device type's leading model number for ordering ("iPhone 15 Pro" →
// 15, "iPad Pro 11-inch" → 11). Names without a number sort lowest.
function deviceTypeModelNumber(name: string): number {
  const match = /\b(\d+)\b/.exec(name);
  return match ? parseInt(match[1], 10) : -1;
}

// The newest device type of a product family (highest model number; a "Pro"
// tie-breaks above a plain model, and "Pro Max"/"Plus" above "Pro"). Returns
// null when the family has no device types. Used only for the create path —
// booting an existing simulator never needs it.
function newestDeviceType(
  deviceTypes: SimDeviceType[],
  family: "iPhone" | "iPad"
): SimDeviceType | null {
  const rank = (name: string): number => {
    if (/pro max/i.test(name)) return 3;
    if (/\bplus\b/i.test(name)) return 2;
    if (/\bpro\b/i.test(name)) return 2;
    return 0;
  };
  const candidates = deviceTypes.filter(
    (t) => (t.productFamily ?? "").toLowerCase() === family.toLowerCase()
  );
  if (!candidates.length) return null;
  return candidates.reduce((best, t) => {
    const dn = deviceTypeModelNumber(t.name) - deviceTypeModelNumber(best.name);
    if (dn !== 0) return dn > 0 ? t : best;
    return rank(t.name) > rank(best.name) ? t : best;
  });
}

// --- Reuse-or-create decision (pure) ---

type SimulatorAcquisition =
  | { action: "reuse-booted"; name: string; udid: string }
  | { action: "boot"; name: string; udid: string }
  | {
      action: "create-boot";
      name: string;
      deviceTypeId: string;
      runtimeId: string;
    }
  | { action: "skip"; reason: string };

// Filter devices to the iPhone/iPad family the descriptor asks for, restricted
// to devices living on an AVAILABLE iOS runtime (so a visionOS Apple Vision Pro,
// a watchOS watch, or a tvOS box is never a candidate for an `ios` context), and
// honoring an explicit `osVersion` (matched against the runtime version). Family
// is matched on the device type identifier, falling back to the device name.
function candidateDevices(
  desc: DeviceDescriptor,
  devices: SimDevice[],
  runtimes: SimRuntime[]
): SimDevice[] {
  const family = productFamilyForDeviceType(desc.deviceType);
  const iosRuntimes = new Set(
    runtimes.filter((r) => r.isAvailable && isIosRuntime(r)).map((r) => r.identifier)
  );
  const versionOf = (runtimeId: string): string =>
    runtimes.find((r) => r.identifier === runtimeId)?.version ?? "";
  const familyRe = family === "iPad" ? /iPad/i : /iPhone|iPod/i;
  return devices
    .filter((d) => d.isAvailable !== false)
    .filter((d) => iosRuntimes.has(d.runtime))
    .filter((d) => {
      if (!desc.osVersion) return true;
      return versionOf(d.runtime) === desc.osVersion;
    })
    .filter(
      (d) => familyRe.test(d.deviceTypeIdentifier ?? "") || familyRe.test(d.name)
    );
}

// Decide how to obtain the simulator described by `desc`. A NAMED device
// reuses a booted match → boots an existing shutdown match → creates+boots
// under that name. The DEFAULT (unnamed) device reuses any booted candidate →
// boots the newest-runtime candidate → creates+boots the newest iPhone. SKIPs
// with an actionable reason when nothing is bootable (no runtime installed).
function planSimulatorAcquisition(
  desc: DeviceDescriptor,
  {
    devices,
    runtimes,
    deviceTypes,
  }: {
    devices: SimDevice[];
    runtimes: SimRuntime[];
    deviceTypes: SimDeviceType[];
  }
): SimulatorAcquisition {
  const versionOf = (runtimeId: string): string =>
    runtimes.find((r) => r.identifier === runtimeId)?.version ?? "";
  const newestOf = (list: SimDevice[]): SimDevice | null =>
    list.length
      ? list.reduce((best, d) =>
          compareVersions(versionOf(d.runtime), versionOf(best.runtime)) > 0
            ? d
            : best
        )
      : null;
  const isBooted = (d: SimDevice) => /^booted$/i.test(d.state);

  if (desc.name) {
    const named = devices.filter((d) => d.name === desc.name);
    const booted = named.find(isBooted);
    if (booted)
      return { action: "reuse-booted", name: desc.name, udid: booted.udid };
    const existing = newestOf(named);
    if (existing)
      return { action: "boot", name: desc.name, udid: existing.udid };
    // Create it under the requested name.
    return planCreate(desc, runtimes, deviceTypes, desc.name);
  }

  // Default device: reuse any booted candidate, else boot the newest existing
  // candidate, else create the newest iPhone.
  const candidates = candidateDevices(desc, devices, runtimes);
  const booted = candidates.find(isBooted);
  if (booted)
    return { action: "reuse-booted", name: booted.name, udid: booted.udid };
  const existing = newestOf(candidates);
  if (existing)
    return { action: "boot", name: existing.name, udid: existing.udid };
  return planCreate(desc, runtimes, deviceTypes, defaultSimulatorName(desc));
}

// The registry name for a created default simulator: stable so a second
// acquire in the same run reuses it rather than creating a duplicate.
function defaultSimulatorName(desc: DeviceDescriptor): string {
  return desc.deviceType === "tablet"
    ? "doc-detective-ipad"
    : "doc-detective-iphone";
}

// Resolve the create-boot plan (or a skip) for a device that must be created:
// needs an available iOS runtime (honoring osVersion) and a device type of the
// requested family.
function planCreate(
  desc: DeviceDescriptor,
  runtimes: SimRuntime[],
  deviceTypes: SimDeviceType[],
  name: string
): SimulatorAcquisition {
  const family = productFamilyForDeviceType(desc.deviceType);
  const available = runtimes.filter((r) => r.isAvailable && isIosRuntime(r));
  const runtime = desc.osVersion
    ? available.find((r) => r.version === desc.osVersion)
    : newestRuntime(available);
  if (!runtime) {
    return {
      action: "skip",
      reason: desc.osVersion
        ? `Skipping context on 'ios': no installed iOS ${desc.osVersion} simulator runtime to create the "${name}" simulator. Install one via Xcode → Settings → Components (or \`xcodebuild -downloadPlatform iOS\`).`
        : `Skipping context on 'ios': no installed iOS simulator runtime is available. Open Xcode once (or run \`xcodebuild -downloadPlatform iOS\`) to install a simulator runtime, then rerun.`,
    };
  }
  const deviceType = newestDeviceType(deviceTypes, family);
  if (!deviceType) {
    return {
      action: "skip",
      reason: `Skipping context on 'ios': no ${family} simulator device type is available to create the "${name}" simulator. Install the iOS platform components in Xcode and rerun.`,
    };
  }
  return {
    action: "create-boot",
    name,
    deviceTypeId: deviceType.identifier,
    runtimeId: runtime.identifier,
  };
}

// --- Simulator registry + acquisition (effectful; deps injected) ---

interface SimulatorEntry {
  name: string;
  udid: string;
  bootedByUs: boolean;
  // In-flight boot, memoized so concurrent acquirers of the same device share
  // one boot instead of racing.
  ready?: Promise<SimulatorEntry>;
}

type SimulatorRegistry = Map<string, SimulatorEntry>;

function createSimulatorRegistry(): SimulatorRegistry {
  return new Map();
}

interface AcquireSimulatorDeps {
  // Probes.
  listDevices: () => Promise<SimDevice[]>;
  listRuntimes: () => Promise<SimRuntime[]>;
  listDeviceTypes: () => Promise<SimDeviceType[]>;
  // Effects.
  create: (args: {
    name: string;
    deviceTypeId: string;
    runtimeId: string;
  }) => Promise<{ udid: string }>;
  boot: (udid: string) => Promise<void>;
  log?: (message: string) => void;
}

// Obtain the simulator for a descriptor, booting/creating as planned and
// registering it (keyed by resolved name, shared across the run). A registry
// hit returns immediately. Returns the entry, or a skip-shaped object the
// caller turns into SKIPPED. Mirrors androidEmulator.acquireDevice.
async function acquireSimulator({
  desc,
  registry,
  deps,
}: {
  desc: DeviceDescriptor;
  registry: SimulatorRegistry;
  deps: AcquireSimulatorDeps;
}): Promise<{ entry: SimulatorEntry } | { skip: string }> {
  // Fast reuse for a NAMED device already acquired this run, without enumerating
  // runtimes/device types (the boot/create-only probes).
  if (desc.name) {
    const registered = registry.get(desc.name);
    if (registered) {
      const entry = registered.ready ? await registered.ready : registered;
      return { entry };
    }
  }

  const [devices, runtimes, deviceTypes] = await Promise.all([
    deps.listDevices(),
    deps.listRuntimes(),
    deps.listDeviceTypes(),
  ]);
  const plan = planSimulatorAcquisition(desc, {
    devices,
    runtimes,
    deviceTypes,
  });
  if (plan.action === "skip") return { skip: plan.reason };

  // Registry hit (same resolved name already acquired this run) — reuse,
  // awaiting any in-flight boot so concurrent callers converge on one device.
  const existing = registry.get(plan.name);
  if (existing) {
    const entry = existing.ready ? await existing.ready : existing;
    return { entry };
  }

  if (plan.action === "reuse-booted") {
    const entry: SimulatorEntry = {
      name: plan.name,
      udid: plan.udid,
      bootedByUs: false,
    };
    registry.set(plan.name, entry);
    return { entry };
  }

  // boot / create-boot: register a placeholder carrying the in-flight boot
  // promise BEFORE awaiting, so a concurrent acquirer shares it.
  const placeholder: SimulatorEntry = {
    name: plan.name,
    udid: plan.action === "boot" ? plan.udid : "",
    bootedByUs: true,
  };
  const readyPromise = (async () => {
    if (plan.action === "create-boot") {
      deps.log?.(
        `Creating simulator "${plan.name}" (${plan.deviceTypeId} on ${plan.runtimeId}).`
      );
      const created = await deps.create({
        name: plan.name,
        deviceTypeId: plan.deviceTypeId,
        runtimeId: plan.runtimeId,
      });
      placeholder.udid = created.udid;
    }
    deps.log?.(`Booting simulator "${plan.name}" (${placeholder.udid}).`);
    await deps.boot(placeholder.udid);
    return placeholder;
  })();
  placeholder.ready = readyPromise;
  registry.set(plan.name, placeholder);
  try {
    await readyPromise;
  } catch (error) {
    // A failed create/boot must not leave a broken placeholder wedging every
    // later acquire of this device — drop it so a retry can start fresh.
    if (registry.get(plan.name) === placeholder) registry.delete(plan.name);
    throw error;
  }
  return { entry: placeholder };
}

// Run-end sweep: shut down only simulators Doc Detective booted (launch-
// ownership), leaving pre-existing booted simulators running. Effects injected.
async function teardownSimulatorRegistry(
  registry: SimulatorRegistry,
  shutdown: (entry: SimulatorEntry) => Promise<void>
): Promise<void> {
  for (const entry of registry.values()) {
    if (!entry.bootedByUs) continue;
    try {
      await shutdown(entry);
    } catch {
      // best-effort; a stuck simulator shouldn't fail the run's teardown
    }
  }
  registry.clear();
}

// --- Real effects (c8-ignored: exercised on the macOS fixture legs and dev
// boxes, not the unit suite, which injects all of these). ---

/* c8 ignore start */
function runSimctl(
  args: string[],
  timeout = 60000
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      "xcrun",
      ["simctl", ...args],
      { timeout, maxBuffer: 32 * 1024 * 1024 },
      (error: any, stdout, stderr) => {
        resolve({
          code: error?.code ?? 0,
          stdout: String(stdout ?? ""),
          stderr: String(stderr ?? ""),
        });
      }
    );
  });
}

// Boot a simulator and block until it finishes booting. `simctl boot` returns
// immediately; `simctl bootstatus -b` waits for the boot to complete (and is a
// no-op if it's already booted).
async function realBootSimulator(udid: string, timeout = 180000): Promise<void> {
  const boot = await runSimctl(["boot", udid], 60000);
  // "Unable to boot device in current state: Booted" is fine — already booted.
  if (boot.code !== 0 && !/current state: Booted/i.test(boot.stderr)) {
    throw new Error(
      `simctl boot ${udid} failed (code ${boot.code}): ${boot.stderr.trim()}`
    );
  }
  const status = await runSimctl(["bootstatus", udid, "-b"], timeout);
  if (status.code !== 0) {
    throw new Error(
      `simctl bootstatus ${udid} failed (code ${status.code}): ${status.stderr.trim()}`
    );
  }
}

async function realCreateSimulator({
  name,
  deviceTypeId,
  runtimeId,
}: {
  name: string;
  deviceTypeId: string;
  runtimeId: string;
}): Promise<{ udid: string }> {
  const created = await runSimctl(["create", name, deviceTypeId, runtimeId]);
  if (created.code !== 0) {
    throw new Error(
      `simctl create "${name}" failed (code ${created.code}): ${created.stderr.trim()}`
    );
  }
  const udid = created.stdout.trim().split(/\r?\n/).pop()?.trim() ?? "";
  if (!udid) {
    throw new Error(`simctl create "${name}" returned no udid.`);
  }
  return { udid };
}

async function realShutdownSimulator(udid: string): Promise<void> {
  await runSimctl(["shutdown", udid], 30000);
}

// Assemble the injected effect bundle for acquireSimulator, plus the `shutdown`
// effect the run-end teardown sweep uses. runContext calls this; unit tests
// pass their own bundle instead. Mirrors androidEmulator.buildAcquireDeviceDeps.
function buildAcquireSimulatorDeps(
  log?: (m: string) => void
): AcquireSimulatorDeps & {
  shutdown: (entry: SimulatorEntry) => Promise<void>;
} {
  return {
    listDevices: async () => {
      const { stdout } = await runSimctl(["list", "devices", "--json"], 60000);
      return parseSimctlDevices(stdout);
    },
    listRuntimes: async () => {
      const { stdout } = await runSimctl(["list", "runtimes", "--json"], 60000);
      return parseSimctlRuntimes(stdout);
    },
    listDeviceTypes: async () => {
      const { stdout } = await runSimctl(
        ["list", "devicetypes", "--json"],
        60000
      );
      return parseSimctlDeviceTypes(stdout);
    },
    create: realCreateSimulator,
    boot: realBootSimulator,
    shutdown: (entry: SimulatorEntry) => realShutdownSimulator(entry.udid),
    log,
  };
}
/* c8 ignore stop */
