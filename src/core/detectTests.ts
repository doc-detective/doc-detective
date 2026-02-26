/**
 * File-level test detection for Doc Detective Core.
 * Discovers input files, reads them, and parses tests from content.
 * Uses detectTests from common for browser-compatible content parsing.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { validate, detectTests as parseContent } from "doc-detective-common";
import { readFile, resolvePaths } from "./files.js";
import { log, fetchFile, spawnCommand } from "./utils.js";

export { detectTests };

/**
 * Detects tests from files based on config.
 * Assumes config has already been processed by setConfig.
 *
 * @async
 * @param {Object} options
 * @param {Object} options.config - Resolved configuration object
 * @returns {Promise<Array>} Array of test specifications
 */
async function detectTests({ config }: { config: any }) {
  const files = await qualifyFiles({ config });
  log(config, "debug", `FILES:`);
  log(config, "debug", files);

  const specs = await parseTests({ config, files });
  log(config, "debug", `SPECS:`);
  log(config, "info", specs);

  return specs;
}

/**
 * Generates a unique specId from a file path that is safe for storage/URLs.
 * @param {string} filePath - Absolute or relative file path
 * @returns {string} A safe specId derived from the file path
 */
function generateSpecId(filePath: string) {
  const absolutePath = path.resolve(filePath);
  const cwd = process.cwd();

  let relativePath;
  if (absolutePath.startsWith(cwd)) {
    relativePath = path.relative(cwd, absolutePath);
  } else {
    relativePath = absolutePath;
  }

  const normalizedPath = relativePath
    .split(path.sep)
    .join("/")
    .replace(/^\.\//, "")
    .replace(/[^a-zA-Z0-9._\-\/]/g, "_");

  return normalizedPath;
}

/**
 * Check if a source file is valid based on fileType definitions.
 * @param {Object} options
 * @param {Object} options.config - Configuration object
 * @param {Array} options.files - Already qualified files
 * @param {string} options.source - File path to check
 * @returns {Promise<boolean>}
 */
async function isValidSourceFile({ config, files, source }: { config: any; files: any[]; source: string }) {
  log(config, "debug", `validation: ${source}`);
  let allowedExtensions = ["json", "yaml", "yml"];
  config.fileTypes.forEach((fileType: any) => {
    allowedExtensions = allowedExtensions.concat(fileType.extensions);
  });
  // Already in files array
  if (files.indexOf(source) >= 0) return false;
  // Is JSON or YAML but isn't a valid spec-formatted object
  if (
    path.extname(source) === ".json" ||
    path.extname(source) === ".yaml" ||
    path.extname(source) === ".yml"
  ) {
    const content: any = await readFile({ fileURLOrPath: source });
    if (typeof content !== "object") {
      log(
        config,
        "debug",
        `${source} isn't a valid test specification. Skipping.`
      );
      return false;
    }
    const validation = validate({
      schemaKey: "spec_v3",
      object: content,
      addDefaults: false,
    });
    if (!validation.valid) {
      log(config, "warning", validation);
      log(
        config,
        "warning",
        `${source} isn't a valid test specification. Skipping.`
      );
      return false;
    }
    for (const test of content.tests) {
      if (test.before) {
        let beforePath = "";
        if (config.relativePathBase === "file") {
          beforePath = path.resolve(path.dirname(source), test.before);
        } else {
          beforePath = path.resolve(test.before);
        }
        if (!fs.existsSync(beforePath)) {
          log(
            config,
            "debug",
            `${beforePath} is specified to run before a test but isn't a valid file. Skipping ${source}.`
          );
          return false;
        }
      }
      if (test.after) {
        let afterPath = "";
        if (config.relativePathBase === "file") {
          afterPath = path.resolve(path.dirname(source), test.after);
        } else {
          afterPath = path.resolve(test.after);
        }
        if (!fs.existsSync(afterPath)) {
          log(
            config,
            "debug",
            `${afterPath} is specified to run after a test but isn't a valid file. Skipping ${source}.`
          );
          return false;
        }
      }
    }
  }
  // Extension not in allowed list
  const extension = path.extname(source).substring(1);
  if (!allowedExtensions.includes(extension)) {
    log(
      config,
      "debug",
      `${source} extension isn't specified in a \`config.fileTypes\` object. Skipping.`
    );
    return false;
  }

  return true;
}

/**
 * Process a DITA map into a set of files using the dita CLI tool.
 * @param {Object} options
 * @param {Object} options.config - Configuration object
 * @param {string} options.source - Path to the ditamap file
 * @returns {Promise<string|null>} Path to output directory or null on failure
 */
async function processDitaMap({ config, source }: { config: any; source: string }) {
  const hash = crypto.createHash("md5").update(source).digest("hex");
  const tmpBase = path.join(os.tmpdir(), "doc-detective");
  const outputDir = path.join(tmpBase, `ditamap_${hash}`);
  if (!fs.existsSync(tmpBase)) {
    log(config, "debug", `Creating temp directory: ${tmpBase}`);
    fs.mkdirSync(tmpBase, { recursive: true });
  }
  const ditaVersion = await spawnCommand("dita", ["--version"]);
  if (ditaVersion.exitCode !== 0) {
    log(
      config,
      "error",
      `'dita' command not found. Make sure it's installed. Error: ${ditaVersion.stderr}`
    );
    return null;
  }

  log(config, "info", `Processing DITA map: ${source}`);
  const ditaOutputDir = await spawnCommand("dita", [
    "-i",
    source,
    "-f",
    "dita",
    "-o",
    outputDir,
  ]);
  if (ditaOutputDir.exitCode !== 0) {
    log(config, "error", `Failed to process DITA map: ${ditaOutputDir.stderr}`);
    return null;
  }
  return outputDir;
}

/**
 * Inspect and qualify files as valid inputs based on config.
 * @param {Object} options
 * @param {Object} options.config - Configuration object
 * @returns {Promise<Array<string>>} Array of qualified file paths
 */
async function qualifyFiles({ config }: { config: any }) {
  let dirs: string[] = [];
  let files: string[] = [];
  let sequence: any[] = [];

  const setup = config.beforeAny;
  if (setup) sequence = sequence.concat(setup);
  const input = config.input;
  sequence = sequence.concat(input);
  const cleanup = config.afterAll;
  if (cleanup) sequence = sequence.concat(cleanup);

  if (sequence.length === 0) {
    log(config, "warning", "No input sources specified.");
    return [];
  }

  const ignoredDitaMaps: string[] = [];

  // Track Heretto output paths for sourceIntegration metadata
  if (!config._herettoPathMapping) {
    config._herettoPathMapping = {};
  }

  for (let source of sequence) {
    log(config, "debug", `source: ${source}`);

    // Check if source is a heretto:<name> reference
    if (source.startsWith("heretto:")) {
      log(
        config,
        "warning",
        `Heretto integration "${source}" is not supported in core. Use the resolver module for Heretto support.`
      );
      continue;
    }

    // Check if source is a URL
    let isURL = source.startsWith("http://") || source.startsWith("https://");
    if (isURL) {
      const fetch = await fetchFile(source);
      if (fetch.result === "error") {
        log(config, "warning", fetch.message);
        continue;
      }
      source = fetch.path;
    }
    // Check if source is a file or directory
    let isFile = false;
    let isDir = false;
    try {
      isFile = fs.statSync(source).isFile();
      isDir = fs.statSync(source).isDirectory();
    } catch {
      log(config, "warning", `Cannot access path: ${source}. Skipping.`);
      continue;
    }

    // If ditamap, process with `dita` to build files
    if (
      isFile &&
      path.extname(source) === ".ditamap" &&
      !ignoredDitaMaps.some((ignored) => source.includes(ignored)) &&
      config.processDitaMaps
    ) {
      const ditaOutput = await processDitaMap({ config, source });
      if (ditaOutput) {
        const currentIndex = sequence.indexOf(source);
        sequence.splice(currentIndex + 1, 0, ditaOutput);
        ignoredDitaMaps.push(ditaOutput);
      }
      continue;
    }

    // Parse input
    if (isFile && (await isValidSourceFile({ config, files, source }))) {
      files.push(path.resolve(source));
    } else if (isDir) {
      dirs = [];
      dirs[0] = source;
      for (const dir of dirs) {
        const objects = fs.readdirSync(dir);
        for (const object of objects) {
          const content = path.resolve(dir + "/" + object);
          if (content.includes("node_modules")) continue;
          const isFile = fs.statSync(content).isFile();
          const isDir = fs.statSync(content).isDirectory();
          if (
            isFile &&
            (await isValidSourceFile({ config, files, source: content }))
          ) {
            files.push(path.resolve(content));
          } else if (isDir && config.recursive) {
            dirs.push(content);
          }
        }
      }
    }
  }
  return files;
}

/**
 * Parse files for tests. Reads each file and extracts test specifications.
 * Uses detectTests from common for text content parsing.
 *
 * @param {Object} options
 * @param {Object} options.config - Configuration object
 * @param {Array<string>} options.files - Array of file paths to parse
 * @returns {Promise<Array>} Array of test specifications
 */
async function parseTests({ config, files }: { config: any; files: string[] }) {
  let specs: any[] = [];

  for (const file of files) {
    log(config, "debug", `file: ${file}`);
    const extension = path.extname(file).slice(1);
    let content: any = "";
    content = await readFile({ fileURLOrPath: file });

    if (typeof content === "object") {
      // JSON/YAML spec file - resolve paths and validate
      content = await resolvePaths({
        config: config,
        object: content,
        filePath: file,
      });

      for (const test of content.tests) {
        if (test.before) {
          const setup: any = await readFile({ fileURLOrPath: test.before });
          if (setup?.tests?.[0]?.steps) {
            test.steps = setup.tests[0].steps.concat(test.steps);
          }
        }
        if (test.after) {
          const cleanup: any = await readFile({ fileURLOrPath: test.after });
          if (cleanup?.tests?.[0]?.steps) {
            test.steps = test.steps.concat(cleanup.tests[0].steps);
          }
        }
      }
      // Validate each step
      for (const test of content.tests) {
        test.steps = test.steps.filter((step: any) => {
          const validation = validate({
            schemaKey: `step_v3`,
            object: { ...step },
            addDefaults: false,
          });
          if (!validation.valid) {
            log(
              config,
              "warning",
              `Step ${step} isn't a valid step. Skipping.`
            );
            return false;
          }
          return true;
        });
      }
      const validation = validate({
        schemaKey: "spec_v3",
        object: content,
        addDefaults: false,
      });
      if (!validation.valid) {
        log(config, "warning", validation);
        log(
          config,
          "warning",
          `After applying setup and cleanup steps, ${file} isn't a valid test specification. Skipping.`
        );
        continue;
      }
      content = validation.object;
      content = await resolvePaths({
        config: config,
        object: content,
        filePath: file,
      });
      specs.push(content);
    } else {
      // Text content - use common's detectTests for parsing
      let id = generateSpecId(file);
      let spec: any = { specId: id, contentPath: file, tests: [] };
      const fileType = config.fileTypes.find((fileType: any) =>
        fileType.extensions.includes(extension)
      );

      // Process executables
      if (fileType?.runShell) {
        let runShell: any = JSON.stringify(fileType.runShell);
        runShell = runShell.replace(/\$1/g, file);
        runShell = JSON.parse(runShell);

        const test = {
          steps: [
            {
              runShell,
            },
          ],
        };

        const validation = validate({
          schemaKey: "test_v3",
          object: test,
          addDefaults: false,
        });
        if (!validation.valid) {
          log(
            config,
            "warning",
            `Failed to convert ${file} to a runShell step: ${validation.errors}. Skipping.`
          );
          continue;
        }

        spec.tests.push(test);
        continue;
      }

      // Parse content using common's detectTests
      const tests = await parseContent({
        config: config,
        content: content,
        fileType: fileType,
        filePath: file,
      });
      spec.tests.push(...tests);

      // Remove tests with no steps
      spec.tests = spec.tests.filter(
        (test: any) => test.steps && test.steps.length > 0
      );

      // Validate spec
      const validation = validate({
        schemaKey: "spec_v3",
        object: spec,
        addDefaults: false,
      });
      if (!validation.valid) {
        log(
          config,
          "warning",
          `Tests from ${file} don't create a valid test specification. Skipping.`
        );
      } else {
        spec = await resolvePaths({
          config: config,
          object: spec,
          filePath: file,
        });
        specs.push(spec);
      }
    }
  }
  return specs;
}
