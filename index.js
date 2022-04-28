const puppeteer = require("puppeteer");
const { PuppeteerScreenRecorder } = require("puppeteer-screen-recorder");
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

config = await setConfig(config, argv);

console.log(config);
exit();

async function setConfig(config,argv) {
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
