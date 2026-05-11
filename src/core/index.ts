import { setConfig } from "./config.js";
import { detectTests } from "./detectTests.js";
import { resolveTests } from "./resolveTests.js";
import { log, cleanTemp } from "./utils.js";
import { runSpecs, runViaApi, getRunner } from "./tests.js";
import { telemetryNotice, sendTelemetry } from "./telem.js";
import { readFile, resolvePaths } from "./files.js";

export { runTests, getRunner, detectTests, detectAndResolveTests, resolveTests, readFile, resolvePaths };

const supportMessage = `
##########################################################################
# Thanks for using Doc Detective! If this project was helpful to you,    #
# please consider starring the repo on GitHub or sponsoring the project: #
# - GitHub Sponsors: https://github.com/sponsors/doc-detective           #
# - Open Collective: https://opencollective.com/doc-detective            #
##########################################################################`;

/**
 * Detects and resolves tests based on the provided configuration.
 * Chains setConfig -> detectTests -> resolveTests.
 *
 * @async
 * @param {Object} options
 * @param {Object} options.config - The configuration object
 * @returns {Promise<Object|null>} Resolved tests object or null if none found
 */
async function detectAndResolveTests({ config }: any) {
  config = await setConfig({ config });
  const detectedTests = await detectTests({ config });
  if (!detectedTests || detectedTests.length === 0) {
    log(config, "warning", "No tests detected.");
    return null;
  }
  const resolvedTests = await resolveTests({ config, detectedTests });
  return resolvedTests;
}

// Run tests defined in specifications and documentation source files.
async function runTests(config: any, options: any = {}) {
  let resolvedTests: any;
  let results: any;

  if (options.resolvedTests) {
    resolvedTests = options.resolvedTests;
    // Caller-provided config wins over the embedded resolved-tests config
    // so CLI overrides like --dry-run / --logLevel are preserved when tests
    // come pre-resolved (DOC_DETECTIVE_API path). Without this merge, a
    // user running `--dry-run` against an orchestration-supplied resolved
    // payload would silently execute tests.
    config = { ...(resolvedTests.config || {}), ...(config || {}) };
    resolvedTests.config = config;
  }

  // Dry-run requires clean stdout so the JSON dump can be piped through
  // `jq` / `JSON.parse`. Force silent log level (which gates info logs from
  // detectAndResolveTests below) and skip the telemetry notice — both would
  // otherwise corrupt stdout at the default logLevel.
  if (config.dryRun) {
    config.logLevel = "silent";
    if (resolvedTests) resolvedTests.config = config;
  } else {
    telemetryNotice(config);
  }

  if (!resolvedTests) {
    resolvedTests = await detectAndResolveTests({ config });
    if (!resolvedTests || resolvedTests.specs.length === 0) {
      // log() in src/core/utils.ts recognizes "warning", not "warn" —
      // see the matching note in the JIT pre-flight catch below.
      log(config, "warning", "Couldn't resolve any tests.");
      return null;
    }
  }

  if (config.dryRun) {
    console.log(JSON.stringify(resolvedTests, null, 2));
    cleanTemp();
    sendTelemetry(config, "runTests:dryRun", {
      specs: resolvedTests.specs.length,
    });
    return resolvedTests;
  }

  // Just-in-time install: inspect the resolved specs to learn which heavy
  // npm packages and which browser binaries this run will actually use, then
  // install them in one batched step before any test executes. The lazy
  // resolver in src/runtime/loader.js is still defensive for any code path
  // this inference might miss, but the steady-state expectation is that
  // every loadHeavyDep() call below hits the warm-cache fast path.
  //
  // Browser installs are gated by `getAvailableApps()` — if the requested
  // browser is already detectable (e.g., the legacy ./browser-snapshots/
  // pre-warm is still in place), we skip the install entirely.
  try {
    const { inferRuntimeNeeds } = await import("../runtime/inferRuntimeNeeds.js");
    const { ensureRuntimeInstalled } = await import("../runtime/loader.js");
    const needs = inferRuntimeNeeds(resolvedTests);
    const ctx = { cacheDir: config.cacheDir };
    if (needs.npmPackages.size > 0) {
      await ensureRuntimeInstalled([...needs.npmPackages], { ctx });
    }
    if (needs.browsers.size > 0) {
      try {
        const { getAvailableApps } = await import("./config.js");
        const { ensureBrowserInstalled } = await import("../runtime/browsers.js");
        const available = await getAvailableApps({ config });
        const availableNames = new Set(available.map((a: any) => a.name));
        for (const browser of needs.browsers) {
          if (availableNames.has(browser)) continue;
          if (browser === "chrome") {
            await ensureBrowserInstalled("chrome", { ctx });
            await ensureBrowserInstalled("chromedriver", { ctx });
          } else if (browser === "firefox") {
            await ensureBrowserInstalled("firefox", { ctx });
            await ensureBrowserInstalled("geckodriver", { ctx });
          }
          // safari has no installable binary — it ships with the OS.
        }
      } catch (browserErr: any) {
        log(
          config,
          "debug",
          `Browser pre-flight check skipped: ${browserErr?.message ?? browserErr}`
        );
      }
    }
  } catch (err: any) {
    // log() in src/core/utils.ts recognizes "warning", not "warn" — using
    // the wrong key would make this branch silent at every log level.
    log(
      config,
      "warning",
      `Runtime pre-flight install hit an error: ${err?.message ?? err}. Falling back to on-demand resolution.`
    );
  }

  // If config.integrations.docDetectiveApi.apiKey is set, run tests via API instead of locally
  if (!process.env.DOC_DETECTIVE_API && config.integrations && config.integrations.docDetectiveApi && config.integrations.docDetectiveApi.apiKey) {
    // Run test specs via API
    results = await runViaApi({
      resolvedTests,
      apiKey: config.integrations.docDetectiveApi.apiKey,
    });
  } else {
    // Run test specs locally
    results = await runSpecs({ resolvedTests });
  }
  log(config, "info", "RESULTS:");
  log(config, "info", results);
  log(config, "info", "Cleaning up and finishing post-processing.");

  // Clean up
  cleanTemp();

  // Send telemetry
  sendTelemetry(config, "runTests", results);
  log(config, "info", supportMessage);

  return results;
}
