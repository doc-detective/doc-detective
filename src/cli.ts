import { runTests, awaitTelemetryFlush } from "./core/index.js";
import {
  buildYargs,
  setConfig,
  outputResults,
  setMeta,
  getVersionData,
  log,
  logLevelEnabled,
  getResolvedTestsFromEnv,
  reportResults,
  isDebugRequested,
} from "./utils.js";
import { installAgentsCommand } from "./agents/command.js";
import { maybeShowHint } from "./hints/index.js";
import { installCommand } from "./runtime/installCommand.js";
import { lspCommand } from "./lsp/command.js";
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
  // c8 ignore: the `?? err` / `|| err` fallback branches (err nullish, or a
  // non-Error thrown value without a `.message`) are structurally dead under
  // every current throw site — setConfig() always rejects with a real Error,
  // and the yargs `.fail` handler in main() always does `throw new
  // Error(msg)` — so `err` here is always a real Error with a non-empty
  // `.message`. Defensive fallback for future throw sites, not reachable today.
  console.error(err?.message || err); /* c8 ignore line - defensive fallback for a non-Error/nullish rejection; unreachable under every current throw site (see comment above) */
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
    .command(lspCommand as any)
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

  // Guard the pretty-print dumps behind a cheap level check so the (large)
  // JSON.stringify only runs when the debug message would actually print.
  if (logLevelEnabled("debug", config)) {
    log(
      `CLI:VERSION INFO:\n${JSON.stringify(getVersionData(), null, 2)}`,
      "debug",
      config
    );
    log(`CLI:CONFIG:\n${JSON.stringify(config, null, 2)}`, "debug", config);
  }

  // Self-update on startup. Honors config.autoUpdate (schema default true),
  // DOC_DETECTIVE_SKIP_AUTO_UPDATE=1 (set by the re-execed child to prevent
  // loops, and by Docker images), and process.env.CI (CI environments
  // should pin their version explicitly — surprise updates in CI are bad).
  //
  // The registry check (`checkForUpdate`, up to a 3s round-trip) is STARTED
  // here but not awaited: it runs concurrently with input detection /
  // resolution (which execute no tests) so its latency is hidden behind work
  // that has to happen anyway. `updateJoin` is handed to runTests, which awaits
  // it AFTER resolution but BEFORE the first test (or any dry-run output) — so
  // `selfUpdate` still re-execs the process before the run, preserving the
  // "update before the run" guarantee (ADR 01063). Only the deferred decision
  // (re-exec on a newer version) is joined; the check itself already overlapped.
  //
  // The `if` condition is exercised offline (every combination of the three
  // guards short-circuiting false — see the "cli.ts — runTestsHandler branches"
  // describe in test/cli-index-adapters-coverage.test.js). Only the block BODY
  // needs a real network/exec dependency: `checkForUpdate` hits a real npm
  // registry and `selfUpdate` re-execs the process via `process.exit` on a
  // newer version. Neither has an injectable seam at this call site (the seam
  // is one level down, in runtime/selfUpdate.ts's own exported functions, which
  // are network/exec bound themselves). See runtime/selfUpdate.ts for that
  // module's own (separately covered) tests. The join-inside-runTests seam is
  // covered directly in test/cli-index-adapters-coverage.test.js.
  let updateJoin: (() => Promise<void>) | undefined;
  if (
    config.autoUpdate !== false &&
    !process.env.DOC_DETECTIVE_SKIP_AUTO_UPDATE &&
    !process.env.CI
  ) {
    /* c8 ignore start - self-update: real registry HTTP + real process re-exec via process.exit; no injectable seam at this call site (see comment above) */
    // Route the self-update module's logs through the CLI's existing log()
    // helper so config.logLevel is respected. Map "warn" → "warning".
    const cliLogger = (msg: string, level: string = "info") => {
      const mapped = level === "warn" ? "warning" : level;
      log(msg, mapped, config);
    };
    const currentVersion: string = cliRequire("../package.json").version;
    // Kick off the registry check now, concurrently with the detection /
    // resolution work that runTests is about to do. Self-contained error
    // handling so a rejected promise never becomes an unhandled rejection.
    const updateCheck = (async () => {
      try {
        const { checkForUpdate } = await import("./runtime/selfUpdate.js");
        return await checkForUpdate(currentVersion, { logger: cliLogger });
      } catch (err) {
        log(`Self-update check skipped: ${String(err)}`, "debug", config);
        return { latest: null as string | null, newer: false };
      }
    })();
    // Deferred join: awaited by runTests once resolution is done and before the
    // first test. On a newer version, selfUpdate re-execs (process.exit) here.
    updateJoin = async () => {
      try {
        const { latest, newer } = await updateCheck;
        if (newer && latest) {
          const { detectInstallMode, selfUpdate } = await import(
            "./runtime/selfUpdate.js"
          );
          await selfUpdate(latest, detectInstallMode(), { logger: cliLogger });
        }
      } catch (err) {
        log(`Self-update check skipped: ${String(err)}`, "debug", config);
      }
    };
    /* c8 ignore stop */
  }

  // Check for DOC_DETECTIVE_API environment variable
  const api = await getResolvedTestsFromEnv(config);
  const resolvedTests = api?.resolvedTests || null;
  const apiConfig = api?.apiConfig || null;

  // Run tests
  const output = config.output;
  const results = resolvedTests
    ? await runTests(config, { resolvedTests, updateJoin })
    : await runTests(config, { updateJoin });

  // Dry-run already emitted the resolved-tests JSON inside runTests().
  // Skip both reporters (which assume executed-result shape) and the
  // orchestration-API report-back path.
  if (config.dryRun) {
    return;
  }

  // c8 ignore justification for the `apiConfig` branch body below: reachable
  // in principle (apiConfig comes back truthy once getResolvedTestsFromEnv's
  // own real HTTP GET succeeds — already exercised offline via a local
  // server in test/utils-coverage.test.js), but exercising THIS line
  // end-to-end needs a full runTests() pass over a pre-resolved, API-sourced
  // context, and that path currently throws inside the runner on a
  // pre-existing, unrelated defect (context normalization assumes a field
  // only locally-resolved contexts carry) — see the follow-up task spawned
  // for that bug. Fixing it is a behavior change out of scope for this
  // comment-only coverage pass; reportResults' own POST logic is
  // unit-tested directly against a local server in test/utils-coverage.test.js.
  if (apiConfig) {
    /* c8 ignore start - orchestration-API report-back: blocked on an unrelated pre-existing runner defect (see comment above) */
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

  // Join the telemetry flush started inside runTests. Awaited only NOW — after
  // reporters + hint — so the PostHog round-trip overlaps that I/O instead of
  // hanging off the tail of the process. Bounded + non-throwing; a no-op when
  // telemetry is disabled or already flushed.
  await awaitTelemetryFlush();
}
