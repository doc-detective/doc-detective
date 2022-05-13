const path = require("path");
const uuid = require("uuid");
const nReadlines = require("n-readlines");
const puppeteer = require("puppeteer");
const { PuppeteerScreenRecorder } = require("puppeteer-screen-recorder");
const fs = require("fs");

exports.setTests = setTests;
exports.runTests = runTests;

// Parse files for tests
function setTests(config, files) {
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
      if (!fileType) {
        // Missing filetype options
        console.log(
          `Specify options for the ${extension} extension in your config file.`
        );
        exit(1);
      }
  
      // Loop through lines
      while ((line = inputFile.next())) {
        let lineJson = "";
        let subStart = "";
        let subEnd = "";
        if (line.includes(fileType.openTestStatement)) {
          const lineAscii = line.toString("ascii");
          if (fileType.closeTestStatement) {
            subEnd = lineAscii.lastIndexOf(fileType.closeTestStatement);
          } else {
            subEnd = lineAscii.length;
          }
          subStart =
            lineAscii.indexOf(fileType.openTestStatement) +
            fileType.openTestStatement.length;
          lineJson = JSON.parse(lineAscii.substring(subStart, subEnd));
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
  
async function runTests(config, tests) {
    const testResults = [];
    // Instantiate browser
    const browser = await puppeteer.launch({ headless: true, slowMo: 50 });
  
    // Iterate tests
    for (const test of tests) {
      // Instantiate page
      const page = await browser.newPage();
      // Iterate through actions
      const results = [];
      for (const action of test.actions) {
        results.push(await runAction(config, action, page));
      }
      testResults.push(results);
    }
    await browser.close();
    return await testResults;
  }
  
  async function runAction(config, action, page) {
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
        result = await screenshot(action, page, config);
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
  
  async function screenshot(action, page, config) {
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
  