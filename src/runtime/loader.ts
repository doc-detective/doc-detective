import path from "node:path";
import fs from "node:fs";
import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { getDeclaredVersion, satisfiesRange, withPeerCompanions } from "./heavyDeps.js";
import { isNpmNoiseLine } from "./installOutput.js";
import {
  assertSafeRuntimePath,
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
 * Resolve a heavy dep's entry path without importing it. Used by call
 * sites that need to spawn a binary directly (e.g. Appium via
 * `node <entry>.js`) rather than `await import()` the module — which
 * lets them bypass `.cmd` shim execution and the Windows shell:true
 * requirement entirely. Mirrors `loadHeavyDep`'s shim → cache fallback.
 * Returns `null` if neither location resolves the name.
 */
export function resolveHeavyDepPath(
  name: string,
  ctx: CacheDirContext = {}
): string | null {
  return tryResolveFromShim(name) ?? tryResolveFromCache(name, ctx);
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

  // Pull in optional peer companions (e.g. proxy-agent for
  // @puppeteer/browsers@3) that npm won't auto-install but the dep needs for
  // full functionality. Done here so both the JIT path (loadHeavyDep) and the
  // bulk path (installRuntime / `install all`) get them.
  packages = withPeerCompanions(packages);

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

  // Keep the announcement calm — no dependency list or count. The resolved
  // versions are reported once the install completes (the install command's
  // per-asset report; the lazy path stays quiet on success). The full spec list
  // still goes to the install.log for diagnostics.
  logger("Installing dependencies…", "info");

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

  // Node 18+ refuses to spawn `.cmd` files on Windows without
  // `shell: true` (security feature: spawning .cmd without shell
  // surfaces as EINVAL). Pair `shell: true` on Windows with explicit
  // validation of `runtimeDir` — the only user-controlled value that
  // would otherwise reach the shell — to keep CodeQL happy and avoid
  // a real injection vector. Linux/macOS spawn the real `npm` binary
  // without a shell.
  assertSafeRuntimePath(runtimeDir, "DOC_DETECTIVE_CACHE_DIR / config.cacheDir");
  await new Promise<void>((resolve, reject) => {
    // Tee the full, RAW npm output (deprecation noise included) to a log file so
    // a non-zero exit is debuggable. The terminal only shows filtered output, so
    // without this the failure reason is lost. Best-effort — logging must never
    // break the install.
    const logPath = path.join(runtimeDir, "install.log");
    let logStream: fs.WriteStream | null = null;
    try {
      fs.mkdirSync(runtimeDir, { recursive: true });
      logStream = fs.createWriteStream(logPath, { flags: "w" });
      // A write/flush error (disk full, EIO, permissions) must never crash the
      // install via an unhandled 'error' event. Swallow it and stop logging.
      logStream.on("error", () => {
        logStream = null;
      });
      // Header so the log is self-contained for diagnostics, even though the
      // terminal no longer lists the deps.
      logStream.write(
        `# doc-detective: installing ${specs.join(", ")}\n# into ${runtimeDir}\n\n`
      );
    } catch {
      logStream = null;
    }
    const logHint = logStream ? ` See full npm output: ${logPath}` : "";

    // DEP0190: spawning npm.cmd on Windows needs shell:true, and passing args
    // with shell:true emits a deprecation warning. We keep the CodeQL-safe args
    // array (runtimeDir is validated above), so just suppress that one warning
    // around the synchronous spawn() call — emitWarning() reads
    // process.noDeprecation synchronously.
    const child: ChildProcess = (() => {
      const prevNoDeprecation = process.noDeprecation;
      process.noDeprecation = true;
      try {
        return spawner(npmExe, args, {
          cwd: runtimeDir,
          env: process.env,
          shell: process.platform === "win32",
          stdio: ["ignore", "pipe", "pipe"],
        });
      } finally {
        process.noDeprecation = prevNoDeprecation;
      }
    })();
    const emitLine = (stream: "stdout" | "stderr", line: string) => {
      if (line.length === 0) return;
      // Drop npm's deprecation/funding/notice noise (about transitive deps
      // the user can't fix) so even `--verbose` install output stays calm.
      // DOC_DETECTIVE_RUNTIME_DEBUG=1 shows everything raw for diagnostics.
      if (!RUNTIME_DEBUG && isNpmNoiseLine(line)) return;
      logger(`npm[${stream}]: ${line}`, "debug");
    };
    // Buffer each stream so a line split across `data` chunks is reassembled
    // before isNpmNoiseLine classifies it — otherwise a fragmented
    // `npm warn deprecated …` line could slip past the filter.
    const buffers: Record<"stdout" | "stderr", string> = { stdout: "", stderr: "" };
    const onChunk = (stream: "stdout" | "stderr", chunk: Buffer | string) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      if (logStream) logStream.write(text); // full raw output → log file
      const parts = (buffers[stream] + text).split(/\r?\n/);
      buffers[stream] = parts.pop() ?? ""; // trailing partial line
      for (const line of parts) emitLine(stream, line);
    };
    const flushBuffers = () => {
      emitLine("stdout", buffers.stdout);
      emitLine("stderr", buffers.stderr);
      buffers.stdout = "";
      buffers.stderr = "";
    };
    if (child.stdout) child.stdout.on("data", (c) => onChunk("stdout", c));
    if (child.stderr) child.stderr.on("data", (c) => onChunk("stderr", c));
    // Wall-clock cap so a stalled npm never freezes the first run. 0 opts
    // out (callers that explicitly want to wait forever, or unit tests
    // with a synchronously-resolving fake spawner).
    let timer: NodeJS.Timeout | null = null;
    const clearTimer = () => {
      if (timer) clearTimeout(timer);
    };
    // Settle exactly once, flushing the log stream first so the file is fully
    // written before the error propagates and the process may exit. end()'s
    // callback only fires on 'finish'; pair it with a one-shot 'error' guard so
    // a stream error (disk full mid-flush) still settles the promise instead of
    // hanging the install.
    let settled = false;
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      clearTimer();
      flushBuffers();
      const stream = logStream;
      logStream = null;
      if (stream) {
        let acted = false;
        const once = () => {
          if (!acted) {
            acted = true;
            action();
          }
        };
        stream.once("error", once);
        stream.end(once);
      } else {
        action();
      }
    };
    if (installTimeoutMs > 0) {
      timer = setTimeout(() => {
        try {
          child.kill();
        } catch {
          // best-effort — the child may already have exited
        }
        finish(() =>
          reject(
            new Error(
              `npm install timed out after ${installTimeoutMs}ms while installing ${specs.join(", ")} into ${runtimeDir}.${logHint}`
            )
          )
        );
      }, installTimeoutMs);
      // Don't keep the event loop alive solely for this timer.
      if (typeof timer.unref === "function") timer.unref();
    }
    // Spawn failure (ENOENT/EINVAL): the OS error is self-descriptive and the
    // log holds no npm output for this path, so we don't append logHint.
    child.on("error", (err: Error) => finish(() => reject(err)));
    child.on("close", (code: number | null) =>
      finish(() =>
        code === 0
          ? resolve()
          : reject(
              new Error(
                `npm install exited with code ${code ?? "null"} while installing ${specs.join(", ")}.${logHint}`
              )
            )
      )
    );
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
