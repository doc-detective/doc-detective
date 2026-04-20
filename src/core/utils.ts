import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import dns from "node:dns/promises";
import net from "node:net";
import axios from "axios";
import { spawn } from "node:child_process";

export {
  outputResults,
  loadEnvs,
  log,
  timestamp,
  getOrInitRunTimestamp,
  replaceEnvs,
  spawnCommand,
  inContainer,
  cleanTemp,
  calculateFractionalDifference,
  fetchFile,
  isRelativeUrl,
  appendQueryParams,
  redactUrlForOutput,
  assertUrlHostIsPublic,
  sanitizeFilesystemName,
};

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

function appendQueryParams(
  url: string,
  params: Record<string, unknown> | undefined | null
): string {
  if (!params || typeof params !== "object" || Array.isArray(params)) return url;
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null
  );
  if (entries.length === 0) return url;

  // Split off the fragment so new params land before it, not inside.
  const hashIdx = url.indexOf("#");
  const fragment = hashIdx >= 0 ? url.slice(hashIdx) : "";
  const base = hashIdx >= 0 ? url.slice(0, hashIdx) : url;

  const queryIdx = base.indexOf("?");
  const pathAndAuthority = queryIdx >= 0 ? base.slice(0, queryIdx) : base;
  const existingQuery = queryIdx >= 0 ? base.slice(queryIdx + 1) : "";

  // Walk the existing query and drop only the segments whose key collides
  // with a new entry; everything else is preserved byte-for-byte. Then
  // append the new pairs (encoded fresh). This avoids re-encoding any
  // non-colliding pair — `URLSearchParams.toString()` would otherwise
  // normalize `+` for spaces and percent-encode `:` / `,` etc., which
  // breaks signed URLs and strict backends. New params always go through
  // encodeURIComponent so callers can pass arbitrary strings.
  const newKeys = new Set(entries.map(([k]) => k));
  const preservedSegments = existingQuery
    ? existingQuery.split("&").filter((segment) => {
        if (!segment) return false;
        const eqIdx = segment.indexOf("=");
        const rawKey = eqIdx >= 0 ? segment.slice(0, eqIdx) : segment;
        let decodedKey: string;
        try {
          decodedKey = decodeURIComponent(rawKey);
        } catch {
          decodedKey = rawKey;
        }
        return !newKeys.has(decodedKey);
      })
    : [];
  const newPairs = entries.map(
    ([k, v]) =>
      `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`
  );

  const query = [...preservedSegments, ...newPairs].join("&");
  return pathAndAuthority + (query ? "?" + query : "") + fragment;
}

// Delete all contents of doc-detective temp directory
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

// Fetch a file from a URL and save to a temp directory.
// With `{ binary: true }`, fetches as arraybuffer and preserves raw bytes —
// required for images and other non-text payloads. Binary fetches also apply
// hard limits (timeout, max body size, max redirects) so a misbehaving server
// can't stall or OOM the run.
// Otherwise, non-JSON responses are stringified (text pass-through).
// Returns `{ result: "error", message }` on failure.
const FETCH_BINARY_DEFAULTS = {
  responseType: "arraybuffer" as const,
  timeout: 30_000,
  maxContentLength: 50 * 1024 * 1024,
  maxBodyLength: 50 * 1024 * 1024,
  maxRedirects: 5,
};

// Replace characters that are invalid in filenames on Windows (and often
// problematic on other platforms) with `_`. Keeps dots, hyphens, and
// alphanumerics untouched so names stay recognizable. Also rejects leading
// dots that could turn the file into a traversal segment.
function sanitizeFilesystemName(name: string, fallback: string): string {
  if (!name || name === "." || name === "..") return fallback;
  // Control chars 0x00-0x1f + Windows reserved: < > : " / \ | ? *
  const cleaned = name.replace(/[\x00-\x1f<>:"/\\|?*]/g, "_");
  // After replacement, guard against all-dots or empty results.
  if (!cleaned || /^\.+$/.test(cleaned)) return fallback;
  return cleaned;
}

// Derive a safe on-disk filename from a URL. URL-derived strings can contain
// path separators (`/`, `\`), traversal segments (`..`), or characters that
// are invalid in filenames on Windows (`:<>"|?*`). `path.basename` strips
// directory components; `sanitizeFilesystemName` then neutralizes remaining
// unsafe characters so `fetchFile` works on every platform.
function safeFilenameFromUrl(fileURL: string, fallback: string): string {
  let raw: string;
  try {
    raw = new URL(fileURL).pathname;
  } catch {
    raw = fileURL;
  }
  raw = raw.split("?")[0].split("#")[0];
  const base = path.basename(raw.replace(/\\/g, "/"));
  return sanitizeFilesystemName(base, fallback);
}

// Strip query string and fragment from a URL for display/logging. S3
// pre-signed URLs carry tokens/signatures in the query; leaking them into
// step descriptions, debug logs, or result outputs exposes credentials.
// The full URL with query is still used for the fetch itself — only the
// *reported* form is redacted.
function redactUrlForOutput(value: string): string {
  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return value.split("?")[0].split("#")[0];
  }
}

// Private/loopback/link-local IP ranges that binary URL fetches refuse to
// reach by default. Covers IPv4 RFC1918, loopback, link-local (169.254/16),
// carrier-grade NAT (100.64/10), and the cloud-metadata special cases
// (169.254.169.254 is inside link-local and thus covered).
function isPrivateOrLoopbackAddress(ip: string): boolean {
  if (!ip) return false;
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    if (normalized === "::1") return true;
    if (normalized === "::") return true;
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // unique local
    if (normalized.startsWith("fe80:")) return true; // link-local
    if (normalized.startsWith("::ffff:")) {
      // IPv4-mapped: recurse on the embedded v4
      return isPrivateOrLoopbackAddress(normalized.replace("::ffff:", ""));
    }
    return false;
  }
  return false;
}

// Reject URLs whose host resolves to a loopback/private IP, unless the
// caller explicitly opts in (DOC_DETECTIVE_ALLOW_LOCAL_URLS=true). Tests
// and trusted internal integrations set the env var; normal doc-spec input
// does not, so an untrusted spec can't pivot through doc-detective to hit
// cloud metadata or intranet services.
//
// Note: this is a best-effort check. DNS rebinding and TOCTOU races are
// possible between resolution and connect; for true SSRF-grade isolation,
// wire in an agent that validates the actual remote address at connect
// time. This guard covers the common misuse cases.
async function assertUrlHostIsPublic(fileURL: string): Promise<void> {
  if (process.env.DOC_DETECTIVE_ALLOW_LOCAL_URLS === "true") return;
  let parsed: URL;
  try {
    parsed = new URL(fileURL);
  } catch {
    throw new Error(`Invalid URL: ${redactUrlForOutput(fileURL)}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `Unsupported URL scheme (${parsed.protocol}) for ${redactUrlForOutput(
        fileURL
      )}`
    );
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  // Direct IP literals: check immediately.
  if (net.isIP(host)) {
    if (isPrivateOrLoopbackAddress(host)) {
      throw new Error(
        `Refusing to fetch private/loopback address (${host}). Set DOC_DETECTIVE_ALLOW_LOCAL_URLS=true to allow.`
      );
    }
    return;
  }
  // Hostnames: resolve and check every answer (A + AAAA).
  const lower = host.toLowerCase();
  if (lower === "localhost" || lower.endsWith(".localhost")) {
    throw new Error(
      `Refusing to fetch localhost (${host}). Set DOC_DETECTIVE_ALLOW_LOCAL_URLS=true to allow.`
    );
  }
  let addresses: { address: string }[];
  try {
    addresses = await dns.lookup(host, { all: true });
  } catch (error) {
    throw new Error(
      `Couldn't resolve host ${host} for SSRF check: ${(error as Error).message}`
    );
  }
  for (const { address } of addresses) {
    if (isPrivateOrLoopbackAddress(address)) {
      throw new Error(
        `Host ${host} resolves to a private/loopback address (${address}); refusing to fetch. Set DOC_DETECTIVE_ALLOW_LOCAL_URLS=true to allow.`
      );
    }
  }
}

async function fetchFile(
  fileURL: string,
  opts: { binary?: boolean } = {}
) {
  try {
    if (opts.binary) {
      // Only gate binary fetches for now — the text path is an internal
      // loader used by the test-detection pipeline and pre-dates this
      // change; expanding SSRF coverage there belongs in its own PR.
      await assertUrlHostIsPublic(fileURL);
    }
    const response = await axios.get(
      fileURL,
      opts.binary ? FETCH_BINARY_DEFAULTS : undefined
    );
    let data: Buffer | string;
    if (opts.binary) {
      data = Buffer.from(response.data);
    } else if (typeof response.data === "object") {
      data = JSON.stringify(response.data, null, 2);
    } else {
      data = response.data.toString();
    }
    const fileName = safeFilenameFromUrl(fileURL, "fetched_file");
    const hash = crypto.createHash("md5").update(data).digest("hex");
    const ddTempDir = path.join(os.tmpdir(), "doc-detective");
    const filePath = path.join(ddTempDir, `${hash}_${fileName}`);
    // Defense in depth: ensure the resolved path is still inside ddTempDir.
    const resolvedDir = path.resolve(ddTempDir);
    const resolvedFile = path.resolve(filePath);
    if (!resolvedFile.startsWith(resolvedDir + path.sep)) {
      return {
        result: "error",
        message: new Error(
          `Refusing to write outside temp dir: ${resolvedFile}`
        ),
      };
    }
    if (!fs.existsSync(ddTempDir)) {
      fs.mkdirSync(ddTempDir, { recursive: true });
    }
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, data);
    }
    return { result: "success", path: filePath };
  } catch (error) {
    return { result: "error", message: error };
  }
}

async function outputResults(path: string, results: any, config: any) {
  let data = JSON.stringify(results, null, 2);
  fs.writeFileSync(path, data);
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

// Memoize one timestamp per run on the config object so every URL-referenced
// screenshot in a single run lands in the same folder.
function getOrInitRunTimestamp(config: any): string {
  if (!config) return timestamp();
  if (!config.__runTimestamp) {
    config.__runTimestamp = timestamp();
  }
  return config.__runTimestamp;
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
 * Calculates the fractional difference between two strings using Levenshtein distance.
 * @param {string} text1 - First string to compare
 * @param {string} text2 - Second string to compare
 * @returns {number} Fractional difference between 0 and 1, where 0 means identical
 *                   and 1 means completely different. Compare against maxVariation
 *                   thresholds directly (e.g., 0.1 for 10% tolerance).
 */
function calculateFractionalDifference(text1: string, text2: string) {
  const distance = llevenshteinDistance(text1, text2);
  const maxLength = Math.max(text1.length, text2.length);
  if (maxLength === 0) return 0; // Both strings are empty
  const fractionalDiff = distance / maxLength;
  return fractionalDiff;
}

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
