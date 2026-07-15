/* eslint-disable */
/**
 * Auto-generated from config_v3.schema.json
 * Do not edit manually
 */

/**
 * Load environment variables from the specified `.env` file.
 */
export type LoadVariables = string;
export type DeviceByName = string;
export type FileTypePredefined = "markdown" | "asciidoc" | "html" | "dita";
export type FileTypeCustom =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * Perform a native shell command.
 */
export type RunShell = RunShellCommandSimple | RunShellCommandDetailed;
/**
 * Command to perform in the default shell (`bash` on every platform, unless the config-level `shell` setting changes it).
 */
export type RunShellCommandSimple = string;
/**
 * OpenAPI description and configuration.
 */
export type OpenApi = {
  [k: string]: unknown;
};
/**
 * Configuration for Heretto CMS integrations. Each entry specifies a Heretto instance and a scenario to build and test.
 */
export type HerettoCMSIntegrations = HerettoCMSIntegration[];

/**
 * Configuration options for Doc Detective operations.
 */
export interface Config {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/config_v3.schema.json";
  /**
   * Identifier for the configuration.
   */
  configId?: string;
  /**
   * Path to the configuration file.
   */
  configPath?: string;
  /**
   * Path(s) to test specifications and documentation source files. May be paths to specific files or to directories to scan for files.
   */
  input?: string | [string, ...string[]];
  /**
   * Path of the directory in which to store the output of Doc Detective commands. If a file path is specified, Doc Detective attempts to honor the file name specified, but file path behavior is controlled by the configured reporters.
   */
  output?: string;
  /**
   * Reporters to use when emitting test results. Built-in reporters: `terminal`, `json`, `html`, `runFolder`. The `runFolder` reporter (on by default) archives each run's results as `<output>/.doc-detective/runs/<runId>/testResults.json` (or `coverageResults.json` for coverage runs), beside any screenshots the run captured, in addition to the flat output the `json` reporter writes. You can also reference custom reporters registered via `registerReporter()` by name.
   */
  reporters?: string[];
  /**
   * Regex patterns (case-insensitive) applied to each spec's `specId`. If set, only specs whose `specId` matches at least one pattern are run. Equivalent to `--spec` on the CLI. Each entry must contain at least one non-whitespace character.
   */
  specFilter?: string[];
  /**
   * Regex patterns (case-insensitive) applied to each test's `testId`. If set, only tests whose `testId` matches at least one pattern are run. Equivalent to `--test` on the CLI. Each entry must contain at least one non-whitespace character.
   */
  testFilter?: string[];
  /**
   * If `true` searches `input`, `setup`, and `cleanup` paths recursively for test specifications and source files.
   */
  recursive?: boolean;
  /**
   * Whether paths should be interpreted as relative to the current working directory (`cwd`) or to the file in which they're specified (`file`).
   */
  relativePathBase?: "cwd" | "file";
  loadVariables?: LoadVariables;
  /**
   * Default protocol and domain to use for relative URLs.
   */
  origin?: string;
  /**
   * Query parameters to append to URLs resolved against `origin`. Values support environment variable substitution via `$VAR` syntax. Step-level `params` on `goTo` / `checkLink` are merged on top of these, with step keys winning on collision. WARNING: values are embedded in request URLs and appear verbatim in test results, logs, and reports — avoid putting long-lived secrets here.
   */
  originParams?: {
    [k: string]: string;
  };
  /**
   * Path(s) to test specifications to perform before those specified by `input`. Useful for setting up testing environments.
   */
  beforeAny?: string | string[];
  /**
   * Path(s) to test specifications to perform after those specified by `input`. Useful for cleaning up testing environments.
   */
  afterAll?: string | string[];
  /**
   * Whether or not to detect steps in input files based on defined markup.
   */
  detectSteps?: boolean;
  /**
   * Whether or not to run potentially unsafe steps, such as those that might modify files or system state.
   */
  allowUnsafeSteps?: boolean;
  /**
   * If `true`, crawls sitemap.xml files specified by URL to find additional files to test.
   */
  crawl?: boolean;
  /**
   * If `true`, processes DITA maps and includes generated files as inputs.
   */
  processDitaMaps?: boolean;
  /**
   * Amount of detail to output when performing an operation.
   */
  logLevel?: "silent" | "error" | "warning" | "info" | "debug";
  /**
   * Contexts to run the test in. Overrides contexts defined at the config and spec levels.
   */
  runOn?: Context[];
  /**
   * Configuration for file types and their markup detection.
   */
  fileTypes?: [
    FileTypePredefined | FileTypeCustom | FileTypeExecutable,
    ...(FileTypePredefined | FileTypeCustom | FileTypeExecutable)[],
  ];
  integrations?: IntegrationsOptions;
  telemetry?: TelemetryOptions;
  hints?: HintsOptions;
  /**
   * Number of concurrent test runners. Set to true to use CPU core count (capped at 4).
   */
  concurrentRunners?: number | boolean;
  environment?: EnvironmentDetails;
  /**
   * @deprecated
   * Deprecated and ignored. Previously reserved for an interactive step-through debugger that was never implemented. Retained so existing configs continue to validate. For diagnostics, run `doc-detective debug` or set the `DOC_DETECTIVE_DEBUG` environment variable.
   */
  debug?: boolean | "stepThrough";
  /**
   * If `true`, fully resolve tests (file/env config merge, schema validation, file detection, inline-test extraction) and emit the resolved test plan as JSON, but do not execute any steps. Equivalent to `--dry-run` on the CLI.
   */
  dryRun?: boolean;
  /**
   * If `true`, captures a screenshot after every browser-driven step that does not already define an explicit `screenshot`. Steps with an explicit `screenshot` are skipped for auto-capture since they already produce an image. Doc Detective saves images in the per-run artifact directory (`<output>/.doc-detective/runs/<runId>/`) under the nested resource tree, with each image named by the step's order, action, and ID (for example, `specs/<specId>/tests/<testId>/contexts/<contextId>/screenshots/01-goTo-s4f2a91c.png`), so the same step lands on the same relative path in every run's folder for run-over-run comparison. Specs and tests can override this value with their own `autoScreenshot` fields (test level wins over spec level, which wins over config level). Equivalent to `--auto-screenshot` on the CLI.
   */
  autoScreenshot?: boolean;
  /**
   * If `true`, records a video of every test context that runs in a browser, in addition to any explicit `record` steps. The recording wraps the whole context (it starts before the first step and stops after the last) and always uses the `ffmpeg` engine. Videos are saved in the per-run artifact directory (`<output>/.doc-detective/runs/<runId>/`) under the nested resource tree (for example, `specs/<specId>/tests/<testId>/contexts/<contextId>/recordings/<contextId>.mp4`), so the same context lands on the same relative path in every run's folder for run-over-run comparison. Specs and tests can override this value with their own `autoRecord` fields (test level wins over spec level, which wins over config level). Equivalent to `--auto-record` on the CLI.
   */
  autoRecord?: boolean;
  /**
   * If `true` (default), the CLI checks for a newer published `doc-detective` on startup and self-updates before running tests. Updates happen for global (`npm i -g`) and `npx` installs only — local installs (where `doc-detective` is a project dep) get an informational message instead, since auto-updating would mutate the user's lockfile. CI environments and the `DOC_DETECTIVE_SKIP_AUTO_UPDATE=1` env var also skip the check. Set to `false` to pin to the installed version. Equivalent to `--no-auto-update` on the CLI.
   */
  autoUpdate?: boolean;
  /**
   * Default shell for `runShell` steps (and `runCode`'s shell-based execution). `runShell` steps can override this value with their own `shell` field. `cmd` and `powershell` are only supported on Windows. On Windows, `bash` resolves to Git Bash, which Doc Detective installs automatically if it isn't present.
   */
  shell?: "bash" | "cmd" | "powershell";
  /**
   * Directory for lazy-installed runtime assets (heavy npm packages, browser binaries, ffmpeg). Defaults to `<os.tmpdir()>/doc-detective/`. Override here, with the `DOC_DETECTIVE_CACHE_DIR` env var, or with `--cache-dir` on the CLI when the default temp location is unsuitable (e.g., baked container images where temp gets cleared on reboot).
   */
  cacheDir?: string;
  /**
   * Controls whether a context whose browser cannot start a driver session falls back to another available browser instead of being skipped. Drivers are validated by execution (not just presence) so a present-but-broken driver — for example a partially downloaded geckodriver — no longer silently skips Firefox coverage. `auto` (default): fall back to any other available browser for both auto-selected and explicitly requested browsers; a fallback away from an explicitly requested browser reports the context as `WARNING` rather than `PASS`. `explicit`: fall back only when the browser was auto-selected; an explicitly requested browser whose driver is broken is skipped with a diagnostic reason. `off`: never fall back across browsers (driver validation and diagnostic skip reasons still apply). Equivalent to `--browser-fallback` on the CLI.
   */
  browserFallback?: "auto" | "explicit" | "off";
}
/**
 * A context in which to perform tests. If no contexts are specified but a context is required by one or more tests, Doc Detective attempts to identify a supported context in the current environment and run tests against it. For example, if a browser isn't specified but is required by steps in the test, Doc Detective will search for and use a supported browser available in the current environment.
 */
export interface Context {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/context_v3.schema.json";
  /**
   * Unique identifier for the context.
   */
  contextId?: string;
  /**
   * Platforms to run tests on.
   */
  platforms?: ("linux" | "mac" | "windows" | "android" | "ios") | ("linux" | "mac" | "windows" | "android" | "ios")[];
  /**
   * Browsers to run tests on. On a mobile (`android`/`ios`) platform entry, the browser runs on the managed device: `chrome` on Android, `safari` on iOS (other combinations skip the context), and it fills in automatically when omitted. Device browsers don't take desktop display config: authored `window`/`viewport` dimensions and `headless: false` are rejected on mobile entries (the device owns its display — control it via the device descriptor's `headless`/`deviceType`); `headless: true` matches this schema's default and is ignored.
   */
  browsers?:
    | ("chrome" | "firefox" | "safari" | "webkit")
    | Browser
    | (("chrome" | "firefox" | "safari" | "webkit") | Browser1)[];
  /**
   * Per-context override for the config-level [`browserFallback`](config) policy that governs whether a context whose browser can't start a driver session falls back to another available browser. Accepts the same values — `auto`, `explicit`, `off` — and, when set, takes precedence over the config-level value for the contexts this entry expands into. Omit it to inherit the config-level policy (which itself defaults to `auto`).
   */
  browserFallback?: "auto" | "explicit" | "off";
  /**
   * Capabilities the environment must provide for this context to run. A string names a required command; an array names several; the object form checks commands (on PATH), files (paths, with `$VAR`/`$HOME` expansion), and environment variables. All entries are AND-ed. Any unmet requirement marks the context as SKIPPED — the same non-failing outcome as a `platforms` mismatch.
   */
  requires?: string | [string, ...string[]] | Requirements;
  /**
   * Default device for a mobile (`android`/`ios`) context. A string references a device by name; an object refines it. The `platform` is implied by the context, so it is not required here. When the named device doesn't already exist, Doc Detective creates it with defaults (see `deviceType`/`osVersion`), provided the toolchain is installed (`doc-detective install android` or `doc-detective install ios`). Same shape as `startSurface.device`.
   */
  device?: DeviceByName | DeviceDescriptor;
}
/**
 * Browser configuration.
 */
export interface Browser {
  /**
   * Name of the browser.
   */
  name: "chrome" | "firefox" | "safari" | "webkit";
  /**
   * Set automatically during context resolution: `true` when the author explicitly requested this browser (as opposed to it being auto-selected as the default). The runner's cross-browser fallback uses it to decide whether substituting another engine reports `PASS` (auto-selected) or `WARNING` (explicitly pinned).
   */
  explicit?: boolean;
  /**
   * If `true`, runs the browser in headless mode.
   */
  headless?: boolean;
  /**
   * If `true`, this browser always starts a brand-new driver session for each context and never reuses a pooled one. By default, Chromium-family browsers (Chrome/Edge) reuse a session across contexts with the same capabilities, resetting all browser state (cookies, storage, cache, service workers, permissions, extra windows) between contexts, which is faster than a fresh launch each time. Set this to `true` to opt out and force a cold session, for example when you need to rule out any possibility of cross-context state carryover. Firefox, WebKit/Safari, and native app surfaces always use a fresh session regardless of this setting.
   */
  freshSession?: boolean;
  window?: BrowserWindow;
  viewport?: BrowserViewport;
}
/**
 * Browser dimensions.
 */
export interface BrowserWindow {
  /**
   * Width of the browser window in pixels.
   */
  width?: number;
  /**
   * Height of the browser window in pixels.
   */
  height?: number;
}
/**
 * Viewport dimensions.
 */
export interface BrowserViewport {
  /**
   * Width of the viewport in pixels.
   */
  width?: number;
  /**
   * Height of the viewport in pixels.
   */
  height?: number;
}
/**
 * Browser configuration.
 */
export interface Browser1 {
  /**
   * Name of the browser.
   */
  name: "chrome" | "firefox" | "safari" | "webkit";
  /**
   * Set automatically during context resolution: `true` when the author explicitly requested this browser (as opposed to it being auto-selected as the default). The runner's cross-browser fallback uses it to decide whether substituting another engine reports `PASS` (auto-selected) or `WARNING` (explicitly pinned).
   */
  explicit?: boolean;
  /**
   * If `true`, runs the browser in headless mode.
   */
  headless?: boolean;
  /**
   * If `true`, this browser always starts a brand-new driver session for each context and never reuses a pooled one. By default, Chromium-family browsers (Chrome/Edge) reuse a session across contexts with the same capabilities, resetting all browser state (cookies, storage, cache, service workers, permissions, extra windows) between contexts, which is faster than a fresh launch each time. Set this to `true` to opt out and force a cold session, for example when you need to rule out any possibility of cross-context state carryover. Firefox, WebKit/Safari, and native app surfaces always use a fresh session regardless of this setting.
   */
  freshSession?: boolean;
  window?: BrowserWindow1;
  viewport?: BrowserViewport1;
}
/**
 * Browser dimensions.
 */
export interface BrowserWindow1 {
  /**
   * Width of the browser window in pixels.
   */
  width?: number;
  /**
   * Height of the browser window in pixels.
   */
  height?: number;
}
/**
 * Viewport dimensions.
 */
export interface BrowserViewport1 {
  /**
   * Width of the viewport in pixels.
   */
  width?: number;
  /**
   * Height of the viewport in pixels.
   */
  height?: number;
}
export interface Requirements {
  /**
   * Commands that must be resolvable on the PATH.
   *
   * @minItems 1
   */
  commands?: [string, ...string[]];
  /**
   * Files that must exist. Entries support `$VAR` and `$HOME` expansion.
   *
   * @minItems 1
   */
  files?: [string, ...string[]];
  /**
   * Environment variables that must be set to a non-empty value.
   *
   * @minItems 1
   */
  env?: [string, ...string[]];
}
export interface DeviceDescriptor {
  /**
   * Target platform. Selects the mobile driver. Required in `startSurface.device`; implied by the context in `context.device`.
   */
  platform?: "android" | "ios";
  /**
   * Device name and registry identity — the same name resolves to the same device. Reference form: names an existing AVD (Android) / simulator (iOS) to reuse. If no device by this name exists, Doc Detective creates one under this name using `deviceType`/`osVersion` (or their defaults), provided the toolchain is installed (`doc-detective install android` or `doc-detective install ios`).
   */
  name?: string;
  /**
   * Abstract hardware profile used when creating a device (portable across `android`/`ios`). Doc Detective maps it to a built-in profile. Ignored when `name` already matches an existing device. Default: `phone`.
   */
  deviceType?: "phone" | "tablet";
  /**
   * Platform version used when creating a device; must match an installed image/runtime for the target platform (install more with `doc-detective install android` or `doc-detective install ios`). Ignored when `name` already matches an existing device. Default: the newest installed version.
   */
  osVersion?: string;
  /**
   * Run the Android emulator without a window. No-op on iOS (simulators boot without the Simulator UI on CI) and ignored where not applicable.
   */
  headless?: boolean;
  /**
   * Initial orientation. Reserved; validated now, not yet implemented.
   */
  orientation?: "portrait" | "landscape";
  /**
   * Pin a specific device/emulator instance by UDID. Reserved; validated now, not yet implemented.
   */
  udid?: string;
  /**
   * Cloud device farm configuration, keyed by provider. Reserved; validated now, not yet implemented.
   */
  provider?: {
    [k: string]: unknown;
  };
}
export interface FileTypeExecutable {
  /**
   * File extensions to use with type.
   */
  extensions: string | [string, ...string[]];
  /**
   * `runShell` step to perform for this file type. Use $1 as a placeholder for the file path.
   */
  runShell?: RunShell;
  [k: string]: unknown;
}
export interface RunShellCommandDetailed {
  /**
   * Command to perform in the selected shell (see `shell`; defaults to `bash` on every platform).
   */
  command: string;
  /**
   * Shell to run the command in. If unset, uses the config-level `shell` setting, which defaults to `bash`. `cmd` and `powershell` are only supported on Windows. On Windows, `bash` resolves to Git Bash, which Doc Detective installs automatically if it isn't present.
   */
  shell?: "bash" | "cmd" | "powershell";
  /**
   * Arguments for the command.
   */
  args?: string[];
  /**
   * Working directory for the command.
   */
  workingDirectory?: string;
  /**
   * Expected exit codes of the command. If the command's actual exit code isn't in this list, the step fails.
   */
  exitCodes?: number[];
  /**
   * Content expected in the command's stdout or stderr. If the expected content can't be found in the command's stdout or stderr, the step fails. Supports strings and regular expressions. To use a regular expression, the string must start and end with a forward slash, like in `/^hello-world.* /`.
   */
  stdio?: string;
  /**
   * File path to save the command's output, relative to `directory`.
   */
  path?: string;
  /**
   * Directory to save the command's output. If the directory doesn't exist, creates the directory. If not specified, the directory is your media directory.
   */
  directory?: string;
  /**
   * Allowed variation as a fraction (0 to 1) of text different between the current output and previously saved output. For example, 0.1 means 10%. If the difference between the current output and the previous output is greater than `maxVariation`, the step fails. If output doesn't exist at `path`, this value is ignored.
   */
  maxVariation?: number;
  /**
   * If `true`, overwrites the existing output at `path` if it exists.
   * If `aboveVariation`, overwrites the existing output at `path` if the difference between the new output and the existing output is greater than `maxVariation`.
   */
  overwrite?: "true" | "false" | "aboveVariation";
  /**
   * Max time in milliseconds the command is allowed to run. If the command runs longer than this, the step fails. When `background` is set, this is instead the max time to wait for `background.waitUntil` to be satisfied before the step fails.
   */
  timeout?: number;
  /**
   * Start the command as a long-running background process and return as soon as it is ready, instead of waiting for it to exit. When set, `exitCodes`, `stdio`, and output saving (`path`, `directory`, `maxVariation`, `overwrite`) are ignored, and `timeout` is the max time to wait for `waitUntil`. The process is owned by the run and is stopped by a `closeSurface` step or automatically when the run finishes.
   */
  background?: {
    /**
     * Unique identifier for this background process within the run. Reference it from a `closeSurface` step to stop it.
     */
    name: string;
    /**
     * Conditions that must all be met before the process is considered ready and the step proceeds. Omit to consider the process ready as soon as it is spawned. Specify any combination; every condition given must pass before `timeout` elapses. Note: a process that forks a daemon and then exits (common for some Docker images and databases) is treated as having exited before becoming ready and the step fails — use `port`, `httpGet`, or `delayMs` for those rather than a condition that depends on the foreground process staying alive.
     */
    waitUntil?: {
      /**
       * Wait until this TCP port accepts connections on localhost.
       */
      port?: number;
      /**
       * Wait until the process's output contains this content. Searches both stdout and stderr. Supports strings and regular expressions. To use a regular expression, the string must start and end with a forward slash, like in `/ready on \d+/`.
       */
      stdio?: string;
      /**
       * Wait until an HTTP GET request to this URL returns a 2xx status.
       */
      httpGet?: string;
      /**
       * Wait at least this many milliseconds.
       */
      delayMs?: number;
    };
    /**
     * Run the process in a pseudo-terminal (PTY) instead of a pipe, so full-screen/interactive TUIs (those that check `isTTY`) render and accept keystrokes. Requires the PTY backend `@homebridge/node-pty-prebuilt-multiarch` to be installed (`npm install @homebridge/node-pty-prebuilt-multiarch`); it is not bundled, and if it is unavailable the step is skipped. `stdout` and `stderr` are merged into one stream in PTY mode. PTY output includes raw ANSI escape sequences (colors, cursor movement); `waitUntil.stdio` patterns should target text that renders without interleaved control codes, or use a regex that tolerates them.
     */
    tty?: boolean;
  };
}
/**
 * Options for connecting to external services.
 */
export interface IntegrationsOptions {
  openApi?: (OpenApi & OpenAPIDescriptionTest)[];
  docDetectiveApi?: DocDetectiveOrchestrationAPI;
  heretto?: HerettoCMSIntegrations;
}
export interface OpenAPIDescriptionTest {
  [k: string]: unknown;
}
/**
 * Configuration for Doc Detective Orchestration API integration.
 */
export interface DocDetectiveOrchestrationAPI {
  /**
   * API key for authenticating with the Doc Detective Orchestration API.
   */
  apiKey?: string;
}
export interface HerettoCMSIntegration {
  /**
   * Unique identifier for this Heretto integration. Used in logs and results.
   */
  name: string;
  /**
   * The organization subdomain used to access Heretto CCMS (e.g., 'thunderbird' for thunderbird.heretto.com).
   */
  organizationId: string;
  /**
   * Heretto CCMS username (email address) for API authentication.
   */
  username: string;
  /**
   * API token generated in Heretto CCMS for authentication. See https://help.heretto.com/en/heretto-ccms/api/ccms-api-authentication/basic-authentication#ariaid-title3
   */
  apiToken: string;
  /**
   * Name of the scenario to build and test.
   */
  scenarioName?: string;
  /**
   * Local path where Heretto content was downloaded. Set automatically during processing.
   */
  outputPath?: string;
  /**
   * Mapping of local file paths to Heretto file metadata. Set automatically during content loading.
   */
  fileMapping?: {
    [k: string]: {
      /**
       * The UUID of the file in Heretto.
       */
      fileId?: string;
      /**
       * The path of the file in Heretto.
       */
      filePath?: string;
      [k: string]: unknown;
    };
  };
  /**
   * If `true`, uploads changed screenshots and other media files back to Heretto CMS after test execution.
   */
  uploadOnChange?: boolean;
  /**
   * Mapping of Heretto file paths to their UUIDs and metadata. Set automatically during content loading by fetching ditamap resource dependencies.
   */
  resourceDependencies?: {
    [k: string]: {
      /**
       * The UUID of the file in Heretto.
       */
      uuid?: string;
      /**
       * The full xmldb path of the file in Heretto.
       */
      fullPath?: string;
      /**
       * The file name.
       */
      name?: string;
      /**
       * The UUID of the parent folder in Heretto.
       */
      parentFolderId?: string;
      [k: string]: unknown;
    };
  };
}
/**
 * Options around sending telemetry for Doc Detective usage.
 */
export interface TelemetryOptions {
  /**
   * If `true`, sends Doc Detective telemetry.
   */
  send: boolean;
  /**
   * Identifier for the organization, group, or individual running Doc Detective.
   */
  userId?: string;
}
/**
 * Options for the post-run hints feature. After a test run, Doc Detective may print one short, contextual hint with code samples and links to encourage further engagement (for example, suggesting a CI workflow when none is detected). Doc Detective displays hints only in an interactive terminal (TTY) and only at the default `info` log level.
 */
export interface HintsOptions {
  /**
   * If `true` (the default), Doc Detective may print one applicable hint after a test run. Disable from the CLI with `--no-hints`.
   */
  enabled: boolean;
}
/**
 * Environment information for the system running Doc Detective.
 */
export interface EnvironmentDetails {
  /**
   * The current working directory of the process running Doc Detective.
   */
  workingDirectory?: string;
  /**
   * The operating system type running Doc Detective.
   */
  platform: "linux" | "mac" | "windows";
  /**
   * The processor architecture of the system running Doc Detective.
   */
  arch?: "arm32" | "arm64" | "x32" | "x64";
}
