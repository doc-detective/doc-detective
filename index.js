const uuid = require("uuid");
const puppeteer = require("puppeteer");
const { PuppeteerScreenRecorder } = require("puppeteer-screen-recorder");
const nReadlines = require("n-readlines");
const path = require("path");
const yargs = require("yargs/yargs");
const { hideBin } = require("yargs/helpers");
const fs = require("fs");
const { exit } = require("process");
const { isAsyncFunction } = require("util/types");

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
  console.log("ACTIONS:")
  tests.forEach(test => {
    test.actions.forEach(action => {
      console.log(action);
    })
  })
}

// Run tests
runTests(tests);

async function runTests(tests) {
  const testResults = [];
  // Instantiate browser
  const browser = await puppeteer.launch({ headless: false, slowMo: 50 });

  // Iterate tests
  for (const test of tests) {
    // Instantiate page
    const page = await browser.newPage();
    // Iterate through actions
    const results = [];
    for (const action of test.actions) {
      results.push(await runAction(action, page));
    }
    testResults.push(results);
  }
  await browser.close();
  console.log("RESULTS:");
  console.log(testResults);
}

async function runAction(action, page, recorder) {
  let result = "";
  switch (action.action) {
    case "goTo":
      result = await openUri(action, page);
      break;
    case "find":
      result = await findElement(action, page);
      break;
    case "matchText":
      find = await findElement(action, page);
      if (find.result.status === "FAIL") return find;
      result = await matchText(action, page);
      break;
    case "click":
      find = await findElement(action, page);
      if (find.result.status === "FAIL") return find;
      result = await clickElement(action, find.elementHandle);
      break;
    case "type":
      find = await findElement(action, page);
      if (find.result.status === "FAIL") return find;
      result = await typeElement(action, find.elementHandle);
      break;
    case "wait":
      result = await wait(action, page);
      break;
    case "screenshot":
      result = await screenshot(action, page);
      break;
    case "startRecording":
      break;
  }
  return await result.result;
}

async function startRecording(action, page) {
  let status;
  let description;
  let result;
  // Set filename
  if (action.filename) {
    filename = action.filename;
  } else {
    filename = `${test.id}-${uuid.v4()}.mp4`;
  }
  // Set directory
  if (action.directory) {
    filePath = action.directory;
  } else {
    filePath = config.imageDirectory;
  }
  if (!fs.existsSync(filePath)) {
    // FAIL: Invalid path
    status = "FAIL";
    description = `Invalid directory path.`;
    result = { action, status, description };
    return { result };
  }
  filePath = path.join(filePath, filename);
  try {
    const recorder = new PuppeteerScreenRecorder(page);
    await recorder.start(filePath);
  } catch {
    // FAIL: Couldn't capture screenshot
    status = "FAIL";
    description = `Couldn't start recording.`;
    result = { action, status, description };
    return { result };
  }
  // PASS
  status = "PASS";
  description = `Started recording: ${filePath}`;
  result = { action, status, description };
  return { result, recorder };
}

async function stopRecording(recorder) {
  let status;
  let description;
  let result;
  try {
    await recorder.stop();
  } catch {
    // FAIL: Couldn't capture screenshot
    status = "FAIL";
    description = `Couldn't stop recording.`;
    result = { action, status, description };
    return { result };
  }
  // PASS
  status = "PASS";
  description = `Stopped recording: ${filePath}`;
  result = { action, status, description };
  return { result };
}

async function screenshot(action, page) {
  let status;
  let description;
  let result;
  // Set filename
  if (action.filename) {
    filename = action.filename;
  } else {
    filename = `${test.id}-${uuid.v4()}.png`;
  }
  // Set directory
  if (action.directory) {
    filePath = action.directory;
  } else {
    filePath = config.imageDirectory;
  }
  if (!fs.existsSync(filePath)) {
    // FAIL: Invalid path
    status = "FAIL";
    description = `Invalid directory path.`;
    result = { action, status, description };
    return { result };
  }
  filePath = path.join(filePath, filename);
  try {
    await page.screenshot({ path: filePath });
  } catch {
    // FAIL: Couldn't capture screenshot
    status = "FAIL";
    description = `Couldn't capture screenshot.`;
    result = { action, status, description };
    return { result };
  }
  // PASS
  status = "PASS";
  description = `Captured screenshot: ${filePath}`;
  result = { action, status, description };
  return { result };
}

async function wait(action, page) {
  let status;
  let description;
  let result;
  if (action.duration === "") {
    duration = 1000;
  } else {
    duration = action.duration;
  }
  await page.waitForTimeout(duration);
  // PASS
  status = "PASS";
  description = `Wait complete.`;
  result = { action, status, description };
  return { result };
}

// Click an element.  Assumes findElement() only found one matching element.
async function typeElement(action, elementHandle) {
  let status;
  let description;
  let result;
  if (!action.keys && !action.trailingSpecialKey) {
    // Fail: No keys specified
    status = "FAIL";
    description = `Specified values for 'keys and/ot 'trailingSpecialKey'."`;
    result = { action, status, description };
    return { result };
  }
  if (action.keys) {
    try {
      await elementHandle.type(action.keys);
    } catch {
      // FAIL: Text didn't match
      status = "FAIL";
      description = `Couldn't type keys.`;
      result = { action, status, description };
      return { result };
    }
  }
  if (action.trailingSpecialKey) {
    try {
      await elementHandle.press(action.trailingSpecialKey);
    } catch {
      // FAIL: Text didn't match
      status = "FAIL";
      description = `Couldn't type special key.`;
      result = { action, status, description };
      return { result };
    }
  }
  // PASS
  status = "PASS";
  description = `Typed keys.`;
  result = { action, status, description };
  return { result };
}

// Click an element.  Assumes findElement() only found one matching element.
async function clickElement(action, elementHandle) {
  let status;
  let description;
  let result;
  try {
    await elementHandle.click();
  } catch {
    // FAIL: Text didn't match
    status = "FAIL";
    description = `Couldn't click element.`;
    result = { action, status, description };
    return { result };
  }
  // PASS
  status = "PASS";
  description = `Clicked element.`;
  result = { action, status, description };
  return { result };
}

// Identify if text in element matches expected text. Assumes findElement() only found one matching element.
async function matchText(action, page) {
  let status;
  let description;
  let result;
  let elementText;
  let elementTag = await page.$eval(action.css, (element) =>
    element.tagName.toLowerCase()
  );
  if (elementTag === "button" || elementTag === "input") {
    // Displayed text is defined by 'value' for button and input elements.
    elementText = await page.$eval(action.css, (element) => element.value);
  } else {
    // Displayed text defined by 'textContent' for all other elements.
    elementText = await page.$eval(
      action.css,
      (element) => element.textContent
    );
  }
  if (elementText === action.text) {
    // PASS
    status = "PASS";
    description = "Element text matched expected text.";
    result = { action, status, description };
    return { result };
  } else {
    // FAIL: Text didn't match
    status = "FAIL";
    description = `Element text didn't match expected text. Element text: ${elementText}`;
    result = { action, status, description };
    return { result };
  }
}

// Find a single element
async function findElement(action, page) {
  if (!action.css) {
    // FAIL: No CSS
    let status = "FAIL";
    let description = "'css' is a required field.";
    let result = { action, status, description };
    return { result };
  }
  let elements = await page.$$eval(action.css, (elements) =>
    elements.map((element) => element.outerHTML)
  );
  if (elements.length === 0) {
    // FAIL: No CSS
    let status = "FAIL";
    let description = " No elements matched CSS selectors.";
    let result = { action, status, description };
    return { result };
  } else if (elements.length > 1) {
    // FAIL: No CSS
    let status = "FAIL";
    let description = "More than one element matched CSS selectors.";
    let result = { action, status, description };
    return { result };
  } else {
    // PASS
    let elementHandle = await page.$(action.css);
    let status = "PASS";
    let description = "Found one element matching CSS selectors.";
    let result = { action, status, description };
    return { result, elementHandle };
  }
}

// Open a URI in the browser
async function openUri(action, page) {
  if (!action.uri) {
    // FAIL: No URI
    let status = "FAIL";
    let description = "'uri' is a required field.";
    let result = { action, status, description };
    return { result };
  }
  let uri = action.uri;
  // Check necessary values
  if (uri === "") console.log("error");
  // Catch common formatting errors
  if (!uri.includes("://")) uri = "https://" + uri;
  // Run action
  try {
    await page.goto(uri);
  } catch {
    // FAIL: Error opening URI
    let status = "FAIL";
    let description = "Couldn't open URI.";
    let result = { action, status, description };
    return { result };
  }
  // PASS
  let status = "PASS";
  let description = "Opened URI.";
  let result = { action, status, description };
  return { result };
}

//   let results = [];
//   // Instantiate browser
//   const browser = await puppeteer.launch();
//   tests.forEach(async (test) => {
//     // Instantiate page
//     const page = await browser.newPage();
//     // Iterate through actions
//     for (var i = 0; i < test.actions.length; i++) {
//       let action = test.actions[i];
//       if (debug) console.log(action);
//       let filename = "";
//       let filePath = "";
//       let selector = "";
//       let elements = [];
//       if (action.action === "open") {
//         if (debug) console.log("open");
//         let uri = action.uri;
//         // Check necessary values
//         if (uri === "") console.log("error");
//         // Catch common formatting errors
//         if (!uri.includes("://")) uri = "https://" + uri;
//         // Run action
//         await page.goto(uri);
//       } else if (action.action === "find") {
//         console.log("find");
//         if (!action.css) console.log("Error: 'css' is a required field.");
//         elements = await page.$$eval(action.css, (elements) =>
//           elements.map((element) => element.outerHTML)
//         );
//         if (elements.length === 0)
//           console.log("Error: No elements matched CSS selectors.");
//         if (elements.length > 1)
//           console.log("Error: More than one element matched CSS selectors.");
//         let elementTag = await page.$eval(action.css, (element) =>
//           element.tagName.toLowerCase()
//         );
//         let elementText = await page.$eval(
//           action.css,
//           (element) => element.textContent
//         );
//         let elementValue = await page.$eval(
//           action.css,
//           (element) => element.value
//         );
//         if (elementTag === "button" || elementTag === "input") {
//           if (elementValue === action.text) console.log("Text match!");
//         } else {
//           if (elementText === action.text) console.log("Text match!");
//         }
//       } else if (action.action === "click") {
//         console.log("click");
//       } else if (action.action === "sendKeys") {
//         console.log("keys");
//         // let selector = "";
//         // await page.type(selector, action.keys);
//       } else if (action.action === "wait") {
//         console.log("wait");
//         if (action.duration === "") {
//           duration = 1000;
//         } else {
//           duration = action.duration;
//         }
//         await page.waitForTimeout(duration);
//       } else if (action.action === "screenshot") {
//         console.log("screenshot");
//         // Set filename
//         if (action.filename) {
//           filename = action.filename;
//         } else {
//           filename = `${test.id}-${uuid.v4()}-${i}.png`;
//         }
//         // Set directory
//         if (action.imageDirectory) {
//           filePath = action.imageDirectory;
//         } else {
//           filePath = config.imageDirectory;
//         }
//         if (!fs.existsSync(filePath)) {
//           console.log("Error: Invalid imageDirectory");
//           continue;
//         }
//         filePath = path.join(filePath, filename);
//         console.log(filePath);
//         await page.screenshot({ path: filePath });
//         // } else if (action.action === "imageDiff") {
//         //   console.log("imagediff");
//         // } else if (action.action === "imageFind") {
//         //   console.log("imagefind");
//         // case "recordStart":
//         //   console.log("recordstart");
//         //   // Set filename
//         //   if (action.filename) {
//         //     filename = action.filename;
//         //   } else {
//         //     filename = `${test.id}-${uuid.v4()}-${i}.mp4`;
//         //   }
//         //   // Set directory
//         //   if (action.imageDirectory) {
//         //     filePath = action.videoDirectory;
//         //   } else {
//         //     filePath = config.videoDirectory;
//         //   }
//         //   if (!fs.existsSync(filePath)) {
//         //     console.log("Error: Invalid videoDirectory");
//         //     continue;
//         //   }
//         //   filePath = path.join(filePath, filename);
//         //   console.log(filePath);
//         //   const recorder = new PuppeteerScreenRecorder(page);
//         //   await recorder.start(filePath);
//         //   break;
//         // case "recordStop":
//         //   console.log("recordstop");
//         //   await recorder.stop();
//         //   break;
//       }
//     }
//     await page.close();
//   });
//   await browser.close();
//   console.log(results);
// }

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
