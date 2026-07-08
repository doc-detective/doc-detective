import axios from "axios";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import {
  spawn as nodeSpawn,
  type ChildProcess,
  type SpawnOptions,
} from "node:child_process";
import type { Logger, SpawnFn } from "./loader.js";
import {
  BEST_EFFORT_NPM_DEPS,
  HEAVY_NPM_DEPS,
  getDeclaredVersion,
  getShimVersion,
  satisfiesRange,
  withPeerCompanions,
} from "./heavyDeps.js";
import {
  getBrowsersDir,
  getCacheDir,
  getRuntimeDir,
  readInstalledRecord,
  writeInstalledRecord,
  type CacheDirContext,
  type InstalledRecord,
} from "./cacheDir.js";
import { verifyDriverBinary, type DriverExec } from "./browsers.js";

// ---------------------------------------------------------------------------
// Types (FROZEN CONTRACT)
// ---------------------------------------------------------------------------

export type PrewarmKind = "runtime" | "browsers";
export type PrewarmResult = "restored" | "skipped" | "lost-race";

export interface DetectedPlatform {
  os: NodeJS.Platform | string;
  arch: string;
  libc: "glibc" | "musl" | null;
  osVersion: string;
  /** Composite match key, or null when the platform can't be prewarmed. */
  key: string | null;
}

export interface PrewarmManifest {
  schemaVersion: 1;
  ddVersion: string;
  kind: PrewarmKind;
  platform: {
    os: string;
    arch: string;
    libc: "glibc" | "musl" | null;
    osVersion: string;
  };
  node: { builtWith: string };
  createdAt: string;
  archive: {
    filename: string;
    sha256: string;
    bytes: number;
    format: "tar.gz";
    rootDir: string;
  };
  /** runtime kind only: exact npm pins. */
  npmPackages?: Record<string, string>;
  /** browsers kind only: per-browser installed version. */
  browsers?: Record<string, { installedVersion: string }>;
}

// ---------------------------------------------------------------------------
// Platform detection (injectable seams for unit tests)
// ---------------------------------------------------------------------------

export interface DetectPlatformDeps {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform | string;
  arch?: string;
  osRelease?: () => string;
  /**
   * `process.report.getReport()` shape, injected for tests. Only the
   * `header.glibcVersionRuntime` field is read. When omitted the real
   * `process.report` is used (Linux only path).
   */
  getReport?: () => any;
}

/**
 * Detect the running platform and compute its prewarm match key per the frozen
 * contract:
 *   - linux: glibc detected via process.report header ⇒ libc "glibc",
 *     osVersion = glibc major.minor (e.g. "2.39"),
 *     key = `linux-<arch>-glibc-<osVersion>`. musl / no glibc ⇒ key null
 *     (unsupported — the caller falls back to lazy install).
 *   - darwin: libc null, osVersion = os.release() major (e.g. "24"),
 *     key = `darwin-<arch>-<osVersion>`.
 *   - win32: libc null, osVersion = os.release() major (e.g. "10"),
 *     key = `win32-<arch>-<osVersion>`.
 */
export function detectPlatform(deps: DetectPlatformDeps = {}): DetectedPlatform {
  const platform = deps.platform ?? process.platform;
  const arch = deps.arch ?? process.arch;
  const osRelease = deps.osRelease ?? (() => os.release());

  if (platform === "linux") {
    let glibcRuntime: string | undefined;
    try {
      const report = deps.getReport
        ? deps.getReport()
        : (process as any).report?.getReport?.();
      const val = report?.header?.glibcVersionRuntime;
      if (typeof val === "string" && val.length > 0) glibcRuntime = val;
    } catch {
      glibcRuntime = undefined;
    }
    if (!glibcRuntime) {
      // musl / absent ⇒ unsupported, fall back.
      return { os: platform, arch, libc: null, osVersion: "", key: null };
    }
    // glibc's own version identifier is its major.minor (e.g. "2.39").
    const m = /^(\d+)\.(\d+)/.exec(glibcRuntime);
    const osVersion = m ? `${m[1]}.${m[2]}` : glibcRuntime;
    return {
      os: platform,
      arch,
      libc: "glibc",
      osVersion,
      key: `linux-${arch}-glibc-${osVersion}`,
    };
  }

  if (platform === "darwin") {
    const osVersion = String(osRelease()).split(".")[0] ?? "";
    return {
      os: platform,
      arch,
      libc: null,
      osVersion,
      key: osVersion ? `darwin-${arch}-${osVersion}` : null,
    };
  }

  if (platform === "win32") {
    const osVersion = String(osRelease()).split(".")[0] ?? "";
    return {
      os: platform,
      arch,
      libc: null,
      osVersion,
      key: osVersion ? `win32-${arch}-${osVersion}` : null,
    };
  }

  // Any other platform is unsupported for prewarm.
  return { os: platform, arch, libc: null, osVersion: "", key: null };
}

/** Convenience: just the match key (null ⇒ callers skip prewarm). */
export function getPlatformKey(deps: DetectPlatformDeps = {}): string | null {
  return detectPlatform(deps).key;
}

// ---------------------------------------------------------------------------
// Asset naming / URLs (FROZEN CONTRACT)
// ---------------------------------------------------------------------------

export interface AssetFilenames {
  archive: string;
  manifest: string;
}

export function assetFilenames(kind: PrewarmKind, key: string): AssetFilenames {
  return {
    archive: `prewarm-${kind}-${key}.tar.gz`,
    manifest: `prewarm-${kind}-${key}.manifest.json`,
  };
}

/**
 * Base URL for a release's prewarm assets. Defaults to the GitHub release
 * download path for `v<version>`, overridable by DOC_DETECTIVE_PREBUILT_BASE_URL
 * (trailing slash tolerant). Always returns a value ending in "/".
 */
export function assetBaseUrl(
  version: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  const override = typeof env.DOC_DETECTIVE_PREBUILT_BASE_URL === "string"
    ? env.DOC_DETECTIVE_PREBUILT_BASE_URL.trim()
    : "";
  const base = override.length > 0
    ? override
    : `https://github.com/doc-detective/doc-detective/releases/download/v${version}/`;
  return base.endsWith("/") ? base : `${base}/`;
}

export interface AssetUrls {
  archive: string;
  manifest: string;
}

export function assetUrl(
  version: string,
  kind: PrewarmKind,
  key: string,
  env: NodeJS.ProcessEnv = process.env
): AssetUrls {
  const base = assetBaseUrl(version, env);
  const files = assetFilenames(kind, key);
  return {
    archive: `${base}${files.archive}`,
    manifest: `${base}${files.manifest}`,
  };
}

// ---------------------------------------------------------------------------
// Opt-out parser (mirrors isRuntimeInstallOptedOut)
// ---------------------------------------------------------------------------

/**
 * True when the user has opted out of prewarm restore via
 * DOC_DETECTIVE_PREBUILT (0/false/no/off, case-insensitive). Default (unset or
 * any other value) ⇒ prewarm enabled.
 */
export function isPrebuiltOptedOut(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = String(env.DOC_DETECTIVE_PREBUILT ?? "").trim().toLowerCase();
  return v === "0" || v === "false" || v === "no" || v === "off";
}

// ---------------------------------------------------------------------------
// Manifest parsing + strict match evaluation
// ---------------------------------------------------------------------------

/**
 * Parse a manifest JSON string/object into a validated PrewarmManifest, or
 * return null if it is not a well-formed schemaVersion-1 manifest. Never
 * throws — a malformed manifest is a silent fallback, not a crash.
 */
export function parsePrewarmManifest(json: unknown): PrewarmManifest | null {
  let obj: any = json;
  if (typeof json === "string") {
    try {
      obj = JSON.parse(json);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== "object") return null;
  if (obj.schemaVersion !== 1) return null;
  if (typeof obj.ddVersion !== "string" || obj.ddVersion.length === 0) return null;
  if (obj.kind !== "runtime" && obj.kind !== "browsers") return null;
  const platform = obj.platform;
  if (!platform || typeof platform !== "object") return null;
  if (typeof platform.os !== "string") return null;
  if (typeof platform.arch !== "string") return null;
  if (!(platform.libc === null || typeof platform.libc === "string")) return null;
  if (typeof platform.osVersion !== "string") return null;
  const archive = obj.archive;
  if (!archive || typeof archive !== "object") return null;
  if (typeof archive.filename !== "string" || archive.filename.length === 0) return null;
  if (typeof archive.sha256 !== "string" || archive.sha256.length === 0) return null;
  if (typeof archive.bytes !== "number") return null;
  if (archive.format !== "tar.gz") return null;
  if (typeof archive.rootDir !== "string" || archive.rootDir.length === 0) return null;
  // node.builtWith is informational; tolerate a missing node block.
  const node =
    obj.node && typeof obj.node === "object" && typeof obj.node.builtWith === "string"
      ? { builtWith: obj.node.builtWith }
      : { builtWith: "" };
  const createdAt = typeof obj.createdAt === "string" ? obj.createdAt : "";

  const manifest: PrewarmManifest = {
    schemaVersion: 1,
    ddVersion: obj.ddVersion,
    kind: obj.kind,
    platform: {
      os: platform.os,
      arch: platform.arch,
      libc: platform.libc,
      osVersion: platform.osVersion,
    },
    node,
    createdAt,
    archive: {
      filename: archive.filename,
      sha256: archive.sha256,
      bytes: archive.bytes,
      format: "tar.gz",
      rootDir: archive.rootDir,
    },
  };

  if (obj.kind === "runtime") {
    if (obj.npmPackages && typeof obj.npmPackages === "object") {
      const pins: Record<string, string> = {};
      for (const [name, ver] of Object.entries(obj.npmPackages)) {
        if (typeof ver === "string") pins[name] = ver;
      }
      manifest.npmPackages = pins;
    } else {
      manifest.npmPackages = {};
    }
  } else {
    if (obj.browsers && typeof obj.browsers === "object") {
      const browsers: Record<string, { installedVersion: string }> = {};
      for (const [name, entry] of Object.entries(obj.browsers)) {
        const iv = (entry as any)?.installedVersion;
        if (typeof iv === "string") browsers[name] = { installedVersion: iv };
      }
      manifest.browsers = browsers;
    } else {
      manifest.browsers = {};
    }
  }

  return manifest;
}

export interface ManifestMatchContext {
  ddVersion: string;
  platform: { os: string; arch: string; libc: "glibc" | "musl" | null; osVersion: string };
  kind: PrewarmKind;
  /** Reads the shim's declared range for a heavy dep. Defaults to getDeclaredVersion. */
  declaredVersionFor?: (name: string) => string;
}

export interface ManifestMatchResult {
  ok: boolean;
  /** Human-readable reason a mismatch was rejected (debug logging). */
  reason?: string;
}

/**
 * Strict match checklist items 6–8 evaluated purely against a parsed manifest:
 *   6. ddVersion exact string equality.
 *   7. platform {os,arch,libc,osVersion} all exactly equal.
 *   8. runtime kind: every npmPackages pin satisfiesRange the shim's declared
 *      range, AND every non-best-effort HEAVY_NPM_DEPS member (expanded via
 *      withPeerCompanions) is present in the manifest.
 * The kind must match too.
 */
export function evaluateManifestMatch(
  manifest: PrewarmManifest,
  ctx: ManifestMatchContext
): ManifestMatchResult {
  const declaredVersionFor = ctx.declaredVersionFor ?? getDeclaredVersion;

  if (manifest.kind !== ctx.kind) {
    return { ok: false, reason: `kind mismatch: manifest ${manifest.kind} !== ${ctx.kind}` };
  }
  if (manifest.ddVersion !== ctx.ddVersion) {
    return {
      ok: false,
      reason: `ddVersion mismatch: manifest ${manifest.ddVersion} !== ${ctx.ddVersion}`,
    };
  }
  const p = manifest.platform;
  const w = ctx.platform;
  if (p.os !== w.os || p.arch !== w.arch || p.libc !== w.libc || p.osVersion !== w.osVersion) {
    return {
      ok: false,
      reason: `platform mismatch: manifest ${JSON.stringify(p)} !== ${JSON.stringify(w)}`,
    };
  }

  if (ctx.kind === "runtime") {
    const pins = manifest.npmPackages ?? {};
    // Every pin must satisfy the shim's declared range.
    for (const [name, pin] of Object.entries(pins)) {
      let declared: string;
      try {
        declared = declaredVersionFor(name);
      } catch {
        // A pin for a package the shim no longer declares: treat as a mismatch
        // rather than trusting an orphaned pin.
        return { ok: false, reason: `pin for undeclared package ${name}` };
      }
      if (!satisfiesRange(pin, declared)) {
        return {
          ok: false,
          reason: `pin ${name}@${pin} outside declared range ${declared}`,
        };
      }
    }
    // Every required (non-best-effort) heavy dep, expanded with peer companions,
    // must be present in the manifest.
    const required = withPeerCompanions(
      HEAVY_NPM_DEPS.filter((n) => !BEST_EFFORT_NPM_DEPS.has(n))
    );
    for (const name of required) {
      if (!(name in pins)) {
        return { ok: false, reason: `manifest missing required heavy dep ${name}` };
      }
    }
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Sentinel (<cacheDir>/prewarm-attempts.json)
// ---------------------------------------------------------------------------

export type PrewarmAttemptOutcome =
  | "verify-failed"
  | "sha-mismatch"
  | "not-found"
  | "extract-failed"
  | "download-failed";

export interface PrewarmAttempt {
  outcome: PrewarmAttemptOutcome;
  at: string;
}

export interface PrewarmAttempts {
  // keyed by `${kind}:${ddVersion}`
  attempts: Record<string, PrewarmAttempt>;
}

function attemptsPath(ctx: CacheDirContext): string {
  return path.join(getCacheDir(ctx), "prewarm-attempts.json");
}

function attemptKey(kind: PrewarmKind, ddVersion: string): string {
  return `${kind}:${ddVersion}`;
}

/** Read the sentinel file; never throws (missing/corrupt ⇒ empty). */
export function readPrewarmAttempts(ctx: CacheDirContext = {}): PrewarmAttempts {
  let raw: string;
  try {
    raw = fs.readFileSync(attemptsPath(ctx), "utf8");
  } catch {
    return { attempts: {} };
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.attempts && typeof parsed.attempts === "object") {
      return { attempts: parsed.attempts };
    }
  } catch {
    // fall through
  }
  return { attempts: {} };
}

/**
 * Record a definitive prewarm failure so a later run for the same
 * (kind, ddVersion) short-circuits instead of re-downloading. Best-effort:
 * a write failure never breaks the caller.
 */
export function recordPrewarmAttempt(
  ctx: CacheDirContext,
  kind: PrewarmKind,
  ddVersion: string,
  outcome: PrewarmAttemptOutcome
): void {
  try {
    const current = readPrewarmAttempts(ctx);
    current.attempts[attemptKey(kind, ddVersion)] = {
      outcome,
      at: new Date().toISOString(),
    };
    const filePath = attemptsPath(ctx);
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = path.join(dir, `prewarm-attempts.json.${process.pid}.${Date.now()}.tmp`);
    fs.writeFileSync(tmp, JSON.stringify(current, null, 2), "utf8");
    try {
      fs.renameSync(tmp, filePath);
    } catch (err: any) {
      if (err && (err.code === "EEXIST" || err.code === "EPERM")) {
        try {
          fs.unlinkSync(filePath);
        } catch {
          // best-effort
        }
        fs.renameSync(tmp, filePath);
      } else {
        try {
          fs.unlinkSync(tmp);
        } catch {
          // best-effort
        }
      }
    }
  } catch {
    // Best-effort: never let sentinel bookkeeping break the caller.
  }
}

function hasPriorFailure(
  ctx: CacheDirContext,
  kind: PrewarmKind,
  ddVersion: string
): boolean {
  const attempts = readPrewarmAttempts(ctx);
  return Boolean(attempts.attempts[attemptKey(kind, ddVersion)]);
}

// ---------------------------------------------------------------------------
// Restore engine deps + defaults
// ---------------------------------------------------------------------------

export interface PrewarmHttp {
  /** Fetch a small text resource (the manifest). Bounded by `timeout` ms. */
  getText: (url: string, opts: { timeoutMs: number }) => Promise<{ status: number; data: string }>;
  /**
   * Stream a URL to `destPath`, returning the sha256 hex digest and byte count.
   * `onActivity` is called on every chunk so the caller's watchdog can reset.
   */
  download: (
    url: string,
    destPath: string,
    opts: { onActivity: () => void; signal: AbortSignal }
  ) => Promise<{ status: number; sha256: string; bytes: number }>;
}

export interface PrewarmDeps {
  http?: PrewarmHttp;
  spawn?: SpawnFn;
  logger?: Logger;
  now?: () => Date;
  /** Injected driver executor forwarded to verifyDriverBinary (tests stub it). */
  verifyExec?: DriverExec;
  /**
   * Override platform detection (tests). When omitted, real detectPlatform().
   */
  detectPlatformFn?: () => DetectedPlatform;
  /** Override the shim version (tests). When omitted, real getShimVersion(). */
  shimVersion?: string | null;
}

export interface EnsurePrewarmOptions {
  ctx?: CacheDirContext;
  deps?: PrewarmDeps;
  env?: NodeJS.ProcessEnv;
}

const RUNTIME_DEBUG = process.env.DOC_DETECTIVE_RUNTIME_DEBUG === "1";
const defaultLogger: Logger = (msg, level = "info") => {
  if (level === "debug" && !RUNTIME_DEBUG) return;
  if (level === "error") console.error(msg);
  else console.log(msg);
};

const MANIFEST_TIMEOUT_MS = 10_000;
const DOWNLOAD_INACTIVITY_MS = 60_000;
const DOWNLOAD_TOTAL_CAP_MS = 10 * 60 * 1000;
const STALE_STAGING_MS = 24 * 60 * 60 * 1000;

const defaultHttp: PrewarmHttp = {
  getText: async (url, opts) => {
    const res = await axios.get(url, {
      timeout: opts.timeoutMs,
      responseType: "text",
      transformResponse: [(d) => d],
      maxRedirects: 5,
      // 404 must not throw — we inspect status and fall back.
      validateStatus: () => true,
    });
    return { status: res.status, data: typeof res.data === "string" ? res.data : String(res.data ?? "") };
  },
  download: async (url, destPath, opts) => {
    const res = await axios.get(url, {
      responseType: "stream",
      maxRedirects: 5,
      signal: opts.signal,
      validateStatus: () => true,
    });
    if (res.status < 200 || res.status >= 300) {
      // Drain/destroy the stream so the socket is released.
      try {
        (res.data as any)?.destroy?.();
      } catch {
        // ignore
      }
      return { status: res.status, sha256: "", bytes: 0 };
    }
    const hash = crypto.createHash("sha256");
    let bytes = 0;
    const out = fs.createWriteStream(destPath);
    await new Promise<void>((resolve, reject) => {
      const stream = res.data as NodeJS.ReadableStream;
      stream.on("data", (chunk: Buffer) => {
        opts.onActivity();
        hash.update(chunk);
        bytes += chunk.length;
      });
      stream.on("error", reject);
      out.on("error", reject);
      out.on("finish", () => resolve());
      stream.pipe(out);
    });
    return { status: res.status, sha256: hash.digest("hex"), bytes };
  },
};

// Module-level in-flight dedupe, keyed by `${kind}:${cacheRoot}`.
const inFlightRestores = new Map<string, Promise<PrewarmResult>>();

/**
 * Restore a prewarmed tarball for `kind` into the cache, or return "skipped"
 * on any mismatch/failure (never throws). "lost-race" means another process
 * populated the target concurrently — the caller's re-check resolves it.
 */
export async function ensurePrewarmRestored(
  kind: PrewarmKind,
  options: EnsurePrewarmOptions = {}
): Promise<PrewarmResult> {
  const ctx = options.ctx ?? {};
  const cacheRoot = getCacheDir(ctx);
  const dedupeKey = `${kind}:${cacheRoot}`;
  const inFlight = inFlightRestores.get(dedupeKey);
  if (inFlight) return inFlight;
  const p = ensurePrewarmRestoredImpl(kind, options).finally(() => {
    inFlightRestores.delete(dedupeKey);
  });
  inFlightRestores.set(dedupeKey, p);
  return p;
}

async function ensurePrewarmRestoredImpl(
  kind: PrewarmKind,
  options: EnsurePrewarmOptions
): Promise<PrewarmResult> {
  const ctx = options.ctx ?? {};
  const deps = options.deps ?? {};
  const env = options.env ?? process.env;
  const logger = deps.logger ?? defaultLogger;
  const http = deps.http ?? defaultHttp;
  const cacheRoot = getCacheDir(ctx);
  const skip = (reason: string): PrewarmResult => {
    logger(`prewarm(${kind}) skipped: ${reason}`, "debug");
    return "skipped";
  };

  try {
    // Item 1: opt-out.
    if (isPrebuiltOptedOut(env)) return skip("DOC_DETECTIVE_PREBUILT opt-out");

    // Item 2: platform key constructible.
    const platform = deps.detectPlatformFn ? deps.detectPlatformFn() : detectPlatform({ env });
    if (!platform.key) return skip("platform key not constructible (unsupported OS/libc)");

    // ddVersion from the shim.
    const ddVersion = deps.shimVersion !== undefined ? deps.shimVersion : getShimVersion();
    if (!ddVersion) return skip("shim version unavailable");

    // Item 3: no prior definitive failure recorded.
    if (hasPriorFailure(ctx, kind, ddVersion)) {
      return skip(`prior failed attempt recorded for ${kind}:${ddVersion}`);
    }

    // Item 4: target dir effectively empty.
    if (!isTargetEmpty(kind, ctx)) {
      return skip("target already populated");
    }

    // Opportunistic stale-staging sweep (best-effort).
    sweepStaleStaging(cacheRoot);

    const urls = assetUrl(ddVersion, kind, platform.key, env);

    // Item 5: manifest downloads, parses, schemaVersion 1, kind matches.
    let manifestRes: { status: number; data: string };
    try {
      manifestRes = await http.getText(urls.manifest, { timeoutMs: MANIFEST_TIMEOUT_MS });
    } catch (err) {
      return skip(`manifest fetch failed: ${String(err)}`);
    }
    if (manifestRes.status === 404) {
      recordPrewarmAttempt(ctx, kind, ddVersion, "not-found");
      return skip(`manifest 404 at ${urls.manifest}`);
    }
    if (manifestRes.status < 200 || manifestRes.status >= 300) {
      return skip(`manifest fetch status ${manifestRes.status}`);
    }
    const manifest = parsePrewarmManifest(manifestRes.data);
    if (!manifest) return skip("manifest failed schema/shape validation");

    // Items 6–8: strict match against the manifest.
    const match = evaluateManifestMatch(manifest, {
      ddVersion,
      platform: {
        os: platform.os,
        arch: platform.arch,
        libc: platform.libc,
        osVersion: platform.osVersion,
      },
      kind,
    });
    if (!match.ok) {
      // A mislabeled/mismatched asset for this exact (kind, ddVersion): record
      // so we don't re-fetch it.
      recordPrewarmAttempt(ctx, kind, ddVersion, "verify-failed");
      return skip(`manifest match failed: ${match.reason}`);
    }

    // Staging dir on the same volume as the cache root → true rename.
    const now = deps.now ? deps.now() : new Date();
    const stagingDir = path.join(
      cacheRoot,
      `.prewarm-${kind}-${process.pid}-${now.getTime()}`
    );
    let restored: PrewarmResult = "skipped";
    try {
      fs.mkdirSync(stagingDir, { recursive: true });
      restored = await downloadExtractCommit({
        kind,
        ctx,
        deps,
        env,
        manifest,
        ddVersion,
        urls,
        stagingDir,
        logger,
        http,
      });
    } finally {
      // Best-effort staging cleanup.
      try {
        fs.rmSync(stagingDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
    return restored;
  } catch (err) {
    // Any unexpected error ⇒ silent fallback.
    return skip(`unexpected error: ${String(err)}`);
  }
}

interface CommitArgs {
  kind: PrewarmKind;
  ctx: CacheDirContext;
  deps: PrewarmDeps;
  env: NodeJS.ProcessEnv;
  manifest: PrewarmManifest;
  ddVersion: string;
  urls: AssetUrls;
  stagingDir: string;
  logger: Logger;
  http: PrewarmHttp;
}

async function downloadExtractCommit(args: CommitArgs): Promise<PrewarmResult> {
  const { kind, ctx, deps, manifest, ddVersion, urls, stagingDir, logger, http } = args;
  const skip = (reason: string): PrewarmResult => {
    logger(`prewarm(${kind}) skipped: ${reason}`, "debug");
    return "skipped";
  };

  // --- Download (item 9: sha256 + byte count) ---
  const archivePath = path.join(stagingDir, manifest.archive.filename);
  const controller = new AbortController();
  let inactivityTimer: NodeJS.Timeout | null = null;
  let totalTimer: NodeJS.Timeout | null = null;
  const clearTimers = () => {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    if (totalTimer) clearTimeout(totalTimer);
    inactivityTimer = null;
    totalTimer = null;
  };
  const resetInactivity = () => {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => controller.abort(), DOWNLOAD_INACTIVITY_MS);
    if (typeof inactivityTimer.unref === "function") inactivityTimer.unref();
  };

  let dl: { status: number; sha256: string; bytes: number };
  try {
    resetInactivity();
    totalTimer = setTimeout(() => controller.abort(), DOWNLOAD_TOTAL_CAP_MS);
    if (typeof totalTimer.unref === "function") totalTimer.unref();
    dl = await http.download(urls.archive, archivePath, {
      onActivity: resetInactivity,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimers();
    return skip(`archive download failed: ${String(err)}`);
  } finally {
    clearTimers();
  }

  if (dl.status === 404) {
    recordPrewarmAttempt(ctx, kind, ddVersion, "not-found");
    return skip(`archive 404 at ${urls.archive}`);
  }
  if (dl.status < 200 || dl.status >= 300) {
    return skip(`archive download status ${dl.status}`);
  }
  if (dl.sha256 !== manifest.archive.sha256) {
    recordPrewarmAttempt(ctx, kind, ddVersion, "sha-mismatch");
    return skip(
      `archive sha256 mismatch: got ${dl.sha256}, manifest ${manifest.archive.sha256}`
    );
  }
  if (dl.bytes !== manifest.archive.bytes) {
    recordPrewarmAttempt(ctx, kind, ddVersion, "sha-mismatch");
    return skip(`archive byte count mismatch: got ${dl.bytes}, manifest ${manifest.archive.bytes}`);
  }

  // --- Extract (system tar; ENOENT ⇒ fallback) ---
  const extractDir = path.join(stagingDir, "extract");
  try {
    fs.mkdirSync(extractDir, { recursive: true });
  } catch {
    return skip("could not create extract dir");
  }
  const extracted = await runTar(deps.spawn, archivePath, extractDir);
  if (!extracted.ok) {
    if (extracted.enoent) {
      // tar missing: correct degradation, not a definitive asset failure.
      return skip("system tar not available (ENOENT)");
    }
    recordPrewarmAttempt(ctx, kind, ddVersion, "extract-failed");
    return skip(`tar extraction failed: ${extracted.error}`);
  }

  // The tarball has exactly one top-level dir named manifest.archive.rootDir.
  const stagedRoot = path.join(extractDir, manifest.archive.rootDir);
  if (!existsDir(stagedRoot)) {
    recordPrewarmAttempt(ctx, kind, ddVersion, "extract-failed");
    return skip(`staged root '${manifest.archive.rootDir}' missing after extract`);
  }

  // --- Post-extract verification against the STAGED tree (item 10) ---
  const verifyRes = await verifyStagedTree({
    kind,
    manifest,
    stagedRoot,
    deps,
    logger,
  });
  if (!verifyRes.ok) {
    recordPrewarmAttempt(ctx, kind, ddVersion, "verify-failed");
    return skip(`staged-tree verification failed: ${verifyRes.reason}`);
  }

  // --- Re-check target absent (item 4 again — TOCTOU) ---
  if (!isTargetEmpty(kind, ctx)) {
    return skip("target populated during restore");
  }

  // --- Atomic commit (item 11): rename staged root → cache ---
  const targetDir = kind === "runtime" ? getRuntimeDir(ctx) : getBrowsersDir(ctx);
  // Ensure parent exists (getCacheDir already mkdir'd the cache root).
  try {
    fs.mkdirSync(path.dirname(targetDir), { recursive: true });
  } catch {
    // ignore
  }
  try {
    fs.renameSync(stagedRoot, targetDir);
  } catch (err: any) {
    if (err && (err.code === "EEXIST" || err.code === "EPERM" || err.code === "ENOTEMPTY")) {
      // Another process won the race.
      return "lost-race";
    }
    // Cross-device or other rename failure: silent fallback.
    return skip(`rename into place failed: ${String(err)}`);
  }

  // --- Merge installed.json from the manifest ---
  try {
    mergeInstalledRecord(kind, manifest, ctx);
  } catch (err) {
    // The tree is in place and verified; a record-merge failure is non-fatal.
    logger(`prewarm(${kind}) installed.json merge failed: ${String(err)}`, "debug");
  }

  logger(`prewarm(${kind}) restored from ${manifest.archive.filename}`, "info");
  return "restored";
}

// ---------------------------------------------------------------------------
// Target-empty check (item 4)
// ---------------------------------------------------------------------------

/**
 * A target is "effectively empty" when the restore may safely populate it:
 *   - runtime: <runtimeDir>/node_modules is absent. A bare
 *     <runtimeDir>/package.json (from ensureRuntimePackageJson) does NOT count.
 *   - browsers: <browsersDir> is absent or empty.
 * Never merges into a partially-populated tree.
 */
function isTargetEmpty(kind: PrewarmKind, ctx: CacheDirContext): boolean {
  if (kind === "runtime") {
    const runtimeDir = getRuntimeDir(ctx);
    return !existsAny(path.join(runtimeDir, "node_modules"));
  }
  const browsersDir = getBrowsersDir(ctx);
  if (!existsAny(browsersDir)) return true;
  try {
    const entries = fs.readdirSync(browsersDir);
    return entries.length === 0;
  } catch {
    // Unreadable ⇒ treat as non-empty (don't clobber).
    return false;
  }
}

function existsAny(p: string): boolean {
  try {
    fs.statSync(p);
    return true;
  } catch {
    return false;
  }
}

function existsDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// tar extraction
// ---------------------------------------------------------------------------

interface TarResult {
  ok: boolean;
  enoent?: boolean;
  error?: string;
}

// Pick the tar binary. On Windows, spawn the System32 bsdtar by its absolute
// path rather than a bare "tar": Git for Windows ships GNU tar
// (C:\Program Files\Git\usr\bin\tar.exe) which, when it appears first on PATH,
// parses the `C:` in an absolute `-f C:\...\archive.tar.gz` as an rsh-style
// `host:path` remote and dies with "Cannot connect to C: resolve failed".
// System32 bsdtar (present on Win10 1803+ and all GitHub windows runners) does
// no host:path parsing and handles drive-letter paths. Elsewhere, PATH `tar`.
function tarBinary(): string {
  if (process.platform === "win32") {
    return path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe");
  }
  return "tar";
}

function runTar(
  spawnFn: SpawnFn | undefined,
  archivePath: string,
  destDir: string
): Promise<TarResult> {
  const spawner = spawnFn ?? (nodeSpawn as SpawnFn);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (r: TarResult) => {
      if (settled) return;
      settled = true;
      resolve(r);
    };
    let child: ChildProcess;
    const opts: SpawnOptions = { stdio: ["ignore", "ignore", "pipe"] };
    try {
      child = spawner(tarBinary(), ["-xzf", archivePath, "-C", destDir], opts);
    } catch (err: any) {
      finish({ ok: false, enoent: err?.code === "ENOENT", error: String(err) });
      return;
    }
    let stderr = "";
    if (child.stderr) child.stderr.on("data", (c: Buffer | string) => (stderr += String(c)));
    child.on("error", (err: any) => {
      finish({ ok: false, enoent: err?.code === "ENOENT", error: String(err) });
    });
    child.on("close", (code: number | null) => {
      if (code === 0) finish({ ok: true });
      else finish({ ok: false, error: `tar exited ${code ?? "null"}: ${stderr.trim()}` });
    });
  });
}

// ---------------------------------------------------------------------------
// Post-extract verification (staged tree)
// ---------------------------------------------------------------------------

interface VerifyArgs {
  kind: PrewarmKind;
  manifest: PrewarmManifest;
  stagedRoot: string;
  deps: PrewarmDeps;
  logger: Logger;
}

interface VerifyResult {
  ok: boolean;
  reason?: string;
}

async function verifyStagedTree(args: VerifyArgs): Promise<VerifyResult> {
  const { kind, manifest, stagedRoot, deps } = args;
  if (kind === "runtime") {
    return verifyStagedRuntime(manifest, stagedRoot, deps);
  }
  return verifyStagedBrowsers(manifest, stagedRoot, deps);
}

/**
 * Runtime staged tree: every manifest package resolves anchored at the staged
 * runtime/ tree; walk-up version equals the manifest pin; sharp gets an
 * out-of-process native load check.
 */
async function verifyStagedRuntime(
  manifest: PrewarmManifest,
  stagedRoot: string,
  deps: PrewarmDeps
): Promise<VerifyResult> {
  const pins = manifest.npmPackages ?? {};
  const pkgJsonAnchor = path.join(stagedRoot, "package.json");
  if (!fs.existsSync(pkgJsonAnchor)) {
    return { ok: false, reason: "staged runtime/package.json missing" };
  }
  const requireFromStaged = createRequire(pathToFileURL(pkgJsonAnchor).href);

  for (const [name, pin] of Object.entries(pins)) {
    const entry = resolveEntryAnchored(requireFromStaged, name);
    if (!entry) {
      return { ok: false, reason: `staged package ${name} did not resolve` };
    }
    const version = walkUpVersion(entry, name);
    if (version !== pin) {
      return {
        ok: false,
        reason: `staged ${name} version ${version ?? "unknown"} !== pin ${pin}`,
      };
    }
  }

  // Native load check for sharp (the libvips hoist-mismatch class), out of
  // process so a failed load can't poison this process.
  if ("sharp" in pins) {
    const sharpEntry = resolveEntryAnchored(requireFromStaged, "sharp");
    if (sharpEntry) {
      const loaded = await nativeLoadCheck(sharpEntry, deps.spawn);
      if (!loaded.ok) {
        return { ok: false, reason: `sharp native load failed: ${loaded.error}` };
      }
    }
  }

  return { ok: true };
}

/**
 * Browsers staged tree: each expected executable exists (+X_OK on POSIX);
 * chromedriver/geckodriver reuse verifyDriverBinary.
 */
async function verifyStagedBrowsers(
  manifest: PrewarmManifest,
  stagedRoot: string,
  deps: PrewarmDeps
): Promise<VerifyResult> {
  const browsers = manifest.browsers ?? {};
  for (const name of Object.keys(browsers)) {
    // Locate an executable-shaped binary for this browser under the staged root.
    const bin = findBrowserBinary(stagedRoot, name);
    if (!bin) {
      return { ok: false, reason: `staged browser ${name} executable not found` };
    }
    if (process.platform !== "win32") {
      try {
        fs.accessSync(bin, fs.constants.X_OK);
      } catch {
        return { ok: false, reason: `staged ${name} binary not executable: ${bin}` };
      }
    }
    if (name === "chromedriver" || name === "geckodriver") {
      const res = await verifyDriverBinary(name, bin, { exec: deps.verifyExec });
      if (!res.ok) {
        return { ok: false, reason: `driver ${name} verify failed: ${res.error}` };
      }
    }
  }
  return { ok: true };
}

// Resolve a package's entry anchored at a require, mirroring loader.resolveEntry
// (require.resolve, falling back to package.json for pure-ESM "." exports).
function resolveEntryAnchored(requireFn: NodeRequire, name: string): string | null {
  try {
    return requireFn.resolve(name);
  } catch {
    try {
      const pkgJson = requireFn.resolve(`${name}/package.json`);
      return entryFromPackageJson(pkgJson);
    } catch {
      return null;
    }
  }
}

function entryFromPackageJson(pkgJsonPath: string): string | null {
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
    const dot = pkg?.exports?.["."] ?? pkg?.exports;
    let rel: unknown;
    if (typeof dot === "string") {
      rel = dot;
    } else if (dot && typeof dot === "object") {
      rel = dot.import ?? dot.require ?? dot.default ?? dot.node;
    }
    if (typeof rel !== "string") rel = pkg?.main;
    if (typeof rel !== "string") return null;
    const pkgDir = path.dirname(pkgJsonPath);
    const entry = path.resolve(pkgDir, rel);
    const within = path.relative(pkgDir, entry);
    if (within === "" || within.startsWith("..") || path.isAbsolute(within)) {
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

// Walk up from a resolved entry to the first package.json whose name matches.
function walkUpVersion(entry: string, name: string): string | null {
  let dir = path.dirname(entry);
  for (let i = 0; i < 12; i++) {
    const pkgJsonPath = path.join(dir, "package.json");
    try {
      if (fs.existsSync(pkgJsonPath)) {
        const parsed = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
        if (parsed?.name === name && typeof parsed.version === "string") {
          return parsed.version;
        }
      }
    } catch {
      // keep walking
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

// Out-of-process native require() check: `node -e "require(argv[1])" <entry>`.
function nativeLoadCheck(
  entry: string,
  spawnFn: SpawnFn | undefined
): Promise<{ ok: boolean; error?: string }> {
  const spawner = spawnFn ?? (nodeSpawn as SpawnFn);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (r: { ok: boolean; error?: string }) => {
      if (settled) return;
      settled = true;
      resolve(r);
    };
    let child: ChildProcess;
    try {
      child = spawner(
        process.execPath,
        ["-e", "require(process.argv[1])", entry],
        { stdio: ["ignore", "ignore", "pipe"] }
      );
    } catch (err) {
      finish({ ok: false, error: String(err) });
      return;
    }
    let stderr = "";
    if (child.stderr) child.stderr.on("data", (c: Buffer | string) => (stderr += String(c)));
    child.on("error", (err) => finish({ ok: false, error: String(err) }));
    child.on("close", (code: number | null) => {
      if (code === 0) finish({ ok: true });
      else finish({ ok: false, error: `exit ${code ?? "null"}: ${stderr.trim()}` });
    });
  });
}

// Locate a browser/driver executable under the staged browsers tree. The
// @puppeteer/browsers layout nests binaries a few dirs deep; we scan for a file
// matching the expected binary name.
function findBrowserBinary(stagedRoot: string, name: string): string | null {
  const isWin = process.platform === "win32";
  const targets: string[] = [];
  switch (name) {
    case "chromedriver":
      targets.push(isWin ? "chromedriver.exe" : "chromedriver");
      break;
    case "geckodriver":
      targets.push(isWin ? "geckodriver.exe" : "geckodriver");
      break;
    case "chrome":
      targets.push(isWin ? "chrome.exe" : "chrome", isWin ? "chrome.exe" : "Google Chrome for Testing");
      break;
    case "firefox":
      targets.push(isWin ? "firefox.exe" : "firefox");
      break;
    default:
      targets.push(name, `${name}.exe`);
  }
  const found = findFileByNames(stagedRoot, new Set(targets), 8);
  return found;
}

function findFileByNames(dir: string, names: Set<string>, depth: number): string | null {
  if (depth < 0) return null;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  // Files first.
  for (const entry of entries) {
    if (entry.isFile() && names.has(entry.name)) {
      return path.join(dir, entry.name);
    }
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const nested = findFileByNames(path.join(dir, entry.name), names, depth - 1);
      if (nested) return nested;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// installed.json merge
// ---------------------------------------------------------------------------

/**
 * Merge record entries from the manifest into <cacheDir>/installed.json. The
 * tarball ships no installed.json; we synthesize entries here. For browsers,
 * set latestCheckedAt = manifest.createdAt so the 24h TTL re-check still fires
 * naturally on the next run.
 */
function mergeInstalledRecord(
  kind: PrewarmKind,
  manifest: PrewarmManifest,
  ctx: CacheDirContext
): void {
  const record: InstalledRecord = readInstalledRecord(ctx);
  const at = manifest.createdAt || new Date().toISOString();
  if (kind === "runtime") {
    for (const [name, version] of Object.entries(manifest.npmPackages ?? {})) {
      record.npmPackages[name] = { installedVersion: version, installedAt: at };
    }
  } else {
    for (const [name, entry] of Object.entries(manifest.browsers ?? {})) {
      record.browsers[name] = {
        installedVersion: entry.installedVersion,
        installedAt: at,
        latestKnownVersion: entry.installedVersion,
        // Use the manifest's createdAt so the 24h freshness TTL naturally
        // re-checks the channel on the next run rather than trusting a
        // possibly-stale build indefinitely.
        latestCheckedAt: at,
      };
    }
  }
  writeInstalledRecord(record, ctx);
}

// ---------------------------------------------------------------------------
// Stale-staging sweep
// ---------------------------------------------------------------------------

function sweepStaleStaging(cacheRoot: string): void {
  try {
    const now = Date.now();
    for (const entry of fs.readdirSync(cacheRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (!entry.name.startsWith(".prewarm-")) continue;
      const full = path.join(cacheRoot, entry.name);
      try {
        const st = fs.statSync(full);
        if (now - st.mtimeMs > STALE_STAGING_MS) {
          fs.rmSync(full, { recursive: true, force: true });
        }
      } catch {
        // ignore individual sweep failures
      }
    }
  } catch {
    // best-effort
  }
}
