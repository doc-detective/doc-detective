#!/usr/bin/env node

const { Builder, By, Key, until } = require("selenium-webdriver");
const chrome = require("selenium-webdriver/chrome");
const nReadlines = require("n-readlines");
const path = require("path");
const yargs = require("yargs/yargs");
const { hideBin } = require("yargs/helpers");
const fs = require("fs");

let config = require("./config.json");
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
if (argv.testFile) files[0] = argv.testFile;
if (argv.testDirectory) config.testDirectory = argv.testDir;
if (argv.imageDir) config.imageDirectory = argv.imageDir;
if (argv.videoDir) config.videoDirectory = argv.videoDir;

// Set array of test files

// Loop through test files

// Set values based on args/config

// Loop through lines in file

// Detect test params

// Convert to Selenium commands + add to array

// End line loop

// End file loop

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

console.log(data);
//testReadLines("./temp/test.md");
