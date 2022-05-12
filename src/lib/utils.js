const yargs = require("yargs/yargs");
const { hideBin } = require("yargs/helpers");
const fs = require("fs");
const { exit } = require("process");
const path = require("path");

exports.setArgs = setArgs;
exports.setConfig = setConfig;
exports.setFiles = setFiles;
exports.outputResults = outputResults;

// Define args
function setArgs(args) {
  let argv = yargs(hideBin(args))
    .option("config", {
      alias: "c",
      description: "Path to a custom config file.",
      type: "string",
    })
    .option("testFile", {
      alias: "f",
      description: "Path to a file to parse for tests.",
      type: "string",
    })
    .option("testDir", {
      alias: "d",
      description: "Path to a ditectory of files to parse for tests.",
      type: "string",
    })
    .option("inputPath", {
      alias: "i",
      description: "Path to a JSON file of tests definitions.",
      type: "string",
    })
    .option("outputPath", {
      alias: "o",
      description: "Path for a JSON file of test result output.",
      type: "string",
    })
    .option("recursive", {
      alias: "r",
      description: "Recursively find test files in the test directory.",
      type: "string",
    })
    .option("ext", {
      alias: "e",
      description:
        "Comma-separated list of file extensions to test, including the leading period",
      type: "string",
    })
    .option("imageDir", {
      description: "Path to image output directory",
      type: "string",
    })
    .option("videoDir", {
      description: "Path to video output directory",
      type: "string",
    })
    .help()
    .alias("help", "h").argv;

  return argv;
}

function setConfig(config, argv) {
  // Set config overrides from args
  if (argv.config) config = JSON.parse(fs.readFileSync(argv.config));
  if (argv.inputPath) config.inputPath = path.resolve(argv.inputPath);
  if (argv.outputPath) config.outputPath = path.resolve(argv.outputPath);
  if (argv.testFile) config.testFile = path.resolve(argv.testFile);
  if (argv.testDir) config.testDirectory = path.resolve(argv.testDir);
  if (argv.imageDir) config.imageDirectory = path.resolve(argv.imageDir);
  if (argv.videoDir) config.videoDirectory = path.resolve(argv.videoDir);
  if (argv.recursive) {
    switch (argv.recursive) {
      case "true":
        config.recursive = true;
        break;
      case "false":
        config.recursive = false;
        break;
    }
  }
  if (argv.ext) config.testExtensions = argv.ext.replace(/\s+/g, "").split(",");
  return config;
}

// Set array of test files
function setFiles(config) {
  let dirs = [];
  let files = [];
  if (config.testFile) {
    // if single file specified
    let file = path.resolve(config.testFile);
    if (fs.statSync(file).isFile()) {
      files[0] = file;
    } else {
      console.log("Error: Specified path isn't a valid file.");
      exit(1);
    }
  } else {
    // Load files from drectory
    dirs[0] = config.testDirectory;
    for (let i = 0; i < dirs.length; i++) {
      fs.readdirSync(dirs[i]).forEach((object) => {
        let content = path.resolve(dirs[i] + "/" + object);
        if (fs.statSync(content).isFile()) {
          // is a file
          if (
            // No specified extension filter list, or file extension is present in extension filter list.
            config.testExtensions === "" ||
            config.testExtensions.includes(path.extname(content))
          ) {
            files.push(content);
          }
        } else if (fs.statSync(content).isDirectory) {
          // is a directory
          if (config.recursive) {
            // recursive set to true
            dirs.push(content);
          }
        } else {
          console.log(
            "Error: " + content + " isn't a valid file or directory."
          );
          exit(1);
        }
      });
    }
  }
  return files;
}

async function outputResults(config, results) {
  let data = JSON.stringify(results, null, 2);
  fs.writeFile(config.outputPath, data, (err) => {
    if (err) throw err;
    console.log("The file has been saved!");
  });
}
