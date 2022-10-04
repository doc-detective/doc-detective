const fs = require("fs");
const PNG = require("pngjs").PNG;
const pixelmatch = require("pixelmatch");
const path = require("path");
const { log } = require("../utils");

exports.screenshot = screenshot;

async function screenshot(action, page, config) {
  let status;
  let description;
  let result;
  let defaultPayload = {
    overwrite: false,
    mediaDirectory: "samples",
    filename: "results.png",
    matchPrevious: true,
    matchThreshold: 0.1,
  };

  // Set directory
  filePath = action.mediaDirectory || config.mediaDirectory;

  if (!fs.existsSync(filePath)) {
    // FAIL: Invalid path
    status = "FAIL";
    description = `Invalid directory path.`;
    result = { status, description };
    return { result };
  }

  // if (fs.existsSync(filePath) && !action.matchPrevious && !action.overwrite) {
  //   // PASS
  //   status = "PASS";
  //   description = `Skipping action. Output file already exists, and 'overwrite' set to 'false', and 'matchPrevious' is set to 'false'.`;
  //   result = { status, description };
  //   return { result };
  // }

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
      log(
        config,
        "warning",
        "Specified filename doesn't exist. Capturing screenshot. Not matching."
      );
      filename = action.filename;
    }
  } else if (action.matchPrevious && !action.filename) {
    action.matchPrevious = false;
    log(config, "warning", "No filename specified. Not matching.");
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
    try {
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
      fs.unlink(filePath, function (err) {
        if (err) {
          log(
            config,
            "warning",
            `Couldn't delete intermediate file: ${filePath}`
          );
        } else {
          log(config, "debug", `Deleted intermediate file: ${filePath}`);
        }
      });
      if (numDiffPixels) {
        // FAIL: Couldn't capture screenshot
        const diffPercentage =
          numDiffPixels / (expected.width * expected.height);
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
    } catch {
      fs.unlink(filePath, function (err) {
        if (err) {
          log(
            config,
            "warning",
            `Couldn't delete intermediate file: ${filePath}`
          );
        } else {
          log(config, "debug", `Deleted intermediate file: ${filePath}`);
        }
      });
      status = "FAIL";
      description = `Image sizes don't match.`;
      result = { status, description };
      return { result };
    }
  }
}
