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
const { validate } = require("doc-detective-common");
const { detectTests } = require("doc-detective-resolver");
const yaml = require("js-yaml");

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
    
    // Extract input file paths from args (everything that's not a flag or flag value)
    const inputPaths = [];
    for (let i = 0; i < rawArgs.length; i++) {
      const arg = rawArgs[i];
      // Skip flags and their values
      if (arg === '--editor' || arg === '-e') continue;
      if (arg === '--input' || arg === '-i') {
        // Next arg is the input value
        if (i + 1 < rawArgs.length) {
          const inputValue = rawArgs[i + 1];
          // Handle comma-separated inputs
          inputValue.split(',').forEach(f => {
            const trimmed = f.trim();
            if (trimmed) inputPaths.push(path.resolve(trimmed));
          });
          i++; // Skip the value
        }
        continue;
      }
      // Handle --input=value format
      if (arg.startsWith('--input=') || arg.startsWith('-i=')) {
        const inputValue = arg.split('=')[1];
        inputValue.split(',').forEach(f => {
          const trimmed = f.trim();
          if (trimmed) inputPaths.push(path.resolve(trimmed));
        });
        continue;
      }
      // Skip other flags
      if (arg.startsWith('-')) continue;
      // Assume it's an input path if it exists
      const resolved = path.resolve(arg);
      if (fs.existsSync(resolved)) {
        inputPaths.push(resolved);
      }
    }
    
    // Use doc-detective-resolver to detect specs from input paths
    const specs = [];
    
    if (inputPaths.length > 0) {
      // Build config for resolver with all input paths
      const resolverConfig = {
        input: inputPaths,
        logLevel: 'silent', // Suppress resolver logging for editor mode
      };
      
      try {
        const detectedSpecs = await detectTests({ config: resolverConfig });
        
        if (detectedSpecs && detectedSpecs.length > 0) {
          // Convert detected specs to the format expected by the builder
          for (const detectedSpec of detectedSpecs) {
            const filePath = detectedSpec.contentPath || null;
            const ext = filePath ? path.extname(filePath).toLowerCase() : '.json';
            
            // detectedSpec is already a valid spec_v3 object from detectTests
            const spec = { ...detectedSpec };
            
            specs.push({
              spec,
              filePath,
              extension: ext,
              isValid: true, // detectTests only returns valid specs
              validationErrors: null,
            });
          }
        }
      } catch (err) {
        console.error(`\x1b[31mError detecting specs: ${err.message}\x1b[0m`);
      }
      
      // If input paths were specified but no specs were detected, exit with error
      if (specs.length === 0) {
        console.error('\x1b[31mError: No valid spec files could be detected from the provided inputs.\x1b[0m');
        process.exit(1);
      }
    }
    
    // Dynamically import the builder to avoid ESM issues at startup
    const { runBuilder } = require("./cli/builder");
    
    // Run the interactive builder with loaded specs
    await runBuilder({ outputDir, specs });
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
