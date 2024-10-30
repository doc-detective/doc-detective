#!/usr/bin/env node

const { runTests, runCoverage } = require("doc-detective-core");
const { setArgs, setConfig, outputResults, setMeta } = require("./utils");
const { argv } = require("node:process");
const path = require("path");
const fs = require("fs");
const prompt = require("prompt-sync")();
const { checkForUpdates } = require('./updateChecker');

function complete(commands) {
  return function (str) {
    var i;
    var ret = [];
    for (i = 0; i < commands.length; i++) {
      if (commands[i].indexOf(str) == 0) ret.push(commands[i]);
    }
    return ret;
  };
}

// Run
setMeta();
main(argv);

// Run
async function main(argv) {
  // Find index of `doc-detective` or `run` in argv
  const index = argv.findIndex(
    (arg) => arg.endsWith("doc-detective") || arg.endsWith("index.js")
  );
  // `command` is the next argument after `doc-detective` or `src/index.js`
  let command = argv[index + 1];
  // Set args
  argv = setArgs(argv);
  // Get .doc-detective.json config, if it exists
  const configPath = path.resolve(process.cwd(), ".doc-detective.json");
  let config = {};
  if (fs.existsSync(configPath)) {
    config = require(configPath);
  }
  // Set config
  config = await setConfig(config, argv);
  command = command || config.defaultCommand;
  // If no command, prompt user to select a command
  if (command !== "runTests" && command !== "runCoverage") {
    const ask = `
  Welcome to Doc Detective. Choose a command:
  - 'runTests' - Run tests defined in specifications and documentation source files.
  - 'runCoverage' - Calculate test coverage of doc content.
  
  You can skip this next time by running 'npx doc-detective <command>'. You can also set 'defaultCommand' in your .doc-detective.json config file.
  
  For more info, visit https://doc-detective.com.
  
  Command: `;
    command = prompt({
      ask,
      value: "runTests",
      autocomplete: complete(["runTests", "runCoverage"]),
    });
  }

  // Run command
  let results = {};
  let output;
  if (command === "runCoverage") {
    output = config?.runCoverage?.output || config.output;
    results = await runCoverage(config);
  } else if (command === "runTests") {
    output = config?.runTests?.output || config.output;
    results = await runTests(config);
  } else {
    console.error(`Sorry, that's not a recognized command. Please try again.`);
    process.exit(1);
  }

  // Output results
  await outputResults(config, output, results, { command });

  // Check for updates
  // Get doc-detective tag from command, if any
  // For example, from `npx doc-detective@next runTests`, get `next`
  const tag = argv[1]?.split("@")[1] || "latest";
  await checkForUpdates({ autoInstall: false, tag });
}
