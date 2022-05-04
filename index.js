const uuid = require("uuid");
const puppeteer = require("puppeteer");
const { PuppeteerScreenRecorder } = require("puppeteer-screen-recorder");
const nReadlines = require("n-readlines");
const path = require("path");
const yargs = require("yargs/yargs");
const { hideBin } = require("yargs/helpers");
const fs = require("fs");
const { exit } = require("process");

// Debug flag
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
runTests(tests);

async function runTests(tests) {
  let results = [];
  tests.forEach(async (test) => {
    // Instantiate browser
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    const recorder = new PuppeteerScreenRecorder(page);
    // Iterate through actions
    for (var i = 0; i < test.actions.length; i++) {
      let action = test.actions[i];
      let filename = "";
      let filePath = "";
      switch (action.action) {
        case "open":
          if (debug) console.log("open");
          let uri = action.uri;
          // Check necessary values
          if (uri === "") console.log("error");
          // Catch common formatting errors
          if (!uri.includes("://")) uri = "https://" + uri;
          // Run action
          await page.goto(uri);
          break;
        case "find":
          console.log("find");
          break;
        case "click":
          console.log("click");
          break;
        case "sendKeys":
          console.log("keys");
          break;
        case "wait":
          console.log("wait");
          break;
        case "screenshot":
          console.log("screenshot");
          // Set filename
          if (action.filename) {
            filename = action.filename;
          } else {
            filename = `${test.id}-${uuid.v4()}-${i}.png`;
          }
          // Set directory
          if (action.imageDirectory) {
            filePath = action.imageDirectory;
          } else {
            filePath = config.imageDirectory;
          }
          if (!fs.existsSync(filePath)) {
            console.log("Error: Invalid imageDirectory");
            continue;
          }
          filePath = path.join(filePath, filename);
          console.log(filePath);
          await page.screenshot({ path: filePath });
          break;
        case "imageDiff":
          console.log("imagediff");
          break;
        case "imageFind":
          console.log("imagefind");
          break;
        case "recordStart":
          console.log("recordstart");
          path = "";
          await recorder.start(path);
          break;
        case "recordStop":
          console.log("recordstop");
          await recorder.stop();
          break;
      }
    }
    await browser.close();
  });
  console.log(results);
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
