#!/usr/bin/env node

const { Builder, By, Key, until } = require("selenium-webdriver");
const chrome = require("selenium-webdriver/chrome");
const nReadlines = require("n-readlines");
const path = require("path");
const yargs = require("yargs/yargs");
const { hideBin } = require("yargs/helpers");
const fs = require("fs");
const { exit } = require("process");

const debug = true;
let config = require("./config.json");
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
  .option("seleniumServer", {
    description: "Path to video output directory",
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
if (argv.ext) config.testExtensions = argv.ext.replace(/\s+/g, "").split(",");
if (argv.seleniumServer) config.seleniumServer = argv.seleniumServer;

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
  let json = {
    file: file,
    tests: [],
  };
  let line;
  let lineNumber = 1;
  let inputFile = new nReadlines(file);
  let extension = path.extname(file);
  let fileType = config.fileTypes.find((fileType) =>
    fileType.extensions.includes(extension)
  );
  while ((line = inputFile.next())) {
    // TODO figure out how to handle closeTestStatement when empty
    if (line.includes(fileType.openTestStatement)) {
      let lineAscii = line.toString("ascii");
      let regexOpen = new RegExp(fileType.openTestStatement, "g");
      let lineJson = JSON.parse(lineAscii.replace(regexOpen, ""));
      lineJson.line = lineNumber;
      json.tests.push(lineJson);
      console.log(json);
      tests.push(json);
    }
    lineNumber++;
  }
});

console.log(tests);
// Loop through tests
let output = async function runTests (tests) {
  tests.forEach((object) => {
    let options = new chrome.Options();
    if (config.seleniumServer) {
      let driver = new Builder()
        .forBrowser("chrome")
        .setChromeOptions(options)
        .usingServer(config.seleniumServer)
        .build();
    } else {
      let driver = new Builder()
        .forBrowser("chrome")
        .setChromeOptions(options)
        .build(); 
    }
    object.tests.forEach((test) => {
    console.log(test.action);
    switch (test.action) {
      case "open":
        if (!test.hasOwnProperty("uri"))
          console.log(JSON.stringify(test) + " doesn't have a uri field.") && exit(1);
          try { driver.get(test.uri); } catch {};
        break;
      case "find":
        if (!test.hasOwnProperty("text") && !test.hasOwnProperty("css"))
          console.log(JSON.stringify(test) + " doesn't have text or css fields.") && exit(1);
        break;
      case "click":
        if (!test.hasOwnProperty("text") && !test.hasOwnProperty("css"))
          console.log(JSON.stringify(test) + " doesn't have text or css fields.") && exit(1);
        break;
      case "sendKeys":
        if (!test.hasOwnProperty("text") && !test.hasOwnProperty("css"))
          console.log(JSON.stringify(test) + " doesn't have text or css fields.") && exit(1);
        if (!test.hasOwnProperty("keys"))
          console.log(JSON.stringify(test) + " doesn't have keys object.") && exit(1);
        break;
    }
  });
});
}
exit();
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

async function readLines(file) {
  let inputFile = new nReadlines(file);
  let lines = [];
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

//testReadLines("./temp/test.md");
