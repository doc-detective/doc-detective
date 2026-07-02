import { runTests } from "./core/index.js";
import {
  buildYargs,
  setConfig,
  outputResults,
  setMeta,
  getVersionData,
  log,
  getResolvedTestsFromEnv,
  reportResults,
  isDebugRequested,
} from "./utils.js";
import { installAgentsCommand } from "./agents/command.js";
import { maybeShowHint } from "./hints/index.js";
import { installCommand } from "./runtime/installCommand.js";
import { printDebug, defaultDebugDir } from "./debug/index.js";
import { debugCommand } from "./debug/command.js";
import { argv as processArgv } from "node:process";
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";

const cliRequire = createRequire(import.meta.url);

// Run
setMeta();
main(processArgv).catch((err) => {
  // yargs' .fail handler prints usage + message; this catches anything that
  // escapes (including our rethrown errors) so the process exits non-zero.
  console.error(err?.message || err);
  process.exit(1);
});

async function main(argv: string[]) {
  await buildYargs(argv)
    .command({
      command: "$0",
      describe: "Run Doc Detective tests (default).",
      handler: runTestsHandler,
    })
    .command({
      // Preserved for back-compat with the `runTests` npm script and any
      // existing CI invocations. Runs the same handler as the default.
      command: "runTests",
      describe: false,
      handler: runTestsHandler,
    })
    // Hidden alias kept for back-compat with existing scripts and docs:
    // `doc-detective install-agents` still works, undocumented, and delegates
    // to the same implementation as `doc-detective install agents`.
    .command({ ...installAgentsCommand, describe: false } as any)
    .command(installCommand as any)
    .command(debugCommand)
    .strict()
    .demandCommand(0)
    // Suppress yargs' default help-dump on failure; surface the concrete error
    // message instead. The top-level .catch() prints it and sets exit code.
    .fail((msg: string, err: Error | undefined) => {
      if (err) throw err;
      throw new Error(msg);
    })
    .parseAsync();
}

// Legacy "run tests" flow — unchanged behavior when no subcommand is given.
async function runTestsHandler(args: any) {
  // Get .doc-detective JSON or YAML config, if it exists, preferring a config arg if provided
  const configPathJSON = path.resolve(process.cwd(), ".doc-detective.json");
  const configPathYAML = path.resolve(process.cwd(), ".doc-detective.yaml");
  const configPathYML = path.resolve(process.cwd(), ".doc-detective.yml");
  // Treat any non-empty `--config` as authoritative (resolved to an
  // absolute path). A mistyped path then fails deterministically via
  // setConfig rather than silently falling back to auto-discovery.
  const hasExplicitConfig =
    typeof args.config === "string" && args.config.trim().length > 0;
  const configPath = hasExplicitConfig
    ? path.resolve(args.config.trim())
    : fs.existsSync(configPathJSON)
    ? configPathJSON
    : fs.existsSync(configPathYAML)
    ? configPathYAML
    : fs.existsSync(configPathYML)
    ? configPathYML
    : null;

  // Detect env-var debug intent before setConfig so we can still emit
  // the diagnostic dump when validation fails. `isDebugRequested`
  // reads `process.env.DOC_DETECTIVE_DEBUG`. Users who want diagnostic
  // output on the CLI should prefer the dedicated `doc-detective
  // debug` subcommand (which also supports `--include-env`); this
  // env-var path stays as the CI-friendly trigger.
  const debugRequested = isDebugRequested();

  // Set config
  let config: any;
  try {
    config = await setConfig({ configPath: configPath, args: args });
  } catch (err: any) {
    if (debugRequested) {
      // Build a minimal stub config so the dump can still render.
      // `printDebug` tolerates undefined fields; the configError banner
      // surfaces the underlying validation message.
      const stubConfig: any = {
        logLevel: typeof args.logLevel === "string" ? args.logLevel : "info",
        input: typeof args.input === "string" ? args.input : ".",
      };
      await printDebug({
        config: stubConfig,
        configPath: configPath,
        configError: err instanceof Error ? err : new Error(String(err)),
        outDir: defaultDebugDir(),
        args,
      });
      // The env-var dump replaced a real test run; a broken config must
      // still fail the process so CI doesn't go green on an unran suite.
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  // Diagnostic dump — fires when DOC_DETECTIVE_DEBUG is truthy. The
  // env-var path intentionally does NOT enable --include-env; users
  // who want the full process.env must run `doc-detective debug
  // --include-env` explicitly. (There is no config-file equivalent —
  // the `debug` config field is deprecated and ignored; diagnostics live
  // behind this env var and the `debug` subcommand.)
  if (debugRequested) {
    await printDebug({
      config,
      configPath,
      configError: null,
      outDir: defaultDebugDir(),
      args,
    });
    return;
  }

  log(
    `CLI:VERSION INFO:\n${JSON.stringify(getVersionData(), null, 2)}`,
    "debug",
    config
  );
  log(`CLI:CONFIG:\n${JSON.stringify(config, null, 2)}`, "debug", config);

  // Self-update on startup. Honors config.autoUpdate (schema default true),
  // DOC_DETECTIVE_SKIP_AUTO_UPDATE=1 (set by the re-execed child to prevent
  // loops, and by Docker images), and process.env.CI (CI environments
  // should pin their version explicitly — surprise updates in CI are bad).
  /* c8 ignore start - every hermetic test run sets CI=1 (or
   * DOC_DETECTIVE_SKIP_AUTO_UPDATE=1) precisely so this block is skipped;
   * entering it for real hits the npm registry via checkForUpdate()/
   * selfUpdate() (src/runtime/selfUpdate.ts), which is a real network call
   * with no seam exposed at this call site (this file never injects
   * selfUpdate.ts's own `deps.http`/`deps.spawn`). */
  if (
    config.autoUpdate !== false &&
    !process.env.DOC_DETECTIVE_SKIP_AUTO_UPDATE &&
    !process.env.CI
  ) {
    try {
      const { checkForUpdate, detectInstallMode, selfUpdate } = await import(
        "./runtime/selfUpdate.js"
      );
      const currentVersion: string = cliRequire("../package.json").version;
      // Route the self-update module's logs through the CLI's existing
      // log() helper so config.logLevel is respected (transient registry
      // failures should not flood stdout at the default level). Map
      // "warn" → "warning" since core/utils.ts uses the latter.
      const cliLogger = (msg: string, level: string = "info") => {
        const mapped = level === "warn" ? "warning" : level;
        log(msg, mapped, config);
      };
      const { latest, newer } = await checkForUpdate(currentVersion, {
        logger: cliLogger,
      });
      if (newer && latest) {
        await selfUpdate(latest, detectInstallMode(), { logger: cliLogger });
      }
    } catch (err) {
      log(`Self-update check skipped: ${String(err)}`, "debug", config);
    }
  }
  /* c8 ignore stop */

  // Check for DOC_DETECTIVE_API environment variable
  const api = await getResolvedTestsFromEnv(config);
  const resolvedTests = api?.resolvedTests || null;
  const apiConfig = api?.apiConfig || null;

  // Run tests
  const output = config.output;
  const results = resolvedTests
    ? await runTests(config, { resolvedTests })
    : await runTests(config);

  // Dry-run already emitted the resolved-tests JSON inside runTests().
  // Skip both reporters (which assume executed-result shape) and the
  // orchestration-API report-back path.
  if (config.dryRun) {
    return;
  }

  if (apiConfig) {
    /* c8 ignore start - only reached when DOC_DETECTIVE_API is set;
     * reportResults() (src/utils.ts) makes a real HTTP call to the
     * orchestration API with no injectable client seam at this call site. */
    await reportResults({ apiConfig, results });
    /* c8 ignore stop */
  } else {
    // Output results — config.reporters (populated from args.reporters by
    // setConfig) is the source of truth for which reporters run.
    await outputResults(config, output, results, { command: "runTests" });
    // Optionally print one contextual hint after the reporters finish.
    // Wrapped in its own try/catch internally — never throws.
    await maybeShowHint(config, results);
  }
}
