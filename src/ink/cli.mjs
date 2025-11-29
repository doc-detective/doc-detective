#!/usr/bin/env node

/**
 * Doc Detective CLI - Ink-based Interactive CLI
 * 
 * This is a modern, interactive CLI built with Ink (React for command-line).
 * It demonstrates best practices for building CLI applications including:
 * - React-based component architecture
 * - Importing components from external libraries (ink-spinner)
 * - Proper argument parsing
 * - Clean separation of concerns
 * 
 * Usage:
 *   node src/ink/cli.mjs [options]
 *   node src/ink/cli.mjs --help
 */

import { render } from 'ink';
import React, { createElement } from 'react';
import { parseArgs } from 'node:util';
import { resolve, dirname } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import App from './App.mjs';

const h = createElement;

// Parse command line arguments
const options = {
  config: {
    type: 'string',
    short: 'c',
  },
  input: {
    type: 'string',
    short: 'i',
  },
  output: {
    type: 'string',
    short: 'o',
  },
  logLevel: {
    type: 'string',
    short: 'l',
  },
  'allow-unsafe': {
    type: 'boolean',
  },
  help: {
    type: 'boolean',
    short: 'h',
  },
  version: {
    type: 'boolean',
    short: 'v',
  },
};

/**
 * Display help message
 */
function showHelp() {
  console.log(`
📋 Doc Detective - Interactive CLI

Usage: doc-detective [options]

Options:
  -c, --config <path>     Path to a config.json or config.yaml file
  -i, --input <path>      Path to test specifications and documentation source files
  -o, --output <path>     Path of the directory for storing output
  -l, --logLevel <level>  Log level: silent, error, warning, info, debug
      --allow-unsafe      Allow execution of potentially unsafe tests
  -h, --help              Display this help message
  -v, --version           Display version information

Examples:
  doc-detective
  doc-detective -i ./docs -o ./results
  doc-detective -c ./my-config.json
  doc-detective --logLevel debug

For more information, visit: https://doc-detective.com
`);
}

/**
 * Display version information
 */
function showVersion() {
  try {
    // Use fileURLToPath and dirname for robust path resolution in ESM
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const packagePath = resolve(currentDir, '../../package.json');
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));
    console.log(`Doc Detective v${packageJson.version}`);
  } catch {
    console.log('Doc Detective (version unknown)');
  }
}

/**
 * Load and merge configuration from file and CLI arguments
 */
async function loadConfig(args) {
  let config = {};
  
  // Find config file
  const cwd = process.cwd();
  const configPaths = [
    args.config,
    resolve(cwd, '.doc-detective.json'),
    resolve(cwd, '.doc-detective.yaml'),
    resolve(cwd, '.doc-detective.yml'),
  ].filter(Boolean);
  
  let configPath = null;
  for (const path of configPaths) {
    if (path && existsSync(path)) {
      configPath = path;
      break;
    }
  }
  
  // Load config file if found
  if (configPath) {
    try {
      const { readFile } = await import('doc-detective-common');
      config = await readFile({ fileURLOrPath: configPath });
      config.configPath = configPath;
    } catch (error) {
      console.error(`Error reading config file at ${configPath}: ${error.message}`);
      process.exit(1);
    }
  }
  
  // Check for DOC_DETECTIVE_CONFIG environment variable
  if (process.env.DOC_DETECTIVE_CONFIG) {
    try {
      const envConfig = JSON.parse(process.env.DOC_DETECTIVE_CONFIG);
      config = { ...config, ...envConfig };
    } catch (error) {
      console.error(`Error parsing DOC_DETECTIVE_CONFIG: ${error.message}`);
      process.exit(1);
    }
  }
  
  // Apply CLI argument overrides
  if (args.input) {
    const inputs = args.input.split(',').map(item => {
      const trimmed = item.trim();
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        return trimmed;
      }
      return resolve(trimmed);
    });
    config.input = inputs;
  }
  
  if (args.output) {
    config.output = resolve(args.output);
  }
  
  if (args.logLevel) {
    config.logLevel = args.logLevel;
  }
  
  if (args['allow-unsafe']) {
    config.allowUnsafeSteps = true;
  }
  
  // Set defaults
  config = {
    input: config.input || '.',
    output: config.output || '.',
    recursive: config.recursive ?? true,
    relativePathBase: config.relativePathBase || 'file',
    loadVariables: config.loadVariables || '.env',
    detectSteps: config.detectSteps ?? true,
    logLevel: config.logLevel || 'info',
    fileTypes: config.fileTypes || ['markdown', 'asciidoc', 'html'],
    telemetry: config.telemetry || { send: true },
    ...config,
  };
  
  // Validate config using doc-detective-common
  try {
    const { validate, resolvePaths } = await import('doc-detective-common');
    
    const validation = validate({
      schemaKey: 'config_v3',
      object: config,
    });
    
    if (!validation.valid) {
      console.error('Invalid config:', validation.errors);
      process.exit(1);
    }
    
    config = validation.object;
    
    // Resolve paths
    config = await resolvePaths({
      config: config,
      object: config,
      filePath: configPath || '.',
      nested: false,
      objectType: 'config',
    });
  } catch (error) {
    // If validation fails, proceed with current config
    console.warn('Warning: Could not validate config:', error.message);
  }
  
  return config;
}

/**
 * Handle test completion and output results
 */
async function handleComplete(results, error, config) {
  if (error) {
    process.exit(1);
  }
  
  if (results) {
    // Output results to file
    const outputPath = config.output || '.';
    const outputFile = resolve(outputPath, `testResults-${Date.now()}.json`);
    
    try {
      // Ensure output directory exists
      const dir = dirname(outputFile);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      
      writeFileSync(outputFile, JSON.stringify(results, null, 2));
      console.log(`\nResults saved to: ${outputFile}`);
    } catch (error) {
      console.error(`Error writing results: ${error.message}`);
    }
    
    // Exit with appropriate code based on results
    const hasFailures = results.summary && (
      (results.summary.specs && results.summary.specs.fail > 0) ||
      (results.summary.tests && results.summary.tests.fail > 0) ||
      (results.summary.contexts && results.summary.contexts.fail > 0) ||
      (results.summary.steps && results.summary.steps.fail > 0)
    );
    
    process.exit(hasFailures ? 1 : 0);
  }
}

/**
 * Main entry point
 */
async function main() {
  let args;
  
  try {
    const { values } = parseArgs({
      options,
      allowPositionals: true,
    });
    args = values;
  } catch (error) {
    console.error(`Error parsing arguments: ${error.message}`);
    showHelp();
    process.exit(1);
  }
  
  // Handle help and version flags
  if (args.help) {
    showHelp();
    process.exit(0);
  }
  
  if (args.version) {
    showVersion();
    process.exit(0);
  }
  
  // Load configuration
  const config = await loadConfig(args);
  
  // Render the Ink app
  const { waitUntilExit } = render(
    h(App, { 
      config: config, 
      onComplete: (results, error) => handleComplete(results, error, config)
    })
  );
  
  await waitUntilExit();
}

// Run the CLI
main().catch(error => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
