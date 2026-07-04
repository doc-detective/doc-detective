import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import {
  getCacheDir,
  readInstalledRecord,
  writeInstalledRecord,
  type CacheDirContext,
} from "./cacheDir.js";
import { detectAndroidSdk, type AndroidSdk } from "./androidSdk.js";
import type { Logger } from "./loader.js";

// `doc-detective install android` — the ONE explicit, opt-in place where the
// multi-GB Android toolchain is downloaded. Augment-or-bootstrap: if an SDK is
// already present it uses that SDK's sdkmanager/avdmanager to add only the
// missing pieces (platform-tools, emulator, a system image) and create the
// default AVD; if no SDK exists it bootstraps commandline-tools into
// <cacheDir>/android-sdk first. Nothing here ever runs at test time — a test
// run only *detects* an SDK (androidSdk.ts) and SKIPs when it's absent.

// Pinned Google commandline-tools build. One build number serves all hosts;
// only the platform token in the filename differs.
export const CMDLINE_TOOLS_BUILD = "11076708";
export const DEFAULT_AVD_NAME = "doc-detective";
// Abstract deviceType -> avdmanager `--device` hardware profile id. The schema
// exposes only the abstract names; this table is the single mapping to concrete
// profiles, so swapping a profile is a code change, not a schema change.
export const DEVICE_TYPE_PROFILES: Record<string, string> = {
  phone: "pixel",
  tablet: "pixel_tablet",
};

// Android release version -> API level. Accepts either a release ("14") or a
// raw API level ("34"); an already-numeric API >= 21 passes through.
const ANDROID_VERSION_TO_API: Record<string, number> = {
  "10": 29,
  "11": 30,
  "12": 31,
  "13": 33,
  "14": 34,
  "15": 35,
};

export function androidVersionToApi(osVersion: string): number | null {
  const trimmed = String(osVersion).trim();
  if (ANDROID_VERSION_TO_API[trimmed] !== undefined)
    return ANDROID_VERSION_TO_API[trimmed];
  const n = Number(trimmed);
  if (Number.isInteger(n) && n >= 21) return n;
  return null;
}

// The system image's ABI for the current host. Emulator perf requires a native
// ABI, so Apple Silicon / ARM Linux need arm64 images, everything else x86_64.
export function hostAbi(arch: string = process.arch): "x86_64" | "arm64-v8a" {
  return arch === "arm64" ? "arm64-v8a" : "x86_64";
}

// The commandline-tools download URL for a platform.
export function cmdlineToolsUrl(platform: NodeJS.Platform): string {
  const token =
    platform === "win32" ? "win" : platform === "darwin" ? "mac" : "linux";
  return `https://dl.google.com/android/repository/commandlinetools-${token}-${CMDLINE_TOOLS_BUILD}_latest.zip`;
}

// Parse `sdkmanager --list` output into package paths (first pipe-column). The
// output has "Installed" and "Available" sections with rows like:
//   system-images;android-34;google_apis;x86_64 | 3 | Google APIs ...
// We only need the package id, so we take the first column of any row that
// looks like an id (contains a ';' or is a bare tool name we care about).
export function parseSdkmanagerList(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("---") || line.endsWith(":")) continue;
    const first = line.split("|")[0].trim();
    if (!first) continue;
    // Package ids contain ';'; bare tools we track are platform-tools/emulator.
    const isId =
      first.includes(";") || first === "platform-tools" || first === "emulator";
    if (isId && !seen.has(first)) {
      seen.add(first);
      out.push(first);
    }
  }
  return out;
}

// A parsed system-image package path.
interface ImageInfo {
  pkg: string;
  api: number;
  tag: string;
  abi: string;
}

function parseImage(pkg: string): ImageInfo | null {
  // system-images;android-<API>;<tag>;<abi>
  const parts = pkg.split(";");
  if (parts.length !== 4 || parts[0] !== "system-images") return null;
  const apiMatch = /^android-(\d+)$/.exec(parts[1]);
  if (!apiMatch) return null; // exclude preview codenames (android-Baklava, etc.)
  return { pkg, api: Number(apiMatch[1]), tag: parts[2], abi: parts[3] };
}

// Pick the best system image from a candidate list for an ABI (and optional
// osVersion). Prefers plain `google_apis` (has the Play-less Google APIs
// without the Play Store's locked/rooted constraints), newest API when no
// version is pinned. Returns the package path or null when nothing matches.
export function pickSystemImage(
  images: string[],
  { osVersion, abi }: { osVersion?: string; abi: string }
): string | null {
  const wantedApi =
    osVersion !== undefined && osVersion !== ""
      ? androidVersionToApi(osVersion)
      : null;
  // osVersion given but unmappable -> no match (caller SKIPs with guidance).
  if (osVersion !== undefined && osVersion !== "" && wantedApi === null)
    return null;

  const candidates = images
    .map(parseImage)
    .filter((i): i is ImageInfo => i !== null)
    .filter((i) => i.abi === abi && i.tag === "google_apis")
    .filter((i) => (wantedApi === null ? true : i.api === wantedApi))
    // Newest API first.
    .sort((a, b) => b.api - a.api);

  return candidates.length > 0 ? candidates[0].pkg : null;
}

interface FsDeps {
  existsSync?: (p: string) => boolean;
  readdirSync?: (p: string) => string[];
}

// Scan <sdkRoot>/system-images/<api>/<tag>/<abi> offline (no java, no network)
// and reconstruct installed package ids. Injectable fs for hermetic tests.
export function listInstalledSystemImages(
  sdkRoot: string,
  deps: FsDeps = {}
): string[] {
  const existsSync = deps.existsSync ?? fs.existsSync;
  const readdirSync = deps.readdirSync ?? ((p: string) => fs.readdirSync(p));
  const base = path.join(sdkRoot, "system-images");
  if (!existsSync(base)) return [];
  const out: string[] = [];
  let apis: string[] = [];
  try {
    apis = readdirSync(base);
  } catch {
    return [];
  }
  for (const api of apis) {
    let tags: string[] = [];
    try {
      tags = readdirSync(path.join(base, api));
    } catch {
      continue;
    }
    for (const tag of tags) {
      let abis: string[] = [];
      try {
        abis = readdirSync(path.join(base, api, tag));
      } catch {
        continue;
      }
      for (const abi of abis) {
        out.push(`system-images;${api};${tag};${abi}`);
      }
    }
  }
  return out;
}

export type AndroidInstallAction =
  | { type: "bootstrap-cmdline-tools"; url: string; dest: string }
  | { type: "accept-licenses" }
  | { type: "install-package"; pkg: string }
  | { type: "create-avd"; name: string; systemImage: string; device: string };

export interface AndroidInstallPlanInput {
  detected: AndroidSdk | null;
  cacheSdkRoot: string;
  platform: NodeJS.Platform;
  abi: string;
  installedImages: string[];
  availableImages: string[];
  osVersion?: string;
  deviceType?: string;
  avdName?: string;
  hasPlatformTools?: boolean;
  hasEmulator?: boolean;
}

export interface AndroidInstallPlan {
  sdkRoot: string;
  bootstrapped: boolean;
  actions: AndroidInstallAction[];
  systemImage: string | null;
  // Set when the plan can't proceed (no installable/installed image); the CLI
  // turns this into an actionable message and a non-zero exit.
  blocked?: string;
}

// Compute the ordered augment-or-bootstrap action list. Pure — all inputs are
// pre-resolved (detection, installed/available image lists, host abi), so the
// plan is fully determined and drives both --dry-run and real execution.
export function buildAndroidInstallPlan(
  input: AndroidInstallPlanInput
): AndroidInstallPlan {
  const actions: AndroidInstallAction[] = [];
  const bootstrapped = input.detected === null;
  const sdkRoot = input.detected?.sdkRoot ?? input.cacheSdkRoot;
  const avdName = input.avdName ?? DEFAULT_AVD_NAME;
  const device =
    DEVICE_TYPE_PROFILES[input.deviceType ?? "phone"] ??
    DEVICE_TYPE_PROFILES.phone;

  if (bootstrapped) {
    actions.push({
      type: "bootstrap-cmdline-tools",
      url: cmdlineToolsUrl(input.platform),
      dest: sdkRoot,
    });
  }
  // Licenses must be accepted before sdkmanager will install anything.
  actions.push({ type: "accept-licenses" });

  const hasPlatformTools = input.detected ? Boolean(input.hasPlatformTools) : false;
  const hasEmulator = input.detected ? Boolean(input.hasEmulator) : false;
  if (!hasPlatformTools) actions.push({ type: "install-package", pkg: "platform-tools" });
  if (!hasEmulator) actions.push({ type: "install-package", pkg: "emulator" });

  // Prefer an already-installed image; else install the best available match.
  let systemImage = pickSystemImage(input.installedImages, {
    osVersion: input.osVersion,
    abi: input.abi,
  });
  if (!systemImage) {
    systemImage = pickSystemImage(input.availableImages, {
      osVersion: input.osVersion,
      abi: input.abi,
    });
    if (systemImage) {
      actions.push({ type: "install-package", pkg: systemImage });
    }
  }
  if (!systemImage) {
    return {
      sdkRoot,
      bootstrapped,
      actions,
      systemImage: null,
      blocked: input.osVersion
        ? `No Android ${input.osVersion} (${input.abi}) google_apis system image is installed or available to install.`
        : `No ${input.abi} google_apis system image is installed or available to install.`,
    };
  }

  actions.push({ type: "create-avd", name: avdName, systemImage, device });
  return { sdkRoot, bootstrapped, actions, systemImage };
}

export interface InstallReport {
  kind: "android";
  assetId: string;
  action: string;
  notes?: string[];
}

export interface AndroidInstallerDeps {
  logger?: Logger;
  // Injected effects for hermetic tests. Defaults do the real work.
  detect?: typeof detectAndroidSdk;
  javaPresent?: () => boolean;
  // Runs sdkmanager/avdmanager; resolves stdout. Real impl spawns.
  run?: (
    command: string,
    args: string[],
    opts?: { input?: string; cwd?: string }
  ) => Promise<string>;
  // Downloads + unzips the cmdline-tools bootstrap into destSdkRoot.
  bootstrap?: (url: string, destSdkRoot: string) => Promise<void>;
  fs?: FsDeps;
  arch?: string;
  platform?: NodeJS.Platform;
}

/**
 * Execute (or, with dryRun, only report) the android install plan. Licenses
 * acceptance and downloads happen only with `yes: true`; without it the plan
 * is printed and the caller exits non-zero, matching Doc Detective's
 * prompt-averse CLI style. Java (JRE 17+) is required for sdkmanager/avdmanager
 * and checked up front.
 */
export async function installAndroid({
  yes = false,
  force = false,
  dryRun = false,
  osVersion,
  deviceType,
  ctx = {},
  deps = {},
}: {
  yes?: boolean;
  force?: boolean;
  dryRun?: boolean;
  osVersion?: string;
  deviceType?: string;
  ctx?: CacheDirContext;
  deps?: AndroidInstallerDeps;
}): Promise<InstallReport[]> {
  const logger: Logger = deps.logger ?? (() => {});
  const platform = deps.platform ?? process.platform;
  const abi = hostAbi(deps.arch);
  const detect = deps.detect ?? detectAndroidSdk;
  const fsDeps = deps.fs ?? {};

  const cacheSdkRoot = path.join(getCacheDir(ctx), "android-sdk");
  const detected = detect(ctx, {});
  const installedImages = detected
    ? listInstalledSystemImages(detected.sdkRoot, fsDeps)
    : [];
  // Only query available images (needs java + network) when we might install
  // one — i.e. no installed image already matches.
  const needAvailable =
    pickSystemImage(installedImages, { osVersion, abi }) === null;
  let availableImages: string[] = [];

  const planInput = {
    detected,
    cacheSdkRoot,
    platform,
    abi,
    installedImages,
    availableImages, // filled from `sdkmanager --list` in the yes-path below
    osVersion,
    deviceType,
    hasPlatformTools: Boolean(detected?.adb),
    hasEmulator: Boolean(detected?.emulator),
  };
  let plan = buildAndroidInstallPlan(planInput);

  // Dry-run is a pure preview — no java, no network, no spawn — so it comes
  // before any capability check.
  if (dryRun) {
    logger(`Android install plan (SDK root: ${plan.sdkRoot}):`, "info");
    for (const action of plan.actions) {
      logger(`  - ${describeAction(action)}`, "info");
    }
    if (plan.blocked) logger(`  ! ${plan.blocked}`, "warn");
    if (needAvailable && !plan.systemImage) {
      logger(
        "  (a matching system image may become available after `sdkmanager --list`; rerun with --yes to install)",
        "info"
      );
    }
    return plan.actions.map((a) => ({
      kind: "android" as const,
      assetId: actionAssetId(a),
      action: "planned",
    }));
  }

  // A bootstrap or package install requires java; report the requirement
  // rather than failing deep inside a spawn.
  const javaPresent = deps.javaPresent ? deps.javaPresent() : realJavaPresent();
  if (!javaPresent) {
    logger(
      "Android setup needs a Java runtime (JRE 17+) for sdkmanager/avdmanager. Install one (e.g. Temurin 17) and rerun.",
      "error"
    );
    return [{ kind: "android", assetId: "java", action: "missing" }];
  }

  if (!yes) {
    logger(
      "Refusing to download the multi-GB Android toolchain without confirmation. Rerun with --yes to proceed, or --dry-run to preview.",
      "error"
    );
    logger(
      "Android SDK licenses: https://developer.android.com/studio/terms",
      "info"
    );
    return [{ kind: "android", assetId: "confirmation", action: "declined" }];
  }

  // --- Real execution (yes && !dryRun). Effects are injected for tests. ---
  const run = deps.run ?? realRun;
  const bootstrap = deps.bootstrap ?? realBootstrap;

  // No installed image matched, but an SDK exists — query what's available to
  // install (`sdkmanager --list` hits the network, so it's confined to this
  // opt-in path) and rebuild the plan so the image download is included. The
  // bootstrap-from-nothing case can't query until cmdline-tools exist, so it
  // relies on `availableImages` staying empty and blocking with guidance.
  if (!plan.systemImage && detected) {
    const sdkmanager = toolPath(detected.sdkRoot, "sdkmanager", platform);
    let listOut = "";
    try {
      listOut = await run(sdkmanager, [
        "--sdk_root=" + detected.sdkRoot,
        "--list",
      ]);
    } catch {
      // Leave availableImages empty; the rebuilt plan stays blocked below.
    }
    availableImages = parseSdkmanagerList(listOut).filter((p) =>
      p.startsWith("system-images;")
    );
    plan = buildAndroidInstallPlan({ ...planInput, availableImages });
  }
  if (plan.blocked) {
    logger(
      `${plan.blocked} Install a matching system image (Android Studio, or \`sdkmanager\`), or rerun with --os-version set to an available level.`,
      "error"
    );
    return [{ kind: "android", assetId: "system-image", action: "blocked" }];
  }

  const reports: InstallReport[] = [];
  let sdkRoot = plan.sdkRoot;

  for (const action of plan.actions) {
    /* c8 ignore start */
    // Bootstrap-from-nothing execution is the deferred path (ADR 01024): a
    // no-SDK host has no installed image and can't query available ones until
    // cmdline-tools exist, so the plan blocks before reaching here. The augment
    // path (an existing SDK) is the exercised flow. Kept wired for when the
    // real download+unzip bootstrap lands.
    if (action.type === "bootstrap-cmdline-tools") {
      await bootstrap(action.url, action.dest);
      sdkRoot = action.dest;
      reports.push({ kind: "android", assetId: "cmdline-tools", action: "installed" });
      continue;
    }
    /* c8 ignore stop */
    const sdkmanager = toolPath(sdkRoot, "sdkmanager", platform);
    const avdmanager = toolPath(sdkRoot, "avdmanager", platform);
    if (action.type === "accept-licenses") {
      // sdkmanager --licenses reads repeated "y" from stdin.
      await run(sdkmanager, ["--sdk_root=" + sdkRoot, "--licenses"], {
        input: "y\n".repeat(50),
      });
      reports.push({ kind: "android", assetId: "licenses", action: "accepted" });
    } else if (action.type === "install-package") {
      await run(sdkmanager, ["--sdk_root=" + sdkRoot, action.pkg]);
      reports.push({ kind: "android", assetId: action.pkg, action: "installed" });
    } else if (action.type === "create-avd") {
      if (force) {
        // Best-effort delete so a re-create doesn't error on an existing AVD.
        try {
          await run(avdmanager, ["delete", "avd", "-n", action.name]);
        } catch {
          // no such avd — fine
        }
      }
      await run(
        avdmanager,
        [
          "create",
          "avd",
          "-n",
          action.name,
          "-k",
          action.systemImage,
          "--device",
          action.device,
          "--force",
        ],
        { input: "no\n" }
      );
      reports.push({ kind: "android", assetId: `avd:${action.name}`, action: "created" });
    }
  }

  recordAndroidInstall(ctx, {
    sdkRoot,
    bootstrapped: plan.bootstrapped,
    systemImage: plan.systemImage,
    avdName: plan.actions.find((a) => a.type === "create-avd") as
      | (AndroidInstallAction & { type: "create-avd" })
      | undefined,
  });
  return reports;
}

function describeAction(a: AndroidInstallAction): string {
  switch (a.type) {
    case "bootstrap-cmdline-tools":
      return `bootstrap Android commandline-tools into ${a.dest}`;
    case "accept-licenses":
      return "accept Android SDK licenses";
    case "install-package":
      return `install ${a.pkg}`;
    case "create-avd":
      return `create AVD "${a.name}" (${a.device}) from ${a.systemImage}`;
  }
}

function actionAssetId(a: AndroidInstallAction): string {
  switch (a.type) {
    case "bootstrap-cmdline-tools":
      return "cmdline-tools";
    case "accept-licenses":
      return "licenses";
    case "install-package":
      return a.pkg;
    case "create-avd":
      return `avd:${a.name}`;
  }
}

function toolPath(
  sdkRoot: string,
  tool: string,
  platform: NodeJS.Platform
): string {
  const suffix = platform === "win32" ? ".bat" : "";
  return path.join(sdkRoot, "cmdline-tools", "latest", "bin", tool + suffix);
}

function recordAndroidInstall(
  ctx: CacheDirContext,
  {
    sdkRoot,
    bootstrapped,
    systemImage,
    avdName,
  }: {
    sdkRoot: string;
    bootstrapped: boolean;
    systemImage: string | null;
    avdName?: { name: string };
  }
): void {
  const record = readInstalledRecord(ctx);
  const prior = record.android;
  record.android = {
    sdkRoot,
    bootstrapped: bootstrapped || Boolean(prior?.bootstrapped),
    systemImages: dedupe([
      ...(prior?.systemImages ?? []),
      ...(systemImage ? [systemImage] : []),
    ]),
    avds: dedupe([...(prior?.avds ?? []), ...(avdName ? [avdName.name] : [])]),
    installedAt: nowIso(),
  };
  writeInstalledRecord(record, ctx);
}

function dedupe(list: string[]): string[] {
  return [...new Set(list)];
}

// Isolated so the record write has one timestamp source (tests can't inject it,
// but the surrounding logic is covered via injected run/detect; the timestamp
// itself is inert).
function nowIso(): string {
  return new Date().toISOString();
}

// --- Real effects (only used when deps aren't injected; tests inject all of
// these, so they're excluded from coverage per ADR 01017's honest-100 policy:
// exercising them means spawning java/sdkmanager and downloading multi-GB
// artifacts, which belongs to the manual dev-box / CI-emulator verification,
// not the unit suite). ---

/* c8 ignore start */
function realJavaPresent(): boolean {
  try {
    const res = spawnSync("java", ["-version"], { stdio: "ignore" });
    return res.status === 0;
  } catch {
    return false;
  }
}

async function realRun(
  command: string,
  args: string[],
  opts: { input?: string; cwd?: string } = {}
): Promise<string> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: opts.cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout?.on("data", (d) => (out += d.toString()));
    child.stderr?.on("data", (d) => (err += d.toString()));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve(out)
        : reject(new Error(`${command} exited ${code}: ${err || out}`))
    );
    if (opts.input) child.stdin?.write(opts.input);
    child.stdin?.end();
  });
}

async function realBootstrap(url: string, destSdkRoot: string): Promise<void> {
  // Bootstrapping commandline-tools (download + unzip + relocate the inner
  // `cmdline-tools/` to `<destSdkRoot>/cmdline-tools/latest/`) needs a zip
  // extractor and network; it's exercised on the CI managed-boot leg and dev
  // boxes, not the unit suite. Until wired, the augment path (an existing SDK)
  // is the supported flow — hosted CI runners and most dev machines have one.
  throw new Error(
    `Android commandline-tools bootstrap from ${url} into ${destSdkRoot} is not wired in this build; install the Android SDK manually (Android Studio or commandline-tools) and set ANDROID_HOME/ANDROID_SDK_ROOT, then rerun \`doc-detective install android --yes\`.`
  );
}
/* c8 ignore stop */
