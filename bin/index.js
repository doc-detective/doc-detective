#!/usr/bin/env node

const { Builder, By, Key, until } = require("selenium-webdriver");
const chrome = require("selenium-webdriver/chrome");
const nReadlines = require("n-readlines");
const path = require("path");
const yargs = require("yargs/yargs");
const { hideBin } = require("yargs/helpers");
const fs = require("fs");
const { exit } = require("process");

let config = require("./config.json");
const { dir } = require("console");
let dirs = [];
let files = [];
let tests = [];

// Define args
const argv = yargs(hideBin(process.argv))
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

// Set config overrides from args
if (argv.config) config = JSON.parse(fs.readFileSync(argv.config));
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
if (argv.ext) config.testExtensions = argv.ext.split(",");

console.log(config.recursive);
// Set array of test files
if (argv.testFile) {
  // if single file specified from -f flag
  let file = path.resolve(argv.testFile);
  // TODO: Valid file validation
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
      console.log(content);
      if (fs.statSync(content).isFile()) {
        // is a file
        if (
          // No specified extensions, or file extension is present in extensions list.
          config.testExtensions === "" ||
          config.testExtensions.includes(path.extname(content))
        ) {
          files.push(content);
        }
      } else if (fs.statSync(content).isDirectory) {
        // is a directory, and recursive is set to true
        if (config.recursive) {
          dirs.push(content);
        }
      } else {
        console.log("Error: " + content + " isn't a valid file or directory.");
        exit(1);
      }
    });
  }
}
// Loop through test files
files.forEach((file) => {
  console.log(file);
  // Loop through lines in file

  // Detect test params

  // Convert to Selenium commands + add to array

  // End line loop
});
exit();

// Loop through selenium commands

// Execute commands

// Log results to array
/*
{
  "file": "",
  "line": "",
  "test": object,
  "status": PASS/WARNING/FAIL,
  "description": "",
  "image": "",
  "video": ""
}
*/

// End Selenium loop

// Output results

async function parseOpenTest(args, file, line) {}

async function testReadLines(file) {
  let inputFile = new nReadlines(file);
  let line;
  let lineNumber = 1;

  while ((line = inputFile.next())) {
    console.log(`Line ${lineNumber} has: ${line.toString("ascii")}`);
    lineNumber++;
  }

  console.log("end of file.");
}

async function testSelenium() {
  let options = new chrome.Options();
  let driver = await new Builder()
    .forBrowser("chrome")
    .setChromeOptions(options)
    .build();
  try {
    await driver.get("http://www.google.com/ncr");
    await driver.findElement(By.name("q")).sendKeys("webdriver", Key.RETURN);
    await driver.wait(until.titleIs("webdriver - Google Search"), 1000);
  } finally {
    await driver.quit();
  }
}

console.log(files);
//testReadLines("./temp/test.md");
