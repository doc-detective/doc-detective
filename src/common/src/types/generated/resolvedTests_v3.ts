/* eslint-disable */
/**
 * Auto-generated from resolvedTests_v3.schema.json
 * Do not edit manually
 */

/**
 * Load environment variables from the specified `.env` file.
 */
export type LoadVariables = string;
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
 * Command to perform in the machine's default shell.
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
 * OpenAPI description and configuration.
 */
export type OpenApi1 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * A Doc Detective test.
 */
export type Test =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };

/**
 * A collection of resolved tests ready to be performed.
 */
export interface ResolvedTests {
  /**
   * Unique identifier for the resolved tests.
   */
  resolvedTestsId?: string;
  config?: Config;
  /**
   * Test specifications that were performed.
   *
   * @minItems 1
   */
  specs: [Specification, ...Specification[]];
  [k: string]: unknown;
}
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
  /**
   * Number of concurrent test runners. Set to true to use CPU core count (capped at 4).
   */
  concurrentRunners?: number | boolean;
  environment?: EnvironmentDetails;
  /**
   * Enable debugging mode. `true` allows pausing on breakpoints, waiting for user input before continuing. `stepThrough` pauses at every step, waiting for user input before continuing. `false` disables all debugging.
   */
  debug?: boolean | "stepThrough";
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
  platforms?: ("linux" | "mac" | "windows") | ("linux" | "mac" | "windows")[];
  /**
   * Browsers to run tests on.
   */
  browsers?:
    | ("chrome" | "firefox" | "safari" | "webkit")
    | Browser
    | (("chrome" | "firefox" | "safari" | "webkit") | Browser1)[];
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
   * If `true`, runs the browser in headless mode.
   */
  headless?: boolean;
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
   * If `true`, runs the browser in headless mode.
   */
  headless?: boolean;
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
   * Command to perform in the machine's default shell.
   */
  command: string;
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
   * Allowed variation in percentage of text different between the current output and previously saved output. If the difference between the current output and the previous output is greater than `maxVariation`, the step fails. If output doesn't exist at `path`, this value is ignored.
   */
  maxVariation?: number;
  /**
   * If `true`, overwrites the existing output at `path` if it exists.
   * If `aboveVariation`, overwrites the existing output at `path` if the difference between the new output and the existing output is greater than `maxVariation`.
   */
  overwrite?: "true" | "false" | "aboveVariation";
  /**
   * Max time in milliseconds the command is allowed to run. If the command runs longer than this, the step fails.
   */
  timeout?: number;
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
export interface Specification {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/spec_v3.schema.json";
  /**
   * Unique identifier for the test specification.
   */
  specId?: string;
  /**
   * Description of the test specification.
   */
  description?: string;
  /**
   * Path to the test specification.
   */
  specPath?: string;
  /**
   * Path to the content that the specification is associated with.
   */
  contentPath?: string;
  /**
   * Contexts to run the test in. Overrides contexts defined at the config and spec levels.
   */
  runOn?: Context1[];
  openApi?: (OpenApi1 & OpenAPIDescriptionTest1)[];
  /**
   * [Tests](test) to perform.
   *
   * @minItems 1
   */
  tests: [Test, ...Test[]];
  [k: string]: unknown;
}
/**
 * A context in which to perform tests. If no contexts are specified but a context is required by one or more tests, Doc Detective attempts to identify a supported context in the current environment and run tests against it. For example, if a browser isn't specified but is required by steps in the test, Doc Detective will search for and use a supported browser available in the current environment.
 */
export interface Context1 {
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
  platforms?: ("linux" | "mac" | "windows") | ("linux" | "mac" | "windows")[];
  /**
   * Browsers to run tests on.
   */
  browsers?:
    | ("chrome" | "firefox" | "safari" | "webkit")
    | Browser2
    | (("chrome" | "firefox" | "safari" | "webkit") | Browser3)[];
}
/**
 * Browser configuration.
 */
export interface Browser2 {
  /**
   * Name of the browser.
   */
  name: "chrome" | "firefox" | "safari" | "webkit";
  /**
   * If `true`, runs the browser in headless mode.
   */
  headless?: boolean;
  window?: BrowserWindow2;
  viewport?: BrowserViewport2;
}
/**
 * Browser dimensions.
 */
export interface BrowserWindow2 {
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
export interface BrowserViewport2 {
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
export interface Browser3 {
  /**
   * Name of the browser.
   */
  name: "chrome" | "firefox" | "safari" | "webkit";
  /**
   * If `true`, runs the browser in headless mode.
   */
  headless?: boolean;
  window?: BrowserWindow3;
  viewport?: BrowserViewport3;
}
/**
 * Browser dimensions.
 */
export interface BrowserWindow3 {
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
export interface BrowserViewport3 {
  /**
   * Width of the viewport in pixels.
   */
  width?: number;
  /**
   * Height of the viewport in pixels.
   */
  height?: number;
}
export interface OpenAPIDescriptionTest1 {
  [k: string]: unknown;
}
