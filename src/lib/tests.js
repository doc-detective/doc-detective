const puppeteer = require("puppeteer");
const fs = require("fs");
const { exit, stdout, exitCode } = require("process");
const { installMouseHelper } = require("./install-mouse-helper");
const { setEnvs, log, timestamp, loadEnvs } = require("./utils");
const util = require("util");
const exec = util.promisify(require("child_process").exec);
const axios = require("axios");
const { goTo } = require("./tests/goTo");
const { moveMouse } = require("./tests/moveMouse");
const { scroll } = require("./tests/scroll");
const { screenshot } = require("./tests/screenshot");
const { startRecording, stopRecording } = require("./tests/record");
const { httpRequest } = require("./tests/httpRequest");

exports.runTests = runTests;

const defaultBrowserPaths = {
  linux: [
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/firefox",
  ],
  darwin: [
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Firefox.app/Contents/MacOS/firefox-bin",
  ],
  win32: [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files/Mozilla Firefox/firefox.exe",
  ],
};
const browserActions = [
  "goTo",
  "find",
  "matchText",
  "click",
  "type",
  "moveMouse",
  "scroll",
  "screenshot",
  "startRecording",
  "stopRecording",
];

async function runTests(config, tests) {
  // Instantiate browser
  let browserConfig = {
    headless: config.browserOptions.headless,
    slowMo: 50,
    executablePath: config.browserOptions.path,
    args: ["--no-sandbox"],
    defaultViewport: {
      height: config.browserOptions.height,
      width: config.browserOptions.width,
    },
  };
  try {
    log(config, "debug", "Launching browser.");
    browser = await puppeteer.launch(browserConfig);
  } catch {
    if (
      process.platform === "linux" ||
      process.platform === "darwin" ||
      process.platform === "win32"
    ) {
      for (i = 0; i < defaultBrowserPaths[process.platform].length; i++) {
        if (fs.existsSync(defaultBrowserPaths[process.platform][i])) {
          log(
            config,
            "debug",
            `Attempting browser fallback: ${
              defaultBrowserPaths[process.platform][i]
            }`
          );
          browserConfig.executablePath =
            defaultBrowserPaths[process.platform][i];
          try {
            browser = await puppeteer.launch(browserConfig);
            break;
          } catch {}
        }
        if (i === defaultBrowserPaths[process.platform].length) {
          log(
            config,
            "error",
            "Couldn't open browser. Failed browser fallback."
          );
          exit(1);
        }
      }
    } else {
      log(config, "error", "Couldn't open browser.");
      exit(1);
    }
  }
  context = await browser.createIncognitoBrowserContext();

  // Iterate tests
  log(config, "info", "Running tests.");
  for (const test of tests.tests) {
    log(config, "debug", `TEST: ${test.id}`);
    let pass = 0;
    let warning = 0;
    let fail = 0;
    config.videoDetails = {};
    config.debugRecording = {};
    let page = {};
    const browserRequired = test.actions.some((action) =>
      browserActions.includes(action.action)
    );
    if (browserRequired) {
      // Instantiate page
      log(config, "debug", "Instantiating page.");
      page = await context.newPage();
      await page._client.send("Page.setDownloadBehavior", {
        behavior: "allow",
        downloadPath: config.downloadDirectory,
      });
      if (
        test.saveFailedTestRecordings ||
        (config.saveFailedTestRecordings &&
          test.saveFailedTestRecordings != false)
      ) {
        failedTestDirectory =
          test.failedTestDirectory || config.failedTestDirectory;
        debugRecordingOptions = {
          action: "startRecording",
          mediaDirectory: failedTestDirectory,
          filename: `${test.id}-${timestamp()}.mp4`,
          overwrite: true,
        };
        config.debugRecording = await startRecording(
          debugRecordingOptions,
          page,
          config
        );
      }
      // Instantiate mouse cursor
      await installMouseHelper(page);
    }
    // Iterate through actions
    for (const action of test.actions) {
      log(config, "debug", `ACTION: ${JSON.stringify(action)}`);
      action.result = await runAction(
        config,
        action,
        page,
        config.videoDetails
      );
      if (action.result.videoDetails) {
        config.videoDetails = action.result.videoDetails;
      }
      action.result = action.result.result;
      if (action.result.status === "FAIL") fail++;
      if (action.result.status === "WARNING") warning++;
      if (action.result.status === "PASS") pass++;
      log(
        config,
        "debug",
        `RESULT: ${action.result.status}. ${action.result.description}`
      );
    }

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

    // Close open recorders/pages
    if (config.debugRecording.videoDetails) {
      await stopRecording(config.debugRecording.videoDetails, config);
      if (!fail) {
        fs.unlink(config.debugRecording.videoDetails.filepath, function (err) {
          if (err) {
            log(
              config,
              "warning",
              `Couldn't delete debug recording: ${config.debugRecording.videoDetails.filepath}`
            );
          } else {
            log(
              config,
              "debug",
              `Deleted debug recording: ${config.debugRecording.videoDetails.filepath}`
            );
          }
        });
      }
    }

    // Close page
    try {
      await page.close();
    } catch {}
  }
  await browser.close();
  return tests;
}

async function runAction(config, action, page, videoDetails) {
  let result = {};
  result.result = {};
  switch (action.action) {
    case "goTo":
      result = await goTo(action, page);
      break;
    case "find":
      // Perform sub-action: wait
      if (typeof action.wait === "undefined") action.wait = {};
      action.wait.css = action.css;
      waitResult = await wait(action.wait, page);
      delete action.wait.css;
      if (waitResult.result.status === "FAIL") {
        return waitResult;
      }
      // Perform find
      result = await findElement(action, page);
      if (result.result.status === "FAIL") return result;
      // Perform sub-action: matchText
      if (action.matchText) {
        action.matchText.css = action.css;
        matchResult = await matchText(action.matchText, page);
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
        move = await moveMouse(
          action.moveMouse,
          page,
          result.elementHandle,
          config
        );
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
      result = await moveMouse(action, page, find.elementHandle, config);
      break;
    case "scroll":
      result = await scroll(action, page, config);
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
    case "httpRequest":
      result = await httpRequest(action, config);
      break;
  }
  return result;
}

async function checkLink(action) {
  let status;
  let description;
  let result;
  let uri;

  // Load environment variables
  if (action.env) {
    let result = await setEnvs(action.env);
    if (result.status === "FAIL") return { result };
  }
  uri = loadEnvs(action.uri);

  // Validate protocol
  if (uri.indexOf("://") < 0) {
    // Insert https if no protocol present
    uri = `https://${uri}`;
  }

  // Default to 200 status code
  if (!action.statusCodes) {
    action.statusCodes = [200];
  }
  let req = await axios
    .get(uri)
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
  let command;

  // Set environment variables
  if (action.env) {
    let result = await setEnvs(action.env);
    if (result.status === "FAIL") return { result };
  }

  // Command
  //// Load envs
  command = loadEnvs(action.command);

  // Promisify and execute command
  const promise = exec(command);
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

async function wait(action, page) {
  let status;
  let description;
  let result;

  if (action.duration === "") {
    duration = 10000;
  } else {
    duration = action.duration;
  }

  if (action.css) {
    try {
      await page.mainFrame().waitForSelector(action.css, { timeout: duration });
    } catch {
      status = "FAIL";
      description = `Couldn't find an element matching 'css' within the duration.`;
      result = { status, description };
      return { result };
    }
  } else {
    await new Promise((r) => setTimeout(r, duration));
  }

  // PASS
  status = "PASS";
  description = `Wait complete.`;
  result = { status, description };
  return { result };
}

// Click an element.  Assumes findElement() only found one matching element.
async function typeElement(action, elementHandle) {
  let status;
  let description;
  let result;
  let keys;
  if (!action.keys && !action.trailingSpecialKey) {
    // Fail: No keys specified
    status = "FAIL";
    description = `Specified values for 'keys and/ot 'trailingSpecialKey'."`;
    result = { status, description };
    return { result };
  }
  // Load environment variables
  if (action.env) {
    result = await setEnvs(action.env);
    if (result.status === "FAIL") return { result };
  }
  // Type keys
  if (action.keys) {
    // Resolve environment variables in keys
    keys = loadEnvs(action.keys);

    try {
      await elementHandle.type(keys);
    } catch {
      // FAIL
      status = "FAIL";
      description = `Couldn't type keys.`;
      result = { status, description };
      return { result };
    }
  }
  // Type training special key
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

// Identify if text in element matches expected text. Assumes findElement() only found one matching element.
async function matchText(action, page) {
  let status;
  let description;
  let result;
  let elementText;
  let text;

  // Load environment variables
  if (action.env) {
    let result = await setEnvs(action.env);
    if (result.status === "FAIL") return { result };
  }
  // Set text
  text = loadEnvs(action.text);

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
  if (elementText.trim() === text) {
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
