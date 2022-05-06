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
    // Instantiate browser
    const browser = await puppeteer.launch();
  tests.forEach(async (test) => {
    // Instantiate page
    const page = await browser.newPage();
    // Iterate through actions
    for (var i = 0; i < test.actions.length; i++) {
      let action = test.actions[i];
      if (debug) console.log(action);
      let filename = "";
      let filePath = "";
      let selector = "";
      if (action.action === "open") {
        if (debug) console.log("open");
        let uri = action.uri;
        // Check necessary values
        if (uri === "") console.log("error");
        // Catch common formatting errors
        if (!uri.includes("://")) uri = "https://" + uri;
        // Run action
        await page.goto(uri);
      } else if (action.action === "find") {
        console.log("find");
        if (action.element_xpath) {
          selector = action.element_xpath;
        } else {
          selector = "//";
          if (action.element_type) selector = selector + action.element_type;
          if (!action.element_type) selector = selector + "*";          
          if (action.element_id) selector = `${selector}[@id="${action.element_id}"]`;
          if (action.element_class) selector = `${selector}[contains(concat(' ',normalize-space(@class),' '),' ${action.element_class} ')]`;
          if (action.element_text) selector = `${selector}[contains(., "${action.element_text}")]`;
        }
        await page.$x(selector);
      } else if (action.action === "click") {
        console.log("click");
      } else if (action.action === "sendKeys") {
        console.log("keys");
        // let selector = "";
        // await page.type(selector, action.keys);
      } else if (action.action === "wait") {
        console.log("wait");
        if (action.duration === "") {
          duration = 1000;
        } else {
          duration = action.duration;
        }
        await page.waitForTimeout(duration);
      } else if (action.action === "screenshot") {
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
        // } else if (action.action === "imageDiff") {
        //   console.log("imagediff");
        // } else if (action.action === "imageFind") {
        //   console.log("imagefind");
        // case "recordStart":
        //   console.log("recordstart");
        //   // Set filename
        //   if (action.filename) {
        //     filename = action.filename;
        //   } else {
        //     filename = `${test.id}-${uuid.v4()}-${i}.mp4`;
        //   }
        //   // Set directory
        //   if (action.imageDirectory) {
        //     filePath = action.videoDirectory;
        //   } else {
        //     filePath = config.videoDirectory;
        //   }
        //   if (!fs.existsSync(filePath)) {
        //     console.log("Error: Invalid videoDirectory");
        //     continue;
        //   }
        //   filePath = path.join(filePath, filename);
        //   console.log(filePath);
        //   const recorder = new PuppeteerScreenRecorder(page);
        //   await recorder.start(filePath);
        //   break;
        // case "recordStop":
        //   console.log("recordstop");
        //   await recorder.stop();
        //   break;
      }
    }
    await page.close();
  });
    await browser.close();
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
