const yargs = require("yargs/yargs");
const { hideBin } = require("yargs/helpers");
const fs = require("fs");
const { exit } = require("process");
const path = require("path");
const uuid = require("uuid");
const nReadlines = require("n-readlines");
const { exec } = require("child_process");
const axios = require("axios");

exports.setArgs = setArgs;
exports.setConfig = setConfig;
exports.setFiles = setFiles;
exports.parseFiles = parseFiles;
exports.outputResults = outputResults;
exports.sendAnalytics = sendAnalytics;
exports.convertToGif = convertToGif;

// Define args
function setArgs(args) {
  if (!args) return {};
  let argv = yargs(hideBin(args))
    .option("config", {
      alias: "c",
      description: "Path to a custom config file.",
      type: "string",
    })
    .option("input", {
      alias: "i",
      description: "Path to a file or directory to parse for tests.",
      type: "string",
    })
    .option("output", {
      alias: "o",
      description: "Path for a JSON file of test result output.",
      type: "string",
    })
    .option("recursive", {
      alias: "r",
      description:
        "Boolean. Recursively find test files in the test directory. Defaults to true.",
      type: "string",
    })
    .option("ext", {
      alias: "e",
      description:
        "Comma-separated list of file extensions to test, including the leading period.",
      type: "string",
    })
    .option("mediaDir", {
      description: "Path to the media output directory.",
      type: "string",
    })
    .option("browserHeadless", {
      description:
        "Boolean. Whether to run the browser in headless mode. Defaults to true.",
      type: "string",
    })
    .option("browserPath", {
      description:
        "Path to a browser executable to run instead of puppeteer's bundled Chromium.",
      type: "string",
    })
    .option("browserHeight", {
      description:
        "Height of the browser viewport in pixels. Default is 600 px.",
      type: "number",
    })
    .option("browserWidth", {
      description:
        "Width of the browser viewport in pixels. Default is 800 px.",
      type: "number",
    })
    .option("verbose", {
      alias: "v",
      description:
        "Boolean. Defaults to false. Log command in-progress output to the console.",
      type: "string",
    })
    .option("analytics", {
      alias: "a",
      description:
        "Boolean. Defaults to false. Sends anonymous, aggregate analytics for usage and trend analysis. For details, see https://github.com/hawkeyexl/doc-unit-test#analytics.",
      type: "string",
    })
    .option("analyticsUserId", {
      description:
        "Identifier of the organization or individual running tests.",
      type: "string",
    })
    .option("analyticsDetailLevel", {
      description:
        "How much detail is included in the analytics object. Defaults to 'action'. Values: ['action', 'test', 'run']. For details, see https://github.com/hawkeyexl/doc-unit-test#analytics.",
      type: "string",
    })
    .help()
    .alias("help", "h").argv;

  return argv;
}

function setConfig(config, argv) {
  // Set config
  if (JSON.stringify(config) === JSON.stringify({}) && !argv.config) {
    console.log(
      "Error: No config specified. If using the 'run()' method, specify the 'config' argument. If running as a CLI tool, use the '-c' argument."
    );
    exit(1);
  }
  if (argv.config) config = JSON.parse(fs.readFileSync(argv.config));
  // Set config overrides from args
  if (argv.input) config.input = path.resolve(argv.input);
  if (argv.output) config.output = path.resolve(argv.output);
  if (argv.mediaDir) config.mediaDirectory = path.resolve(argv.mediaDir);
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
  if (argv.browserHeadless)
    config.browserOptions.headless = argv.browserHeadless;
  if (argv.browserPath) config.browserOptions.path = argv.browserPath;
  if (argv.browserHeight) config.browserOptions.height = argv.browserHeight;
  if (argv.browserWidth) config.browserOptions.width = argv.browserWidth;
  if (argv.verbose) config.verbose = argv.verbose;
  if (argv.analytics) config.analytics.send = argv.analytics;
  if (argv.analyticsUserId) config.analytics.userId = argv.analyticsUserId;
  if (argv.analyticsDetailLevel)
    config.analytics.detailLevel = argv.analyticsDetailLevel;

  return config;
}

// Set array of test files
function setFiles(config) {
  let dirs = [];
  let files = [];

  // Validate input
  const input = path.resolve(config.input);
  let isFile = fs.statSync(input).isFile();
  let isDir = fs.statSync(input).isDirectory();
  if (!isFile && !isDir) {
    console.log("Error: Input isn't a valid file or directory.");
    exit(1);
  }

  // Parse input
  if (isFile) {
    // if single file specified
    files[0] = input;
    return files;
  } else if (isDir) {
    // Load files from drectory
    dirs[0] = input;
    for (let i = 0; i < dirs.length; i++) {
      fs.readdirSync(dirs[i]).forEach((object) => {
        let content = path.resolve(dirs[i] + "/" + object);
        let isFile = fs.statSync(content).isFile();
        let isDir = fs.statSync(content).isDirectory();
        if (isFile) {
          // is a file
          if (
            // No specified extension filter list, or file extension is present in extension filter list.
            config.testExtensions === "" ||
            config.testExtensions.includes(path.extname(content))
          ) {
            files.push(content);
          }
        } else if (isDir) {
          // is a directory
          if (config.recursive) {
            // recursive set to true
            dirs.push(content);
          }
        }
      });
    }
    return files;
  }
}

// Parse files for tests
function parseFiles(config, files) {
  let json = { tests: [] };

  // Loop through test files
  files.forEach((file) => {
    if (config.verbose) console.log(`file: ${file}`);
    let id = uuid.v4();
    let line;
    let lineNumber = 1;
    let inputFile = new nReadlines(file);
    let extension = path.extname(file);
    let fileType = config.fileTypes.find((fileType) =>
      fileType.extensions.includes(extension)
    );
    if (!fileType && extension !== ".json") {
      // Missing filetype options
      console.log(
        `Error: Specify options for the ${extension} extension in your config file.`
      );
      exit(1);
    }

    // If file is JSON, add tests straight to array
    if (path.extname(file) === ".json") {
      content = require(file);
      content.tests.forEach((test) => {
        json.tests.push(test);
      });
    } else {
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
          if (!lineJson.testId) {
            lineJson.testId = id;
          }
          let test = json.tests.find((item) => item.id === lineJson.testId);
          if (!test) {
            json.tests.push({ id: lineJson.testId, file, actions: [] });
            test = json.tests.find((item) => item.id === lineJson.testId);
          }
          delete lineJson.testId;
          lineJson.line = lineNumber;
          test.actions.push(lineJson);
        }
        lineNumber++;
      }
    }
  });
  return json;
}

async function outputResults(config, results) {
  let data = JSON.stringify(results, null, 2);
  fs.writeFile(config.output, data, (err) => {
    if (err) throw err;
  });
}

async function sendToGa(data) {
  let gaData = {
    client_id: "doc-unit-test",
    non_personalized_ads: true,
    events: [
      {
        name: "analytics_report",
        params: {
          engagement_time_msec: "",
          session_id: "",
        },
      },
    ],
  };
  // Transform to flat object
  if (
    data.detailLevel === "test" ||
    data.detailLevel === "action-simple" ||
    data.detailLevel === "action-detailed"
  ) {
    gaData.events[0].params.tests_numberTests = data.tests.numberTests;
    gaData.events[0].params.tests_passed = data.tests.passed;
    gaData.events[0].params.tests_failed = data.tests.failed;
    delete data.tests;
    if (
      data.detailLevel === "action-simple" ||
      data.detailLevel === "action-detailed"
    ) {
      gaData.events[0].params.actions_numberTests = data.actions.numberTests;
      gaData.events[0].params.actions_passed = data.actions.passed;
      gaData.events[0].params.actions_failed = data.actions.failed;
      gaData.events[0].params.actions_averageNumberActionsPerTest =
        data.actions.averageNumberActionsPerTest;
      gaData.events[0].params.actions_maxActionsPerTest =
        data.actions.maxActionsPerTest;
      gaData.events[0].params.actions_minActionsPerTest =
        data.actions.minActionsPerTest;
      delete data.actions;
      if (data.detailLevel === "action-detailed") {
        gaData.events[0].params.actionDetails_goTo_numberInstances =
          data.actionDetails.goTo.numberInstances;
        gaData.events[0].params.actionDetails_goTo_passed =
          data.actionDetails.goTo.passed;
        gaData.events[0].params.actionDetails_goTo_failed =
          data.actionDetails.goTo.failed;
        gaData.events[0].params.actionDetails_goTo_uri =
          data.actionDetails.goTo.uri;
        gaData.events[0].params.actionDetails_find_numberInstances =
          data.actionDetails.find.numberInstances;
        gaData.events[0].params.actionDetails_find_passed =
          data.actionDetails.find.passed;
        gaData.events[0].params.actionDetails_find_failed =
          data.actionDetails.find.failed;
        gaData.events[0].params.actionDetails_find_css =
          data.actionDetails.find.css;
        gaData.events[0].params.actionDetails_matchText_numberInstances =
          data.actionDetails.matchText.numberInstances;
        gaData.events[0].params.actionDetails_matchText_passed =
          data.actionDetails.matchText.passed;
        gaData.events[0].params.actionDetails_matchText_failed =
          data.actionDetails.matchText.failed;
        gaData.events[0].params.actionDetails_matchText_css =
          data.actionDetails.matchText.css;
        gaData.events[0].params.actionDetails_matchText_text =
          data.actionDetails.matchText.text;
        gaData.events[0].params.actionDetails_click_numberInstances =
          data.actionDetails.click.numberInstances;
        gaData.events[0].params.actionDetails_click_passed =
          data.actionDetails.click.passed;
        gaData.events[0].params.actionDetails_click_failed =
          data.actionDetails.click.failed;
        gaData.events[0].params.actionDetails_click_css =
          data.actionDetails.click.css;
        gaData.events[0].params.actionDetails_type_numberInstances =
          data.actionDetails.type.numberInstances;
        gaData.events[0].params.actionDetails_type_passed =
          data.actionDetails.type.passed;
        gaData.events[0].params.actionDetails_type_failed =
          data.actionDetails.type.failed;
        gaData.events[0].params.actionDetails_type_css =
          data.actionDetails.type.css;
        gaData.events[0].params.actionDetails_type_keys =
          data.actionDetails.type.keys;
        gaData.events[0].params.actionDetails_type_trailingSpecialKey =
          data.actionDetails.type.trailingSpecialKey;
        gaData.events[0].params.actionDetails_moveMouse_numberInstances =
          data.actionDetails.moveMouse.numberInstances;
        gaData.events[0].params.actionDetails_moveMouse_passed =
          data.actionDetails.moveMouse.passed;
        gaData.events[0].params.actionDetails_moveMouse_failed =
          data.actionDetails.moveMouse.failed;
        gaData.events[0].params.actionDetails_moveMouse_css =
          data.actionDetails.moveMouse.css;
        gaData.events[0].params.actionDetails_moveMouse_alignH =
          data.actionDetails.moveMouse.alignH;
        gaData.events[0].params.actionDetails_moveMouse_alignV =
          data.actionDetails.moveMouse.alignV;
        gaData.events[0].params.actionDetails_moveMouse_offsetX =
          data.actionDetails.moveMouse.offsetX;
        gaData.events[0].params.actionDetails_moveMouse_offsetY =
          data.actionDetails.moveMouse.offsetY;
        gaData.events[0].params.actionDetails_scroll_numberInstances =
          data.actionDetails.scroll.numberInstances;
        gaData.events[0].params.actionDetails_scroll_passed =
          data.actionDetails.scroll.passed;
        gaData.events[0].params.actionDetails_scroll_failed =
          data.actionDetails.scroll.failed;
        gaData.events[0].params.actionDetails_scroll_x =
          data.actionDetails.scroll.x;
        gaData.events[0].params.actionDetails_scroll_y =
          data.actionDetails.scroll.y;
        gaData.events[0].params.actionDetails_wait_numberInstances =
          data.actionDetails.wait.numberInstances;
        gaData.events[0].params.actionDetails_wait_passed =
          data.actionDetails.wait.passed;
        gaData.events[0].params.actionDetails_wait_failed =
          data.actionDetails.wait.failed;
        gaData.events[0].params.actionDetails_wait_duration =
          data.actionDetails.wait.duration;
        gaData.events[0].params.actionDetails_screenshot_numberInstances =
          data.actionDetails.screenshot.numberInstances;
        gaData.events[0].params.actionDetails_screenshot_passed =
          data.actionDetails.screenshot.passed;
        gaData.events[0].params.actionDetails_screenshot_failed =
          data.actionDetails.screenshot.failed;
        gaData.events[0].params.actionDetails_screenshot_mediaDirectory =
          data.actionDetails.screenshot.mediaDirectory;
        gaData.events[0].params.actionDetails_screenshot_filename =
          data.actionDetails.screenshot.filename;
        gaData.events[0].params.actionDetails_screenshot_matchPrevious =
          data.actionDetails.screenshot.matchPrevious;
        gaData.events[0].params.actionDetails_screenshot_matchThreshold =
          data.actionDetails.screenshot.matchThreshold;
        gaData.events[0].params.actionDetails_startRecording_numberInstances =
          data.actionDetails.startRecording.numberInstances;
        gaData.events[0].params.actionDetails_startRecording_passed =
          data.actionDetails.startRecording.passed;
        gaData.events[0].params.actionDetails_startRecording_failed =
          data.actionDetails.startRecording.failed;
        gaData.events[0].params.actionDetails_startRecording_mediaDirectory =
          data.actionDetails.startRecording.mediaDirectory;
        gaData.events[0].params.actionDetails_startRecording_filename =
          data.actionDetails.startRecording.filename;
        gaData.events[0].params.actionDetails_startRecording_gifFps =
          data.actionDetails.startRecording.gifFps;
        gaData.events[0].params.actionDetails_startRecording_gifWidth =
          data.actionDetails.startRecording.gifWidth;
        gaData.events[0].params.actionDetails_stopRecording_numberInstances =
          data.actionDetails.stopRecording.numberInstances;
        gaData.events[0].params.actionDetails_stopRecording_passed =
          data.actionDetails.stopRecording.passed;
        gaData.events[0].params.actionDetails_stopRecording_failed =
          data.actionDetails.stopRecording.failed;
        gaData.events[0].params.actionDetails_checkLink_numberInstances =
          data.actionDetails.checkLink.numberInstances;
        gaData.events[0].params.actionDetails_checkLink_passed =
          data.actionDetails.checkLink.passed;
        gaData.events[0].params.actionDetails_checkLink_failed =
          data.actionDetails.checkLink.failed;
        gaData.events[0].params.actionDetails_checkLink_uri =
          data.actionDetails.checkLink.uri;
        gaData.events[0].params.actionDetails_checkLink_statusCodes =
          data.actionDetails.checkLink.statusCodes;
        gaData.events[0].params.actionDetails_runShell_numberInstances =
          data.actionDetails.runShell.numberInstances;
        gaData.events[0].params.actionDetails_runShell_passed =
          data.actionDetails.runShell.passed;
        gaData.events[0].params.actionDetails_runShell_failed =
          data.actionDetails.runShell.failed;
        gaData.events[0].params.actionDetails_runShell_command =
          data.actionDetails.runShell.command;
        gaData.events[0].params.actionDetails_runShell_env =
          data.actionDetails.runShell.env;
        delete data.actionDetails;
      }
    }
  }

  // Send to GA
  let req = await axios({
    method: "post",
    url: "https://www.google-analytics.com/mp/collect",
    params: {
      api_secret: "J_RJCtf0Rk-G42nX6XQBLQ",
      measurement_id: "G-5VDP3TNPWC",
    },
    data: gaData,
  })
    .then(() => {
      console.log(`INFO: Sucessfully sent analytics. Thanks for contributing to the project!`);
    })
    .catch((error) => {
      console.log(`WARNING: Problem sending analytics. Status: ${error.status}. Status text: ${error.statusText}`);
    });
}

async function sendAnalytics(config, results) {
  const packageJson = require("../../package.json");
  let data = {
    version: packageJson.version,
    detailLevel: config.analytics.detailLevel,
    userId: config.analytics.userId,
    tests: {
      numberTests: 0,
      passed: 0,
      failed: 0,
    },
    actions: {
      numberActions: 0,
      averageNumberActionsPerTest: 0,
      maxActionsPerTest: 0,
      minActionsPerTest: 0,
      passed: 0,
      failed: 0,
    },
    actionDetails: {
      goTo: {
        numberInstances: 0,
        passed: 0,
        failed: 0,
        uri: 0,
      },
      find: {
        numberInstances: 0,
        passed: 0,
        failed: 0,
        css: 0,
      },
      matchText: {
        numberInstances: 0,
        passed: 0,
        failed: 0,
        css: 0,
        text: 0,
      },
      click: {
        numberInstances: 0,
        passed: 0,
        failed: 0,
        css: 0,
      },
      type: {
        numberInstances: 0,
        passed: 0,
        failed: 0,
        css: 0,
        keys: 0,
        trailingSpecialKey: 0,
      },
      moveMouse: {
        numberInstances: 0,
        passed: 0,
        failed: 0,
        css: 0,
        alignH: 0,
        alignV: 0,
        offsetX: 0,
        offsetY: 0,
      },
      scroll: {
        numberInstances: 0,
        passed: 0,
        failed: 0,
        x: 0,
        y: 0,
      },
      wait: {
        numberInstances: 0,
        passed: 0,
        failed: 0,
        duration: 0,
      },
      screenshot: {
        numberInstances: 0,
        passed: 0,
        failed: 0,
        mediaDirectory: 0,
        filename: 0,
        matchPrevious: 0,
        matchThreshold: 0,
      },
      startRecording: {
        numberInstances: 0,
        passed: 0,
        failed: 0,
        mediaDirectory: 0,
        filename: 0,
        gifFps: 0,
        gifWidth: 0,
      },
      stopRecording: {
        numberInstances: 0,
        passed: 0,
        failed: 0,
      },
      checkLink: {
        numberInstances: 0,
        passed: 0,
        failed: 0,
        uri: 0,
        statusCodes: 0,
      },
      runShell: {
        numberInstances: 0,
        passed: 0,
        failed: 0,
        command: 0,
        env: 0,
      },
    },
  };
  let actionsPerTest = [];

  // Preventatively remove unneeded sections based on detailLevel
  if (data.detailLevel === "run") {
    delete data.tests;
  } else if (data.detailLevel === "test") {
    delete data.actions;
  }

  // detailLeval: test
  if (
    data.detailLevel === "test" ||
    data.detailLevel === "action-simple" ||
    data.detailLevel === "action-detailed"
  ) {
    data.tests.numberTests = results.tests.length;
    results.tests.forEach((test) => {
      if (test.status === "PASS") data.tests.passed++;
      if (test.status === "FAIL") data.tests.failed++;

      // detailLevel: action
      if (
        data.detailLevel === "action-simple" ||
        data.detailLevel === "action-detailed"
      ) {
        actionsPerTest.push(test.actions.length);

        // loop through actions
        test.actions.forEach((action) => {
          if (action.result.status === "PASS") {
            data.actions.passed++;
            if (data.detailLevel === "action-detailed")
              data.actionDetails[action.action].passed++;
          }
          if (action.result.status === "FAIL") {
            data.actions.failed++;
            if (data.detailLevel === "action-detailed")
              data.actionDetails[action.action].failed++;
          }

          if (data.detailLevel === "action-detailed") {
            // loop through keys
            data.actionDetails[action.action].numberInstances++;
            Object.keys(action).forEach((key) => {
              if (key != "result" && key != "action" && key != "line") {
                data.actionDetails[action.action][key]++;
              }
            });
          }
        });
      }
    });
  }

  // Calculate actions per test numbers
  if (
    data.detailLevel === "action-simple" ||
    data.detailLevel === "action-detailed"
  ) {
    data.actions.numberActions = actionsPerTest.reduce(
      (a, b) => a + b,
      0
    );
    data.actions.averageNumberActionsPerTest =
      data.actions.numberActions / actionsPerTest.length;
    data.actions.maxActionsPerTest = actionsPerTest.reduce((a, b) =>
      Math.max(a, b)
    );
    data.actions.minActionsPerTest = actionsPerTest.reduce((a, b) =>
      Math.min(a, b)
    );
  }

  sendToGa(data);
}

async function convertToGif(config, input, fps, width) {
  if (!fs.existsSync(input)) return { error: "Invalid input." };
  let output = path.join(
    path.parse(input).dir,
    path.parse(input).name + ".gif"
  );
  if (!fps) fps = 15;
  let command = `ffmpeg -nostats -loglevel 0 -y -i ${input} -vf "fps=${fps},scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" -loop 0 ${output}`;
  exec(command, (error, stdout, stderr) => {
    if (error) {
      if (config.verbose) console.log(error.message);
      return { error: error.message };
    }
    if (stderr) {
      if (config.verbose) console.log(stderr);
      return { stderr };
    }
    if (config.verbosev) console.log(stdout);
    return { stdout };
  });
  return output;
}
