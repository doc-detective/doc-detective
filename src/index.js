#!/usr/bin/env node

const { runTests, runCoverage } = require("doc-detective-core");
const { setArgs, setConfig, outputResults, setMeta, getVersionData, log } = require("./utils");
const { argv } = require("node:process");
const path = require("path");
const fs = require("fs");

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

  if (config.logLevel === "debug") {
    console.log(`CLI:VERSION INFO:\n${JSON.stringify(getVersionData(), null, 2)}`);
    console.log(`CLI:CONFIG:\n${JSON.stringify(config, null, 2)}`);
  }

  // Run tests
  const output = config.output;
  const results = await runTests(config);

  // Output results
  await outputResults(config, output, results, { command: "runTests" });

}