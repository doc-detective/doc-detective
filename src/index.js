#!/usr/bin/env node

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

// Run
async function main(argv) {
  // Find index of `doc-detective` or `run` in argv
  const index = argv.findIndex(
    (arg) => arg.endsWith("doc-detective") || arg.endsWith("index.js")
  );
  // Set args
  argv = setArgs(argv);

  // Get .doc-detective JSON or YAML config, if it exists, preferring a config arg if provided
  const configPathJSON = path.resolve(process.cwd(), ".doc-detective.json");
  const configPathYAML = path.resolve(process.cwd(), ".doc-detective.yaml");
  const configPathYML = path.resolve(process.cwd(), ".doc-detective.yml");
  const configPath = fs.existsSync(argv.config)
    ? argv.config
    : fs.existsSync(configPathJSON)
    ? configPathJSON
    : fs.existsSync(configPathYAML)
    ? configPathYAML
    : fs.existsSync(configPathYML)
    ? configPathYML
    : null;

  // Set config
  const config = await setConfig({ configPath: configPath, args: argv });

  log(
    `CLI:VERSION INFO:\n${JSON.stringify(getVersionData(), null, 2)}`,
    "debug",
    config
  );
  log(`CLI:CONFIG:\n${JSON.stringify(config, null, 2)}`, "debug", config);

  // Check for DOC_DETECTIVE_API environment variable
  let api = await getResolvedTestsFromEnv(config);
  let resolvedTests = api?.resolvedTests || null;
  let apiConfig = api?.apiConfig || null;

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
