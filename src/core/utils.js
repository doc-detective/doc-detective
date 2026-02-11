const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const axios = require("axios");
const { spawn } = require("child_process");

exports.outputResults = outputResults;
exports.loadEnvs = loadEnvs;
exports.log = log;
exports.timestamp = timestamp;
exports.replaceEnvs = replaceEnvs;
exports.spawnCommand = spawnCommand;
exports.inContainer = inContainer;
exports.cleanTemp = cleanTemp;
exports.calculateFractionalDifference = calculateFractionalDifference;
exports.fetchFile = fetchFile;
exports.isRelativeUrl = isRelativeUrl;

function isRelativeUrl(url) {
  try {
    new URL(url);
    // If no error is thrown, it's a complete URL
    return false;
  } catch (error) {
    // If URL constructor throws an error, it's a relative URL
    return true;
  }
}

// Delete all contents of doc-detective temp directory
function cleanTemp() {
  const tempDir = `${os.tmpdir}/doc-detective`;
  if (fs.existsSync(tempDir)) {
    fs.readdirSync(tempDir).forEach((file) => {
      const curPath = `${tempDir}/${file}`;
      const stat = fs.statSync(curPath);
      if (stat.isDirectory()) {
        fs.rmSync(curPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(curPath);
      }
    });
  }
}

// Fetch a file from a URL and save to a temp directory
// If the file is not JSON, return the contents as a string
// If the file is not found, return an error
async function fetchFile(fileURL) {
  try {
    const response = await axios.get(fileURL);
    if (typeof response.data === "object") {
      response.data = JSON.stringify(response.data, null, 2);
    } else {
      response.data = response.data.toString();
    }
    const fileName = fileURL.split("/").pop();
    const hash = crypto.createHash("md5").update(response.data).digest("hex");
    const filePath = `${os.tmpdir}/doc-detective/${hash}_${fileName}`;
    // If doc-detective temp directory doesn't exist, create it
    if (!fs.existsSync(`${os.tmpdir}/doc-detective`)) {
      fs.mkdirSync(`${os.tmpdir}/doc-detective`);
    }
    // If file doesn't exist, write it
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, response.data);
    }
    return { result: "success", path: filePath };
  } catch (error) {
    return { result: "error", message: error };
  }
}

async function outputResults(path, results, config) {
  let data = JSON.stringify(results, null, 2);
  fs.writeFile(path, data, (err) => {
    if (err) throw err;
  });
  log(config, "info", "RESULTS:");
  log(config, "info", results);
  log(config, "info", `See results at ${path}`);
  log(config, "info", "Cleaning up and finishing post-processing.");
}

/**
 * Loads environment variables from a specified .env file.
 *
 * @async
 * @param {string} envsFile - Path to the environment variables file.
 * @returns {Promise<Object>} An object containing the operation result.
 * @returns {string} returns.status - "PASS" if environment variables were loaded successfully, "FAIL" otherwise.
 * @returns {string} returns.description - A description of the operation result.
 */
async function loadEnvs(envsFile) {
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
      console.log(JSON.stringify(message, null, 2));
    }
  }
}

function replaceEnvs(stringOrObject) {
  if (!stringOrObject) return stringOrObject;
  if (typeof stringOrObject === "object") {
    // Iterate through object and recursively resolve variables
    Object.keys(stringOrObject).forEach((key) => {
      // Resolve all variables in key value
      stringOrObject[key] = replaceEnvs(stringOrObject[key]);
    });
  } else if (typeof stringOrObject === "string") {
    // Load variable from string
    variableRegex = new RegExp(/\$[a-zA-Z0-9_]+/, "g");
    matches = stringOrObject.match(variableRegex);
    // If no matches, return string
    if (!matches) return stringOrObject;
    // Iterate matches
    matches.forEach((match) => {
      // Check if is declared variable
      value = process.env[match.substring(1)];
      if (value) {
        // If match is the entire string instead of just being a substring, try to convert value to object
        try {
          if (
            match.length === stringOrObject.length &&
            typeof JSON.parse(stringOrObject) === "object"
          ) {
            value = JSON.parse(value);
          }
        } catch {}
        // Attempt to load additional variables in value
        value = replaceEnvs(value);
        // Replace match with variable value
        if (typeof value === "string") {
          // Replace match with value. Supports whole- and sub-string matches.
          stringOrObject = stringOrObject.replace(match, value);
        } else if (typeof value === "object") {
          // If value is an object, replace match with object
          stringOrObject = value;
        }
      }
    });
  }
  return stringOrObject;
}

function timestamp() {
  let timestamp = new Date();
  return `${timestamp.getFullYear()}${("0" + (timestamp.getMonth() + 1)).slice(
    -2
  )}${("0" + timestamp.getDate()).slice(-2)}-${(
    "0" + timestamp.getHours()
  ).slice(-2)}${("0" + timestamp.getMinutes()).slice(-2)}${(
    "0" + timestamp.getSeconds()
  ).slice(-2)}`;
}

// Perform a native command in the current working directory.
/**
 * Executes a command in a child process using the `spawn` function from the `child_process` module.
 * @param {string} cmd - The command to execute.
 * @param {string[]} args - The arguments to pass to the command.
 * @param {object} options - The options for the command execution.
 * @param {boolean} options.workingDirectory - Directory in which to execute the command.
 * @param {boolean} options.debug - Whether to enable debug mode.
 * @returns {Promise<object>} A promise that resolves to an object containing the stdout, stderr, and exit code of the command.
 */
async function spawnCommand(cmd, args = [], options) {
  // Set default options
  if (!options) options = {};

  // Set shell (bash/cmd) based on OS
  let shell = "bash";
  let command = ["-c"];
  if (process.platform === "win32") {
    shell = "cmd";
    command = ["/c"];
  }

  // Combine command and arguments
  let fullCommand = [cmd, ...args].join(" ");
  command.push(fullCommand);

  // Set spawnOptions based on OS
  let spawnOptions = {};
  let cleanupNodeModules = false;
  if (process.platform === "win32") {
    spawnOptions.shell = true;
    spawnOptions.windowsHide = true;
  }
  if (options.cwd) {
    spawnOptions.cwd = options.cwd;
  }

  const runCommand = spawn(shell, command, spawnOptions);
  runCommand.on("error", (error) => {});

  // Capture stdout
  let stdout = "";
  for await (const chunk of runCommand.stdout) {
    stdout += chunk;
    if (options.debug) console.log(chunk.toString());
  }
  // Remove trailing newline
  stdout = stdout.replace(/\n$/, "");

  // Capture stderr
  let stderr = "";
  for await (const chunk of runCommand.stderr) {
    stderr += chunk;
    if (options.debug) console.log(chunk.toString());
  }
  // Remove trailing newline
  stderr = stderr.replace(/\n$/, "");

  // Capture exit code
  const exitCode = await new Promise((resolve, reject) => {
    runCommand.on("close", resolve);
  });

  return { stdout, stderr, exitCode };
}

async function inContainer() {
  if (process.env.IN_CONTAINER === "true") return true;
  if (process.platform === "linux") {
    result = await spawnCommand(
      `grep -sq "docker\|lxc\|kubepods" /proc/1/cgroup`
    );
    if (result.exitCode === 0) return true;
  }
  return false;
}

/**
 * Calculates the fractional difference between two strings using Levenshtein distance.
 * @param {string} text1 - First string to compare
 * @param {string} text2 - Second string to compare
 * @returns {number} Fractional difference between 0 and 1, where 0 means identical
 *                   and 1 means completely different. Compare against maxVariation
 *                   thresholds directly (e.g., 0.1 for 10% tolerance).
 */
function calculateFractionalDifference(text1, text2) {
  const distance = llevenshteinDistance(text1, text2);
  const maxLength = Math.max(text1.length, text2.length);
  if (maxLength === 0) return 0; // Both strings are empty
  const fractionalDiff = distance / maxLength;
  return fractionalDiff;
}

function llevenshteinDistance(s, t) {
  if (!s.length) return t.length;
  if (!t.length) return s.length;

  const arr = [];

  for (let i = 0; i <= t.length; i++) {
    arr[i] = [i];
  }

  for (let j = 0; j <= s.length; j++) {
    arr[0][j] = j;
  }

  for (let i = 1; i <= t.length; i++) {
    for (let j = 1; j <= s.length; j++) {
      arr[i][j] = Math.min(
        arr[i - 1][j] + 1, // deletion
        arr[i][j - 1] + 1, // insertion
        arr[i - 1][j - 1] + (s[j - 1] === t[i - 1] ? 0 : 1) // substitution
      );
    }
  }

  return arr[t.length][s.length];
}
