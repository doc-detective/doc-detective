#!/usr/bin/env node

const {
  setArgs,
  setConfig,
  outputResults,
  setMeta,
  getVersionData,
  log,
  getResolvedTestsFromEnv,
  reportResults,
} = require("./utils");
const { argv } = require("node:process");
const path = require("path");
const fs = require("fs");

// Run
setMeta();
main(argv);

// Run
async function main(argv) {
  // Check for --editor flag first (before processing other args)
  const rawArgs = argv.slice(2); // Remove 'node' and script path
  if (rawArgs.includes('--editor') || rawArgs.includes('-e')) {
    // Parse editor-specific options
    const outputDir = process.cwd();
    
    // Dynamically import the builder to avoid ESM issues at startup
    const { runBuilder } = require("./cli/builder");
    
    // Run the interactive builder
    await runBuilder({ outputDir });
    return;
  }

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

  // Run tests with the new Ink-based UI
  // Dynamically import to avoid ESM issues at startup
  const { runWithUI } = require("./cli/runner");
  const output = config.output;
  const results = await runWithUI(config, { resolvedTests });

  if (apiConfig) {
    await reportResults({ apiConfig, results });
  } else {
    // Output results to JSON file only (terminal output is handled by Ink UI)
    await outputResults(config, output, results, { 
      command: "runTests",
      reporters: ["json"] // Only use JSON reporter, not terminal reporter
    });
  }
}
