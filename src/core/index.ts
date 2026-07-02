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
    //
    // Note: the `resolvedTests.config || {}` fallback is covered (see
    // test/cli-index-adapters-coverage.test.js — a resolvedTests payload
    // with no embedded config). The second fallback, `config || {}`,
    // requires the caller to pass a falsy `config` (e.g. `runTests(undefined,
    // {resolvedTests})`); that shape currently proceeds into the runner with
    // no dryRun/logLevel signal and hits a pre-existing, unrelated defect (a
    // pre-resolved context missing platform info local resolution normally
    // adds — see the follow-up task spawned for that bug), so it isn't
    // exercised here. Left un-ignored since most of this line IS covered;
    // the residual branch is a known, tracked gap, not annotated dead code.
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
  //
  // Skipped entirely for API-backed runs: the orchestration API executes
  // tests remotely, so installing browsers/runtime locally would burn
  // network and disk for nothing.
  const willRunViaApi = Boolean(
    !process.env.DOC_DETECTIVE_API &&
      config.integrations &&
      config.integrations.docDetectiveApi &&
      config.integrations.docDetectiveApi.apiKey
  );
  if (willRunViaApi) {
    log(
      config,
      "debug",
      "Skipping runtime pre-flight install — run is dispatched via Doc Detective Orchestration API."
    );
  } else try {
    const { inferRuntimeNeeds } = await import("../runtime/inferRuntimeNeeds.js");
    const { ensureRuntimeInstalled } = await import("../runtime/loader.js");
    const needs = inferRuntimeNeeds(resolvedTests);
    const ctx = { cacheDir: config.cacheDir };
    // Bridge the runtime modules' logger contract to core/utils.ts:log()
    // so config.logLevel filters npm install stdout/stderr (which the
    // runtime logs at "debug") and prevents flooded output during a
    // routine `doc-detective` run. Map "warn" → "warning" since
    // core/utils.ts uses the latter.
    // c8 ignore justification (preflightLogger through the matching `if
    // (needs.browsers.size > 0)` block below, per ADR 01017): the outer
    // shell above (willRunViaApi dispatch, the try/inferRuntimeNeeds setup)
    // is exercised offline in test/cli-index-adapters-coverage.test.js with
    // `wait`-only specs, whose inferred needs are empty
    // (npmPackages.size === 0, browsers.size === 0) — proving the shell runs
    // without proving this logger or either preflight body does.
    // `preflightLogger` is only ever CALLED from inside these bodies (passed
    // as `deps.logger` to ensureRuntimeInstalled/ensureBrowserInstalled), so
    // it's defined-but-never-invoked for every offline spec. Actually
    // entering either `if` body requires a resolved spec whose steps need a
    // heavy npm package (e.g. pngjs for screenshot diffing) or an
    // uninstalled browser, and `ensureRuntimeInstalled`/
    // `ensureBrowserInstalled` are called from HERE with only `deps.logger`
    // bridged — not `deps.spawn` — so there is no injectable seam at this
    // exact call site to fake the real npm install / browser download those
    // functions perform (their own spawn/fetch seams are exercised directly
    // in test/runtime-helpers-coverage.test.js,
    // test/runtime-infer-needs.test.js, and test/runtime-loader.test.js).
    // Forcing this block in a unit test would mean either a real network
    // install (slow, flaky, mutates the shared cache dir) or re-stubbing the
    // same seam its own module tests already prove — the latter wouldn't be
    // testing core/index.ts's orchestration, just re-asserting loader.ts's
    // contract.
    /* c8 ignore start */
    const preflightLogger = (msg: string, level: string = "info") => {
      const mapped = level === "warn" ? "warning" : level;
      log(config, mapped, msg);
    };
    if (needs.npmPackages.size > 0) {
      await ensureRuntimeInstalled([...needs.npmPackages], {
        ctx,
        deps: { logger: preflightLogger },
      });
    }
    if (needs.browsers.size > 0) {
      try {
        const { getAvailableApps, clearAppCache } = await import("./config.js");
        const { ensureBrowserInstalled, requiredBrowserAssets } = await import(
          "../runtime/browsers.js"
        );
        const available = await getAvailableApps({ config });
        const availableNames = new Set(available.map((a: any) => a.name));
        let installedAnything = false;
        for (const browser of needs.browsers) {
          if (availableNames.has(browser)) continue;
          // requiredBrowserAssets returns [] for safari (ships with the OS)
          // and any unknown name, so the loop body simply no-ops for those.
          const assets = requiredBrowserAssets(browser);
          for (const asset of assets) {
            await ensureBrowserInstalled(asset, { ctx, deps: { logger: preflightLogger } });
          }
          if (assets.length > 0) installedAnything = true;
        }
        // Invalidate the available-apps cache for this cacheDir so a
        // subsequent runSpecs/getRunner call re-detects what the
        // pre-flight just materialized. Without this, the empty
        // `available` snapshot above would stick and downstream
        // browser-presence checks would still see "not installed."
        if (installedAnything) clearAppCache(config);
      } catch (browserErr: any) {
        log(
          config,
          "debug",
          `Browser pre-flight check skipped: ${browserErr?.message ?? browserErr}`
        );
      }
    }
    /* c8 ignore stop */
  } catch (err: any) {
    /* c8 ignore start - this catch's only practical trigger today is a
     * throw from inside the c8-ignored preflight block above (a real npm
     * install / browser download failure); inferRuntimeNeeds() is
     * documented pure/non-throwing (degrades to "no need" on malformed
     * input — see runtime/inferRuntimeNeeds.ts) so it cannot reach this
     * catch on its own. No hermetic path to this line without the same
     * un-injectable network/spawn dependency as the block it guards. */
    // log() in src/core/utils.ts recognizes "warning", not "warn" — using
    // the wrong key would make this branch silent at every log level.
    log(
      config,
      "warning",
      `Runtime pre-flight install hit an error: ${err?.message ?? err}. Falling back to on-demand resolution.`
    );
  }
  /* c8 ignore stop */

  // If config.integrations.docDetectiveApi.apiKey is set, run tests via API instead of locally
  if (willRunViaApi) {
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
