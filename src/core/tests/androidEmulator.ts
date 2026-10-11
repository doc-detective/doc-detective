// Native app surfaces phase A3b: the managed Android emulator/device layer.
// The top half is pure — output parsers, descriptor normalization, boot-arg
// and port computation, and the reuse-or-create decision — so it's unit-
// testable without an SDK or emulator. The bottom half is the effectful device
// registry and `acquireDevice`, whose effects (adb/emulator spawns, boot
// polling) are all injected so the orchestration is testable with fakes.

import { execFile, spawn, spawnSync } from "node:child_process";
import treeKill from "tree-kill";
import fs from "node:fs";
import path from "node:path";
import {
  pickSystemImage,
  DEVICE_TYPE_PROFILES,
  DEFAULT_AVD_NAME,
  listInstalledSystemImages,
  winShellCommand,
  androidAvdHome,
  CLEAN_SNAPSHOT_NAME,
  hasCleanSnapshot,
  discardCleanSnapshot,
} from "../../runtime/androidInstaller.js";
import type { AndroidSdk } from "../../runtime/androidSdk.js";
import { normalizeDeviceDescriptor } from "./mobileDevice.js";
import type { DeviceDescriptor } from "./mobileDevice.js";

export {
  parseAdbDevices,
  parseEmuAvdName,
  parseListAvds,
  parseAccelCheck,
  // Re-exported from the shared mobileDevice module so existing importers
  // (appSurface.ts) keep resolving it here.
  normalizeDeviceDescriptor,
  emulatorBootArgs,
  nextEmulatorPort,
  udidForPort,
  planDeviceAcquisition,
  planAndroidToolchain,
  createDeviceRegistry,
  acquireDevice,
  teardownDeviceRegistry,
  // Effectful helpers + the deps builder that wires them for a detected SDK.
  buildAcquireDeviceDeps,
  checkEmulatorAcceleration,
  hostHasKvm,
  bootWithCleanSnapshot,
  cleanSnapshotSaveCommands,
  saveCleanSnapshotWith,
  CLEAN_SNAPSHOT_NAME,
  waitForBootCompleted,
  waitForProcessExit,
  shutdownEmulatorWith,
  shutdownEmulator,
  adbPathForSdkRoot,
};
export type { DeviceDescriptor, DeviceRegistry, DeviceEntry, DeviceAcquisition };

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

// The adb commands that save the clean snapshot. Delete it through the
// console first: a directory-only delete (reset, discard) leaves the
// qcow2-internal snapshot behind, and re-saving the name over it produced a
// snapshot that never resumed on windowed (host-GPU) emulators.
function cleanSnapshotSaveCommands(udid: string): string[][] {
  return [
    ["-s", udid, "emu", "avd", "snapshot", "delete", CLEAN_SNAPSHOT_NAME],
    ["-s", udid, "emu", "avd", "snapshot", "save", CLEAN_SNAPSHOT_NAME],
  ];
}

// Run the save, but only after the console confirms the delete (it answers
// OK even when there's nothing to delete). An unconfirmed delete may have
// left the stale copy behind, so skip the save: the next boot is cold and
// retakes it, rather than resuming a snapshot that can't. Returns whether
// the console confirmed the save.
async function saveCleanSnapshotWith(
  run: (args: string[]) => Promise<{ stdout: string }>,
  udid: string
): Promise<boolean> {
  const [deleteArgs, saveArgs] = cleanSnapshotSaveCommands(udid);
  if (!/\bOK\b/.test((await run(deleteArgs)).stdout)) return false;
  return /\bOK\b/.test((await run(saveArgs)).stdout);
}

// --- Descriptor / boot computation (pure) ---

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

// Emulator boot arguments; headless adds `-no-window -no-audio`.
function emulatorBootArgs(
  desc: DeviceDescriptor,
  port: number,
  { snapshot = false }: { snapshot?: boolean } = {}
): string[] {
  const args = ["-avd", String(desc.name), "-port", String(port)];
  // Headless needs a software renderer — a windowless emulator with the default
  // (host) GPU has no surface and exits immediately on a headless CI runner.
  if (desc.headless)
    args.push("-no-window", "-no-audio", "-gpu", "swiftshader_indirect");
  // Snapshot boots resume the clean snapshot, never save over it, and exit
  // (instead of silently cold booting) when it can't load. Otherwise cold boot.
  if (snapshot) {
    args.push("-snapshot", CLEAN_SNAPSHOT_NAME, "-no-snapshot-save", "-force-snapshot-load");
  } else {
    args.push("-no-snapshot");
  }
  args.push("-no-boot-anim");
  return args;
}

// Whether a boot should be headless: an explicit `headless` wins, otherwise
// default to headless on a Linux host with no X display (a CI runner) — a
// windowed emulator can't start there regardless of the descriptor.
function effectiveHeadless(desc: DeviceDescriptor): boolean {
  if (typeof desc.headless === "boolean") return desc.headless;
  return process.platform === "linux" && !process.env.DISPLAY;
}

// --- Toolchain lazy-install decision (pure) ---

type ToolchainPlan =
  | { action: "ready" }
  | { action: "skip"; reason: string }
  | { action: "install"; osVersion?: string; reason: string };

// Decide whether an android run's toolchain is ready, needs a lazy install, or
// the host simply can't run the emulator. `requiredOsVersions` are the versions
// the test's device descriptors ask for (an `undefined` entry means "newest").
//
// - Not capable (no hardware acceleration) -> SKIP; never install on a host
//   that couldn't use the emulator anyway (don't waste a multi-GB download).
// - Capable but the SDK is absent, or an image for a requested version is
//   missing -> INSTALL (the caller warns loudly and runs the installer).
// - Otherwise -> READY.
function planAndroidToolchain({
  capable,
  sdkPresent,
  requiredOsVersions,
  installedImages,
  abi,
}: {
  capable: boolean;
  sdkPresent: boolean;
  requiredOsVersions: (string | undefined)[];
  installedImages: string[];
  abi: string;
}): ToolchainPlan {
  if (!capable) {
    return {
      action: "skip",
      reason: `Skipping context on 'android': this host can't run the Android emulator (no KVM/HVF/WHPX hardware acceleration detected, and no emulator is already running). Android tests run on hosts with virtualization enabled (e.g. a Linux CI runner with KVM).`,
    };
  }
  const versions = requiredOsVersions.length ? requiredOsVersions : [undefined];
  // The first requested version with no installed image (SDK absent counts as
  // "everything missing"). Drives which image the installer fetches.
  let missingVersion: string | undefined;
  let needsInstall = !sdkPresent;
  for (const osVersion of versions) {
    if (!sdkPresent || pickSystemImage(installedImages, { osVersion, abi }) === null) {
      needsInstall = true;
      missingVersion = osVersion;
      break;
    }
  }
  if (needsInstall) {
    return {
      action: "install",
      osVersion: missingVersion,
      reason: `Android tests require the Android SDK toolchain and a system image, which aren't fully installed. Doc Detective is installing them now — this is a one-time, multi-GB download. Pre-install with \`doc-detective install android\` to avoid this delay at test time.`,
    };
  }
  return { action: "ready" };
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

// Resolve true once `proc` has exited (or was never there), false if it's
// still running after `timeoutMs`.
function waitForProcessExit(
  proc: { exitCode: number | null; once: (event: "exit", cb: () => void) => any } | undefined,
  timeoutMs: number
): Promise<boolean> {
  if (!proc || proc.exitCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    proc.once("exit", () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

// The emulator shutdown policy (ADR 01106), effects injected: ask the
// emulator to exit through its console and wait, so qemu flushes its disk
// images (a hard kill can leave them — and the clean snapshot inside them —
// inconsistent). An accepted kill arms the emulator's own watchdog, which ends
// qemu within 20s even when adb clients stall its exit — so a slow exit is
// left to it rather than waited on or hard-killed. Force-kill only when the
// console refused the kill (no watchdog). Then release our stdio pipes: the
// watchdog inherits them and would hold the run open until it fires.
async function shutdownEmulatorWith({
  consoleKill,
  waitExit,
  forceKill,
  release,
}: {
  consoleKill: () => Promise<boolean>;
  waitExit: () => Promise<boolean>;
  forceKill: () => Promise<void>;
  release: () => void;
}): Promise<"graceful" | "watchdog" | "forced"> {
  let accepted = false;
  try {
    accepted = await consoleKill();
  } catch {
    /* fall through to the wait and the force-kill fallback */
  }
  try {
    const graceful = await waitExit();
    if (!graceful && !accepted) await forceKill();
    return graceful ? "graceful" : accepted ? "watchdog" : "forced";
  } finally {
    release();
  }
}

// --- Boot wait (effects injected) ---

// Sub-second so a resumed snapshot is noticed promptly; each probe is a cheap
// `adb shell getprop`.
export const BOOT_POLL_INTERVAL_MS = 500;

// Poll `probe` (sys.boot_completed == 1) until it reports booted, the emulator
// process exits, or `timeoutMs` elapses. Probes immediately — no leading sleep
// — and checks for an exit around every probe so a crashed emulator fails fast
// instead of burning the timeout. The caller formats the outcome.
async function waitForBootCompleted({
  probe,
  exitCode,
  timeoutMs,
  intervalMs = BOOT_POLL_INTERVAL_MS,
  sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
  now = Date.now,
}: {
  probe: () => Promise<boolean>;
  exitCode: () => number | null;
  timeoutMs: number;
  intervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}): Promise<"booted" | "timeout" | { exited: number }> {
  const deadline = now() + timeoutMs;
  while (true) {
    let code = exitCode();
    if (code !== null) return { exited: code };
    if (await probe()) return "booted";
    code = exitCode();
    if (code !== null) return { exited: code };
    if (now() >= deadline) return "timeout";
    await sleep(intervalMs);
  }
}

type BootOutcome = "booted" | "timeout" | { exited: number };

// The clean-snapshot boot policy (ADR 01106), effects injected. With a
// snapshot on disk, force-load it (the emulator EXITS when it can't load, so
// we always know which boot happened). A snapshot that won't load — or loads
// but never finishes booting — is bad: discard it, so a bad snapshot never
// fails a test or costs more than one run. Then (or with no snapshot)
// cold-boot and take the snapshot before any test touches the device. Settle
// first: a snapshot taken mid boot-time work makes every resume replay that
// work. Discard, settle, and save are best-effort — a failed save just means
// the next boot is cold again.
async function bootWithCleanSnapshot<T extends { outcome: BootOutcome }>({
  hasSnapshot,
  attempt,
  discard,
  settle,
  save,
}: {
  hasSnapshot: boolean;
  attempt: (opts: { snapshot: boolean }) => Promise<T>;
  discard: () => Promise<void>;
  settle: () => Promise<void>;
  save: () => Promise<void>;
}): Promise<T> {
  if (hasSnapshot) {
    const fromSnapshot = await attempt({ snapshot: true });
    if (fromSnapshot.outcome === "booted") return fromSnapshot;
    try {
      await discard();
    } catch {
      /* best-effort: the cold boot below still runs */
    }
  }
  const cold = await attempt({ snapshot: false });
  if (cold.outcome === "booted") {
    try {
      await settle();
    } catch {
      /* best-effort: snapshot the unsettled device */
    }
    try {
      await save();
    } catch {
      /* best-effort */
    }
  }
  return cold;
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

  // Fast reuse path for a NAMED device: if it's already acquired this run, or an
  // emulator is already running under that name, we can decide without
  // enumerating AVDs. Enumerating shells out to `emulator -list-avds`, and the
  // reuse path shouldn't depend on that tool being present/working. (Mirrors
  // planDeviceAcquisition step 1, where plan.name === desc.name for a named
  // device.)
  if (desc.name) {
    const registered = registry.get(desc.name);
    if (registered) {
      const entry = registered.ready ? await registered.ready : registered;
      return { entry };
    }
    const hit = running.find((r) => r.name === desc.name);
    if (hit) {
      const entry: DeviceEntry = {
        name: desc.name,
        udid: hit.udid,
        bootedByUs: false,
        sdkRoot,
      };
      registry.set(desc.name, entry);
      return { entry };
    }
  }

  // Full plan (needs the AVD list) — create/boot, or the unnamed/default device
  // whose name resolution depends on the installed AVDs.
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
  // promise BEFORE awaiting, so a concurrent acquirer shares it. Reserve away
  // from BOTH registry devices and any already-running emulators outside the
  // registry, so a fresh boot never collides with a pre-existing one.
  const usedPorts = [
    ...[...registry.values()].map((e) => e.udid),
    ...running.map((r) => r.udid),
  ]
    .map((udid) => Number(udid.replace("emulator-", "")))
    .filter((n) => !Number.isNaN(n));
  const port = nextEmulatorPort(usedPorts);
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

// Run-end sweep: kill only devices Doc Detective booted (launch-ownership),
// leaving pre-existing emulators running. Shutdowns run concurrently: each
// graceful one takes seconds, and a multi-device run shouldn't pay their sum.
// Effects injected.
async function teardownDeviceRegistry(
  registry: DeviceRegistry,
  kill: (entry: DeviceEntry) => Promise<void>
): Promise<void> {
  await Promise.all(
    [...registry.values()]
      .filter((entry) => entry.bootedByUs)
      .map(async (entry) => {
        // A warm-phase boot can still be in flight at run end (the warm task
        // resolves at boot initiation). Await it so the entry carries its real
        // process/udid before the kill — sweeping mid-boot would no-op on the
        // unset process and orphan the emulator. A boot that fails booted
        // nothing, so there's nothing to kill.
        if (entry.ready) {
          try {
            await entry.ready;
          } catch {
            return;
          }
        }
        try {
          await kill(entry);
        } catch {
          // best-effort; a stuck emulator shouldn't fail the run's teardown
        }
      })
  );
  registry.clear();
}

// The adb a shutdown should use: the SDK's platform-tools copy when it's
// there, else adb on PATH — the same fallback boot uses (`sdk.adb ?? "adb"`).
function adbPathForSdkRoot(sdkRoot: string): string {
  const adb = path.join(
    sdkRoot,
    "platform-tools",
    process.platform === "win32" ? "adb.exe" : "adb"
  );
  return fs.existsSync(adb) ? adb : "adb";
}

// --- Real effects (c8-ignored: exercised on the CI emulator legs and dev
// boxes, not the unit suite, which injects all of these). ---

/* c8 ignore start */
function runTool(
  command: string,
  args: string[],
  timeout = 30000,
  env?: NodeJS.ProcessEnv
): Promise<{ code: number | null; stdout: string }> {
  return new Promise((resolve) => {
    execFile(command, args, { timeout, env }, (error: any, stdout) => {
      resolve({ code: error?.code ?? 0, stdout: String(stdout ?? "") });
    });
  });
}

// Probe hardware acceleration via `emulator -accel-check`.
async function checkEmulatorAcceleration(emulatorPath: string): Promise<boolean> {
  const { code, stdout } = await runTool(emulatorPath, ["-accel-check"], 15000);
  return parseAccelCheck({ code, text: stdout });
}

// Cheap host-capability probe when no SDK exists yet (so `emulator -accel-check`
// isn't available): on Linux, KVM acceleration means /dev/kvm is present and
// read/write accessible to this process — which is exactly what enabling the
// KVM udev rule grants. On non-Linux hosts without an SDK we can't cheaply
// confirm HVF/WHPX and hosted CI runners can't nest-virtualize, so treat them as
// not capable (a real dev machine with an SDK takes the accel-check path).
async function hostHasKvm(): Promise<boolean> {
  if (process.platform !== "linux") return false;
  try {
    const fs = await import("node:fs");
    fs.accessSync("/dev/kvm", fs.constants.R_OK | fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
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
  {
    name,
    systemImage,
    device,
  }: { name: string; systemImage: string; device: string },
  env: NodeJS.ProcessEnv
): Promise<void> {
  // avdmanager is a `.bat` shim on Windows — spawn it through the shell as a
  // single validated command string (Node 20.12+/22 EINVAL on `.bat` without
  // shell:true; winShellCommand rejects any shell-metacharacter token).
  const useShell =
    process.platform === "win32" && /\.(bat|cmd)$/i.test(avdmanagerPath);
  const args = [
    "create",
    "avd",
    "-n",
    name,
    "-k",
    systemImage,
    "--device",
    device,
    "--force",
  ];
  await new Promise<void>((resolve, reject) => {
    const child = useShell
      ? spawn(winShellCommand(avdmanagerPath, args), {
          stdio: ["pipe", "ignore", "pipe"],
          shell: true,
          env,
        })
      : spawn(avdmanagerPath, args, { stdio: ["pipe", "ignore", "pipe"], env });
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

// One emulator spawn, polled until sys.boot_completed, an exit, or timeout.
async function bootEmulatorOnce(
  emulatorPath: string,
  adbPath: string,
  desc: DeviceDescriptor,
  port: number,
  env: NodeJS.ProcessEnv,
  timeout: number,
  snapshot: boolean
): Promise<{ outcome: BootOutcome; child: any; diag: string; bootArgs: string[] }> {
  const udid = udidForPort(port);
  // Force headless when there's no display (CI) so a windowed emulator doesn't
  // exit immediately on a headless runner.
  const bootDesc = { ...desc, headless: effectiveHeadless(desc) };
  const bootArgs = emulatorBootArgs(bootDesc, port, { snapshot });
  // Capture stdout AND stderr so an emulator that dies on boot reports WHY
  // (missing accel, bad AVD config, …) instead of an opaque "exited (code 1)".
  // The emulator writes most fatal errors to stdout, not stderr.
  const child = spawn(emulatorPath, bootArgs, {
    detached: false,
    stdio: ["ignore", "pipe", "pipe"],
    env,
  });
  let diag = "";
  const capture = (d: Buffer) => {
    diag = (diag + d.toString()).slice(-1500);
  };
  child.stdout?.on("data", capture);
  child.stderr?.on("data", capture);
  // Track an early exit so a crashed emulator fails fast instead of burning the
  // whole timeout on getprop polls against a dead process.
  let exited: number | null = null;
  child.on("exit", (code) => {
    exited = code ?? 0;
  });
  const outcome = await waitForBootCompleted({
    probe: async () => {
      const { stdout } = await runTool(adbPath, ["-s", udid, "shell", "getprop", "sys.boot_completed"], 8000);
      return stdout.trim() === "1";
    },
    exitCode: () => exited,
    timeoutMs: timeout,
  });
  if (outcome === "timeout") {
    // Tree-kill the launcher so its qemu child goes with it. The console
    // can't be trusted here — a wedged guest can ignore `emu kill` — and
    // killing only the launcher orphans qemu on Windows, which keeps the AVD
    // lock and port and fails every later boot of this AVD in the run.
    await new Promise<void>((resolve) => {
      if (!child.pid) return resolve();
      treeKill(child.pid, "SIGKILL", () => resolve());
    });
    await waitForProcessExit(child, 30000);
    // Like the graceful shutdown: a straggling helper that inherited these
    // pipes must not hold the run open.
    child.stdout?.destroy();
    child.stderr?.destroy();
    child.unref?.();
  }
  return { outcome, child, diag, bootArgs };
}

// A healthy resume reaches sys.boot_completed in seconds; past this, the
// snapshot is treated as bad (discarded and replaced by a cold boot).
const SNAPSHOT_RESUME_TIMEOUT_MS = 60000;

// Boot an emulator from its clean snapshot (or cold, taking the snapshot).
async function realBootEmulator(
  emulatorPath: string,
  adbPath: string,
  desc: DeviceDescriptor,
  port: number,
  env: NodeJS.ProcessEnv,
  timeout = 180000,
  log?: (message: string) => void
): Promise<{ udid: string; process: any }> {
  const udid = udidForPort(port);
  const avdHome = env.ANDROID_AVD_HOME ?? androidAvdHome();
  const result = await bootWithCleanSnapshot({
    hasSnapshot: hasCleanSnapshot(String(desc.name), { avdHome }),
    attempt: ({ snapshot }) => {
      log?.(
        snapshot
          ? `Resuming "${desc.name}" from its clean snapshot.`
          : `Cold-booting "${desc.name}"; its clean snapshot is taken once it boots.`
      );
      return bootEmulatorOnce(
        emulatorPath,
        adbPath,
        desc,
        port,
        env,
        snapshot ? Math.min(timeout, SNAPSHOT_RESUME_TIMEOUT_MS) : timeout,
        snapshot
      );
    },
    discard: async () => {
      log?.(`The clean snapshot of "${desc.name}" didn't resume; discarding it.`);
      discardCleanSnapshot(String(desc.name), { avdHome });
    },
    // Boot-completed receivers keep the CPU pinned for ~10s after
    // sys.boot_completed; this returns once their broadcast queues drain.
    // Unsupported on old Android versions, where it exits immediately.
    settle: async () => {
      await runTool(adbPath, ["-s", udid, "shell", "am", "wait-for-broadcast-idle"], 60000);
    },
    save: async () => {
      // Best-effort: an unconfirmed save leaves no snapshot, so the next boot
      // is cold again and retakes it. Say so, or slow boots look unexplained.
      const saved = await saveCleanSnapshotWith(
        (args) => runTool(adbPath, args, 120000),
        udid
      );
      if (!saved) {
        log?.(`Couldn't save the clean snapshot of "${desc.name}"; its next boot will be cold.`);
      }
    },
  });
  if (result.outcome === "booted") return { udid, process: result.child };
  if (typeof result.outcome === "object") {
    const why = result.diag.trim() ? ` — ${result.diag.trim()}` : "";
    throw new Error(
      `Emulator "${desc.name}" exited (code ${result.outcome.exited}) before finishing boot` +
        ` (\`emulator ${result.bootArgs.join(" ")}\`)${why}`
    );
  }
  throw new Error(`Emulator "${desc.name}" did not finish booting within ${timeout}ms.`);
}

// Shut down an emulator Doc Detective booted and wait for it to exit, so the
// run never ends while it's still flushing its disk images (which hold the
// clean snapshot). A shutdown that stalls gets tree-killed.
async function shutdownEmulator(entry: DeviceEntry): Promise<void> {
  const adbPath = adbPathForSdkRoot(entry.sdkRoot);
  await shutdownEmulatorWith({
    // The console answers "OK: killing emulator, bye bye".
    consoleKill: async () => {
      const { stdout } = await runTool(adbPath, ["-s", entry.udid, "emu", "kill"], 15000);
      return /\bOK\b/.test(stdout);
    },
    // A clean exit takes 1-4s; past that, an accepted kill is the watchdog's.
    waitExit: () => waitForProcessExit(entry.process, 8000),
    forceKill: () =>
      new Promise<void>((resolve) => {
        if (!entry.process?.pid) return resolve();
        treeKill(entry.process.pid, "SIGKILL", () => resolve());
      }),
    release: () => {
      entry.process?.stdout?.destroy();
      entry.process?.stderr?.destroy();
      entry.process?.unref?.();
    },
  });
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
  // Pin ANDROID_AVD_HOME so avdmanager (create), `emulator -list-avds`, and
  // `emulator -avd` all agree on ONE AVD directory (shared with the installer) —
  // otherwise the host's ANDROID_USER_HOME / ANDROID_SDK_HOME can split them and
  // the emulator reports "Unknown AVD name" for an AVD we just created.
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ANDROID_AVD_HOME: androidAvdHome(),
  };
  return {
    listRunning: () => listRunningEmulators(adb),
    listAvds: async () => {
      const { stdout } = await runTool(emulator, ["-list-avds"], 30000, env);
      return parseListAvds(stdout);
    },
    installedImages: () => listInstalledSystemImages(sdk.sdkRoot),
    javaPresent,
    abi,
    createAvd: (a: { name: string; systemImage: string; device: string }) =>
      realCreateAvd(avdmanager, a, env),
    boot: (desc: DeviceDescriptor, port: number) =>
      realBootEmulator(emulator, adb, desc, port, env, undefined, log),
    kill: (entry: DeviceEntry) => shutdownEmulator(entry),
    log,
  };
}
/* c8 ignore stop */
