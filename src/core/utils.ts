import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import axios from "axios";
import { spawn } from "node:child_process";

export {
  outputResults,
  loadEnvs,
  log,
  timestamp,
  replaceEnvs,
  spawnCommand,
  inContainer,
  cleanTemp,
  calculateFractionalDifference,
  fetchFile,
  isRelativeUrl,
};

/**
 * Determines whether a URL string is relative.
 *
 * @param url - The URL string to test
 * @returns `true` if `url` is a relative URL, `false` otherwise
 */
function isRelativeUrl(url: string) {
  try {
    new URL(url);
    // If no error is thrown, it's a complete URL
    return false;
  } catch (error) {
    // If URL constructor throws an error, it's a relative URL
    return true;
  }
}

/**
 * Removes all files and subdirectories inside the "doc-detective" directory within the OS temporary directory.
 *
 * If the directory exists, its entries are deleted; the "doc-detective" directory itself is not removed.
 */
function cleanTemp() {
  const tempDir = path.join(os.tmpdir(), "doc-detective");
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
/**
 * Fetches a remote file and caches it in a temporary doc-detective directory.
 *
 * Downloads the resource at `fileURL`, normalizes response data to a string (JSON-stringifying objects),
 * writes the content to a temp file named with an MD5 hash and the original filename, and returns the file path.
 *
 * @param fileURL - The HTTP(S) URL of the resource to fetch.
 * @returns An object with `result: "success"` and `path` when the file was written or already exists; otherwise `result: "error"` and a `message` containing the caught error.
 */
async function fetchFile(fileURL: string) {
  try {
    const response = await axios.get(fileURL);
    if (typeof response.data === "object") {
      response.data = JSON.stringify(response.data, null, 2);
    } else {
      response.data = response.data.toString();
    }
    const fileName = fileURL.split("/").pop() || "fetched_file";
    const hash = crypto.createHash("md5").update(response.data).digest("hex");
    const ddTempDir = path.join(os.tmpdir(), "doc-detective");
    const filePath = path.join(ddTempDir, `${hash}_${fileName}`);
    // If doc-detective temp directory doesn't exist, create it
    if (!fs.existsSync(ddTempDir)) {
      fs.mkdirSync(ddTempDir, { recursive: true });
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

/**
 * Write `results` as pretty-printed JSON to `path` and emit informational log messages about the saved file and cleanup progress.
 *
 * Serializes `results` with 2-space indentation before writing. After writing, logs the results, the output path, and a final cleanup/finish message using the provided `config`.
 *
 * @param path - Filesystem path where the JSON results will be written
 * @param results - The value to serialize and save
 * @param config - Logger configuration object passed to the internal `log` function
 */
async function outputResults(path: string, results: any, config: any) {
  let data = JSON.stringify(results, null, 2);
  fs.writeFileSync(path, data);
  log(config, "info", "RESULTS:");
  log(config, "info", results);
  log(config, "info", `See results at ${path}`);
  log(config, "info", "Cleaning up and finishing post-processing.");
}

/**
 * Load environment variables from the specified .env file and apply them with override enabled.
 *
 * @param envsFile - Path to the .env file to load.
 * @returns An object with `status` set to `"PASS"` if variables were loaded, `"FAIL"` if the file was not found, and `description` containing a human-readable message.
 */
async function loadEnvs(envsFile: string) {
  const fileExists = fs.existsSync(envsFile);
  if (fileExists) {
    const { default: dotenv } = await import("dotenv");
    dotenv.config({ path: envsFile, override: true });
    return { status: "PASS", description: "Envs set." };
  } else {
    return { status: "FAIL", description: "Invalid file." };
  }
}

/**
 * Logs a message to the console when the configured log level allows the given severity.
 *
 * Logs are prefixed with the uppercase level in parentheses; if `message` is an object it is printed as pretty JSON on the following lines.
 *
 * @param config - Optional configuration object that may include `logLevel` with one of: `"error"`, `"warning"`, `"info"`, or `"debug"`. If omitted the function treats all levels as disabled.
 * @param level - Severity of the message: `"error"`, `"warning"`, `"info"`, or `"debug"`. Messages are emitted only when `config.logLevel` permits this severity.
 * @param message - The payload to log. If a string, it is printed on a single line; if an object, it is printed as formatted JSON. If omitted the function supports the two-argument form `log(message, level)`.
 */
async function log(config: any, level: string, message?: any) {
  if (message === undefined) {
    // 2-arg form: log(message, level)
    message = config;
    config = {};
  }
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

/**
 * Recursively replaces environment-variable placeholders in a string or all string values within an object.
 *
 * For strings, occurrences of `$VAR` are replaced with the value of `process.env.VAR`. If the placeholder spans the entire string and the environment value parses as JSON to an object, the parsed object is used instead of a string. Replacement is applied recursively to allow nested variables. For objects, the function traverses own enumerable properties and applies the same replacement behavior to each value; it skips keys that could introduce prototype pollution (`__proto__`, `constructor`, `prototype`).
 *
 * @param stringOrObject - A string or an object whose string values may contain `$VAR` placeholders.
 * @returns The input with environment placeholders replaced: a string, an object, or the original value if no replacements were performed.
 */
function replaceEnvs(stringOrObject: any): any {
  if (!stringOrObject) return stringOrObject;
  if (typeof stringOrObject === "object") {
    // Iterate through object and recursively resolve variables
    Object.keys(stringOrObject).forEach((key) => {
      if (key === "__proto__" || key === "constructor" || key === "prototype") return;
      // Resolve all variables in key value
      stringOrObject[key] = replaceEnvs(stringOrObject[key]);
    });
  } else if (typeof stringOrObject === "string") {
    // Load variable from string
    const variableRegex = new RegExp(/\$[a-zA-Z0-9_]+/, "g");
    const matches = stringOrObject.match(variableRegex);
    // If no matches, return string
    if (!matches) return stringOrObject;
    // Iterate matches
    matches.forEach((match) => {
      // Check if is declared variable
      let value: any = process.env[match.substring(1)];
      if (value) {
        // If match is the entire string instead of just being a substring, try to convert value to object
        try {
          if (
            match.length === stringOrObject.length &&
            typeof JSON.parse(value) === "object"
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

/**
 * Generate a compact timestamp string in the format YYYYMMDD-HHMMSS.
 *
 * @returns A string formatted as `YYYYMMDD-HHMMSS` representing the current local date and time.
 */
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
 * Run a shell command and capture its stdout, stderr, and exit code.
 *
 * @param cmd - The command to execute (run in a shell).
 * @param args - Array of arguments to pass to the command.
 * @param options - Optional execution settings.
 * @param options.cwd - Working directory in which to run the command.
 * @param options.debug - If truthy, stream output chunks to the console while the command runs.
 * @returns An object containing `stdout` (string), `stderr` (string), and `exitCode` (process exit code).
 */
async function spawnCommand(cmd: string, args: string[] = [], options: any = {}) {
  // Set spawnOptions based on OS
  const spawnOptions: any = {
    shell: true,
  };
  if (process.platform === "win32") {
    spawnOptions.windowsHide = true;
  }
  if (options.cwd) {
    spawnOptions.cwd = options.cwd;
  }

  const runCommand = spawn(cmd, args, spawnOptions);
  runCommand.on("error", (error) => {});

  // Set up exit code promise BEFORE consuming streams to avoid race condition
  const exitCodePromise = new Promise((resolve) => {
    runCommand.on("close", resolve);
  });

  // Capture stdout and stderr concurrently to avoid deadlock
  let stdout = "";
  let stderr = "";
  const stdoutPromise = (async () => {
    for await (const chunk of runCommand.stdout) {
      stdout += chunk;
      if (options.debug) console.log(chunk.toString());
    }
  })();
  const stderrPromise = (async () => {
    for await (const chunk of runCommand.stderr) {
      stderr += chunk;
      if (options.debug) console.log(chunk.toString());
    }
  })();
  await Promise.all([stdoutPromise, stderrPromise]);
  // Remove trailing newlines
  stdout = stdout.replace(/\n$/, "");
  stderr = stderr.replace(/\n$/, "");

  // Capture exit code
  const exitCode = await exitCodePromise;

  return { stdout, stderr, exitCode };
}

/**
 * Detects whether the current process is running inside a containerized environment.
 *
 * Checks the `IN_CONTAINER` environment variable and, on Linux, inspects `/proc/1/cgroup` for common container indicators.
 *
 * @returns `true` if running inside a container, `false` otherwise.
 */
async function inContainer() {
  if (process.env.IN_CONTAINER === "true") return true;
  if (process.platform === "linux") {
    const result = await spawnCommand(
      `grep -sq "docker\|lxc\|kubepods" /proc/1/cgroup`
    );
    if (result.exitCode === 0) return true;
  }
  return false;
}

/**
 * Computes the fractional difference between two strings based on Levenshtein distance.
 *
 * @param text1 - The first string to compare
 * @param text2 - The second string to compare
 * @returns A number in the range 0 to 1 representing the edit distance divided by the length of the longer string; `0` means the strings are identical
 */
function calculateFractionalDifference(text1: string, text2: string) {
  const distance = llevenshteinDistance(text1, text2);
  const maxLength = Math.max(text1.length, text2.length);
  if (maxLength === 0) return 0; // Both strings are empty
  const fractionalDiff = distance / maxLength;
  return fractionalDiff;
}

/**
 * Computes the Levenshtein distance between two strings.
 *
 * @param s - The first string (source)
 * @param t - The second string (target)
 * @returns The minimum number of single-character insertions, deletions, or substitutions required to transform `s` into `t`
 */
function llevenshteinDistance(s: string, t: string) {
  if (!s.length) return t.length;
  if (!t.length) return s.length;

  const arr: number[][] = [];

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