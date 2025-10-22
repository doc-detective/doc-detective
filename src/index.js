#!/usr/bin/env node

const { runTests, runCoverage } = require("doc-detective-core");
const { setArgs, setConfig, outputResults, setMeta, getVersionData } = require("./utils");
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

  // Check for DOC_DETECTIVE_TESTS environment variable
  let resolvedTests = null;
  if (process.env.DOC_DETECTIVE_TESTS) {
    try {
      // Parse the environment variable as JSON
      resolvedTests = JSON.parse(process.env.DOC_DETECTIVE_TESTS);
      
      // Validate against resolvedTests_v3 schema
      const { validate } = require("doc-detective-common");
      const validation = validate({
        schemaKey: "resolvedTests_v3",
        object: resolvedTests,
      });
      
      if (!validation.valid) {
        console.error("Invalid resolvedTests from DOC_DETECTIVE_TESTS environment variable.", validation.errors);
        process.exit(1);
      }
      
      // Apply config overrides from DOC_DETECTIVE_CONFIG to resolvedTests.config
      if (resolvedTests.config) {
        // Merge the current config into resolvedTests.config
        resolvedTests.config = { ...resolvedTests.config, ...config };
      } else {
        resolvedTests.config = config;
      }
      
      if (config.logLevel === "debug") {
        console.log(`CLI:RESOLVED_TESTS:\n${JSON.stringify(resolvedTests, null, 2)}`);
      }
    } catch (error) {
      console.error(`Error parsing DOC_DETECTIVE_TESTS environment variable: ${error.message}`);
      process.exit(1);
    }
  }

  // Run tests
  const output = config.output;
  const results = resolvedTests 
    ? await runTests(config, { resolvedTests: resolvedTests })
    : await runTests(config);

  // Output results
  await outputResults(config, output, results, { command: "runTests" });

}