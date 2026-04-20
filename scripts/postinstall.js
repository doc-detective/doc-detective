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

  // Hard ceiling on the whole detection phase. Some adapters shell out to
  // external CLIs that could hang on auth prompts, proxy stalls, etc., and a
  // hung postinstall would freeze `npm install`. On timeout we treat the
  // answer as "don't know" and skip prompting.
  const DETECTION_TIMEOUT_MS = 10_000;

  let needsInstall;
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
    if (result === "__timeout__") return;
    needsInstall = result.filter(Boolean);
  } catch {
    return;
  }

  if (needsInstall.length === 0) return;

  let confirm;
  try {
    ({ confirm } = await import("@inquirer/prompts"));
  } catch {
    return;
  }

  const names = needsInstall.map((a) => a.displayName).join(", ");
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
  for (const a of needsInstall) {
    cliArgs.push("--agent", a.id);
  }
  const exitCode = await new Promise((resolve) => {
    const child = spawn(process.execPath, [cliPath, ...cliArgs], {
      stdio: "inherit",
      cwd: targetCwd,
    });
    child.on("exit", (code) => resolve(code ?? 0));
    child.on("error", () => resolve(1));
  });
  if (exitCode !== 0) {
    console.log(
      `\ndoc-detective install-agents exited with code ${exitCode}. ` +
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
