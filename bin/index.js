#!/usr/bin/env node

const { Builder, By, Key, until } = require("selenium-webdriver");
const chrome = require("selenium-webdriver/chrome");
const nReadlines = require("n-readlines");
const path = require("path");
const config = require("./config.json");

// Parse args

// Set array of test files

// Loop through test files

// Set values based on args/config
let ext = path.extname(file);
let openTestStatement;

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

console.log(config);
//testReadLines("./temp/test.md");
