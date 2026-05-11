import path from "node:path";
import fs from "node:fs";
import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { getDeclaredVersion, satisfiesRange } from "./heavyDeps.js";
import {
  getRuntimeDir,
  readInstalledRecord,
  writeInstalledRecord,
  type CacheDirContext,
} from "./cacheDir.js";

export type LogLevel = "info" | "warn" | "error" | "debug";
export type Logger = (msg: string, level?: LogLevel) => void;

// The default logger gates `debug` output OFF so call sites that omit a
// logger (the JIT pre-flight, the CLI startup self-update check) don't
// flood stdout with npm child-process stdout/stderr on every run. Set
// DOC_DETECTIVE_RUNTIME_DEBUG=1 to opt back in for debugging the
// installer itself. Real callers (the install CLI commands) inject a
// logger that respects --silent/--verbose explicitly.
const RUNTIME_DEBUG = process.env.DOC_DETECTIVE_RUNTIME_DEBUG === "1";
const defaultLogger: Logger = (msg, level = "info") => {
  if (level === "debug" && !RUNTIME_DEBUG) return;
  if (level === "error") console.error(msg);
  else console.log(msg);
};

export type SpawnFn = (
  command: string,
  args: readonly string[],
  options: SpawnOptions
) => ChildProcess;

export interface LoaderDeps {
  spawn?: SpawnFn;
  logger?: Logger;
}

export interface LoadOptions {
  autoInstall?: boolean;
  ctx?: CacheDirContext;
  deps?: LoaderDeps;
}

const requireFromShim = createRequire(import.meta.url);

function tryResolveFromShim(name: string): string | null {
  try {
    return requireFromShim.resolve(name);
  } catch {
    return null;
  }
}

function tryResolveFromCache(
  name: string,
  ctx: CacheDirContext = {}
): string | null {
  const runtimeDir = getRuntimeDir(ctx);
  // Probe directly with require.resolve anchored at the runtime dir; this
  // honors package "exports" maps that a naive existsSync(node_modules/<name>)
  // check would miss for scoped or sub-path entry points.
  const pkgJsonAnchor = path.join(runtimeDir, "package.json");
  if (!fs.existsSync(pkgJsonAnchor)) return null;
  try {
    const requireFromCache = createRequire(pathToFileURL(pkgJsonAnchor).href);
    return requireFromCache.resolve(name);
  } catch {
    return null;
  }
}

/**
 * Resolve and import a heavy dep, lazy-installing into <cacheDir>/runtime
 * if neither the shim's node_modules nor the cache currently has it. The
 * shim's own node_modules wins so a user who kept the optionalDependency
 * pre-installed never pays the lazy-install cost.
 */
export async function loadHeavyDep<T = unknown>(
  name: string,
  options: LoadOptions = {}
): Promise<T> {
  const { autoInstall = true, ctx = {}, deps = {} } = options;

  let resolved = tryResolveFromShim(name);
  if (!resolved) resolved = tryResolveFromCache(name, ctx);

  if (!resolved) {
    if (!autoInstall) {
      throw new Error(
        `Heavy dep '${name}' is not installed in either the shim's node_modules or <cacheDir>/runtime. Run \`doc-detective install runtime\` to install it, or call loadHeavyDep with { autoInstall: true }.`
      );
    }
    await ensureRuntimeInstalled([name], { ctx, deps });
    resolved = tryResolveFromShim(name) ?? tryResolveFromCache(name, ctx);
    if (!resolved) {
      throw new Error(
        `Failed to resolve heavy dep '${name}' even after install. Inspect <cacheDir>/runtime/node_modules/${name}.`
      );
    }
  }

  return (await import(pathToFileURL(resolved).href)) as T;
}

export interface EnsureRuntimeInstalledOptions {
  ctx?: CacheDirContext;
  deps?: LoaderDeps;
  /** Reinstall even when the package already resolves from the cache. */
  force?: boolean;
  /**
   * Wall-clock cap on the spawned `npm install` child. Stalls (hanging
   * proxy, rate-limit, large dep tree on a flaky link) get terminated
   * instead of freezing the first `doc-detective` run forever. Defaults
   * to 5 minutes; pass `0` to disable the timeout entirely.
   */
  installTimeoutMs?: number;
}

const DEFAULT_INSTALL_TIMEOUT_MS = 5 * 60 * 1000;

const RUNTIME_PACKAGE_JSON_CONTENTS = JSON.stringify(
  {
    name: "doc-detective-runtime-cache",
    private: true,
    description:
      "Auto-managed cache of doc-detective's lazy-installed runtime deps. Do not edit.",
    version: "0.0.0",
  },
  null,
  2
);

function ensureRuntimePackageJson(runtimeDir: string): void {
  fs.mkdirSync(runtimeDir, { recursive: true });
  const pkgPath = path.join(runtimeDir, "package.json");
  if (!fs.existsSync(pkgPath)) {
    fs.writeFileSync(pkgPath, RUNTIME_PACKAGE_JSON_CONTENTS, "utf8");
  }
}

function readInstalledVersionFromCache(
  name: string,
  ctx: CacheDirContext = {}
): string | null {
  const runtimeDir = getRuntimeDir(ctx);
  const candidate = path.join(runtimeDir, "node_modules", name, "package.json");
  try {
    const raw = fs.readFileSync(candidate, "utf8");
    const parsed = JSON.parse(raw);
    return typeof parsed.version === "string" ? parsed.version : null;
  } catch {
    return null;
  }
}

/**
 * Install one or more heavy npm packages into <cacheDir>/runtime. Uses
 * `npm install --prefix <runtimeDir> --no-save --no-audit --no-fund <pkg>@<v>`
 * — `--prefix` confines npm to the cache dir, and the resolved version comes
 * from `package.json#optionalDependencies` via getDeclaredVersion().
 *
 * On success, refreshes <cacheDir>/installed.json with the actually-installed
 * versions for each package. Skips packages already present unless `force`.
 */
export async function ensureRuntimeInstalled(
  packages: string[],
  options: EnsureRuntimeInstalledOptions = {}
): Promise<void> {
  const {
    ctx = {},
    deps = {},
    force = false,
    installTimeoutMs = DEFAULT_INSTALL_TIMEOUT_MS,
  } = options;
  const logger = deps.logger ?? defaultLogger;
  const spawner = deps.spawn ?? (nodeSpawn as SpawnFn);
  if (packages.length === 0) return;

  // Decide what actually needs `npm install`. The skip cases — when
  // not forced — are:
  //   1. The package resolves from the shim's node_modules (npm
  //      installed it alongside doc-detective). Whatever version was
  //      pinned with the shim is what users get; we don't try to
  //      override it here.
  //   2. The package resolves from <cacheDir>/runtime/node_modules AND
  //      its installed version still satisfies the shim's declared
  //      range in package.json#optionalDependencies. Cached installs
  //      from an older doc-detective release can land here with a
  //      stale version; we re-install in that case so an upgraded shim
  //      doesn't run against an outdated cache (the bug Copilot
  //      flagged for persistent DOC_DETECTIVE_CACHE_DIR setups).
  const toInstall = force
    ? [...packages]
    : packages.filter((name) => {
        if (tryResolveFromShim(name)) return false;
        if (!tryResolveFromCache(name, ctx)) return true;
        try {
          const installed = readInstalledVersionFromCache(name, ctx);
          const expected = getDeclaredVersion(name);
          if (!installed) return true;
          return !satisfiesRange(installed, expected);
        } catch {
          // getDeclaredVersion throws for names not in package.json.
          // The caller passed an unknown name; let the npm install
          // path produce its own error rather than silently skipping.
          return true;
        }
      });
  if (toInstall.length === 0) return;

  const specs = toInstall.map(
    (name) => `${name}@${getDeclaredVersion(name)}`
  );
  const runtimeDir = getRuntimeDir(ctx);
  ensureRuntimePackageJson(runtimeDir);

  logger(
    `Installing ${specs.length} runtime dep(s) into ${runtimeDir}: ${specs.join(", ")}`,
    "info"
  );

  const npmExe = process.platform === "win32" ? "npm.cmd" : "npm";
  const args = [
    "install",
    "--prefix",
    runtimeDir,
    "--no-save",
    "--no-audit",
    "--no-fund",
    ...specs,
  ];

  await new Promise<void>((resolve, reject) => {
    // shell:true on Windows so npm.cmd resolves via PATHEXT.
    const child = spawner(npmExe, args, {
      cwd: runtimeDir,
      env: process.env,
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const onLine = (stream: "stdout" | "stderr", chunk: Buffer | string) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      for (const line of text.split(/\r?\n/)) {
        if (line.length > 0) logger(`npm[${stream}]: ${line}`, "debug");
      }
    };
    if (child.stdout) child.stdout.on("data", (c) => onLine("stdout", c));
    if (child.stderr) child.stderr.on("data", (c) => onLine("stderr", c));
    // Wall-clock cap so a stalled npm never freezes the first run. 0 opts
    // out (callers that explicitly want to wait forever, or unit tests
    // with a synchronously-resolving fake spawner).
    let timer: NodeJS.Timeout | null = null;
    if (installTimeoutMs > 0) {
      timer = setTimeout(() => {
        try {
          child.kill();
        } catch {
          // best-effort — the child may already have exited
        }
        reject(
          new Error(
            `npm install timed out after ${installTimeoutMs}ms while installing ${specs.join(", ")} into ${runtimeDir}`
          )
        );
      }, installTimeoutMs);
      // Don't keep the event loop alive solely for this timer.
      if (typeof timer.unref === "function") timer.unref();
    }
    const clearTimer = () => {
      if (timer) clearTimeout(timer);
    };
    child.on("error", (err: Error) => {
      clearTimer();
      reject(err);
    });
    child.on("close", (code: number | null) => {
      clearTimer();
      if (code === 0) resolve();
      else reject(new Error(`npm install exited with code ${code ?? "null"}`));
    });
  });

  const record = readInstalledRecord(ctx);
  const now = new Date().toISOString();
  for (const name of toInstall) {
    const installedVersion =
      readInstalledVersionFromCache(name, ctx) ?? getDeclaredVersion(name);
    record.npmPackages[name] = { installedVersion, installedAt: now };
  }
  writeInstalledRecord(record, ctx);
}
