/**
 * File-level test detection for Doc Detective Core.
 * Discovers input files, reads them, and parses tests from content.
 * Uses detectTests from common for browser-compatible content parsing.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import YAML from "yaml";
import { validate } from "../common/src/validate.js";
import { detectTests as parseContent, getLineNumber, getLineStarts, contentHash } from "../common/src/detectTests.js";
import { readFile, resolvePaths } from "./files.js";
import { log, fetchFile, spawnCommand } from "./utils.js";
import { loadHerettoContent, createApiClient, createRestApiClient, findScenario, getResourceDependencies, DEFAULT_SCENARIO_NAME } from "./integrations/heretto.js";

export { detectTests, parseTests, generateSpecId };

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

  // Relativize only when the path is genuinely inside cwd. A bare
  // startsWith(cwd) check would misclassify siblings that share a prefix
  // (/repo vs /repo-other), producing unstable `../`-laden IDs.
  const candidate = path.relative(cwd, absolutePath);
  const isInsideCwd =
    candidate.length > 0 &&
    !candidate.startsWith("..") &&
    !path.isAbsolute(candidate);
  const relativePath = isInsideCwd ? candidate : absolutePath;

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

  // Past the version guard: the `dita` CLI (Apache DITA-OT) is present and is
  // invoked to transform the map. This success path shells out to a real
  // external tool that isn't installed in the hermetic test env (the version
  // guard above returns first there), so it can't be exercised offline — its
  // outcome branches are covered only in an environment with DITA-OT (ADR 01017).
  /* c8 ignore start */
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
  /* c8 ignore stop */
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
  // Each sequence entry carries its phase so config-level beforeAny / afterAll
  // can be gated as execution barriers later (see runSpecs Phase 2). ditamap /
  // heretto splices inherit the triggering entry's phase. The per-file phase is
  // recorded in phaseByFile (keyed by resolved path, first-write-wins to match
  // the isValidSourceFile dedup) and stamped onto each spec as `_phase` in
  // parseTests.
  //
  // Call-order invariant: the map is published on `config._phaseByFile` (same
  // side-channel pattern as `config._herettoPathMapping`). parseTests reads it
  // from there, so qualifyFiles MUST run first; a parseTests call that bypasses
  // qualifyFiles safely defaults every spec to phase "main".
  let sequence: Array<{ source: string; phase: string }> = [];
  const phaseByFile: Map<string, string> = new Map();
  config._phaseByFile = phaseByFile;

  const toEntries = (value: any, phase: string) =>
    (value == null ? [] : [].concat(value)).map((source: string) => ({
      source,
      phase,
    }));

  sequence = sequence.concat(toEntries(config.beforeAny, "beforeAny"));
  sequence = sequence.concat(toEntries(config.input, "main"));
  sequence = sequence.concat(toEntries(config.afterAll, "afterAll"));

  if (sequence.length === 0) {
    log(config, "warning", "No input sources specified.");
    config._qualifiedFiles = [];
    return [];
  }

  const ignoredDitaMaps: string[] = [];

  // Track Heretto output paths for sourceIntegration metadata
  if (!config._herettoPathMapping) {
    config._herettoPathMapping = {};
  }

  for (let i = 0; i < sequence.length; i++) {
    let source: any = sequence[i].source;
    const phase = sequence[i].phase;
    log(config, "debug", `source: ${source}`);

    // Check if source is a heretto:<name> reference
    if (source.startsWith("heretto:")) {
      const herettoName = source.substring(8);
      const herettoConfig = config?.integrations?.heretto?.find(
        (h: any) => h.name === herettoName
      );

      if (!herettoConfig) {
        log(config, "warning", `Heretto integration "${herettoName}" not found in config. Skipping.`);
        continue;
      }

      // First-load branch: fetch+export the Heretto scenario over the network
      // (loadHerettoContent hits the Heretto API). Not reproducible offline;
      // the hermetic tests cover the no-integration and outputPath-reuse paths
      // instead (ADR 01017).
      /* c8 ignore start */
      if (!herettoConfig.outputPath) {
        try {
          const outputPath = await loadHerettoContent(herettoConfig, log, config);
          if (outputPath) {
            herettoConfig.outputPath = outputPath;
            config._herettoPathMapping[outputPath] = herettoName;
            sequence.splice(i + 1, 0, { source: outputPath, phase });
            ignoredDitaMaps.push(outputPath);
          } else {
            log(config, "warning", `Failed to load Heretto content for "${herettoName}". Skipping.`);
          }
        } catch (error: any) {
          log(config, "warning", `Failed to load Heretto content from "${herettoName}": ${error.message}`);
        }
        /* c8 ignore stop */
      } else {
        config._herettoPathMapping[herettoConfig.outputPath] = herettoName;
        if (!ignoredDitaMaps.includes(herettoConfig.outputPath)) {
          ignoredDitaMaps.push(herettoConfig.outputPath);
        }
        if (!sequence.some((e) => e.source === herettoConfig.outputPath)) {
          sequence.splice(i + 1, 0, {
            source: herettoConfig.outputPath,
            phase,
          });
        }
        // Hydrate resourceDependencies for uploadOnChange on reuse runs. This
        // fans out to the Heretto API (createApiClient/findScenario/
        // getResourceDependencies) — a network path not reproducible offline
        // (ADR 01017).
        /* c8 ignore start */
        if (herettoConfig.uploadOnChange && !herettoConfig.resourceDependencies) {
          try {
            const client = createApiClient(herettoConfig);
            const scenarioName = herettoConfig.scenarioName || DEFAULT_SCENARIO_NAME;
            const scenario = await findScenario(client, log, config, scenarioName);
            if (scenario) {
              const restClient = createRestApiClient(herettoConfig);
              herettoConfig.resourceDependencies = await getResourceDependencies(restClient, scenario.fileId, log, config);
            }
          } catch (error: any) {
            log(config, "warning", `Failed to fetch resource dependencies for "${herettoName}": ${error.message}`);
          }
        }
        /* c8 ignore stop */
      }
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
      // Success means a remote file was downloaded — a network fetch, not
      // reproducible offline (the hermetic tests exercise the error arm above).
      /* c8 ignore next */
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
      // processDitaMap only returns a path when the `dita` CLI is installed and
      // succeeds; in the hermetic env it returns null (handled by falling
      // through to `continue`), so the splice branch needs real DITA-OT (ADR 01017).
      /* c8 ignore next 5 */
      if (ditaOutput) {
        const currentIndex = sequence.findIndex((e) => e.source === source);
        sequence.splice(currentIndex + 1, 0, { source: ditaOutput, phase });
        ignoredDitaMaps.push(ditaOutput);
      }
      continue;
    }

    // Parse input. Resolve before the validity/dedup check so isValidSourceFile
    // de-dups against the resolved paths already in `files` (the directory
    // branch below also passes resolved paths) and so `_phaseByFile` is keyed by
    // the same resolved path the job list will carry — otherwise a file
    // referenced once relative and once absolute could slip through twice with a
    // mismatched phase.
    const resolved = path.resolve(source);
    if (isFile && (await isValidSourceFile({ config, files, source: resolved }))) {
      files.push(resolved);
      if (!phaseByFile.has(resolved)) phaseByFile.set(resolved, phase);
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
            const resolved = path.resolve(content);
            files.push(resolved);
            if (!phaseByFile.has(resolved)) phaseByFile.set(resolved, phase);
          } else if (isDir && config.recursive) {
            dirs.push(content);
          }
        }
      }
    }
  }
  // Side-channel the full qualified file set (same pattern as `_phaseByFile`)
  // so the "Last Verified On" write-back can scan prose-only files that carry a
  // `verified` marker but contribute no spec to the report.
  config._qualifiedFiles = files;
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
    let rawContent: string | undefined;

    // For JSON/YAML specs, read raw content once and parse from it
    if (extension === "json" || extension === "yaml" || extension === "yml") {
      try {
        rawContent = await fs.promises.readFile(file, "utf8");
        if (extension === "json") {
          content = JSON.parse(rawContent);
        } else {
          content = YAML.parse(rawContent);
        }
      } catch (err: any) {
        console.warn(`Failed to read/parse ${file}: ${err.message}`);
        content = await readFile({ fileURLOrPath: file });
      }
    } else {
      content = await readFile({ fileURLOrPath: file });
    }

    if (typeof content === "object") {
      // Stable IDs for JSON/YAML specs, assigned before any path resolution
      // or before/after-spec merging so the IDs hash the spec as authored:
      // - specId derives from the file path (mirroring the text-content
      //   branch below) instead of getting a fresh UUID at resolution.
      // - testId fallbacks are `<specId>~<contentHash>` so the same test
      //   keeps the same ID across runs and machines.
      if (!content.specId) content.specId = generateSpecId(file);
      if (!content.contentPath) content.contentPath = file;
      // Internal phase marker (beforeAny / main / afterAll) so runSpecs can gate
      // execution as barriers. Stripped before reporting; never in public schema.
      // Captured here and re-stamped after the validate / resolvePaths transforms
      // below (either of which could drop an unknown key), so a future schema
      // tightening can't silently turn the barriers into a no-op.
      const specPhase = config._phaseByFile?.get(path.resolve(file)) ?? "main";
      content._phase = specPhase;
      if (Array.isArray(content.tests)) {
        const usedTestIds = new Set(
          content.tests
            .map((test: any) => test?.testId)
            .filter((id: any) => id)
        );
        for (const test of content.tests) {
          if (!test || typeof test !== "object" || test.testId) continue;
          // v2-shaped tests (`id`, `setup`/`cleanup`, action-keyed steps) are
          // validated against the strict test_v2 schema before the v2→v3
          // transform runs — injecting an unknown `testId` property would
          // fail that validation. Leave them to resolveTest's fallback.
          if (
            typeof test.id !== "undefined" ||
            test.file ||
            test.setup ||
            test.cleanup ||
            (Array.isArray(test.steps) &&
              test.steps.some(
                (step: any) =>
                  step && typeof step === "object" && "action" in step
              ))
          ) {
            continue;
          }
          const baseId = `${content.specId}~${contentHash(test)}`;
          let id = baseId;
          let suffix = 2;
          while (usedTestIds.has(id)) {
            id = `${baseId}-${suffix++}`;
          }
          usedTestIds.add(id);
          test.testId = id;
        }
      }

      // Collect step location data from YAML AST before validation/transformation.
      // Location must be applied AFTER resolvePaths (which may transform v2→v3 steps).
      const stepLocations: Map<number, Map<number, { line: number; startIndex: number; endIndex: number }>> = new Map();
      if (rawContent && content.tests) {
        try {
          const doc = YAML.parseDocument(rawContent);
          const lineStarts = getLineStarts(rawContent);
          const testsNode = doc.get("tests", true);
          if (testsNode && YAML.isSeq(testsNode)) {
            for (let t = 0; t < testsNode.items.length; t++) {
              const testNode = testsNode.get(t, true);
              if (!testNode || !YAML.isMap(testNode)) continue;
              const stepsNode = testNode.get("steps", true);
              if (!stepsNode || !YAML.isSeq(stepsNode)) continue;
              const test = content.tests[t];
              if (!test?.steps) continue;
              const testMap = new Map<number, { line: number; startIndex: number; endIndex: number }>();
              for (let s = 0; s < stepsNode.items.length && s < test.steps.length; s++) {
                const stepNode = stepsNode.items[s] as any;
                if (stepNode?.range) {
                  testMap.set(s, {
                    line: getLineNumber(rawContent, stepNode.range[0], lineStarts),
                    startIndex: stepNode.range[0],
                    endIndex: stepNode.range[1],
                  });
                }
              }
              if (testMap.size > 0) stepLocations.set(t, testMap);
            }
          }
        } catch {}
      }

      // JSON/YAML spec file - resolve paths and validate (transforms v2→v3)
      content = await resolvePaths({
        config: config,
        object: content,
        filePath: file,
      });

      // Merge before/after steps, tracking which steps came from before-specs.
      for (let t = 0; t < content.tests.length; t++) {
        const test = content.tests[t];
        // Scrub the internal routing markers from authored steps: they're set
        // only by the before/after merge below. Without this, a spec could
        // forge `_fromAfter: true` (the validation clone strips it, so it would
        // survive to runtime) and bypass skip-on-failure / the cascade guard
        // outside the `after` mechanism.
        if (Array.isArray(test.steps)) {
          for (const step of test.steps) {
            if (step && typeof step === "object") {
              delete step._fromBefore;
              delete step._fromAfter;
            }
          }
        }
        if (test.before) {
          const setup: any = await readFile({ fileURLOrPath: test.before });
          if (setup?.tests?.[0]?.steps) {
            // Tag before-steps with a marker that survives validation cloning.
            // Scrub any forged _fromAfter from these authored steps first.
            for (const step of setup.tests[0].steps) {
              if (step && typeof step === "object") delete step._fromAfter;
              step._fromBefore = true;
            }
            test.steps = setup.tests[0].steps.concat(test.steps);
          }
        }
        if (test.after) {
          const cleanup: any = await readFile({ fileURLOrPath: test.after });
          if (cleanup?.tests?.[0]?.steps) {
            // Tag cleanup steps so the runner hard-routes them: they execute
            // after the test even when an earlier step failed, and a failing
            // cleanup step doesn't cascade-skip later cleanup steps. Unlike
            // _fromBefore (deleted at detection time), _fromAfter must reach
            // runtime. Defined non-enumerable so it's invisible to contentHash
            // (stepId stays identical to the unmarked step), object spreads, and
            // JSON — it never affects hashing or the report.
            for (const step of cleanup.tests[0].steps) {
              if (step && typeof step === "object") delete step._fromBefore;
              Object.defineProperty(step, "_fromAfter", {
                value: true,
                enumerable: false,
                writable: true,
                configurable: true,
              });
            }
            test.steps = test.steps.concat(cleanup.tests[0].steps);
          }
        }
      }
      // Validate each step
      for (const test of content.tests) {
        test.steps = test.steps.filter((step: any) => {
          // Exclude internal routing markers from the validated clone so a
          // future strict (additionalProperties:false) step schema can't drop
          // tagged setup/cleanup steps. The markers stay on the real `step`.
          const stepForValidation = { ...step };
          delete stepForValidation._fromBefore;
          delete stepForValidation._fromAfter;
          const validation = validate({
            schemaKey: `step_v3`,
            object: stepForValidation,
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
      // Re-stamp the phase: neither `content = validation.object` nor
      // resolvePaths is guaranteed to preserve unknown keys.
      content._phase = specPhase;

      // Apply step locations after all validation/transformation (v2→v3 safe).
      // Compute offset from surviving before-steps (tagged with _fromBefore).
      for (const [testIdx, testMap] of stepLocations) {
        const test = content.tests[testIdx];
        if (!test?.steps) continue;
        let offset = 0;
        for (const step of test.steps) {
          if (step._fromBefore) {
            offset++;
          } else {
            break;
          }
        }
        for (const [stepIdx, loc] of testMap) {
          const pos = offset + stepIdx;
          if (pos < test.steps.length) {
            test.steps[pos].location = loc;
          }
        }
      }

      // Clean up _fromBefore markers from all tests/steps, even if
      // stepLocations is empty (e.g., AST parse failed).
      if (content?.tests) {
        for (const test of content.tests) {
          if (!test?.steps) continue;
          for (const step of test.steps) {
            if (step && "_fromBefore" in step) {
              delete step._fromBefore;
            }
          }
        }
      }

      specs.push(content);
    } else {
      // Text content - use common's detectTests for parsing
      let id = generateSpecId(file);
      let spec: any = {
        specId: id,
        contentPath: file,
        _phase: config._phaseByFile?.get(path.resolve(file)) ?? "main",
        tests: [],
      };
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

        // Finalize the spec the same way the non-runShell path does below:
        // validate spec_v3, then on success resolve paths, re-stamp the phase,
        // and push. Previously this branch `continue`d straight past the
        // shared finalization, so a runShell-typed file built a valid test but
        // never emitted a spec (#435). Skip parseContent — runShell files carry
        // no inline statements to parse.
        const specValidation = validate({
          schemaKey: "spec_v3",
          object: spec,
          addDefaults: false,
        });
        if (!specValidation.valid) {
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
          // Re-stamp the phase: resolvePaths isn't guaranteed to preserve
          // unknown keys. Mirrors the JSON/YAML and text branches.
          spec._phase = config._phaseByFile?.get(path.resolve(file)) ?? "main";
          specs.push(spec);
        }
        continue;
      }

      // Parse content using common's detectTests. testIdBase keys generated
      // testIds to the spec's stable path-derived ID instead of the absolute
      // file path.
      const tests = await parseContent({
        config: config,
        content: content,
        fileType: fileType,
        filePath: file,
        testIdBase: id,
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
        // Re-stamp the phase: resolvePaths isn't guaranteed to preserve unknown
        // keys, so a text/markdown file referenced by beforeAny/afterAll would
        // otherwise silently fall back to "main". Mirrors the JSON/YAML branch.
        spec._phase = config._phaseByFile?.get(path.resolve(file)) ?? "main";
        specs.push(spec);
      }
    }
  }
  return specs;
}
