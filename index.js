const uuid = require("uuid");
const puppeteer = require("puppeteer");
const { PuppeteerScreenRecorder } = require("puppeteer-screen-recorder");
const nReadlines = require("n-readlines");
const path = require("path");
const yargs = require("yargs/yargs");
const { hideBin } = require("yargs/helpers");
const fs = require("fs");
const { exit } = require("process");

const debug = true;

// Set args
let argv = setArgs(process.argv);
if (debug) {
  console.log("ARGV:");
  console.log(argv);
}

// Set config
let config = setConfig(require("./config.json"), argv);
if (debug) {
  console.log("CONFIG:");
  console.log(config);
}

// Set files
let files = setFiles(config);
if (debug) {
  console.log("FILES:");
  console.log(files);
}

// Set tests
let tests = setTests(files);
if (debug) {
  console.log("TESTS:");
  console.log(tests);
}

// Run tests
let results = runTests(tests);

// Output test results
console.log(results);
exit();

function runTests(tests) {
  let results = [];
  
  return results;
}

// Parse files for tests
function setTests(files) {
  let tests = [];

  // Loop through test files
  files.forEach((file) => {
    let testJson = {
      id: uuid.v4(),
      file: file,
      actions: [],
    };
    let line;
    let lineNumber = 1;
    let inputFile = new nReadlines(file);
    let extension = path.extname(file);
    let fileType = config.fileTypes.find((fileType) =>
      fileType.extensions.includes(extension)
    );

    // Loop through lines
    while ((line = inputFile.next())) {
      // TODO figure out how to handle closeTestStatement when empty
      if (line.includes(fileType.openTestStatement)) {
        let lineAscii = line.toString("ascii");
        let regexOpen = new RegExp(fileType.openTestStatement, "g");
        let lineJson = JSON.parse(lineAscii.replace(regexOpen, ""));
        lineJson.line = lineNumber;
        testJson.actions.push(lineJson);
      }
      lineNumber++;
    }
    if (testJson.actions.length > 0) {
      tests.push(testJson);
    }
  });

  return tests;
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

// Define args
function setArgs(args) {
  let argv = yargs(hideBin(args))
    .option("config", {
      alias: "c",
      description: "Path to a custom config file",
      type: "string",
    })
    .option("testFile", {
      alias: "f",
      description: "Path to a test",
      type: "string",
    })
    .option("testDir", {
      alias: "d",
      description: "Path to a ditectory of tests",
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
      alias: "i",
      description: "Path to image output directory",
      type: "string",
    })
    .option("videoDir", {
      alias: "v",
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

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  const recorder = new PuppeteerScreenRecorder(page);
  // await recorder.start("./demo.mp4");
  await page.goto("https://www.google.com");
  await page.screenshot({ path: "1.png" });
  await page.goto("https://www.bing.com");
  // await page.screenshot({ path: "2.png" });
  // await recorder.stop();
  await browser.close();
})();
