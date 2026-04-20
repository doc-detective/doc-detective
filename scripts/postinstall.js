import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as browsers from "@puppeteer/browsers";
import * as geckodriver from "geckodriver";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  await installBrowsers();
  // await installAppiumDepencencies();
  await maybePromptInstallAgents();
}

main();

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
  const initCwdAbs = process.env.INIT_CWD
    ? path.resolve(process.env.INIT_CWD)
    : null;
  const sanitizedPath = (originalPath || "")
    .split(pathSep)
    .filter((entry) => {
      if (!entry || entry === ".") return false;
      const normalized = entry.split(path.sep).join("/");
      if (normalized.includes("/node_modules/.bin")) return false;
      if (initCwdAbs) {
        const resolved = path.resolve(entry);
        if (
          resolved === initCwdAbs ||
          resolved.startsWith(initCwdAbs + path.sep)
        )
          return false;
      }
      return true;
    })
    .join(pathSep);
  process.env[pathKey] = sanitizedPath;

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
      process.env[pathKey] = originalPath;
      // Orphaned adapter children would otherwise keep the event loop alive
      // and freeze `npm install`. See comment above.
      process.exit(0);
    }
    adaptersNeedingInstall = result.filter(Boolean);
  } catch {
    process.env[pathKey] = originalPath;
    return;
  }
  process.env[pathKey] = originalPath;

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
  const cliPath = path.join(__dirname, "..", "bin", "doc-detective.js");
  const cliArgs = ["install-agents"];
  for (const a of adaptersNeedingInstall) {
    cliArgs.push("--agent", a.id);
  }
  // Hand the child the sanitized PATH under the actual key (PATH or Path) so
  // its adapter spawns can't resolve a fake `claude`/`gh`/etc from
  // `node_modules/.bin` during the install step either.
  const childEnv = { ...process.env, [pathKey]: sanitizedPath };
  const { code, signal } = await new Promise((resolve) => {
    const child = spawn(process.execPath, [cliPath, ...cliArgs], {
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

async function installBrowsers() {
  // Move to package root directory to correctly set browser snapshot directory
  let cwd = process.cwd();
  process.chdir(path.join(__dirname, ".."));

  // Meta
  const browser_platform = browsers.detectBrowserPlatform();
  const cacheDir = path.resolve("browser-snapshots");

  // Install Chrome
  try {
    console.log("Installing Chrome browser");
    let browser = "chrome";
    let buildId = await browsers.resolveBuildId(
      browser,
      browser_platform,
      "stable"
    );
    await browsers.install({
      browser,
      buildId,
      cacheDir,
    });
  } catch (error) {
    console.log("Chrome download not available.", error);
  }

  // Install Firefox
  try {
    console.log("Installing Firefox browser");
    let browser = "firefox";
    let buildId = await browsers.resolveBuildId(
      browser,
      browser_platform,
      "latest"
    );
    await browsers.install({
      browser,
      buildId,
      cacheDir,
    });
  } catch (error) {
    console.log("Firefox download not available.", error);
  }

  // Install ChromeDriver
  try {
    console.log("Installing ChromeDriver binary");
    let browser = "chromedriver";
    let buildId = await browsers.resolveBuildId(
      browser,
      browser_platform,
      "stable"
    );
    await browsers.install({
      browser,
      buildId,
      cacheDir,
    });
  } catch (error) {
    console.log("ChromeDriver download not available.", error);
  }

  // Install Geckodriver
  try {
    console.log("Installing Geckodriver binary");
    let binPath;
    if (__dirname.includes("AppData\\Roaming\\")) {
      // Running from global install on Windows
      binPath = path.join(__dirname.split("node_modules")[0]);
    } else if (__dirname.includes("node_modules")) {
      // If running from node_modules
      binPath = path.join(__dirname, "../../.bin");
    } else {
      binPath = path.join(__dirname, "../node_modules/.bin");
    }
    process.env.GECKODRIVER_CACHE_DIR = binPath;
    await geckodriver.download();
  } catch (error) {
    console.log("Geckodriver download not available.", error);
  }
  // Move back to original directory
  process.chdir(cwd);
}
