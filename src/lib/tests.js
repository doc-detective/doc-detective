const path = require("path");
const puppeteer = require("puppeteer");
const { PuppeteerScreenRecorder } = require("puppeteer-screen-recorder");
const fs = require("fs");
const { exit, stdout, exitCode } = require("process");
const { installMouseHelper } = require("./install-mouse-helper");
const { convertToGif, setEnvs } = require("./utils");
const util = require("util");
const exec = util.promisify(require("child_process").exec);
const PNG = require("pngjs").PNG;
const pixelmatch = require("pixelmatch");
const uuid = require("uuid");
const axios = require("axios");

exports.runTests = runTests;

async function runTests(config, tests) {
  // Instantiate browser
  let browserConfig = {
    headless: config.browserOptions.headless,
    slowMo: 50,
    executablePath: config.browserOptions.path,
    args: ["--no-sandbox"],
    defaultViewport: {
      height: 600,
      width: 800,
    },
  };
  if (config.browserOptions.width) {
    browserConfig.defaultViewport.width = config.browserOptions.width;
  } else {
    config.browserOptions.width = 800;
  }
  if (config.browserOptions.height) browserConfig.defaultViewport.height = 800;
  try {
    browser = await puppeteer.launch(browserConfig);
  } catch {
    console.log("Error: Couldn't open browser.");
    exit(1);
  }

  // Iterate tests
  for (const test of tests.tests) {
    let pass = 0;
    let warning = 0;
    let fail = 0;
    let videoDetails;
    // Instantiate page
    const page = await browser.newPage();
    // Instantiate mouse cursor
    await installMouseHelper(page);
    // Iterate through actions
    for (const action of test.actions) {
      action.result = await runAction(config, action, page, videoDetails);
      if (action.result.videoDetails) {
        videoDetails = action.result.videoDetails;
      }
      action.result = action.result.result;
      if (action.result.status === "FAIL") fail++;
      if (action.result.status === "WARNING") warning++;
      if (action.result.status === "PASS") pass++;
    }

    // Close open recorders/pages
    if (videoDetails) {
      await runAction("", { action: "stopRecording" }, "", videoDetails);
    }
    try {
      await page.close();
    } catch {}

    // Calc overall test result
    if (fail) {
      test.status = "FAIL";
    } else if (warning) {
      test.status = "WARNING";
    } else if (pass) {
      test.status = "PASS";
    } else {
      console.log("Error: Couldn't read test action results.");
      exit(1);
    }
  }
  await browser.close();
  return tests;
}

async function runAction(config, action, page, videoDetails) {
  let result = "";
  switch (action.action) {
    case "goTo":
      result = await openUri(action, page);
      break;
    case "find":
      result = await findElement(action, page);
      if (result.result.status === "FAIL") return result;
      // Perform sub-action: matchText
      if (action.matchText) {
        action.matchText.css = action.css;
        matchResult = await matchText(action.matchText, result.elementHandle);
        delete action.matchText.css;
        result.result.description =
          result.result.description + " " + matchResult.result.description;
        if (matchResult.result.status === "FAIL") {
          result.result.status = "FAIL";
          return result;
        }
      }
      // Perform sub-action: moveMouse
      if (action.moveMouse) {
        action.moveMouse.css = action.css;
        move = await moveMouse(action.moveMouse, page, result.elementHandle);
        delete action.moveMouse.css;
        result.result.description =
          result.result.description + " " + move.result.description;
        if (move.result.status === "FAIL") {
          result.result.status = "FAIL";
          return result;
        }
      }
      // Perform sub-action: click
      if (action.click) {
        action.click.css = action.css;
        click = await clickElement(action.click, result.elementHandle);
        delete action.click.css;
        result.result.description =
          result.result.description + " " + click.result.description;
        if (click.result.status === "FAIL") {
          result.result.status = "FAIL";
          return result;
        }
      }
      // Perform sub-action: type
      if (action.type) {
        action.type.css = action.css;
        type = await typeElement(action.type, result.elementHandle);
        delete action.type.css;
        result.result.description =
          result.result.description + " " + type.result.description;
        if (type.result.status === "FAIL") {
          result.result.status = "FAIL";
        }
      }
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
    case "moveMouse":
      find = await findElement(action, page);
      if (find.result.status === "FAIL") return find;
      result = await moveMouse(action, page, find.elementHandle);
      break;
    case "scroll":
      result = await scroll(action, page);
      break;
    case "wait":
      result = await wait(action, page);
      break;
    case "screenshot":
      result = await screenshot(action, page, config);
      break;
    case "startRecording":
      result = await startRecording(action, page, config);
      break;
    case "stopRecording":
      result = await stopRecording(videoDetails, config);
      break;
    case "runShell":
      result = await runShell(action);
      break;
    case "checkLink":
      result = await checkLink(action);
      break;
  }
  return result;
}
async function checkLink(action) {
  let status;
  let description;
  let result;

  // Validate protocol
  if (action.uri.indexOf("://") < 0) {
    // Insert https if no protocol present
    action.uri = `https://${action.uri}`;
  }

  // Default to 200 status code
  if (!action.statusCodes) {
    action.statusCodes = [200];
  }
  let req = await axios
    .get(action.uri)
    .then((res) => {
      return { statusCode: res.status };
    })
    .catch((error) => {
      return { error };
    });

  // If request returned an error
  if (req.error) {
    status = "FAIL";
    description = `Invalid or unresolvable URI: ${action.uri}`;
    result = { status, description };
    return { result };
  }

  // Compare status codes
  if (action.statusCodes.indexOf(req.statusCode) >= 0) {
    status = "PASS";
    description = `Returned ${req.statusCode}`;
  } else {
    status = "FAIL";
    description = `Returned ${req.statusCode}. Expected one of ${JSON.stringify(
      action.statusCodes
    )}`;
  }

  result = { status, description };
  return { result };
}

async function runShell(action) {
  let status;
  let description;
  let result;
  let exitCode;

  // Load environment variables
  if (action.env) {
    let envs = await setEnvs(action.env);
    if (envs.status === "FAIL") return envs;
  }

  // Promisify and execute command
  const promise = exec(action.command);
  const child = promise.child;
  child.on("close", function (code) {
    exitCode = code;
  });

  // Await for promisified command to complete
  let { stdout, stderr } = await promise;
  stdout = stdout.trim();
  stderr = stderr.trim();

  if (exitCode || stderr) {
    status = "FAIL";
    description = `Error during execution.`;
  } else {
    status = "PASS";
    description = `Executed command.`;
  }
  result = { status, description, stdout, stderr, exitCode };
  return { result };
}

async function startRecording(action, page, config) {
  let status;
  let description;
  let result;
  // Set filename
  let targetExtension = path.extname(action.filename);
  if (action.filename) {
    filename = `${path.basename(action.filename, ".gif")}.mp4`;
  } else {
    filename = `${test.id}-${uuid.v4()}.mp4`;
  }
  // Set directory
  if (action.mediaDirectory) {
    filePath = action.mediaDirectory;
  } else {
    filePath = config.mediaDirectory;
  }
  if (!fs.existsSync(filePath)) {
    // FAIL: Invalid path
    status = "FAIL";
    description = `Invalid directory path.`;
    result = { status, description };
    return { result };
  }
  filePath = path.join(filePath, filename);
  try {
    const recorder = new PuppeteerScreenRecorder(page);
    await recorder.start(filePath);
    // PASS
    status = "PASS";
    description = `Started recording: ${filePath}`;
    result = { status, description, video: filePath };
    videoDetails = {
      recorder,
      targetExtension,
      filePath,
      width: config.browserOptions.width,
    };
    if (action.gifFps || action.gifWidth) {
      if (action.gifFps) videoDetails.fps = action.gifFps;
      if (action.gifWidth) videoDetails.width = action.gifWidth;
    }
    return { result, videoDetails };
  } catch {
    // FAIL: Couldn't capture screenshot
    status = "FAIL";
    description = `Couldn't start recording.`;
    result = { status, description };
    return { result };
  }
}

async function stopRecording(videoDetails, config) {
  let status;
  let description;
  let result;
  try {
    await videoDetails.recorder.stop();
    if (videoDetails.targetExtension === ".gif") {
      let output = await convertToGif(
        config,
        videoDetails.filePath,
        videoDetails.fps,
        videoDetails.width
      );
      videoDetails.filePath = output;
    }
    // PASS
    status = "PASS";
    description = `Stopped recording: ${filePath}`;
    result = { status, description };
    return { result };
  } catch {
    // FAIL: Couldn't capture screenshot
    status = "FAIL";
    description = `Couldn't stop recording.`;
    result = { status, description };
    return { result };
  }
}

async function screenshot(action, page, config) {
  let status;
  let description;
  let result;

  // Set directory
  if (action.mediaDirectory) {
    filePath = action.mediaDirectory;
  } else {
    filePath = config.mediaDirectory;
  }
  if (!fs.existsSync(filePath)) {
    // FAIL: Invalid path
    status = "FAIL";
    description = `Invalid directory path.`;
    result = { status, description };
    return { result };
  }

  if (action.matchPrevious && action.filename) {
    let testPath = path.join(filePath, action.filename);
    const fileExists = fs.existsSync(testPath);
    if (fileExists) {
      filename = "temp_" + action.filename;
      previousFilename = action.filename;
      previousFilePath = path.join(filePath, previousFilename);
      // Set threshold
      if (!(action.matchThreshold >= 0 && action.matchThreshold <= 1)) {
        action.matchThreshold = 0.1;
      }
    } else {
      action.matchPrevious = false;
      if (config.verbose)
        console.log(
          "WARNING: Specified filename doesn't exist. Capturing screenshot. Not matching."
        );
      filename = action.filename;
    }
  } else if (action.matchPrevious && !action.filename) {
    action.matchPrevious = false;
    if (config.verbose)
      console.log("WARNING: No filename specified. Not matching.");
    filename = "temp_" + action.filename;
  } else if (!action.matchPrevious && action.filename) {
    filename = action.filename;
  } else {
    filename = "temp_" + action.filename;
  }
  filePath = path.join(filePath, filename);

  try {
    await page.screenshot({ path: filePath });
    if (!action.matchPrevious) {
      // PASS
      status = "PASS";
      description = `Captured screenshot.`;
      result = { status, description, image: filePath };
      return { result };
    }
  } catch {
    // FAIL: Couldn't capture screenshot
    status = "FAIL";
    description = `Couldn't capture screenshot.`;
    result = { status, description };
    return { result };
  }
  if (action.matchPrevious) {
    const expected = PNG.sync.read(fs.readFileSync(previousFilePath));
    const actual = PNG.sync.read(fs.readFileSync(filePath));
    const numDiffPixels = pixelmatch(
      expected.data,
      actual.data,
      null,
      expected.width,
      expected.height,
      {
        threshold: action.matchThreshold,
      }
    );
    fs.unlinkSync(filePath);
    if (numDiffPixels) {
      // FAIL: Couldn't capture screenshot
      const diffPercentage = numDiffPixels / (expected.width * expected.height);
      status = "FAIL";
      description = `Screenshot comparison had larger diff (${diffPercentage}) than threshold (${action.matchThreshold}).`;
      result = { status, description };
      return { result };
    } else {
      // PASS
      status = "PASS";
      description = `Screenshot matches previously captured image.`;
      result = { status, description, image: previousFilePath };
      return { result };
    }
  }
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
  result = { status, description };
  return { result };
}

async function scroll(action, page) {
  let status;
  let description;
  let result;
  try {
    await page.mouse.wheel({ deltaX: action.x, deltaY: action.y });
    // PASS
    status = "PASS";
    description = `Scroll complete.`;
    result = { status, description };
    return { result };
  } catch {
    // FAIL
    status = "PASS";
    description = `Couldn't scroll.`;
    result = { status, description };
    return { result };
  }
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
    result = { status, description };
    return { result };
  }
  if (action.keys) {
    try {
      await elementHandle.type(action.keys);
    } catch {
      // FAIL: Text didn't match
      status = "FAIL";
      description = `Couldn't type keys.`;
      result = { status, description };
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
      result = { status, description };
      return { result };
    }
  }
  // PASS
  status = "PASS";
  description = `Typed keys.`;
  result = { status, description };
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
    result = { status, description };
    return { result };
  }
  // PASS
  status = "PASS";
  description = `Clicked element.`;
  result = { status, description };
  return { result };
}

// Move mouse to an element.  Assumes findElement() only found one matching element.
async function moveMouse(action, page, elementHandle) {
  let status;
  let description;
  let result;
  try {
    // Calc coordinates
    const bounds = await elementHandle.boundingBox();
    let x = bounds.x;
    if (action.offsetX) x = x + Number(action.offsetX);
    if (action.alignH) {
      if (action.alignH === "left") {
        alignHOffset = 10;
      } else if (action.alignH === "center") {
        alignHOffset = bounds.width / 2;
      } else if (action.alignH === "right") {
        alignHOffset = bounds.width - 10;
      } else {
        // FAIL
        status = "FAIL";
        description = `Invalid 'alignH' value.`;
        result = { status, description };
        return { result };
      }
      x = x + alignHOffset;
    }
    let y = bounds.y;
    if (action.offsetY) y = y + Number(action.offsetY);
    if (action.alignV) {
      if (action.alignV === "top") {
        alignVOffset = 10;
      } else if (action.alignV === "center") {
        alignVOffset = bounds.height / 2;
      } else if (action.alignV === "bottom") {
        alignVOffset = bounds.height - 10;
      } else {
        // FAIL
        status = "FAIL";
        description = `Invalid 'alignV' value.`;
        result = { status, description };
        return { result };
      }
      y = y + alignVOffset;
    }
    // Move
    await page.mouse.move(x, y, { steps: 25 });
    // Display mouse cursor
    await page.$eval(
      "puppeteer-mouse-pointer",
      (e) => (e.style.display = "block")
    );
    // PASS
    status = "PASS";
    description = `Moved mouse to element.`;
    result = { status, description };
    return { result };
  } catch {
    // FAIL
    status = "FAIL";
    description = `Couldn't move mouse to element.`;
    result = { status, description };
    return { result };
  }
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
  if (elementText.trim() === action.text) {
    // PASS
    status = "PASS";
    description = "Element text matched expected text.";
    result = { status, description };
    return { result };
  } else {
    // FAIL: Text didn't match
    status = "FAIL";
    description = `Element text didn't match expected text. Element text: ${elementText}`;
    result = { status, description };
    return { result };
  }
}

// Find a single element
async function findElement(action, page) {
  if (!action.css) {
    // FAIL: No CSS
    let status = "FAIL";
    let description = "'css' is a required field.";
    let result = { status, description };
    return { result };
  }
  let elements = await page.$$eval(action.css, (elements) =>
    elements.map((element) => element.outerHTML)
  );
  if (elements.length === 0) {
    // FAIL: No CSS
    let status = "FAIL";
    let description = " No elements matched CSS selectors.";
    let result = { status, description };
    return { result };
  } else if (elements.length > 1) {
    // FAIL: No CSS
    let status = "FAIL";
    let description = "More than one element matched CSS selectors.";
    let result = { status, description };
    return { result };
  } else {
    // PASS
    let elementHandle = await page.$(action.css);
    let status = "PASS";
    let description = "Found one element matching CSS selectors.";
    let result = { status, description };
    return { result, elementHandle };
  }
}

// Open a URI in the browser
async function openUri(action, page) {
  if (!action.uri) {
    // FAIL: No URI
    let status = "FAIL";
    let description = "'uri' is a required field.";
    let result = { status, description };
    return { result };
  }
  let uri = action.uri;
  // Catch common formatting errors
  if (!uri.includes("://")) uri = "https://" + uri;
  // Run action
  try {
    await page.goto(uri);
  } catch {
    // FAIL: Error opening URI
    let status = "FAIL";
    let description = "Couldn't open URI.";
    let result = { status, description };
    return { result };
  }
  // PASS
  let status = "PASS";
  let description = "Opened URI.";
  let result = { status, description };
  return { result };
}
