import { runTests } from "./core/index.js";
import {
  setArgs,
  setConfig,
  outputResults,
  setMeta,
  getVersionData,
  log,
  getResolvedTestsFromEnv,
  reportResults,
} from "./utils.js";
import { argv } from "node:process";
import path from "node:path";
import fs from "node:fs";

// Run
setMeta();
main(argv);

/**
 * Orchestrates CLI execution: resolves configuration, runs tests, and emits or reports results.
 *
 * Loads CLI arguments, determines the configuration file (preferring an explicit `--config` argument then
 * local `.doc-detective` JSON/YAML files), builds the runtime configuration, logs version and config data,
 * resolves any environment-provided test definitions, executes the test run, and either reports results to an API
 * or writes output according to the loaded configuration.
 *
 * @param argv - Command-line arguments to parse (typically `process.argv`)
 */
async function main(argv: string[]) {
  // Find index of `doc-detective` or `run` in argv
  const index = argv.findIndex(
    (arg) => arg.endsWith("doc-detective") || arg.endsWith("index.js")
  );
  // Set args
  const args: any = setArgs(argv);

  // Get .doc-detective JSON or YAML config, if it exists, preferring a config arg if provided
  const configPathJSON = path.resolve(process.cwd(), ".doc-detective.json");
  const configPathYAML = path.resolve(process.cwd(), ".doc-detective.yaml");
  const configPathYML = path.resolve(process.cwd(), ".doc-detective.yml");
  const configPath = fs.existsSync(args.config)
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
    // Output results
    await outputResults(config, output, results, { command: "runTests" });
  }
}