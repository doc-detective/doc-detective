const yargs = require("yargs/yargs");
const { hideBin } = require("yargs/helpers");
const fs = require("fs");
const { exit } = require("process");
const path = require("path");
const uuid = require("uuid");
const nReadlines = require("n-readlines");
const { exec } = require("child_process");
const defaultConfig = require("../config.json");

exports.setArgs = setArgs;
exports.setConfig = setConfig;
exports.setFiles = setFiles;
exports.parseFiles = parseFiles;
exports.outputResults = outputResults;
exports.convertToGif = convertToGif;
exports.setEnvs = setEnvs;
exports.loadEnvsForObject = loadEnvsForObject;
exports.log = log;

const analyticsRequest =
  "Thanks for using Doc Detective! If you want to contribute to the project, consider sending analytics to help us understand usage patterns and functional gaps. To turn on analytics, set 'analytics.send = true' in your config, or use the '-a true' argument. See https://github.com/hawkeyexl/doc-detective#analytics";
const defaultAnalyticsServers = [
  {
    name: "GA",
    method: "post",
    url: "https://www.google-analytics.com/mp/collect",
    params: {
      api_secret: "J_RJCtf0Rk-G42nX6XQBLQ",
      measurement_id: "G-5VDP3TNPWC",
    },
  },
];

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
    .option("setup", {
      description:
        "Path to a file or directory to parse for tests to run before 'input' tests. Useful for preparing environments to perform tests.",
      type: "string",
    })
    .option("cleanup", {
      description:
        "Path to a file or directory to parse for tests to run after 'input' tests. Useful for resetting environments after tests run.",
      type: "string",
    })
    .option("recursive", {
      alias: "r",
      description:
        "Boolean. Recursively find test files in the test directory. Defaults to true.",
      type: "string",
    })
    .option("ext", {
      description:
        "Comma-separated list of file extensions to test, including the leading period.",
      type: "string",
    })
    .option("env", {
      alias: "e",
      description:
        "Path to file of environment variables to set before running tests.",
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
    .option("logLevel", {
      alias: "l",
      description:
        "Detail level of logging events. Accepted values: silent, error, warning, info (default), debug",
      type: "string",
    })
    .option("analytics", {
      alias: "a",
      description:
        "Boolean. Defaults to false. Sends anonymous, aggregate analytics for usage and trend analysis. For details, see https://github.com/hawkeyexl/doc-detective#analytics.",
      type: "string",
    })
    .option("analyticsUserId", {
      description:
        "Identifier of the organization or individual running tests.",
      type: "string",
    })
    .option("analyticsDetailLevel", {
      description:
        "How much detail is included in the analytics object. Defaults to 'action'. Values: ['action', 'test', 'run']. For details, see https://github.com/hawkeyexl/doc-detective#analytics.",
      type: "string",
    })
    .help()
    .alias("help", "h").argv;

  return argv;
}

function setLogLevel(config, argv) {
  let logLevel = "";
  let enums = ["debug", "info", "warning", "error", "silent"];
  logLevel =
    argv.logLevel || process.env.DOC_LOG_LEVEL || config.logLevel || "info";
  logLevel = String(logLevel).toLowerCase();
  if (enums.indexOf(logLevel) >= 0) {
    config.logLevel = logLevel;
    log(config, "debug", `Log level set: ${logLevel}`);
  } else {
    config.logLevel = defaultConfig.logLevel;
    log(
      config,
      "warning",
      `Invalid log level. Reverted to default: ${config.logLevel}`
    );
  }
  return config;
}

function selectConfig(config, argv) {
  if (argv.config && fs.existsSync(argv.config)) {
    // Argument
    config = JSON.parse(fs.readFileSync(argv.config));
    setLogLevel(config, argv);
    log(config, "debug", "Loaded config from argument.");
  } else if (
    process.env.DOC_CONFIG_PATH &&
    fs.existsSync(process.env.DOC_CONFIG_PATH)
  ) {
    // Env
    config = JSON.parse(fs.readFileSync(process.env.DOC_CONFIG_PATH));
    setLogLevel(config, argv);
    log(config, "debug", "Loaded config from environment variable.");
  } else if (JSON.stringify(config) != JSON.stringify({})) {
    // Function param
    config = config;
    setLogLevel(config, argv);
    log(config, "debug", "Loaded config from function parameter.");
  } else {
    // Default
    config = JSON.parse(JSON.stringify(defaultConfig));
    setLogLevel(config, argv);
    log(
      config,
      "warning",
      "No custom config specified. Loaded default config."
    );
  }
  return config;
}

function setEnv(config, argv) {
  config.env = argv.env || process.env.DOC_ENV_PATH || config.env;
  if (config.env) {
    config.env = path.resolve(config.env);
    if (fs.existsSync(config.env)) {
      let envResult = setEnvs(config.env);
      if (envResult.status === "PASS")
        log(config, "debug", `Env file set: ${config.env}`);
      if (envResult.status === "FAIL")
        log(config, "warning", `File format issue. Can't load env file.`);
    } else {
      log(config, "warning", `Invalid file path. Can't load env file.`);
    }
  } else {
    log(config, "debug", "No env file specified.");
  }
  return config;
}

function setInput(config, argv) {
  config.input = argv.input || process.env.DOC_INPUT_PATH || config.input;
  if (config.input) {
    config.input = path.resolve(config.input);
    if (fs.existsSync(config.input)) {
      log(config, "debug", `Input path set: ${config.input}`);
    } else {
      log(
        config,
        "warning",
        `Invalid input path. Reverted to default: ${config.input}`
      );
    }
  } else {
    config.input = path.resolve(defaultConfig.input);
    log(
      config,
      "warning",
      `Invalid input path. Reverted to default: ${config.input}`
    );
  }
  return config;
}

function setOutput(config, argv) {
  config.output = argv.output || process.env.DOC_OUTPUT_PATH || config.output;
  config.output = path.resolve(config.output);
  log(config, "debug", `Output path set: ${config.output}`);
  return config;
}

function setSetup(config, argv) {
  config.setup = argv.setup || process.env.DOC_SETUP || config.setup;
  if (config.setup === "") {
    log(config, "debug", `No setup tests.`);
    return config;
  } else {
    config.setup = path.resolve(config.setup);
    if (fs.existsSync(config.setup)) {
      log(config, "debug", `Setup tests path set: ${config.setup}`);
    } else {
      config.setup = defaultConfig.setup;
      log(config, "warning", `Invalid setup tests path.`);
    }
    return config;
  }
}

function setCleanup(config, argv) {
  config.cleanup = argv.cleanup || process.env.DOC_CLEANUP || config.cleanup;
  if (config.cleanup === "") {
    log(config, "debug", `No cleanup tests.`);
    return config;
  } else {
    config.cleanup = path.resolve(config.cleanup);
    if (fs.existsSync(config.cleanup)) {
      log(config, "debug", `Cleanup tests path set: ${config.cleanup}`);
    } else {
      config.cleanup = defaultConfig.cleanup;
      log(config, "warning", `Invalid cleanup tests path.`);
    }
    return config;
  }
}

function setMediaDirectory(config, argv) {
  config.mediaDirectory =
    argv.mediaDir ||
    process.env.DOC_MEDIA_DIRECTORY_PATH ||
    config.mediaDirectory;
  config.mediaDirectory = path.resolve(config.mediaDirectory);
  if (fs.existsSync(config.mediaDirectory)) {
    log(config, "debug", `Media directory set: ${config.mediaDirectory}`);
  } else {
    config.mediaDirectory = path.resolve(defaultConfig.mediaDirectory);
    log(
      config,
      "warning",
      `Invalid media directory. Reverted to default: ${config.mediaDirectory}`
    );
  }
  return config;
}

function setRecursion(config, argv) {
  config.recursive =
    argv.recursive || process.env.DOC_RECURSIVE || config.recursive;
  switch (config.recursive) {
    case true:
    case "true":
      config.recursive = true;
      log(config, "debug", `Recursion set: ${config.recursive}.`);
      break;
    case false:
    case "false":
      config.recursive = false;
      log(config, "debug", `Recursion set: ${config.recursive}.`);
      break;
    default:
      config.recursive = defaultConfig.recursive;
      log(
        config,
        "warning",
        `Invalid recursion valie. Reverted to default: ${config.recursive}.`
      );
  }
  return config;
}

function setTestFileExtensions(config, argv) {
  config.testExtensions =
    argv.ext || process.env.DOC_TEST_EXTENSTIONS || config.testExtensions;
  if (typeof config.testExtensions === "string")
    config.testExtensions = config.testExtensions
      .replace(/\s+/g, "")
      .split(",");
  if (config.testExtensions.length > 0) {
    log(
      config,
      "debug",
      `Test file extensions set: ${JSON.stringify(config.testExtensions)}`
    );
  } else {
    config.testExtensions = defaultConfig.testExtensions;
    log(
      config,
      "debug",
      `Invalid test file extension value(s). Reverted to default: ${JSON.stringify(
        config.testExtensions
      )}`
    );
  }
  return config;
}

function setBrowserHeadless(config, argv) {
  config.browserOptions.headless =
    argv.browserHeadless ||
    process.env.DOC_BROWSER_HEADLESS ||
    config.browserOptions.headless;
  switch (config.browserOptions.headless) {
    case true:
    case "true":
      config.browserOptions.headless = true;
      log(
        config,
        "debug",
        `Browser headless set to: ${config.browserOptions.headless}`
      );
      break;
    case false:
    case "false":
      config.browserOptions.headless = false;
      log(
        config,
        "debug",
        `Browser headless set to: ${config.browserOptions.headless}`
      );
      break;
    default:
      config.browserOptions.headless = defaultConfig.browserOptions.headless;
      log(
        config,
        "warning",
        `Invalid browser headless value. Reverted to default: ${config.browserOptions.headless}`
      );
  }
  return config;
}

function setBrowserPath(config, argv) {
  config.browserOptions.path =
    argv.browserPath ||
    process.env.DOC_BROWSER_PATH ||
    config.browserOptions.path;
  if (config.browserOptions.path === "") {
    log(config, "debug", `Browser set to default Chromium install.`);
    return config;
  } else {
    config.browserOptions.path = path.resolve(config.browserOptions.path);
    if (fs.existsSync(config.browserOptions.path)) {
      log(config, "debug", `Browser path set: ${config.browserOptions.path}`);
    } else {
      config.browserOptions.path = defaultConfig.browserOptions.path;
      log(
        config,
        "warning",
        `Invalid browser path. Reverted to default Chromium install.`
      );
    }
    return config;
  }
}

function setBrowserHeight(config, argv) {
  config.browserOptions.height =
    argv.browserHeight ||
    process.env.DOC_BROWSER_HEIGHT ||
    config.browserOptions.height;
  if (typeof config.browserOptions.height === "string") {
    try {
      config.browserOptions.height = Number(config.browserOptions.height);
    } catch {
      config.browserOptions.height = defaultConfig.browserOptions.height;
      log(
        config,
        "warning",
        `Invalid browser height. Reverted to default: ${config.browserOptions.height}`
      );
    }
  }
  if (typeof config.browserOptions.height === "number") {
    log(config, "debug", `Browser height set: ${config.browserOptions.height}`);
  } else {
    config.browserOptions.height = defaultConfig.browserOptions.height;
    log(
      config,
      "warning",
      `Invalid browser height. Reverted to default: ${config.browserOptions.height}`
    );
  }
  return config;
}

function setBrowserWidth(config, argv) {
  config.browserOptions.width =
    argv.browserWidth ||
    process.env.DOC_BROWSER_WIDTH ||
    config.browserOptions.width;
  if (typeof config.browserOptions.width === "string") {
    try {
      config.browserOptions.width = Number(config.browserOptions.width);
    } catch {
      config.browserOptions.width = defaultConfig.browserOptions.width;
      log(
        config,
        "warning",
        `Invalid browser width. Reverted to default: ${config.browserOptions.width}`
      );
    }
  }
  if (typeof config.browserOptions.width === "number") {
    log(config, "debug", `Browser width set: ${config.browserOptions.width}`);
  } else {
    config.browserOptions.width = defaultConfig.browserOptions.width;
    log(
      config,
      "warning",
      `Invalid browser width. Reverted to default: ${config.browserOptions.width}`
    );
  }
  return config;
}

function setAnalytics(config, argv) {
  config.analytics.send =
    argv.analytics || process.env.DOC_ANALYTICS || config.analytics.send;
  switch (config.analytics.send) {
    case true:
    case "true":
      config.analytics.send = true;
      log(config, "debug", `Analytics set: ${config.analytics.send}`);
      break;
    case false:
    case "false":
      config.analytics.send = false;
      log(config, "debug", `Analytics set: ${config.analytics.send}`);
      log(config, "info", analyticsRequest);
      break;
    default:
      config.analytics.send = defaultConfig.analytics.send;
      log(
        config,
        "warning",
        `Invalid analytics value. Reverted to default: ${config.analytics.send}`
      );
  }
  return config;
}

function setAnalyticsUserId(config, argv) {
  config.analytics.userId =
    argv.analyticsUserId ||
    process.env.DOC_ANALYTICS_USER_ID ||
    config.analytics.userId;
  log(config, "debug", `Analytics user ID set: ${config.analytics.userId}`);
  return config;
}

function setAnalyticsDetailLevel(config, argv) {
  let enums = ["run", "test", "action-simple", "action-detailed"];
  detailLevel =
    argv.analyticsDetailLevel ||
    process.env.DOC_ANALYTCS_DETAIL_LEVEL ||
    config.analytics.detailLevel;
  detailLevel = String(detailLevel).toLowerCase();
  if (enums.indexOf(detailLevel) >= 0) {
    config.analytics.detailLevel = detailLevel;
    log(config, "debug", `Analytics detail level set: ${detailLevel}`);
  } else {
    config.analytics.detailLevel = defaultConfig.analytics.detailLevel;
    log(
      config,
      "warning",
      `Invalid analytics detail level. Reverted to default: ${config.analytics.detailLevel}`
    );
  }
  return config;
}

function setAnalyticsServers(config, argv) {
  // Note: No validation on server info. It's up to users to get this right.
  if (config.analytics.customServers.length > 0) {
    config.analytics.servers = defaultAnalyticsServers.concat(
      config.analytics.customServers
    );
  } else {
    config.analytics.servers = defaultAnalyticsServers;
  }
  return config;
}

function setConfig(config, argv) {
  config = selectConfig(config, argv);

  config = setEnv(config, argv);

  config = setInput(config, argv);

  config = setOutput(config, argv);

  config = setSetup(config, argv);

  config = setCleanup(config, argv);

  config = setMediaDirectory(config, argv);

  config = setRecursion(config, argv);

  config = setTestFileExtensions(config, argv);

  config = setBrowserHeadless(config, argv);

  config = setBrowserPath(config, argv);

  config = setBrowserHeight(config, argv);

  config = setBrowserWidth(config, argv);

  config = setAnalytics(config, argv);

  config = setAnalyticsUserId(config, argv);

  config = setAnalyticsDetailLevel(config, argv);

  config = setAnalyticsServers(config, argv);

  return config;
}

// Set array of test files
function setFiles(config) {
  let dirs = [];
  let files = [];
  let sequence = [];

  // Validate input
  const setup = config.setup;
  if (setup) sequence.push(setup);
  const input = config.input;
  sequence.push(input);
  const cleanup = config.cleanup;
  if (cleanup) sequence.push(cleanup);

  for (s = 0; s < sequence.length; s++) {
    let isFile = fs.statSync(sequence[s]).isFile();
    let isDir = fs.statSync(sequence[s]).isDirectory();

    // Parse input
    if (
      // Is a file
      isFile &&
      // Isn't present in files array already
      files.indexOf(sequence[s]) < 0 &&
      // No extension filter or extension included in filter
      (config.testExtensions === "" ||
        config.testExtensions.includes(path.extname(sequence[s])))
    ) {
      files.push(sequence[s]);
    } else if (isDir) {
      // Load files from directory
      dirs = [];
      dirs[0] = sequence[s];
      for (let i = 0; i < dirs.length; i++) {
        fs.readdirSync(dirs[i]).forEach((object) => {
          let content = path.resolve(dirs[i] + "/" + object);
          let isFile = fs.statSync(content).isFile();
          let isDir = fs.statSync(content).isDirectory();
          if (
            // Is a file
            isFile &&
            // Isn't present in files array already
            files.indexOf(s) < 0 &&
            // No extension filter or extension included in filter
            (config.testExtensions === "" ||
              config.testExtensions.includes(path.extname(content)))
          ) {
            files.push(content);
          } else if (isDir && config.recursive) {
            // recursive set to true
            dirs.push(content);
          }
        });
      }
    }
  }
  return files;
}

// Parse files for tests
function parseFiles(config, files) {
  let json = { tests: [] };

  // Loop through test files
  files.forEach((file) => {
    log(config, "debug", `file: ${file}`);
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
  log(config, "info", "RESULTS:");
  log(config, "info", results);
  log(config, "info", `See detailed results at ${config.output}`);
}

async function convertToGif(config, input, fps, width) {
  const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;

  if (!fs.existsSync(input)) return { error: "Invalid input." };
  let output = path.join(
    path.parse(input).dir,
    path.parse(input).name + ".gif"
  );
  if (!fps) fps = 15;

  let command = `${ffmpegPath} -nostats -loglevel 0 -y -i ${input} -vf "fps=${fps},scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" -loop 0 ${output}`;
  exec(command, (error, stdout, stderr) => {
    if (error) {
      log(config, "debug", error.message);
      return { error: error.message };
    }
    if (stderr) {
      log(config, "debug", stderr);
      return { stderr };
    }
    log(config, "debug", stdout);
    fs.unlink(input, function (err) {
      if (err) {
        log(config, "warning", `Couldn't delete intermediate file: ${input}`);
      } else {
        log(config, "debug", `Deleted intermediate file: ${input}`);
      }
    });
    return { stdout };
  });
  return output;
}

async function setEnvs(envsFile) {
  const fileExists = fs.existsSync(envsFile);
  if (fileExists) {
    require("dotenv").config({ path: envsFile, override: true });
    return { status: "PASS", description: "Envs set." };
  } else {
    return { status: "FAIL", description: "Invalid file." };
  }
}

async function log(config, level, message) {
  let logLevelMatch = false;
  if (config.logLevel === "error" && level === "error") {
    logLevelMatch = true;
  } else if (
    config.logLevel === "warning" &&
    (level === "error" || level === "warning")
  ) {
    logLevelMatch = true;
  } else if (
    config.logLevel === "info" &&
    (level === "error" || level === "warning" || level === "info")
  ) {
    logLevelMatch = true;
  } else if (
    config.logLevel === "debug" &&
    (level === "error" ||
      level === "warning" ||
      level === "info" ||
      level === "debug")
  ) {
    logLevelMatch = true;
  }

  if (logLevelMatch) {
    if (typeof message === "string") {
      let logMessage = `(${level.toUpperCase()}) ${message}`;
      console.log(logMessage);
    } else if (typeof message === "object") {
      let logMessage = `(${level.toUpperCase()})`;
      console.log(logMessage);
      console.log(message);
    }
  }
}

function loadEnvsForObject(object) {
  Object.keys(object).forEach((key) => {
    if (typeof object[key] === "object") {
      object[key] = loadEnvsForObject(object[key]);
    } else if (object[key][0] === "$") {
      object[key] = process.env[object[key].substring(1)];
    }
  });
  return object;
}
