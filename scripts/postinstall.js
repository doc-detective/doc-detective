import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolved path to the compiled CLI, shared by both install steps below.
const CLI_PATH = path.join(__dirname, "..", "bin", "doc-detective.js");

// Two steps run at `npm install` time:
//   1. maybeInstallRuntime(): eagerly install the heavy runtime assets
//      (webdriverio/appium/sharp + browsers) via `doc-detective install all`,
//      so a fresh install — and any Docker image built `FROM` it — is ready to
//      run without a separate install step. On by default; opt out with
//      DOC_DETECTIVE_INSTALL_RUNTIME=0.
//   2. maybePromptInstallAgents(): the optional agent-tools install prompt —
//      lightweight (TTY-gated, time-bounded, skipped in CI).
async function main() {
  await maybeInstallRuntime();
  await maybePromptInstallAgents();
}

// Only run the install steps when executed as the npm lifecycle script, not
// when a test imports this module for the exported pure helpers below.
function isInvokedDirectly() {
  try {
    if (!process.argv[1]) return false;
    return (
      fs.realpathSync(process.argv[1]) ===
      fs.realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return false;
  }
}
// Swallow any unexpected rejection: a postinstall script must always exit 0,
// otherwise it fails the user's `npm install`.
if (isInvokedDirectly()) main().catch(() => {});

// --- Runtime + browsers auto-install ----------------------------------------

/**
 * True when the user has opted out of the postinstall heavy install via
 * DOC_DETECTIVE_INSTALL_RUNTIME (0/false/no/off, case-insensitive). Default
 * (unset or any other value) installs. Exported for tests.
 */
export function isRuntimeInstallOptedOut(env = process.env) {
  const v = String(env.DOC_DETECTIVE_INSTALL_RUNTIME ?? "").trim().toLowerCase();
  return v === "0" || v === "false" || v === "no" || v === "off";
}

/**
 * A line we surface to the user: the installer's own clean progress output
 * (`Installing runtime…`, `  [npm] webdriverio — installed`, …). Everything
 * else from the child — npm deprecation/funding noise, blank lines — is
 * suppressed on the success path. Exported for tests.
 */
export function isProgressLine(line) {
  return /^\s*Installing\b/.test(line) || /^\s*\[(npm|browser)\]/.test(line);
}

/**
 * Pure npm noise (deprecation/funding/notice). Dropped from the captured
 * buffer when surfacing a failure tail so the dump stays readable — genuine
 * warnings/errors (e.g. EBADENGINE) are kept. Exported for tests.
 *
 * Kept in sync with src/runtime/installOutput.ts#isNpmNoiseLine (this is a
 * plain Node script that can't import the compiled TS module reliably).
 */
export function isNpmNoiseLine(line) {
  const l = line.trim();
  if (!l) return true;
  return (
    /^npm warn deprecated/i.test(l) ||
    /^npm notice/i.test(l) ||
    /^npm fund/i.test(l) ||
    /packages are looking for funding/i.test(l)
  );
}

// Install the heavy runtime assets in a CHILD PROCESS whose stdout/stderr we
// capture (pipe) rather than inherit, so npm's deprecated-transitive-dependency
// warnings (glob, whatwg-encoding, …) never reach the user's terminal. We
// forward only the installer's own progress lines; on failure we surface a
// curated tail. This never fails the npm install — the assets also lazy-install
// on first use, so a failure here just forfeits the pre-warm.
async function maybeInstallRuntime() {
  if (isRuntimeInstallOptedOut()) return;

  const distDir = path.join(__dirname, "..", "dist");
  // Dev checkout / partial install without a build: the CLI can't run yet.
  // Skip silently — postinstall must never fail.
  if (!fs.existsSync(CLI_PATH) || !fs.existsSync(distDir)) return;

  console.log(
    "doc-detective: installing runtime + browsers " +
      "(set DOC_DETECTIVE_INSTALL_RUNTIME=0 to skip)…"
  );

  const captured = [];
  const handleLine = (raw, forward) => {
    if (!raw.trim()) return;
    captured.push(raw);
    if (forward && isProgressLine(raw)) console.log("  " + raw.trim());
  };
  // Buffer per stream so a line split across data chunks is reassembled before
  // the allow-list filter sees it. Returns the new buffer remainder.
  const consume = (buf, chunk, forward) => {
    const parts = (buf + chunk.toString()).split(/\r?\n/);
    const remainder = parts.pop(); // trailing partial line (no newline yet)
    for (const line of parts) handleLine(line, forward);
    return remainder;
  };

  const { code, signal, errored } = await new Promise((resolve) => {
    let child;
    try {
      child = spawn(
        process.execPath,
        [CLI_PATH, "install", "all", "--yes"],
        { stdio: ["ignore", "pipe", "pipe"], env: process.env }
      );
    } catch {
      resolve({ code: 1, signal: null, errored: true });
      return;
    }
    let outBuf = "";
    let errBuf = "";
    child.stdout?.on("data", (chunk) => (outBuf = consume(outBuf, chunk, true)));
    // stderr is captured for a possible failure dump but never forwarded live.
    child.stderr?.on("data", (chunk) => (errBuf = consume(errBuf, chunk, false)));
    child.on("close", (code, signal) => {
      // Flush any trailing partial lines left without a final newline.
      handleLine(outBuf, true);
      handleLine(errBuf, false);
      resolve({ code, signal, errored: false });
    });
    child.on("error", () => resolve({ code: 1, signal: null, errored: true }));
  });

  if (!errored && !signal && code === 0) {
    console.log("doc-detective: runtime + browsers ready.");
    return;
  }

  const tail = captured.filter((l) => !isNpmNoiseLine(l)).slice(-20);
  console.error(
    "doc-detective: runtime install did not complete " +
      (signal ? `(signal ${signal})` : `(exit ${code})`) +
      ". Assets will install on first use, or run `doc-detective install all`."
  );
  if (tail.length) console.error(tail.map((l) => "  " + l).join("\n"));
}

async function maybePromptInstallAgents() {
  // Don't prompt in non-interactive contexts. npm sets many of these during
  // automated installs (CI, Docker builds, `npm install --silent`, etc.), and a
  // blocking prompt there would hang the parent install.
  if (!process.stdin.isTTY || !process.stdout.isTTY) return;
  if (process.env.CI) return;
  if (process.env.DOC_DETECTIVE_SKIP_AGENT_PROMPT) return;

  let listAdapters;
  try {
    const registryPath = path.join(__dirname, "..", "dist", "agents", "registry.js");
    ({ listAdapters } = await import(pathToFileURL(registryPath).href));
  } catch {
    // Compiled agents module isn't present (e.g., dev checkout without a build,
    // or a partial install). Skip silently — postinstall must never fail.
    return;
  }

  // NOTE: do NOT chdir() to INIT_CWD here. Adapter detect()/getInstallState()
  // implementations spawn bare commands (e.g., `claude --version`), and on
  // Windows CreateProcess searches the cwd before PATH. Running with cwd set
  // to a (potentially untrusted) user repo would let a hostile `claude.cmd`
  // or `claude.exe` in that repo execute during `npm install`. The tradeoff
  // is that project-scope `.claude/`-style files in the consuming repo won't
  // be seen here — we accept occasional over-prompting in that case. The
  // child CLI spawn below gets INIT_CWD explicitly since the user has
  // consented by then and we invoke node with an absolute path.
  const targetCwd = process.env.INIT_CWD || process.cwd();

  // npm prepends `node_modules/.bin` (and every ancestor's .bin) onto PATH for
  // lifecycle scripts, so a malicious transitive dep declaring `bin: { claude }`
  // could ship a fake `claude` binary that an adapter's bare-command spawn
  // would pick up. Sanitize PATH for detection AND pass the sanitized PATH
  // through to the child CLI spawn — legitimate `claude`/`gh`/etc binaries
  // always come from system or user-global bin dirs, never from a project's
  // `node_modules/.bin`, so stripping those entries is safe throughout.
  //
  // On Windows the PATH env var can be spelled `Path` or `PATH` depending on
  // how the parent process populated its environment. Node's process.env is
  // case-insensitive for reads on Windows, but assigning `process.env.PATH`
  // when the underlying entry is `Path` creates a second entry — so resolve
  // the actual key once and use it consistently.
  const pathKey =
    process.platform === "win32"
      ? Object.keys(process.env).find((k) => k.toUpperCase() === "PATH") ||
        "Path"
      : "PATH";
  const originalPath = process.env[pathKey];
  const pathSep = process.platform === "win32" ? ";" : ":";
  // Windows paths are case-insensitive, so normalize both sides of every
  // comparison to lowercase on win32. Otherwise `C:\Proj\NODE_MODULES\.BIN`
  // would slip past a literal `/node_modules/.bin` check.
  const isWin = process.platform === "win32";
  const caseFold = (s) => (isWin ? s.toLowerCase() : s);
  const initCwdAbs = process.env.INIT_CWD
    ? path.resolve(process.env.INIT_CWD)
    : null;
  const initCwdMatch = initCwdAbs ? caseFold(initCwdAbs) : null;
  // Guard against INIT_CWD resolving to a root ("/" on POSIX, "C:\" on
  // Windows): blindly appending path.sep would produce "//" or "C:\\", and
  // `startsWith` would miss every subpath. When the value already ends with
  // a separator (root case), use it as-is; otherwise append.
  const initCwdPrefix =
    initCwdMatch && !initCwdMatch.endsWith(path.sep)
      ? initCwdMatch + path.sep
      : initCwdMatch;
  const sanitizedPath = (originalPath || "")
    .split(pathSep)
    .filter((entry) => {
      if (!entry || entry === ".") return false;
      const normalized = caseFold(entry.split(path.sep).join("/"));
      if (normalized.includes("/node_modules/.bin")) return false;
      if (initCwdMatch) {
        const resolved = caseFold(path.resolve(entry));
        if (resolved === initCwdMatch || resolved.startsWith(initCwdPrefix))
          return false;
      }
      return true;
    })
    .join(pathSep);
  process.env[pathKey] = sanitizedPath;
  // Restoring via `process.env[k] = undefined` coerces to the literal string
  // "undefined" (Node stringifies every env value), leaving the process with
  // a broken PATH. Delete the key when the original was absent; only assign
  // when we have a real string.
  const restorePath = () => {
    if (originalPath === undefined) delete process.env[pathKey];
    else process.env[pathKey] = originalPath;
  };

  // Hard ceiling on the whole detection phase. Some adapters shell out to
  // external CLIs that could hang on auth prompts, proxy stalls, etc. On
  // timeout we return — but because Promise.race doesn't cancel the detection
  // promise, any spawned adapter child processes keep the event loop alive
  // and `npm install` would still hang. Force-exit on timeout to tear them
  // down. This is safe here: maybePromptInstallAgents is the last step in
  // main(), the browser installs have already completed, and we're exiting
  // cleanly with code 0.
  const DETECTION_TIMEOUT_MS = 10_000;

  let adaptersNeedingInstall;
  try {
    const adapters = listAdapters();
    const detection = Promise.all(
      adapters.map(async (adapter) => {
        try {
          const detect = await adapter.detect();
          if (!detect.present) return null;
          const scopes = adapter.supportsScopes();
          const states = await Promise.all(
            scopes.map((s) =>
              adapter.getInstallState(s).catch(() => ({ installed: false }))
            )
          );
          if (states.some((s) => s.installed)) return null;
          return adapter;
        } catch {
          return null;
        }
      })
    );
    const timeout = new Promise((resolve) =>
      setTimeout(() => resolve("__timeout__"), DETECTION_TIMEOUT_MS).unref()
    );
    const result = await Promise.race([detection, timeout]);
    if (result === "__timeout__") {
      restorePath();
      // Orphaned adapter children would otherwise keep the event loop alive
      // and freeze `npm install`. See comment above.
      process.exit(0);
    }
    adaptersNeedingInstall = result.filter(Boolean);
  } catch {
    restorePath();
    return;
  }
  restorePath();

  if (adaptersNeedingInstall.length === 0) return;

  let confirm;
  try {
    ({ confirm } = await import("@inquirer/prompts"));
  } catch {
    return;
  }

  const names = adaptersNeedingInstall.map((a) => a.displayName).join(", ");
  console.log(
    `\nDetected coding agents that may be missing doc-detective tools: ${names}.`
  );
  let proceed = false;
  try {
    proceed = await confirm({
      message: "Install doc-detective agent tools now?",
      default: false,
    });
  } catch {
    // User cancelled (Ctrl+C) or prompt failed — treat as decline.
    return;
  }
  if (!proceed) {
    console.log(
      "Skipped. Run `npx doc-detective install-agents` later to install."
    );
    return;
  }

  // Pre-fill --agent so the CLI doesn't re-prompt for the picker. Scope stays
  // interactive on purpose — project vs global is a per-user decision.
  const cliArgs = ["install-agents"];
  for (const a of adaptersNeedingInstall) {
    cliArgs.push("--agent", a.id);
  }
  // Hand the child the sanitized PATH under the actual key (PATH or Path) so
  // its adapter spawns can't resolve a fake `claude`/`gh`/etc from
  // `node_modules/.bin` during the install step either.
  const childEnv = { ...process.env, [pathKey]: sanitizedPath };
  const { code, signal } = await new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI_PATH, ...cliArgs], {
      stdio: "inherit",
      cwd: targetCwd,
      env: childEnv,
    });
    // Use `close` (fires after all stdio is flushed) and capture signal so a
    // signal-terminated child (code === null) is treated as failure rather
    // than silently succeeding.
    child.on("close", (c, s) => resolve({ code: c, signal: s }));
    child.on("error", () => resolve({ code: 1, signal: null }));
  });
  if (signal || (code !== null && code !== 0)) {
    const reason = signal ? `due to signal ${signal}` : `with code ${code}`;
    console.log(
      `\ndoc-detective install-agents exited ${reason}. ` +
        "You can retry with `npx doc-detective install-agents`."
    );
  }
}
