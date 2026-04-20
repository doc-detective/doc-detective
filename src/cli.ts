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
} from "./utils.js";
import { installAgentsCommand } from "./agents/command.js";
import { argv as processArgv } from "node:process";
import path from "node:path";
import fs from "node:fs";

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
    .command(installAgentsCommand)
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
  // Guard `args.config` so the handler falls back to the defaults cleanly
  // when --config is omitted (args.config is undefined in that case).
  const hasExplicitConfig =
    typeof args.config === "string" && args.config.length > 0 && fs.existsSync(args.config);
  const configPath = hasExplicitConfig
    ? args.config
    : fs.existsSync(configPathJSON)
    ? configPathJSON
    : fs.existsSync(configPathYAML)
    ? configPathYAML
    : fs.existsSync(configPathYML)
    ? configPathYML
    : null;

  // Set config
  const config: any = await setConfig({ configPath: configPath, args: args });

  log(
    `CLI:VERSION INFO:\n${JSON.stringify(getVersionData(), null, 2)}`,
    "debug",
    config
  );
  log(`CLI:CONFIG:\n${JSON.stringify(config, null, 2)}`, "debug", config);

  // Check for DOC_DETECTIVE_API environment variable
  const api = await getResolvedTestsFromEnv(config);
  const resolvedTests = api?.resolvedTests || null;
  const apiConfig = api?.apiConfig || null;

  // Run tests
  const output = config.output;
  const results = resolvedTests
    ? await runTests(config, { resolvedTests })
    : await runTests(config);

  if (apiConfig) {
    await reportResults({ apiConfig, results });
  } else {
    // Output results — config.reporters (populated from args.reporters by
    // setConfig) is the source of truth for which reporters run.
    await outputResults(config, output, results, { command: "runTests" });
  }
}
