// Native app surfaces phase A3b: the managed Android emulator/device layer.
// The top half is pure — output parsers, descriptor normalization, boot-arg
// and port computation, and the reuse-or-create decision — so it's unit-
// testable without an SDK or emulator. The bottom half is the effectful device
// registry and `acquireDevice`, whose effects (adb/emulator spawns, boot
// polling) are all injected so the orchestration is testable with fakes.

import { execFile, spawn, spawnSync } from "node:child_process";
import {
  pickSystemImage,
  DEVICE_TYPE_PROFILES,
  DEFAULT_AVD_NAME,
  listInstalledSystemImages,
} from "../../runtime/androidInstaller.js";
import type { AndroidSdk } from "../../runtime/androidSdk.js";

export {
  parseAdbDevices,
  parseEmuAvdName,
  parseListAvds,
  parseAccelCheck,
  normalizeDeviceDescriptor,
  emulatorBootArgs,
  nextEmulatorPort,
  udidForPort,
  planDeviceAcquisition,
  createDeviceRegistry,
  acquireDevice,
  teardownDeviceRegistry,
  // Effectful helpers + the deps builder that wires them for a detected SDK.
  buildAcquireDeviceDeps,
  checkEmulatorAcceleration,
};
export type { DeviceDescriptor, DeviceRegistry, DeviceEntry, DeviceAcquisition };

interface DeviceDescriptor {
  name?: string;
  deviceType?: string;
  osVersion?: string;
  headless?: boolean;
  platform?: string;
}

// --- Output parsers (pure) ---

// Parse `adb devices` into attached devices. The first line is a header; each
// subsequent non-empty line is "<serial>\t<state>".
function parseAdbDevices(text: string): { udid: string; state: string }[] {
  const out: { udid: string; state: string }[] = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^list of devices/i.test(line)) continue;
    const [udid, state] = line.split(/\s+/);
    if (udid && state) out.push({ udid, state });
  }
  return out;
}

// Parse `adb -s <udid> emu avd name`, whose output is the AVD name followed by
// a trailing "OK" acknowledgement line.
function parseEmuAvdName(text: string): string | null {
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line === "OK") continue;
    return line;
  }
  return null;
}

// Parse `emulator -list-avds` — one AVD name per line.
function parseListAvds(text: string): string[] {
  return String(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/^INFO\b|^WARNING\b/i.test(l));
}

// Interpret `emulator -accel-check`: exit code 0 means hardware acceleration
// (KVM/HVF/WHPX) is usable. Some builds still exit 0 with a warning, so a
// "not installed / not usable" phrase in the text vetoes.
function parseAccelCheck({
  code,
  text = "",
}: {
  code: number | null;
  text?: string;
}): boolean {
  if (code !== 0) return false;
  return !/not installed|not usable|is not/i.test(text);
}

// --- Descriptor / boot computation (pure) ---

// Normalize a context default device merged with a step-level device override.
// A string is shorthand for `{ name }`. The step wins field-by-field; platform
// comes from whichever supplies it (the mobile context, normally).
function normalizeDeviceDescriptor({
  contextDevice,
  stepDevice,
  platform,
}: {
  contextDevice?: DeviceDescriptor | string;
  stepDevice?: DeviceDescriptor | string;
  platform?: string;
}): DeviceDescriptor {
  const asObj = (d?: DeviceDescriptor | string): DeviceDescriptor =>
    typeof d === "string" ? { name: d.trim() } : d ? { ...d } : {};
  const ctx = asObj(contextDevice);
  const step = asObj(stepDevice);
  const merged: DeviceDescriptor = { ...ctx, ...step };
  // Drop undefined step keys so they don't clobber context values.
  for (const k of Object.keys(step) as (keyof DeviceDescriptor)[]) {
    if (step[k] === undefined && ctx[k] !== undefined) (merged as any)[k] = ctx[k];
  }
  merged.platform = step.platform ?? ctx.platform ?? platform;
  return merged;
}

// The AVD emulator serial for a console port (even ports 5554..5680).
function udidForPort(port: number): string {
  return `emulator-${port}`;
}

// The next free even console port in the emulator's range. Throws only if the
// whole range is exhausted (128 concurrent emulators — never in practice).
function nextEmulatorPort(usedPorts: Iterable<number>): number {
  const used = new Set<number>(usedPorts);
  for (let port = 5554; port <= 5680; port += 2) {
    if (!used.has(port)) return port;
  }
  /* c8 ignore next */
  throw new Error("No free emulator console port in 5554-5680.");
}

// Emulator boot arguments. `-no-snapshot-save`/`-no-boot-anim` keep CI runs
// fast and deterministic; headless adds `-no-window -no-audio`.
function emulatorBootArgs(desc: DeviceDescriptor, port: number): string[] {
  const args = ["-avd", String(desc.name), "-port", String(port)];
  if (desc.headless) args.push("-no-window", "-no-audio");
  args.push("-no-snapshot-save", "-no-boot-anim");
  return args;
}

// --- Reuse-or-create decision (pure) ---

type DeviceAcquisition =
  | { action: "reuse-running"; name: string; udid: string }
  | { action: "boot"; name: string }
  | {
      action: "create-boot";
      name: string;
      systemImage: string;
      device: string;
    }
  | { action: "skip"; reason: string };

// Decide how to obtain the device described by `desc`, given the current probe
// results. Reuse a running emulator with a matching AVD name; else boot an
// existing AVD; else create one (needs an installed system image + Java) and
// boot it; else SKIP with an actionable reason. When `desc` names nothing, the
// default device resolves to a running emulator → an existing AVD (preferring
// the `doc-detective` one) → creating `doc-detective`.
function planDeviceAcquisition(
  desc: DeviceDescriptor,
  {
    running,
    avds,
    installedImages,
    abi,
    javaPresent,
  }: {
    running: { udid: string; name: string | null }[];
    avds: string[];
    installedImages: string[];
    abi: string;
    javaPresent: boolean;
  }
): DeviceAcquisition {
  const name =
    desc.name ??
    (avds.includes(DEFAULT_AVD_NAME) ? DEFAULT_AVD_NAME : avds[0]) ??
    DEFAULT_AVD_NAME;

  // 1. A running emulator already booted as this AVD → reuse it.
  const hit = running.find((r) => r.name === name);
  if (hit) return { action: "reuse-running", name, udid: hit.udid };

  // 2. When no device was named, any running emulator is the default.
  if (!desc.name && running.length > 0) {
    return {
      action: "reuse-running",
      name: running[0].name ?? name,
      udid: running[0].udid,
    };
  }

  // 3. The AVD exists on disk → boot it.
  if (avds.includes(name)) return { action: "boot", name };

  // 4. Create it, then boot — needs an installed image (matching osVersion when
  //    given) and Java for avdmanager.
  const systemImage = pickSystemImage(installedImages, {
    osVersion: desc.osVersion,
    abi,
  });
  if (!systemImage) {
    return {
      action: "skip",
      reason: desc.osVersion
        ? `Skipping context: no installed Android ${desc.osVersion} (${abi}) google_apis system image to create the "${name}" device. Install one with \`doc-detective install android --os-version ${desc.osVersion}\`.`
        : `Skipping context: no installed Android google_apis system image to create the "${name}" device. Install one with \`doc-detective install android\`.`,
    };
  }
  if (!javaPresent) {
    return {
      action: "skip",
      reason: `Skipping context: creating the "${name}" AVD needs a Java runtime (JRE 17+) for avdmanager. Install one and rerun, or create the AVD ahead of time.`,
    };
  }
  const device =
    DEVICE_TYPE_PROFILES[desc.deviceType ?? "phone"] ??
    DEVICE_TYPE_PROFILES.phone;
  return { action: "create-boot", name, systemImage, device };
}

// --- Device registry + acquisition (effectful; deps injected) ---

interface DeviceEntry {
  name: string;
  udid: string;
  bootedByUs: boolean;
  process?: any;
  headless?: boolean;
  sdkRoot: string;
  // In-flight boot, memoized so concurrent acquirers of the same device share
  // one boot instead of racing two emulators onto the same AVD.
  ready?: Promise<DeviceEntry>;
}

type DeviceRegistry = Map<string, DeviceEntry>;

function createDeviceRegistry(): DeviceRegistry {
  return new Map();
}

interface AcquireDeviceDeps {
  // Probes.
  listRunning: () => Promise<{ udid: string; name: string | null }[]>;
  listAvds: () => Promise<string[]>;
  installedImages: () => string[];
  javaPresent: () => boolean;
  abi: string;
  // Effects.
  createAvd: (args: {
    name: string;
    systemImage: string;
    device: string;
  }) => Promise<void>;
  boot: (
    desc: DeviceDescriptor,
    port: number
  ) => Promise<{ udid: string; process: any }>;
  log?: (message: string) => void;
}

// Obtain the device for a descriptor, booting/creating as planned and
// registering it. A registry hit returns immediately (shared across the run).
// Returns the entry, or a skip-shaped object the caller turns into SKIPPED.
async function acquireDevice({
  desc,
  registry,
  sdkRoot,
  deps,
}: {
  desc: DeviceDescriptor;
  registry: DeviceRegistry;
  sdkRoot: string;
  deps: AcquireDeviceDeps;
}): Promise<
  { entry: DeviceEntry } | { skip: string }
> {
  const running = await deps.listRunning();
  const avds = await deps.listAvds();
  const plan = planDeviceAcquisition(desc, {
    running,
    avds,
    installedImages: deps.installedImages(),
    abi: deps.abi,
    javaPresent: deps.javaPresent(),
  });
  if (plan.action === "skip") return { skip: plan.reason };

  // Registry hit (same name already acquired this run) — reuse, awaiting any
  // in-flight boot so concurrent callers converge on one device.
  const existing = registry.get(plan.name);
  if (existing) {
    const entry = existing.ready ? await existing.ready : existing;
    return { entry };
  }

  if (plan.action === "reuse-running") {
    const entry: DeviceEntry = {
      name: plan.name,
      udid: plan.udid,
      bootedByUs: false,
      sdkRoot,
    };
    registry.set(plan.name, entry);
    return { entry };
  }

  // boot / create-boot: register a placeholder carrying the in-flight boot
  // promise BEFORE awaiting, so a concurrent acquirer shares it.
  const usedPorts = [...registry.values()].map((e) =>
    Number(e.udid.replace("emulator-", ""))
  );
  const port = nextEmulatorPort(usedPorts.filter((n) => !Number.isNaN(n)));
  const placeholder: DeviceEntry = {
    name: plan.name,
    udid: udidForPort(port),
    bootedByUs: true,
    headless: desc.headless,
    sdkRoot,
  };
  const readyPromise = (async () => {
    if (plan.action === "create-boot") {
      deps.log?.(`Creating AVD "${plan.name}" from ${plan.systemImage}.`);
      await deps.createAvd({
        name: plan.name,
        systemImage: plan.systemImage,
        device: plan.device,
      });
    }
    deps.log?.(`Booting emulator "${plan.name}" on port ${port}.`);
    const booted = await deps.boot({ ...desc, name: plan.name }, port);
    placeholder.udid = booted.udid;
    placeholder.process = booted.process;
    return placeholder;
  })();
  placeholder.ready = readyPromise;
  registry.set(plan.name, placeholder);
  await readyPromise;
  return { entry: placeholder };
}

// Run-end sweep: kill only devices Doc Detective booted (launch-ownership),
// leaving pre-existing emulators running. Effects injected.
async function teardownDeviceRegistry(
  registry: DeviceRegistry,
  kill: (entry: DeviceEntry) => Promise<void>
): Promise<void> {
  for (const entry of registry.values()) {
    if (!entry.bootedByUs) continue;
    try {
      await kill(entry);
    } catch {
      // best-effort; a stuck emulator shouldn't fail the run's teardown
    }
  }
  registry.clear();
}

// --- Real effects (c8-ignored: exercised on the CI emulator legs and dev
// boxes, not the unit suite, which injects all of these). ---

/* c8 ignore start */
function runTool(
  command: string,
  args: string[],
  timeout = 30000
): Promise<{ code: number | null; stdout: string }> {
  return new Promise((resolve) => {
    execFile(command, args, { timeout }, (error: any, stdout) => {
      resolve({ code: error?.code ?? 0, stdout: String(stdout ?? "") });
    });
  });
}

// Probe hardware acceleration via `emulator -accel-check`.
async function checkEmulatorAcceleration(emulatorPath: string): Promise<boolean> {
  const { code, stdout } = await runTool(emulatorPath, ["-accel-check"], 15000);
  return parseAccelCheck({ code, text: stdout });
}

// List running emulators with their AVD names (adb devices + emu avd name).
async function listRunningEmulators(
  adbPath: string
): Promise<{ udid: string; name: string | null }[]> {
  const { stdout } = await runTool(adbPath, ["devices"]);
  const devices = parseAdbDevices(stdout).filter((d) => d.state === "device");
  const out: { udid: string; name: string | null }[] = [];
  for (const d of devices) {
    const { stdout: nameOut } = await runTool(adbPath, ["-s", d.udid, "emu", "avd", "name"]);
    out.push({ udid: d.udid, name: parseEmuAvdName(nameOut) });
  }
  return out;
}

async function realCreateAvd(
  avdmanagerPath: string,
  { name, systemImage, device }: { name: string; systemImage: string; device: string }
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      avdmanagerPath,
      ["create", "avd", "-n", name, "-k", systemImage, "--device", device, "--force"],
      { stdio: ["pipe", "ignore", "pipe"] }
    );
    let err = "";
    child.stderr?.on("data", (d) => (err += d.toString()));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`avdmanager create exited ${code}: ${err}`))
    );
    child.stdin?.write("no\n"); // decline the custom-hardware-profile prompt
    child.stdin?.end();
  });
}

// Boot an emulator and poll sys.boot_completed until ready or timeout.
async function realBootEmulator(
  emulatorPath: string,
  adbPath: string,
  desc: DeviceDescriptor,
  port: number,
  timeout = 180000
): Promise<{ udid: string; process: any }> {
  const udid = udidForPort(port);
  const child = spawn(emulatorPath, emulatorBootArgs(desc, port), {
    detached: false,
    stdio: "ignore",
  });
  const deadline = Date.now() + timeout;
  // Give adb a moment, then poll the boot flag.
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    const { stdout } = await runTool(adbPath, ["-s", udid, "shell", "getprop", "sys.boot_completed"], 8000);
    if (stdout.trim() === "1") return { udid, process: child };
  }
  try {
    child.kill();
  } catch {
    /* ignore */
  }
  throw new Error(`Emulator "${desc.name}" did not finish booting within ${timeout}ms.`);
}

async function realKillEmulator(adbPath: string, udid: string): Promise<void> {
  await runTool(adbPath, ["-s", udid, "emu", "kill"], 15000);
}

// Assemble the injected effect bundle for acquireDevice from a detected SDK.
// The runContext wiring calls this; unit tests pass their own bundle instead.
function buildAcquireDeviceDeps(sdk: AndroidSdk, abi: string, log?: (m: string) => void) {
  const adb = sdk.adb ?? "adb";
  const emulator = sdk.emulator ?? "emulator";
  const avdmanager = sdk.avdmanager ?? "avdmanager";
  const javaPresent = () => {
    const { status } = spawnSync("java", ["-version"], { stdio: "ignore" });
    return status === 0;
  };
  return {
    listRunning: () => listRunningEmulators(adb),
    listAvds: async () => {
      const { stdout } = await runTool(emulator, ["-list-avds"]);
      return parseListAvds(stdout);
    },
    installedImages: () => listInstalledSystemImages(sdk.sdkRoot),
    javaPresent,
    abi,
    createAvd: (a: { name: string; systemImage: string; device: string }) =>
      realCreateAvd(avdmanager, a),
    boot: (desc: DeviceDescriptor, port: number) =>
      realBootEmulator(emulator, adb, desc, port),
    kill: (entry: DeviceEntry) => realKillEmulator(adb, entry.udid),
    log,
  };
}
/* c8 ignore stop */
