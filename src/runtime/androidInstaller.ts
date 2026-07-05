import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import https from "node:https";
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
  "12L": 32,
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

// --- Portable JRE (so Java stops being a host prerequisite) ---
//
// sdkmanager/avdmanager are Java tools. Rather than require the user to install a
// JRE, Doc Detective can download a portable Temurin JRE into its cache — the
// same "bootstrap it ourselves" approach used for the SDK. These helpers build
// the download URL and locate JAVA_HOME inside the extracted archive; the
// effectful download/extract lives below with the other real effects.

// Temurin (Eclipse Adoptium) LTS feature version to fetch. 17 is the current
// baseline sdkmanager/avdmanager require.
const JRE_FEATURE_VERSION = "17";

// The Adoptium binary API redirects to the actual JRE archive for the host
// (`.tar.gz` on Linux/macOS, `.zip` on Windows). arch: Adoptium uses `x64` and
// `aarch64`; anything unusual falls back to x64.
export function jreDownloadUrl(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch
): string {
  const os =
    platform === "win32" ? "windows" : platform === "darwin" ? "mac" : "linux";
  const adoptiumArch = arch === "arm64" ? "aarch64" : "x64";
  return `https://api.adoptium.net/v3/binary/latest/${JRE_FEATURE_VERSION}/ga/${os}/${adoptiumArch}/jre/hotspot/normal/eclipse`;
}

// The temp filename to save the download as, so the extractor picks the right
// tool by extension (a `.tar.gz` on POSIX, `.zip` on Windows).
export function jreArchiveFilename(
  platform: NodeJS.Platform = process.platform
): string {
  return platform === "win32" ? "jre.zip" : "jre.tar.gz";
}

// Given the directory a Temurin JRE was extracted into, resolve JAVA_HOME.
// Temurin extracts a single top-level `jdk-<ver>-jre/` directory; on macOS the
// runnable home is nested under `Contents/Home`. `entries` is the extracted
// dir's top-level names (injected so this is pure/testable).
export function resolveJavaHome(
  extractDir: string,
  entries: string[],
  platform: NodeJS.Platform = process.platform
): string | null {
  const top = entries.find((e) => /jdk|jre/i.test(e));
  if (!top) return null;
  const base = path.join(extractDir, top);
  return platform === "darwin" ? path.join(base, "Contents", "Home") : base;
}

// The `java` executable path under a JAVA_HOME, per platform.
export function javaBinPath(
  javaHome: string,
  platform: NodeJS.Platform = process.platform
): string {
  return path.join(javaHome, "bin", platform === "win32" ? "java.exe" : "java");
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
  // Portable-JRE provisioning (so Java isn't a host prerequisite). Defaults
  // detect a cached JRE and, when absent, download a Temurin JRE into the cache.
  detectCachedJavaHome?: (cacheJreRoot: string) => string | null;
  bootstrapJava?: (cacheJreRoot: string) => Promise<string>;
  setJavaEnv?: (javaHome: string, platform: NodeJS.Platform) => void;
  fs?: FsDeps;
  arch?: string;
  platform?: NodeJS.Platform;
}

export interface EnsureJavaResult {
  ok: boolean;
  source?: "system" | "cache" | "bootstrap";
  javaHome?: string;
  reason?: string;
}

// Point JAVA_HOME (and PATH) at a Doc-Detective-managed JRE so the sdkmanager /
// avdmanager spawns that follow — in this process — pick it up.
function applyJavaEnv(javaHome: string, platform: NodeJS.Platform): void {
  process.env.JAVA_HOME = javaHome;
  const bin = path.join(javaHome, "bin");
  const sep = platform === "win32" ? ";" : ":";
  if (!(process.env.PATH ?? "").split(sep).includes(bin)) {
    process.env.PATH = `${bin}${sep}${process.env.PATH ?? ""}`;
  }
}

/**
 * Make a Java runtime available for sdkmanager/avdmanager without requiring one
 * on the host: use the system Java if present, else a previously cached
 * Doc-Detective JRE, else download a portable Temurin JRE into the cache. On a
 * cache/bootstrap hit JAVA_HOME + PATH are pointed at it for the rest of this
 * process. Effects are injected so the branch logic is unit-testable.
 */
export async function ensureJava(deps: {
  javaPresent: () => boolean;
  cacheJreRoot: string;
  detectCachedJavaHome: (cacheJreRoot: string) => string | null;
  bootstrapJava: (cacheJreRoot: string) => Promise<string>;
  setJavaEnv?: (javaHome: string, platform: NodeJS.Platform) => void;
  platform?: NodeJS.Platform;
  logger?: Logger;
}): Promise<EnsureJavaResult> {
  const platform = deps.platform ?? process.platform;
  const setEnv = deps.setJavaEnv ?? applyJavaEnv;
  const log = deps.logger ?? (() => {});

  if (deps.javaPresent()) return { ok: true, source: "system" };

  const cached = deps.detectCachedJavaHome(deps.cacheJreRoot);
  if (cached) {
    setEnv(cached, platform);
    return { ok: true, source: "cache", javaHome: cached };
  }

  log(
    `No Java runtime found for sdkmanager/avdmanager. Downloading a portable Temurin JRE ${JRE_FEATURE_VERSION} into the Doc Detective cache — this is a one-time download.`,
    "warn"
  );
  try {
    const javaHome = await deps.bootstrapJava(deps.cacheJreRoot);
    setEnv(javaHome, platform);
    log(`Using a Doc-Detective-managed JRE at ${javaHome}.`, "info");
    return { ok: true, source: "bootstrap", javaHome };
  } catch (error) {
    return { ok: false, reason: (error as Error)?.message ?? String(error) };
  }
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

  // A bootstrap or package install needs Java for sdkmanager/avdmanager. Provide
  // it without requiring one on the host: system Java, else a cached JRE, else a
  // one-time portable Temurin download. Runs only after the --yes guard so the
  // JRE download is part of the confirmed install, never a surprise.
  const cacheJreRoot = path.join(getCacheDir(ctx), "jre");
  const java = await ensureJava({
    javaPresent: deps.javaPresent ?? realJavaPresent,
    cacheJreRoot,
    detectCachedJavaHome: deps.detectCachedJavaHome ?? realDetectCachedJavaHome,
    bootstrapJava: deps.bootstrapJava ?? realBootstrapJava,
    setJavaEnv: deps.setJavaEnv,
    platform,
    logger,
  });
  if (!java.ok) {
    logger(
      `Android setup needs a Java runtime and Doc Detective couldn't provision one automatically: ${java.reason}. Install a JRE 17+ (e.g. Temurin) and rerun.`,
      "error"
    );
    return [{ kind: "android", assetId: "java", action: "missing" }];
  }

  // --- Real execution (yes && !dryRun). Effects are injected for tests. ---
  // Imperative and bootstrap-aware: cmdline-tools may not exist yet, and the
  // system image can't be chosen until sdkmanager can query what's available —
  // so the flow is bootstrap → licenses → platform-tools/emulator → resolve &
  // install image → create AVD, working the same for a from-nothing bootstrap
  // and an augment of an existing SDK.
  const run = deps.run ?? realRun;
  const bootstrap = deps.bootstrap ?? realBootstrap;
  const reports: InstallReport[] = [];
  const sdkRoot = plan.sdkRoot;
  const sdkArg = "--sdk_root=" + sdkRoot;

  // 1. Bootstrap the command-line tools when no SDK exists (the "portable
  //    Android" download: fetch + unzip + relocate into the cache).
  if (plan.bootstrapped) {
    logger(
      `Downloading Android command-line tools into ${sdkRoot} (one-time)…`,
      "info"
    );
    try {
      await bootstrap(cmdlineToolsUrl(platform), sdkRoot);
    } catch (error: any) {
      logger(
        `Failed to bootstrap the Android command-line tools: ${error?.message ?? error}`,
        "error"
      );
      return [{ kind: "android", assetId: "cmdline-tools", action: "failed" }];
    }
    reports.push({ kind: "android", assetId: "cmdline-tools", action: "installed" });
  }

  const sdkmanager = toolPath(sdkRoot, "sdkmanager", platform);
  const avdmanager = toolPath(sdkRoot, "avdmanager", platform);

  // 2. Accept licenses (sdkmanager exists now, from the bootstrap or the SDK).
  await run(sdkmanager, [sdkArg, "--licenses"], { input: "y\n".repeat(50) });
  reports.push({ kind: "android", assetId: "licenses", action: "accepted" });

  // 3. Ensure platform-tools (adb) + emulator are present. sdkmanager is a
  //    no-op when they already are, so this is safe on an augment too.
  for (const pkg of ["platform-tools", "emulator"]) {
    const alreadyHave =
      (pkg === "platform-tools" && detected?.adb) ||
      (pkg === "emulator" && detected?.emulator);
    if (alreadyHave) continue;
    await run(sdkmanager, [sdkArg, pkg]);
    reports.push({ kind: "android", assetId: pkg, action: "installed" });
  }

  // 4. Resolve the system image: an installed match first, else query what's
  //    available (`sdkmanager --list`) and install it.
  let systemImage = pickSystemImage(listInstalledSystemImages(sdkRoot, fsDeps), {
    osVersion,
    abi,
  });
  if (!systemImage) {
    let listOut = "";
    try {
      listOut = await run(sdkmanager, [sdkArg, "--list"]);
    } catch {
      // Leave empty; blocked below with guidance.
    }
    const available = parseSdkmanagerList(listOut).filter((p) =>
      p.startsWith("system-images;")
    );
    systemImage = pickSystemImage(available, { osVersion, abi });
    if (!systemImage) {
      logger(
        `No ${osVersion ? `Android ${osVersion} ` : ""}${abi} google_apis system image is available to install. Rerun with --os-version set to an available level.`,
        "error"
      );
      return [...reports, { kind: "android", assetId: "system-image", action: "blocked" }];
    }
    await run(sdkmanager, [sdkArg, systemImage]);
    reports.push({ kind: "android", assetId: systemImage, action: "installed" });
  }

  // 5. Create the default AVD from the resolved image.
  const avdName = DEFAULT_AVD_NAME;
  const device =
    DEVICE_TYPE_PROFILES[deviceType ?? "phone"] ?? DEVICE_TYPE_PROFILES.phone;
  if (force) {
    try {
      await run(avdmanager, ["delete", "avd", "-n", avdName]);
    } catch {
      // no such avd — fine
    }
  }
  await run(
    avdmanager,
    ["create", "avd", "-n", avdName, "-k", systemImage, "--device", device, "--force"],
    { input: "no\n" }
  );
  reports.push({ kind: "android", assetId: `avd:${avdName}`, action: "created" });

  recordAndroidInstall(ctx, {
    sdkRoot,
    bootstrapped: plan.bootstrapped,
    systemImage,
    avdName: { name: avdName },
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

// The only characters an Android SDK command/arg legitimately needs: letters,
// digits, space, and path/arg punctuation (`. _ : ; = \ / @ + ~ ( ) -`). Every
// cmd.exe metacharacter (`& | < > ^ " ' $ % !` and backtick) is excluded, so a
// validated token cannot break out of the command line.
const SAFE_SHELL_TOKEN = /^[A-Za-z0-9 ._:;=\\/@+~()-]*$/;

// Build a single cmd.exe command line from a command + args. sdkmanager and
// avdmanager are `.bat` shims Node 20.12+/22 refuses to `spawn` without
// shell:true (CVE-2024-27980); this feeds the shell:true no-args form (which
// also avoids the DEP0190 array-arg warning). Every token is validated against
// SAFE_SHELL_TOKEN first and rejected otherwise — a hard barrier against command
// injection through a config-derived path or arg (not just a quoting
// convention): with no metacharacter surviving, the assembled line cannot break
// out into a second command. Only whitespace tokens are quoted, so the
// `;`-laden system-image id (a cmd.exe non-metacharacter) is passed verbatim.
// Exported for testing.
//
// NOTE: CodeQL flags the downstream shell:true spawn as js/command-line-injection
// — a known false positive for this managed-tool exec (Doc Detective runs its
// OWN sdkmanager/avdmanager from its own cache dir; the "user input" is a
// DD-controlled path), the same class already dismissed for verifyDriverBinary.
// The SAFE_SHELL_TOKEN barrier above is the real mitigation. This Windows-only
// path is never exercised by CI (the emulator legs are Linux/KVM).
export function winShellCommand(command: string, args: string[]): string {
  const tokens = [command, ...args];
  for (const token of tokens) {
    if (!SAFE_SHELL_TOKEN.test(token)) {
      throw new Error(
        `Refusing to run an Android SDK command with an unsafe token: ${JSON.stringify(token)}`
      );
    }
  }
  // Only whitespace needs quoting now; no metacharacter (incl. `"`) survives.
  return tokens.map((s) => (/\s/.test(s) ? `"${s}"` : s)).join(" ");
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

// The single AVD directory Doc Detective pins for BOTH avdmanager (create) and
// the emulator (list/boot), via ANDROID_AVD_HOME. Without pinning, a host's
// ANDROID_USER_HOME / ANDROID_SDK_HOME can send avdmanager and the emulator to
// different dirs, so the emulator reports "Unknown AVD name" for an AVD we just
// created (seen on GitHub's hosted Linux runners). Creates the dir so avdmanager
// can write its `.ini` immediately. Shared by the installer and the runtime
// device layer so `install android` and test-time boot agree on one location.
export function androidAvdHome(): string {
  const home = path.join(os.homedir(), ".android", "avd");
  try {
    fs.mkdirSync(home, { recursive: true });
  } catch {
    /* best-effort; avdmanager surfaces a real failure if it can't write */
  }
  return home;
}

async function realRun(
  command: string,
  args: string[],
  opts: { input?: string; cwd?: string } = {}
): Promise<string> {
  // sdkmanager/avdmanager are `.bat` shims on Windows, and Node 20.12+/22 refuse
  // to spawn `.bat`/`.cmd` without `shell: true` (CVE-2024-27980). Run those
  // through the shell as a single pre-quoted command string (winShellCommand
  // validates every token first), so paths with spaces survive cmd.exe's parse.
  // Pin ANDROID_AVD_HOME so the AVD avdmanager creates lands where the emulator
  // later looks for it.
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ANDROID_AVD_HOME: androidAvdHome(),
  };
  const useShell = process.platform === "win32" && /\.(bat|cmd)$/i.test(command);
  const child = useShell
    ? spawn(winShellCommand(command, args), {
        cwd: opts.cwd,
        stdio: ["pipe", "pipe", "pipe"],
        shell: true,
        env,
      })
    : spawn(command, args, {
        cwd: opts.cwd,
        stdio: ["pipe", "pipe", "pipe"],
        env,
      });
  return await new Promise((resolve, reject) => {
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

// Bootstrap the Android command-line tools from nothing: download the platform
// zip, extract it, and relocate its inner `cmdline-tools/` to
// `<destSdkRoot>/cmdline-tools/latest/` (the layout sdkmanager requires). This
// is the "portable Android" install — a self-contained SDK root under the Doc
// Detective cache, no system Android Studio needed. (A JRE 17+ is still a host
// prerequisite for sdkmanager/avdmanager; checked before this runs.)
// Look for a previously downloaded Doc-Detective JRE under <cache>/jre and
// return its JAVA_HOME if the `java` binary is present.
function realDetectCachedJavaHome(cacheJreRoot: string): string | null {
  if (!fs.existsSync(cacheJreRoot)) return null;
  const entries = fs.readdirSync(cacheJreRoot);
  const home = resolveJavaHome(cacheJreRoot, entries, process.platform);
  return home && fs.existsSync(javaBinPath(home)) ? home : null;
}

// Download + extract a portable Temurin JRE into <cache>/jre and return its
// JAVA_HOME. Reuses the redirect-following downloader and the cross-platform
// extractor (its `tar -xf` handles the POSIX `.tar.gz`).
async function realBootstrapJava(cacheJreRoot: string): Promise<string> {
  const url = jreDownloadUrl();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-jre-"));
  try {
    const archive = path.join(tmpDir, jreArchiveFilename());
    await downloadFile(url, archive);
    fs.rmSync(cacheJreRoot, { recursive: true, force: true });
    fs.mkdirSync(cacheJreRoot, { recursive: true });
    await extractZip(archive, cacheJreRoot);
    const home = realDetectCachedJavaHome(cacheJreRoot);
    if (!home) {
      throw new Error("extracted JRE has no runnable java binary");
    }
    return home;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function realBootstrap(url: string, destSdkRoot: string): Promise<void> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-android-cli-"));
  try {
    const zipPath = path.join(tmpDir, "cmdline-tools.zip");
    await downloadFile(url, zipPath);
    const extractDir = path.join(tmpDir, "extracted");
    fs.mkdirSync(extractDir, { recursive: true });
    await extractZip(zipPath, extractDir);
    // The archive holds a top-level `cmdline-tools/` directory.
    const inner = path.join(extractDir, "cmdline-tools");
    if (!fs.existsSync(inner)) {
      throw new Error(
        "unexpected command-line tools archive layout (no top-level cmdline-tools/)"
      );
    }
    const dest = path.join(destSdkRoot, "cmdline-tools", "latest");
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.rmSync(dest, { recursive: true, force: true });
    try {
      fs.renameSync(inner, dest);
    } catch {
      // rename fails across filesystems (tmp -> cache); fall back to a copy.
      fs.cpSync(inner, dest, { recursive: true });
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// Download a URL to a file, following redirects (dl.google.com redirects to a
// CDN). Fails on any non-2xx final status.
async function downloadFile(
  url: string,
  dest: string,
  redirects = 0
): Promise<void> {
  if (redirects > 10) throw new Error(`too many redirects fetching ${url}`);
  await new Promise<void>((resolve, reject) => {
    const req = https.get(url, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        downloadFile(res.headers.location, dest, redirects + 1).then(
          resolve,
          reject
        );
        return;
      }
      if (status !== 200) {
        res.resume();
        reject(new Error(`download failed (HTTP ${status}) for ${url}`));
        return;
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on("finish", () => file.close(() => resolve()));
      file.on("error", reject);
    });
    // Fail a stalled connection rather than hanging installAndroid forever: 60s
    // to first response, and an idle-socket timeout once streaming.
    req.setTimeout(60000, () => req.destroy(new Error(`download timed out: ${url}`)));
    req.on("error", reject);
  });
}

// Extract a .zip cross-platform, trying the extractors likely to be present:
// unzip / bsdtar on POSIX, bsdtar / PowerShell Expand-Archive on Windows.
async function extractZip(zipPath: string, destDir: string): Promise<void> {
  const attempts: [string, string[]][] =
    process.platform === "win32"
      ? [
          ["tar", ["-xf", zipPath, "-C", destDir]],
          [
            "powershell",
            [
              "-NoProfile",
              "-NonInteractive",
              "-Command",
              `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${destDir}' -Force`,
            ],
          ],
        ]
      : [
          ["unzip", ["-q", "-o", zipPath, "-d", destDir]],
          ["tar", ["-xf", zipPath, "-C", destDir]],
        ];
  let lastError: any;
  for (const [cmd, args] of attempts) {
    try {
      await realRun(cmd, args);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    `couldn't extract ${zipPath}: no working zip extractor found (${lastError?.message ?? lastError})`
  );
}
/* c8 ignore stop */
