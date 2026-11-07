import { validate } from "./common/src/validate.js";
import { diag, displayPath, palette } from "./cliOutput.js";
import { userConfigDir } from "./runtime/cacheDir.js";
import { resolvePaths, readFile } from "./core/index.js";
import { configErrorMessage, deepMerge, getRunOutputDir, loadAxios, timestamp } from "./core/utils.js";
import { checkEnvAliases, envFlag, isDebugRequested, setEnvWarningSink, warnOnce } from "./envFlag.js";
import { splitList } from "./cliOptions.js";
import path from "node:path";
import fs from "node:fs";
import { spawn } from "node:child_process";
import os from "node:os";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export {
  loadProjectEnv,
  readStdinInputs,
  writeResultsFile,
  setConfig,
  outputResults,
  spawnCommand,
  setMeta,
  getVersionData,
  log,
  logLevelEnabled,
  getResolvedTestsFromEnv,
  reportResults,
  reporters,
  registerReporter,
  isDebugRequested,
  discoverConfigPath,
};

// Log function that respects logLevel
// Pure predicate: would `log(message, level, config)` actually print at this
// config.logLevel? Exported so CLI call sites can GUARD expensive message
// construction (e.g. `JSON.stringify(config, null, 2)`) behind a cheap check —
// the stringify then only runs when the message would be printed. `log`
// delegates to this so the level policy has a single source of truth.
function logLevelEnabled(level: string, config: any = {}): boolean {
  const logLevels = ["silent", "error", "warning", "info", "debug"];
  const currentLevel = config.logLevel || "info";
  const currentLevelIndex = logLevels.indexOf(currentLevel);
  const messageLevelIndex = logLevels.indexOf(level);
  return currentLevelIndex >= messageLevelIndex && messageLevelIndex > 0;
}

function log(message: any, level: string = "info", config: any = {}) {
  // Only log if the message level is at or above the current log level
  if (logLevelEnabled(level, config)) {
    // stdout is for results. Labels and timestamps appear only at debug level.
    if (config?.logLevel === "debug") {
      diag(`${new Date().toISOString()} (${level.toUpperCase()}) ${message}`);
    } else if (level === "warning") {
      diag(`Warning: ${message}`);
    } else if (level === "error") {
      diag(`Error: ${message}`);
    } else {
      diag(message);
    }
  }
}

// Get resolved tests from environment variable, if set
async function getResolvedTestsFromEnv(config: any = {}) {
  const apiFile = process.env.DOC_DETECTIVE_API_FILE;
  if (!process.env.DOC_DETECTIVE_API && !apiFile) {
    return null;
  }

  let resolvedTests: any = null;
  let apiConfig: any = null;
  try {
    // Parse the setting as JSON. A file keeps the token out of the environment.
    apiConfig = JSON.parse(
      apiFile ? fs.readFileSync(path.resolve(apiFile), "utf8") : (process.env.DOC_DETECTIVE_API as string)
    );

    // Validate the structure: { accountId, url, token, contextIds }
    if (!apiConfig.accountId || !apiConfig.url || !apiConfig.token || !apiConfig.contextIds) {
      log(
        "Invalid DOC_DETECTIVE_API: must contain 'accountId', 'url', 'token', and 'contextIds' properties",
        "error",
        config
      );
      process.exit(2);
    }

    log(`CLI:Fetching resolved tests from ${apiConfig.url}/resolved-tests`, "debug", config);

    // Make GET request to the specified URL with token in header
    const response = await (await loadAxios()).get(`${apiConfig.url}/resolved-tests`, {
      headers: {
        "x-runner-token": apiConfig.token,
      },
    });

    // The response is the resolvedTests
    resolvedTests = response.data;

    // Validate against resolvedTests_v3 schema
    const validation = validate({
      schemaKey: "resolvedTests_v3",
      object: resolvedTests,
    });

    if (!validation.valid) {
      log(
        "Invalid resolvedTests from API response. " + validation.errors,
        "error",
        config
      );
      process.exit(2);
    }

    // Get config from environment variable for merging
    const envConfig = await getConfigFromEnv();
    if (envConfig) {
      // Apply config overrides to resolvedTests.config
      if (resolvedTests.config) {
        resolvedTests.config = { ...resolvedTests.config, ...envConfig };
      } else {
        resolvedTests.config = envConfig;
      }
    }

    log(
      `CLI:RESOLVED_TESTS:\n${JSON.stringify(resolvedTests, null, 2)}`,
      "debug",
      config
    );
  } catch (error: any) {
    log(
      `Error fetching resolved tests from DOC_DETECTIVE_API: ${error.message}`,
      "error",
      config
    );
    process.exit(2);
  }
  return { apiConfig, resolvedTests };
}

async function getConfigFromEnv() {
  if (!process.env.DOC_DETECTIVE_CONFIG) {
    return null;
  }

  let envConfig: any = null;
  try {
    // Parse the environment variable as JSON
    envConfig = JSON.parse(process.env.DOC_DETECTIVE_CONFIG);

    // JSON.parse legally yields non-objects (null, arrays, primitives).
    // validate() would then throw a generic "Object is required." that
    // doesn't point at the env var — give a targeted message instead.
    if (envConfig === null || typeof envConfig !== "object" || Array.isArray(envConfig)) {
      throw new Error(
        "DOC_DETECTIVE_CONFIG environment variable must be a JSON object."
      );
    }

    // Validate the environment variable config
    const envValidation = validate({
      schemaKey: "config_v3",
      object: envConfig,
      structuredErrors: true,
    });

    if (!envValidation.valid) {
      throw new Error(configErrorMessage("DOC_DETECTIVE_CONFIG", envValidation.errorObjects, envConfig), {
        cause: envValidation.errors,
      });
    }

    log(`CLI:ENV_CONFIG:\n${JSON.stringify(envConfig, null, 2)}`, "debug", envConfig);
  } catch (error: any) {
    if (error instanceof SyntaxError) {
      throw new Error(
        `Error parsing DOC_DETECTIVE_CONFIG environment variable: ${error.message}`
      );
    }
    throw error;
  }
  return envConfig;
}

// DOC_DETECTIVE's `config` object, the deprecated spelling of
// DOC_DETECTIVE_CONFIG (ADR 01165). It sits just below that variable, and its
// other keys, such as `container`, do nothing. Warnings wait for setConfig to
// know the log level.
function readLegacyEnvConfig() {
  if (!process.env.DOC_DETECTIVE) return null;
  let legacy: any;
  try {
    legacy = JSON.parse(process.env.DOC_DETECTIVE);
  } catch (error: any) {
    warnOnce("DOC_DETECTIVE", `Ignoring \`DOC_DETECTIVE\`: it isn't valid JSON (${error.message}).`);
    return null;
  }
  if (legacy?.container !== undefined) {
    warnOnce(
      "DOC_DETECTIVE.container",
      '`DOC_DETECTIVE`\'s `container` key no longer turns on unsafe steps. Set `"allowUnsafeSteps": true` in your user config, `$XDG_CONFIG_HOME/doc-detective/config.json`, or pass `--allow-unsafe`.'
    );
  }
  const config = legacy?.config;
  if (config === null || typeof config !== "object" || Array.isArray(config)) return null;
  warnOnce("DOC_DETECTIVE", '`DOC_DETECTIVE` is deprecated. Move its "config" object to `DOC_DETECTIVE_CONFIG`.');
  return anchorPaths(assertValidConfig(config, "DOC_DETECTIVE"), process.cwd());
}

// A relative `output` or `cacheDir` resolves against the source that set it:
// a config file's folder, or the working directory for the environment and
// flags (ADR 01165). `path.join` keeps a trailing separator, so `output: "x/"`
// still reads as a folder. Returns a copy; the input is left as it was.
function anchorPaths(config: any, base: string) {
  const anchored = { ...config };
  for (const key of ["output", "cacheDir"]) {
    const value = anchored[key];
    if (typeof value === "string" && value !== "-" && !path.isAbsolute(value) && !/^https?:\/\//.test(value)) {
      anchored[key] = path.join(base, value);
    }
  }
  return anchored;
}

// Where a config file's relative paths resolve: its folder, unless it sets
// `relativePathBase: "cwd"`, or it's a URL.
function configFileBase(config: any, file: string) {
  return config.relativePathBase === "cwd" || /^https?:\/\//.test(file) ? process.cwd() : path.dirname(path.resolve(file));
}

// `--output` and config `output` name the results file (ADR 01146). Fail on a
// folder rather than guessing, so nobody loses results to a misread path.
function resolveResultsFile(output: string, base = process.cwd()): string {
  const resolved = path.resolve(base, output);
  let isFolder = /[\\/]$/.test(output);
  try {
    isFolder = isFolder || fs.statSync(resolved).isDirectory();
  } catch {
    // Doesn't exist yet, which is normal for a results file.
  }
  if (isFolder) {
    throw new Error(
      `--output is a results file, but '${output}' is a folder. Use --output-dir for a folder.`
    );
  }
  return resolved;
}

// Write the run's results to the file `--output` names, replacing any file there.
// A run that found no tests writes its empty report, so `--output` always
// gets a file.
function writeResultsFile(outputFile: string | undefined, results: any) {
  if (!outputFile) return;
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
}

// `-` as an input reads stdin. Input is a path everywhere downstream, so it lands
// in a temporary file in the current directory, where its relative paths still
// resolve, and is removed when the process exits.
async function readStdinInputs(args: any) {
  const inputs = [
    ...(typeof args.input === "string" ? args.input.split(",").map((i: string) => i.trim()) : []),
    ...(args.inputs ?? []),
  ];
  if (!inputs.includes("-")) return;
  let text = "";
  for await (const chunk of process.stdin) text += chunk;
  const extension = stdinFileExtension(text);
  const file = path.resolve(`stdin-${process.pid}${extension}`);
  fs.writeFileSync(file, text);
  process.on("exit", () => fs.rmSync(file, { force: true }));
  const swap = (input: string) => (input === "-" ? file : input);
  if (typeof args.input === "string") {
    args.input = args.input.split(",").map((i: string) => swap(i.trim())).join(",");
  }
  if (args.inputs) args.inputs = args.inputs.map(swap);
}

// Stdin has no filename, so detect a spec by its content. Anything else is treated
// as Markdown, the most common documentation format.
function stdinFileExtension(text: string): string {
  const trimmed = text.trimStart();
  if (trimmed.startsWith("{")) return ".spec.json";
  if (/^(tests|specId|contexts)\s*:/m.test(trimmed)) return ".spec.yaml";
  return ".md";
}

// Per-user defaults for everything on this machine, such as telemetry or a proxy.
async function readUserConfig() {
  const file = path.join(userConfigDir(), "config.json");
  if (!fs.existsSync(file)) return null;
  const config = await readFile({ fileURLOrPath: file });
  if (config === null || typeof config !== "object") {
    throw new Error(`Could not parse user config at ${file}: it isn't valid JSON.`);
  }
  const valid = assertValidConfig(config, `user config ${file}`);
  return anchorPaths(valid, configFileBase(valid, file));
}

// Validate one config source on its own, so an error names where it came from.
// `addDefaults: false` only picks which object validate() returns: it still
// validates a defaulted clone, so a partial source such as
// `{"telemetry":{"userId":"x"}}` passes even though `telemetry.send` is required.
// Returns the source to merge: the caller's own object, or a v2 config's v3
// form, so the merge never mixes v2 keys into a v3 config.
function assertValidConfig(config: any, source: string): any {
  const validation = validate({ schemaKey: "config_v3", object: config, addDefaults: false, structuredErrors: true });
  if (!validation.valid) {
    throw new Error(configErrorMessage(source, validation.errorObjects, config), { cause: validation.errors });
  }
  return validation.object;
}

// Secrets can come from a file rather than the config or environment, where they
// leak into logs and child processes. `apiKeyFile` becomes `apiKey`, and so on.
function readCredentialFiles(config: any) {
  const read = (owner: any, fileKey: string, valueKey: string) => {
    if (!owner?.[fileKey]) return;
    try {
      owner[valueKey] = fs.readFileSync(path.resolve(owner[fileKey]), "utf8").trim();
    } catch (error: any) {
      throw new Error(`Could not read ${fileKey} at ${owner[fileKey]}: ${error.message}`);
    }
    delete owner[fileKey];
  };
  read(config.integrations?.docDetectiveApi, "apiKeyFile", "apiKey");
  for (const heretto of config.integrations?.heretto ?? []) {
    read(heretto, "apiTokenFile", "apiToken");
  }
}

// Load `.env` from the current directory, for values that rarely change in a
// project. Anything already set in the shell wins (ADR 01146).
async function loadProjectEnv(args: any) {
  if (args.envFile === false) return;
  const file = path.resolve(".env");
  if (!fs.existsSync(file)) return;
  const { default: dotenv } = await import("dotenv");
  dotenv.config({ path: file, override: false, quiet: true });
}

// The project config: `--config` when given, resolved to an absolute path so a
// mistyped one fails rather than falling back, else the first of
// `.doc-detective.json`, `.yaml`, and `.yml` in the working directory.
function discoverConfigPath(args: { config?: unknown } = {}): string | null {
  if (typeof args.config === "string" && args.config.trim()) return path.resolve(args.config.trim());
  const found = [".doc-detective.json", ".doc-detective.yaml", ".doc-detective.yml"]
    .map((name) => path.resolve(name))
    .find((file) => fs.existsSync(file));
  return found ?? null;
}

// Override config values based on args and validate the config.
// `readCredentials: false` leaves `apiKeyFile` and `apiTokenFile` unread, for
// `install`, which never uses them and may run before secrets are mounted.
async function setConfig({
  configPath,
  args,
  readCredentials = true,
}: {
  configPath?: any;
  args: any;
  readCredentials?: boolean;
}) {
  if (args.config && !configPath) {
    configPath = args.config;
  }
  // Unlike core setConfig, keep what's queued: the CLI's own startup, such as
  // applyColorFlags, raises warnings before this runs, once per process.
  // Both spellings of a renamed variable is a usage error.
  checkEnvAliases();

  // If a config path is given, read it. `readFile` returns null on a read
  // failure (missing/unreadable file) and may throw on bad input; in both
  // cases throw a clear error rather than letting a null config fall
  // through to a generic "Object is required." validation message. Throwing
  // (rather than returning null) means an unreadable / mistyped config path
  // follows the same error path as a validation failure: the normal run
  // exits non-zero via the top-level catch, and the debug flows render it
  // under the CONFIG INVALID banner.
  let config: any = {};
  if (configPath) {
    try {
      config = await readFile({ fileURLOrPath: configPath });
    } catch (error: any) {
      throw new Error(
        `Error reading config file at ${configPath}: ${error?.message || error}`
      );
    }
    if (config === null || config === undefined) {
      throw new Error(
        `Could not read config file at ${configPath}. Check that the path exists and is readable.`
      );
    }
    if (typeof config !== "object") {
      throw new Error(`Could not parse config file at ${configPath}: it isn't valid JSON or YAML.`);
    }
    config = assertValidConfig(config, /^https?:\/\//.test(configPath) ? configPath : displayPath(path.resolve(configPath)));
    config = anchorPaths(config, configFileBase(config, configPath));
  }

  // Lowest first: the user config, the project config, the deprecated
  // DOC_DETECTIVE, then DOC_DETECTIVE_CONFIG. Objects merge, arrays replace
  // (ADR 01165). Single-purpose variables and flags go on top, below.
  config = deepMerge((await readUserConfig()) ?? {}, config);
  const legacyConfig = readLegacyEnvConfig();
  if (legacyConfig) config = deepMerge(config, legacyConfig);
  const envConfig = await getConfigFromEnv();
  if (envConfig) config = deepMerge(config, anchorPaths(envConfig, process.cwd()));

  if (readCredentials) readCredentialFiles(config);

  // Validate config. Each source passed on its own, so this rarely fails.
  const validation = validate({
    schemaKey: "config_v3",
    object: config,
    structuredErrors: true,
  });
  if (!validation.valid) {
    throw new Error(configErrorMessage("", validation.errorObjects, config), { cause: validation.errors });
  }

  // Accept coerced and defaulted values
  config = validation.object;
  // Set default values
  config = {
    ...config,
    input: config.input || ".",
    outputDir: config.outputDir || ".",
    recursive: config.recursive ?? true,
    relativePathBase: config.relativePathBase || "file",
    detectSteps: config.detectSteps ?? true,
    logLevel: config.logLevel || "info",
    telemetry: config.telemetry || { send: true },
    hints: config.hints || { enabled: true },
  };
  // Single-purpose variables and flags resolve against the working directory.
  const cacheDirFromEnv = process.env.DOC_DETECTIVE_CACHE_DIR?.trim();
  if (cacheDirFromEnv) config.cacheDir = path.resolve(cacheDirFromEnv);
  if (envFlag("DOC_DETECTIVE_SKIP_AUTO_UPDATE")) config.autoUpdate = false;
  // Override config values
  if (configPath) {
    config.configPath = configPath;
  }
  if (args.input || args.inputs?.length) {
    // Split --input on commas, then add `run`'s positional inputs. Those aren't
    // split: they're single paths, usually from a shell glob.
    args.input = [
      ...(args.input ? args.input.split(",").map((item: any) => item.trim()) : []),
      ...(args.inputs ?? []),
    ];
    // Resolve paths
    args.input = args.input.map((item: any) => {
      if (item.startsWith("https://") || item.startsWith("http://")) {
        return item; // Don't resolve URLs
      }
      return path.resolve(item);
    });
    // Add to config
    config.input = args.input;
  }
  // `--output -` means stdout, the same as --json.
  const jsonOnStdout = args.json === true || args.output === "-";
  if (args.output && args.output !== "-") {
    config.output = resolveResultsFile(args.output);
  } else if (typeof config.output === "string") {
    // Each source anchored its own relative path already.
    config.output = resolveResultsFile(config.output);
  }
  if (args.outputDir) {
    config.outputDir = path.resolve(args.outputDir);
  }
  // Least specific first: the environment, then --quiet and --debug, then an
  // explicit level.
  if (isDebugRequested()) config.logLevel = "debug";
  if (args.quiet) config.logLevel = "error";
  if (args.debug) config.logLevel = "debug";
  if (args.logLevel) {
    config.logLevel = args.logLevel;
  }
  // Now that the level is known, environment warnings (bad boolean values,
  // deprecated names) print through log(), so -q and -l hide them.
  const logged = config;
  // The runner's setConfig sets the sink again on purpose, so JS API callers,
  // who never reach this one, get the same warnings.
  setEnvWarningSink((message) => log(message, "warning", logged));
  if (args.telemetry === false || process.env.DO_NOT_TRACK) {
    config.telemetry = { ...(config.telemetry || {}), send: false };
  }
  if (typeof args.allowUnsafe === "boolean") {
    config.allowUnsafeSteps = args.allowUnsafe;
  }
  if (typeof args.dryRun === "boolean") {
    config.dryRun = args.dryRun;
  }
  // The CLI's list flags are one comma-separated value each (ADR 01166).
  for (const [flag, key] of [
    ["reporters", "reporters"],
    ["test", "testFilter"],
    ["spec", "specFilter"],
  ]) {
    const list = typeof args[flag] === "string" ? splitList(args[flag]) : [];
    if (list.length > 0) config[key] = list;
  }
  if (typeof args.hints === "boolean") {
    config.hints = config.hints || { enabled: true };
    config.hints.enabled = args.hints;
  }
  // setConfig is CLI-only (not a package export), so commander has already
  // checked each value below against its choices: verification,
  // browserFallback, shell, and concurrentRunners pass through unchecked. Its
  // callers, cli.ts and the install command, hand it commander's parsed
  // options; a new caller must too.
  if (typeof args.verification === "string") {
    const write = args.verification === "existing" ? "existing" : args.verification === "true";
    config.verification = { ...(config.verification || {}), write };
  }
  if (typeof args.autoUpdate === "boolean") {
    config.autoUpdate = args.autoUpdate;
  }
  if (typeof args.exitOnFail === "boolean") {
    config.exitOnFail = args.exitOnFail;
  }
  if (typeof args.autoScreenshot === "boolean") {
    config.autoScreenshot = args.autoScreenshot;
  }
  if (typeof args.autoRecord === "boolean") {
    config.autoRecord = args.autoRecord;
  }
  // Absolute, so a later chdir or another working directory finds the same
  // cache. A whitespace-only value is ignored.
  if (typeof args.cacheDir === "string" && args.cacheDir.trim().length > 0) {
    config.cacheDir = path.resolve(args.cacheDir.trim());
  }
  if (typeof args.browserFallback === "string") config.browserFallback = args.browserFallback;
  if (typeof args.shell === "string") config.shell = args.shell;
  // `auto` and `true` both mean one runner per CPU core, as in config.
  if (typeof args.concurrentRunners === "string") {
    config.concurrentRunners =
      args.concurrentRunners === "auto" || args.concurrentRunners === "true" ? true : Number(args.concurrentRunners);
  }
  // Modes that replace the terminal summary on stdout.
  const stdoutReporters: string[] = [];
  if (jsonOnStdout || args.plain || args.quiet || config.logLevel === "silent") {
    config.reporters = (config.reporters ?? []).filter((reporter: any) => reporter !== "terminal");
    if (jsonOnStdout) stdoutReporters.push("jsonStdoutReporter");
    if (args.plain) stdoutReporters.push("plainReporter");
  }
  // --output is the JSON results file, so the json reporter would write a second copy.
  if (config.output && Array.isArray(config.reporters)) {
    config.reporters = config.reporters.filter((reporter: any) => reporter !== "json");
  }
  // Resolve paths
  config = await resolvePaths({
    config: config,
    object: config,
    filePath: configPath || ".",
    nested: false,
    objectType: "config",
  });
  // The stdout modes' reporters aren't config `reporters` values, so they ride
  // along unenumerated, out of the runner's validation. Non-enumerable on
  // purpose: the runner's JSON clone drops it, and only outputResults reads it.
  Object.defineProperty(config, "_stdoutReporters", { value: stdoutReporters, configurable: true });

  return config;
}

// Resolve the directory the runFolder reporter's `.doc-detective/` archive
// root sits under, from its `output`. `output` is normally a directory, but
// the reporter also accepts a file path (e.g. `results.json`), in which case
// the run folder belongs *beside* the file, not inside it.
//
// A report-file extension (`.json`/`.html`/`.htm`/`.xml`/`.md`) always
// resolves to the parent, matching getRunOutputDir exactly — even for an
// existing directory oddly named `reports.json` — so the archive root never
// diverges from the stamped runDir (a divergence would reject the stamp and
// break runId/runDir correlation with autoScreenshot). Any other path is then
// resolved by real filesystem type: an existing file (any extension) archives
// beside it, an existing or not-yet-created directory (including a dotted name
// like `reports.v1`) archives inside it.
//
// `.xml`/`.md` joined the list when the junit and markdown reporters landed;
// getRunOutputDir carries the same two so the three resolvers stay in
// agreement (see the note on the list below).
function runFolderBaseDir(output: any): string {
  const base = String(output ?? ".") || ".";
  // Must match the lists in getRunOutputDir (src/core/utils.ts) and
  // reportOutputDir (src/reporters/outputDir.ts). If `.xml`/`.md` were missing
  // here, `--output junit.xml --reporters runFolder junit` would have the
  // junit reporter write the file while this resolver tried to create a
  // directory of the same name — concurrently, under Promise.all.
  const reportFileExtensions = [".json", ".html", ".htm", ".xml", ".md"];
  if (reportFileExtensions.some((ext) => base.toLowerCase().endsWith(ext))) {
    return path.dirname(base);
  }
  try {
    return fs.statSync(base).isDirectory() ? base : path.dirname(base);
  } catch {
    // Not created yet — treat as a directory (matches getRunOutputDir).
    return base;
  }
}

// Internal reporters
const reporters: Record<string, (config: any, outputPath: any, results: any, options: any) => Promise<any>> = {
  // HTML reporter: outputs results as a self-contained HTML file
  // Lazy-loaded to avoid parsing the large inlined CSS/JS on every CLI invocation
  htmlReporter: async (config: any, outputPath: any, results: any, options: any = {}) => {
    const { htmlReporter } = await import("./reporters/htmlReporter.js");
    return htmlReporter(config, outputPath, results, options);
  },

  // JUnit reporter: writes `junit.xml` for CI test-summary widgets
  junitReporter: async (config: any, outputPath: any, results: any, options: any = {}) => {
    const { junitReporter } = await import("./reporters/junitReporter.js");
    return junitReporter(config, outputPath, results, options);
  },

  // Markdown reporter: writes a run summary for CI job summaries and comments
  markdownReporter: async (config: any, outputPath: any, results: any, options: any = {}) => {
    const { markdownReporter } = await import("./reporters/markdownReporter.js");
    return markdownReporter(config, outputPath, results, options);
  },

  // JSON reporter: outputs results to a JSON file
  // `--json`: the results, and nothing else, on stdout.
  jsonStdoutReporter: async (_config: any, _outputPath: any, results: any) => {
    console.log(JSON.stringify(results, null, 2));
  },

  // `--plain`: one tab-separated line per test context, for grep and cut.
  plainReporter: async (_config: any, _outputPath: any, results: any) => {
    for (const spec of results?.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const contexts = (test.contexts ?? []).filter(Boolean);
        for (const context of contexts.length > 0 ? contexts : [{}]) {
          const where = [context.platform, context.browser?.name].filter(Boolean).join("/");
          console.log(
            [context.result ?? test.result, spec.specId, test.testId, where].join("\t")
          );
        }
      }
    }
  },

  jsonReporter: async (config: any = {}, outputPath: any, results: any, options: any = {}) => {
    // Define supported output extensions
    const outputExtensions = [".json"];

    // Normalize output path
    outputPath = path.resolve(outputPath);

    // Reuse the results JSON serialized once by outputResults when present
    // (byte-identical to serializing `results` here); fall back for direct
    // callers that don't pass it.
    const data =
      typeof options.resultsJson === "string"
        ? options.resultsJson
        : JSON.stringify(results, null, 2);
    let outputFile = "";
    let outputDir = "";
    let reportType = "doc-detective-results";
    if (options.command) {
      if (options.command === "runTests") {
        reportType = "testResults";
      }
    }

    // Detect if output ends with a supported extension
    if (outputExtensions.some((ext) => outputPath.endsWith(ext))) {
      outputDir = path.dirname(outputPath);
      outputFile = outputPath;
      // If outputFile already exists, add a counter to the filename
      if (fs.existsSync(outputFile)) {
        let counter = 0;
        while (fs.existsSync(outputFile.replace(".json", `-${counter}.json`))) {
          counter++;
        }
        outputFile = outputFile.replace(".json", `-${counter}.json`);
      }
    } else {
      outputDir = outputPath;
      outputFile = path.resolve(outputDir, `${reportType}-${results?.runId ?? timestamp()}.json`);
    }

    try {
      // Create output directory if it doesn't exist
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Write results to output file
      fs.writeFileSync(outputFile, data);
      log(`Results: ${displayPath(outputFile)}`, "info", config);
      return outputFile;
    } catch (err) {
      console.error(`Error writing results to ${outputFile}. ${err}`);
      return null;
    }
  },

  // runFolder reporter: archives each run's results in its per-run artifact
  // folder (`<output>/.doc-detective/runs/<runId>/`), beside any screenshots
  // captured during the run. The folder is the timestamp, so the filename
  // stays constant across runs — diff two run folders to compare results
  // over time. Runs by default in addition to the flat json reporter.
  runFolderReporter: async (config: any = {}, outputPath: any, results: any, options: any = {}) => {
    let reportType = "doc-detective-results";
    if (options.command === "runTests") {
      reportType = "testResults";
    }

    // Prefer the run folder stamped on the results (set by runSpecs, shared
    // with auto screenshots) — but only when it resolves inside this output
    // path's `.doc-detective/runs/` root. Results can originate outside the
    // local process (e.g. API runs), and a garbled or malicious runDir must not
    // redirect the write elsewhere. Otherwise derive a fresh run folder.
    // Resolve the output to a base directory once (file paths → parent), then
    // both the confinement root and the fresh-folder fallback below derive
    // from the same base, so a file-path output archives beside the file.
    const baseDir = runFolderBaseDir(outputPath || config.output || ".");
    const expectedRunsRoot = path.resolve(baseDir, ".doc-detective", "runs");
    const stampedRunDir =
      typeof results?.runDir === "string" && results.runDir.length > 0
        ? path.resolve(results.runDir)
        : null;
    // Confine the stamped runDir to a child run folder *under* the output's
    // `.doc-detective/runs/` root. Compare *real* paths (resolving symlinks on
    // both sides) so a runDir that is — or sits under — a symlink pointing
    // outside the tree can't slip past a plain string-prefix check and redirect
    // the write. The stamped path must be a strict child (`startsWith(root +
    // sep)`), never the `runs/` collection root itself: an equal-to-root match
    // would archive to `.doc-detective/runs/testResults.json` and mix every
    // run's results into one file. Both paths exist in the normal local case
    // (getRunOutputDir created them); a non-existent or unresolvable stamped
    // path (e.g. an external/API result) throws and falls through to a fresh
    // local folder.
    let useStampedRunDir = false;
    if (stampedRunDir) {
      try {
        const realRoot = fs.realpathSync(expectedRunsRoot);
        const realStamped = fs.realpathSync(stampedRunDir);
        useStampedRunDir = realStamped.startsWith(realRoot + path.sep);
      } catch {
        useStampedRunDir = false;
      }
    }
    // Pass the already-resolved directory so getRunOutputDir creates the run
    // folder under it directly (it's a directory, so its report-extension
    // handling is a no-op) — keeping the fallback consistent with baseDir.
    const runDir = useStampedRunDir
      ? stampedRunDir!
      : getRunOutputDir({ output: baseDir });
    // When we reject the stamped runDir and write to a fresh folder, rewrite
    // runDir/runId in the archived JSON so the report describes the folder it
    // actually sits beside — otherwise consumers resolve `autoScreenshot`
    // paths against a directory the report no longer lives in.
    const persistedResults = useStampedRunDir
      ? results
      : {
          ...results,
          runDir,
          // The run folder name IS the runId under the `runs/<id>` layout.
          runId: path.basename(runDir),
        };
    // When we archive the unmodified `results` (stamped-runDir case), reuse the
    // JSON outputResults already serialized. When we rewrote runId/runDir into a
    // fresh copy, that object differs from `results`, so serialize it directly —
    // keeping the written file byte-identical to before this optimization.
    const persistedJson =
      useStampedRunDir && typeof options.resultsJson === "string"
        ? options.resultsJson
        : JSON.stringify(persistedResults, null, 2);
    const outputFile = path.resolve(runDir, `${reportType}.json`);

    try {
      fs.mkdirSync(runDir, { recursive: true });
      fs.writeFileSync(outputFile, persistedJson);

      // Archive a human-readable HTML report beside the JSON, so the run folder
      // is a complete shareable artifact without the standalone `html` reporter.
      // Best-effort and isolated: an HTML failure must not break the JSON
      // archive (this reporter's primary contract). Dynamic import keeps the
      // large inlined CSS/JS off the hot path, matching htmlReporter.
      const htmlFile = path.resolve(runDir, `${reportType}.html`);
      try {
        const { buildHtml } = await import("./reporters/htmlReporter.js");
        fs.writeFileSync(htmlFile, buildHtml(persistedResults));
        log(`Run report: ${displayPath(htmlFile)}`, "info", config);
      } catch (htmlErr) {
        // Pass the error as a separate arg so its stack survives (string
        // interpolation would flatten it, e.g. to "[object Object]").
        console.error(
          `Error writing per-run HTML report to ${htmlFile}.`,
          htmlErr
        );
      }

      log(`Run results: ${displayPath(outputFile)}`, "info", config);

      return outputFile;
    } catch (err) {
      console.error(`Error writing results to ${outputFile}. ${err}`);
      return null;
    }
  },

  // Terminal reporter: outputs a summary to the terminal
  terminalReporter: async (config: any = {}, outputPath: any, results: any, options: any = {}) => {
    const colors = palette(process.stdout);
    // Emoji read well in a terminal, and as noise in a CI log.
    const warningMark = process.stdout.isTTY ? "⚠️  " : "";

    // Single source of truth for the "No tests were run" warning so the
    // null-results path and the totalTests===0 path can't drift apart.
    const printNoTestsWarning = () => {
      const specFilterActive =
        Array.isArray(config?.specFilter) && config.specFilter.length > 0;
      const testFilterActive =
        Array.isArray(config?.testFilter) && config.testFilter.length > 0;
      console.log(
        `\n${colors.yellow}${warningMark}No tests were run.${colors.reset}`
      );
      if (specFilterActive || testFilterActive) {
        console.log(
          `${colors.yellow}This may be because the configured filters excluded every spec/test. Filters: specFilter=${JSON.stringify(
            config?.specFilter ?? null
          )}, testFilter=${JSON.stringify(
            config?.testFilter ?? null
          )}.${colors.reset}`
        );
      } else {
        console.log(
          `${colors.yellow}Check that the input paths contain testable content.${colors.reset}`
        );
      }
    };

    // Check if we have the new results format with summary
    if (!results) {
      // No results means the runner bailed before producing a report (e.g.
      // no input matched, no tests detected upstream). Surface that as a
      // warning rather than the prior bare "No results available." line —
      // the run still exits 0, but it is empty, not a clean success.
      printNoTestsWarning();
      return;
    }

    // Handle results that have a summary section
    if (results.summary) {
      // Extract summary data
      const { specs, tests, contexts, steps } = results.summary;

      // Calculate totals
      const totalSpecs = specs
        ? specs.pass + specs.fail + specs.warning + specs.skipped
        : 0;
      const totalTests = tests
        ? tests.pass + tests.fail + tests.warning + tests.skipped
        : 0;
      const totalContexts = contexts
        ? contexts.pass + contexts.fail + contexts.warning + contexts.skipped
        : 0;
      const totalSteps = steps
        ? steps.pass + steps.fail + steps.warning + steps.skipped
        : 0;

      // Any failures overall?
      const hasFailures =
        (specs && specs.fail > 0) ||
        (tests && tests.fail > 0) ||
        (contexts && contexts.fail > 0) ||
        (steps && steps.fail > 0);

      // Any skipped overall?
      const allSpecsSkipped =
        specs && specs.pass === 0 && specs.fail === 0 && specs.skipped > 0;

      const summaryLine = (label: string, counts: any, total: number) => {
        if (!counts) return;
        const parts = [
          `${total} total`,
          `${counts.pass > 0 ? colors.green : ""}${counts.pass} passed${counts.pass > 0 ? colors.reset : ""}`,
          `${counts.fail > 0 ? colors.red : ""}${counts.fail} failed${counts.fail > 0 ? colors.reset : ""}`,
        ];
        if (counts.warning > 0) parts.push(`${colors.yellow}${counts.warning} warnings${colors.reset}`);
        if (counts.skipped > 0) parts.push(`${colors.yellow}${counts.skipped} skipped${colors.reset}`);
        console.log(`${colors.bold}${label}${colors.reset} ${parts.join(", ")}`);
      };
      console.log("");
      summaryLine("Specs:   ", specs, totalSpecs);
      summaryLine("Tests:   ", tests, totalTests);
      summaryLine("Contexts:", contexts, totalContexts);
      summaryLine("Steps:   ", steps, totalSteps);

      // If all specs were skipped, call it out
      if (allSpecsSkipped) {
        console.log(
          `\n${colors.yellow}${warningMark}All items were skipped. No specs passed or failed.${colors.reset}`
        );
      }

      // If zero tests ran for any reason (filters excluded everything, no
      // input matched, no tests detected, etc.), surface that as a warning
      // rather than letting the green "Passed: 0" line read like success.
      // The run still exits 0 — this is an empty run, not a failure.
      if (totalTests === 0) {
        printNoTestsWarning();
      }

      // If we have specs with failures, display them
      if (results.specs && hasFailures) {
        console.log(
          `\n${colors.bold}${colors.red}Failed Items:${colors.reset}`
        );

        // Collect failures
        const failedSpecs: any[] = [];
        const failedTests: any[] = [];
        const failedContexts: any[] = [];
        const failedSteps: any[] = [];

        // Collect skipped
        const skippedSpecs: any[] = [];
        const skippedTests: any[] = [];
        const skippedContexts: any[] = [];
        const skippedSteps: any[] = [];

        // Process specs array to collect failures and skipped
        results.specs.forEach((spec: any, specIndex: any) => {
          // Check if spec has failed
          if (spec.result === "FAIL") {
            failedSpecs.push({
              index: specIndex,
              id: spec.specId || `Spec ${specIndex + 1}`,
            });
          }
          // Check if spec was skipped
          if (spec.result === "SKIPPED") {
            skippedSpecs.push({
              index: specIndex,
              id: spec.specId || `Spec ${specIndex + 1}`,
            });
          }

          // Process tests in this spec
          if (spec.tests && spec.tests.length > 0) {
            spec.tests.forEach((test: any, testIndex: any) => {
              // Check if test has failed
              if (test.result === "FAIL") {
                failedTests.push({
                  specIndex,
                  testIndex,
                  specId: spec.specId || `Spec ${specIndex + 1}`,
                  id: test.testId || `Test ${testIndex + 1}`,
                });
              }
              // Check if test was skipped
              if (test.result === "SKIPPED") {
                skippedTests.push({
                  specIndex,
                  testIndex,
                  specId: spec.specId || `Spec ${specIndex + 1}`,
                  id: test.testId || `Test ${testIndex + 1}`,
                });
              }

              // Process contexts in this test
              if (test.contexts && test.contexts.length > 0) {
                test.contexts.forEach((context: any, contextIndex: any) => {
                  // Check if context has failed
                  if (
                    context.result === "FAIL" ||
                    (context.result && context.result.status === "FAIL")
                  ) {
                    failedContexts.push({
                      specIndex,
                      testIndex,
                      contextIndex,
                      specId: spec.specId || `Spec ${specIndex + 1}`,
                      testId: test.testId || `Test ${testIndex + 1}`,
                      platform: context.platform || "unknown",
                      browser: context.browser
                        ? context.browser.name
                        : "unknown",
                    });
                  }
                  // Check if context was skipped
                  if (
                    context.result === "SKIPPED" ||
                    (context.result && context.result.status === "SKIPPED")
                  ) {
                    skippedContexts.push({
                      specIndex,
                      testIndex,
                      contextIndex,
                      specId: spec.specId || `Spec ${specIndex + 1}`,
                      testId: test.testId || `Test ${testIndex + 1}`,
                      platform: context.platform || "unknown",
                      browser: context.browser
                        ? context.browser.name
                        : "unknown",
                    });
                  }

                  // Process steps in this context
                  if (context.steps && context.steps.length > 0) {
                    context.steps.forEach((step: any, stepIndex: any) => {
                      // Check if step has failed
                      if (step.result === "FAIL") {
                        failedSteps.push({
                          specIndex,
                          testIndex,
                          contextIndex,
                          stepIndex,
                          specId: spec.specId || `Spec ${specIndex + 1}`,
                          testId: test.testId || `Test ${testIndex + 1}`,
                          platform: context.platform || "unknown",
                          browser: context.browser
                            ? context.browser.name
                            : "unknown",
                          stepId: step.stepId || `Step ${stepIndex + 1}`,
                          error: step.resultDescription || "Unknown error",
                        });
                      }
                      // Check if step was skipped
                      if (step.result === "SKIPPED") {
                        skippedSteps.push({
                          specIndex,
                          testIndex,
                          contextIndex,
                          stepIndex,
                          specId: spec.specId || `Spec ${specIndex + 1}`,
                          testId: test.testId || `Test ${testIndex + 1}`,
                          platform: context.platform || "unknown",
                          browser: context.browser
                            ? context.browser.name
                            : "unknown",
                          stepId: step.stepId || `Step ${stepIndex + 1}`,
                        });
                      }
                    });
                  }
                });
              }
            });
          }
        });

        // Display failures
        if (failedSpecs.length > 0) {
          console.log(`\n${colors.red}Failed Specs:${colors.reset}`);
          failedSpecs.forEach((item, i) => {
            console.log(`${colors.red}${i + 1}. ${item.id}${colors.reset}`);
          });
        }

        if (failedTests.length > 0) {
          console.log(`\n${colors.red}Failed Tests:${colors.reset}`);
          failedTests.forEach((item, i) => {
            console.log(
              `${colors.red}${i + 1}. ${item.id} (from ${item.specId})${
                colors.reset
              }`
            );
          });
        }

        if (failedContexts.length > 0) {
          console.log(`\n${colors.red}Failed Contexts:${colors.reset}`);
          failedContexts.forEach((item, i) => {
            console.log(
              `${colors.red}${i + 1}. ${item.platform}/${item.browser} (from ${
                item.testId
              })${colors.reset}`
            );
          });
        }

        if (failedSteps.length > 0) {
          console.log(`\n${colors.red}Failed Steps:${colors.reset}`);
          failedSteps.forEach((item, i) => {
            console.log(
              `${colors.red}${i + 1}. ${item.platform}/${item.browser} - ${
                item.stepId
              }${colors.reset}`
            );
            console.log(`   Error: ${item.error}`);
          });
        }

        // Display skipped items in yellow
        if (skippedSpecs.length > 0) {
          console.log(`\n${colors.yellow}Skipped Specs:${colors.reset}`);
          skippedSpecs.forEach((item, i) => {
            console.log(`${colors.yellow}${i + 1}. ${item.id}${colors.reset}`);
          });
        }
        if (skippedTests.length > 0) {
          console.log(`\n${colors.yellow}Skipped Tests:${colors.reset}`);
          skippedTests.forEach((item, i) => {
            console.log(
              `${colors.yellow}${i + 1}. ${item.id} (from ${item.specId})${
                colors.reset
              }`
            );
          });
        }
        if (skippedContexts.length > 0) {
          console.log(`\n${colors.yellow}Skipped Contexts:${colors.reset}`);
          skippedContexts.forEach((item, i) => {
            console.log(
              `${colors.yellow}${i + 1}. ${item.platform}/${
                item.browser
              } (from ${item.testId})${colors.reset}`
            );
          });
        }
        if (skippedSteps.length > 0) {
          console.log(`\n${colors.yellow}Skipped Steps:${colors.reset}`);
          skippedSteps.forEach((item, i) => {
            console.log(
              `${colors.yellow}${i + 1}. ${item.platform}/${item.browser} - ${
                item.stepId
              }${colors.reset}`
            );
          });
        }
      }
    } else {
      console.log(
        "No tests were executed or results are in an unknown format."
      );
    }

    console.log("\n===============================\n");
  },
};

// Helper function to register custom reporters
function registerReporter(name: string, reporterFunction: any) {
  if (typeof reporterFunction !== "function") {
    throw new Error("Reporter must be a function");
  }
  reporters[name] = reporterFunction;
  return true;
}

async function reportResults({ apiConfig, results }: { apiConfig: any; results: any }) {
  // Transform results into the required format for the API
  // Extract contexts from the nested structure and format them
  const contexts: any[] = [];

  if (results.specs) {
    results.specs.forEach((spec: any) => {
      if (spec.tests) {
        spec.tests.forEach((test: any) => {
          if (test.contexts) {
            test.contexts.forEach((context: any) => {
              // Extract or generate contextId
              const contextId =
                context.contextId;

              // Convert result status to lowercase (PASS -> passed, FAIL -> failed, etc.)
              let status;
              if (context.result === "PASS") {
                status = "passed";
              } else if (context.result === "FAIL") {
                status = "failed";
              } else if (context.result === "WARNING") {
                status = "warning";
              } else if (context.result === "SKIPPED") {
                status = "skipped";
              }
              if (!status) {
                console.error(`Unknown context result status for context ID ${contextId}`);
                return;
              }

              // Build the context payload with the entire context object embedded
              contexts.push({
                contextId: contextId,
                status: status,
                result: context,
              });
            });
          }
        });
      }
    });
  }

  // POST to the /contexts endpoint
  try {
    const url = `${apiConfig.url}/contexts`;
    const payload = { contexts };

    const response = await (await loadAxios()).post(url, payload, {
      headers: {
        "x-runner-token": apiConfig.token,
      },
    });
    console.log("Results reported successfully:", response.data);
  } catch (error: any) {
    console.error(
      `Error reporting results to ${apiConfig.url}/contexts: ${error.message}`
    );
  }
}

// Convert a reporter's shorthand name to its key in `reporters`.
function reporterKey(reporter: string): string {
  const shorthand: Record<string, string> = {
    json: "jsonReporter",
    html: "htmlReporter",
    runfolder: "runFolderReporter",
    terminal: "terminalReporter",
    junit: "junitReporter",
    markdown: "markdownReporter",
  };
  return shorthand[reporter.toLowerCase()] ?? reporter;
}

async function outputResults(config: any = {}, outputPath: any, results: any, options: any = {}) {
  // Config is the source of truth, and an empty list means no reporters, as
  // when `--json` replaces the only one. Fall back to options.reporters for
  // programmatic callers that pass them directly, then to defaults. The run
  // folder gate, runArchivesArtifacts, follows the same rule.
  const defaultReporters = ["terminal", "runFolder"];
  // `--json` and `--plain` add their stdout reporters here, not to `reporters`.
  const stdoutReporters = (config as { _stdoutReporters?: string[] } | undefined)?._stdoutReporters ?? [];

  let activeReporters = Array.isArray(config?.reporters)
    ? [...config.reporters, ...stdoutReporters]
    : options.reporters || defaultReporters;

  // If the reporters option is provided as strings, normalize them
  if (activeReporters.length > 0) {
    // Convert any shorthand names to full reporter names
    activeReporters = activeReporters.map((reporter: any) =>
      typeof reporter === "string" ? reporterKey(reporter) : reporter
    );
  }

  // Serialize the canonical results tree ONCE and share the string with the
  // JSON-writing reporters (json + runFolder) instead of each calling
  // JSON.stringify on the full tree independently. Only computed when a
  // JSON-writing reporter is actually active, so a terminal-only run pays
  // nothing. Each reporter still falls back to serializing itself when the
  // shared string is absent (so they stay correct if called directly), and
  // runFolder only reuses it when it archives the unmodified `results` (the
  // stamped-runDir case) — a rewritten runId/runDir copy is serialized fresh,
  // keeping every written file byte-identical to before.
  const writesJson =
    activeReporters.includes("jsonReporter") ||
    activeReporters.includes("runFolderReporter");
  const reporterOptions = writesJson
    ? { ...options, resultsJson: JSON.stringify(results, null, 2) }
    : options;

  // Execute each reporter
  const reporterPromises = activeReporters.map((reporter: any) => {
    if (typeof reporter === "function") {
      // Direct function reference
      return reporter(config, outputPath, results, reporterOptions);
    } else if (typeof reporter === "string" && reporters[reporter]) {
      // String reference to built-in or registered reporter
      return reporters[reporter](config, outputPath, results, reporterOptions);
    } else if (typeof reporter === "string" && !reporters[reporter]) {
      console.error(
        `Reporter "${reporter}" not found. Available reporters: ${Object.keys(
          reporters
        ).join(", ")}`
      );
      return Promise.resolve();
    } else {
      console.error(`Invalid reporter: ${reporter}`);
      return Promise.resolve();
    }
  });

  // Wait for all reporters to complete
  return Promise.all(reporterPromises);
}

// Perform a native command in the current working directory.
async function spawnCommand(cmd: string, args?: string[]) {
  // Split command into command and arguments
  if (cmd.includes(" ")) {
    const cmdArray = cmd.split(" ");
    cmd = cmdArray[0];
    const cmdArgs = cmdArray.slice(1);
    // Add arguments to args array
    if (args) {
      args = cmdArgs.concat(args);
    } else {
      args = cmdArgs;
    }
  }

  const runCommand = spawn(cmd, args, {
    env: process.env, // Explicitly pass environment variables
  });

  // Drain both streams at once. Reading them in turn deadlocks: a child that fills
  // the unread pipe blocks on its write and never closes the other.
  const collect = async (stream: AsyncIterable<any>) => {
    let text = "";
    for await (const chunk of stream) text += chunk;
    return text;
  };
  let [stdout, stderr] = await Promise.all([collect(runCommand.stdout), collect(runCommand.stderr)]);
  // Remove trailing newline
  stdout = stdout.replace(/\n$/, "");

  // Remove trailing newline
  stderr = stderr.replace(/\n$/, "");

  // Capture exit code
  const exitCode = await new Promise((resolve, reject) => {
    runCommand.on("close", resolve);
  });

  return { stdout, stderr, exitCode };
}

function parseMeta(value: string | undefined): any {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch (error: any) {
    throw new Error(`DOC_DETECTIVE_META isn't valid JSON: ${error.message}`);
  }
}

function setMeta() {
  const platformMap: Record<string, string> = {
    win32: "windows",
    darwin: "mac",
    linux: "linux",
  };

  // Set meta
  const meta: any = parseMeta(process.env["DOC_DETECTIVE_META"]);
  const pkg = require("../package.json");
  meta.distribution = "doc-detective";
  meta.dist_version = pkg.version;
  meta.dist_platform = platformMap[os.platform()] || os.platform();
  meta.dist_platform_version = os.release();
  meta.dist_platform_arch = os.arch();
  meta.dist_deployment = meta.dist_deployment || "node";
  meta.dist_deployment_version =
    meta.dist_deployment_version || process.version;
  meta.dist_interface = meta.dist_interface || "cli";
  process.env["DOC_DETECTIVE_META"] = JSON.stringify(meta);
}

// Get version data programmatically (no console output)
function getVersionData() {
  try {
    // Get main package version
    const mainPackage = require("../package.json");
    const versionData: any = {
      main: {
        "doc-detective": {
          version: mainPackage.version,
          expected: "main package",
        },
      },
      dependencies: {},
      context: {
        executionMethod: "direct node execution",
        nodeVersion: process.version,
        platform: `${os.platform()} ${os.arch()}`,
        timestamp: new Date().toISOString(),
      },
      locations: {},
    };

    // Auto-discover all doc-detective-* packages in node_modules
    const nodeModulesPath = path.resolve(process.cwd(), "node_modules");
    const dependenciesToCheck: string[] = [];

    if (fs.existsSync(nodeModulesPath)) {
      const nodeModulesContents = fs.readdirSync(nodeModulesPath);
      nodeModulesContents.forEach((dir) => {
        if (dir.startsWith("doc-detective-") && dir !== "doc-detective") {
          dependenciesToCheck.push(dir);
        }
      });
    }

    // Detect execution method
    const isNpx =
      process.env.npm_execpath && process.env.npm_execpath.includes("npx");
    const isNpm = process.env.npm_execpath && !isNpx;

    if (isNpx) {
      versionData.context.executionMethod = "npx";
    } else if (isNpm) {
      versionData.context.executionMethod = "npm";
    }

    // Check installed versions of dependencies
    dependenciesToCheck.sort().forEach((dep) => {
      try {
        // Try to read the dependency's package.json
        const depPackagePath = path.resolve(
          process.cwd(),
          "node_modules",
          dep,
          "package.json"
        );
        if (fs.existsSync(depPackagePath)) {
          const depPackage = JSON.parse(
            fs.readFileSync(depPackagePath, "utf8")
          );
          const installedVersion = depPackage.version;

          // Look for expected version in main package dependencies or devDependencies
          const expectedVersion =
            mainPackage.dependencies[dep] ||
            mainPackage.devDependencies[dep] ||
            "not specified in main package";

          versionData.dependencies[dep] = {
            installed: installedVersion,
            expected: expectedVersion,
            status:
              expectedVersion !== "not specified in main package" &&
              !expectedVersion.includes(installedVersion) &&
              !installedVersion.includes(expectedVersion.replace(/[\^~]/, ""))
                ? "mismatch"
                : "ok",
          };

          versionData.locations[dep] = path.resolve(
            process.cwd(),
            "node_modules",
            dep
          );
        } else {
          versionData.dependencies[dep] = {
            installed: null,
            expected:
              mainPackage.dependencies[dep] ||
              mainPackage.devDependencies[dep] ||
              "not specified",
            status: "not found",
            error: "package.json not found",
          };
        }
      } catch (error: any) {
        versionData.dependencies[dep] = {
          installed: null,
          expected:
            mainPackage.dependencies[dep] ||
            mainPackage.devDependencies[dep] ||
            "not specified",
          status: "error",
          error: error.message,
        };
      }
    });

    return versionData;
  } catch (error: any) {
    return { error: error.message };
  }
}
