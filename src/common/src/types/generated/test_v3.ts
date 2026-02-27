/* eslint-disable */
/**
 * Auto-generated from test_v3.schema.json
 * Do not edit manually
 */

/**
 * A Doc Detective test.
 */
export type Test = {
  [k: string]: unknown;
} & {
  /**
   * Unique identifier for the test.
   */
  testId?: string;
  /**
   * Description of the test.
   */
  description?: string;
  /**
   * Path to the content that the test is associated with.
   */
  contentPath?: string;
  /**
   * Whether or not to detect steps in input files based on markup regex.
   */
  detectSteps?: boolean;
  /**
   * Contexts to run the test in. Overrides contexts defined at the config and spec levels.
   */
  runOn?: Context[];
  openApi?: (OpenApi & OpenAPIDescriptionTest)[];
  /**
   * Path to a test specification to perform before this test, while maintaining this test's context. Useful for setting up testing environments. Only the `steps` property is used from the first test in the setup spec.
   */
  before?: string;
  /**
   * Path to a test specification to perform after this test, while maintaining this test's context. Useful for cleaning up testing environments. Only the `steps` property is used from the first test in the cleanup spec.
   */
  after?: string;
  /**
   * Steps to perform as part of the test. Performed in the sequence defined. If one or more actions fail, the test fails. By default, if a step fails, the test stops and the remaining steps are not executed.
   *
   * @minItems 1
   */
  steps?: [Step, ...Step[]];
  contexts?: ResolvedContexts;
};
/**
 * OpenAPI description and configuration.
 */
export type OpenApi = {
  [k: string]: unknown;
};
/**
 * A step in a test.
 */
export type Step =
  | (Common & CheckLink)
  | (Common1 & Click)
  | (Common2 & Find)
  | (Common3 & GoTo)
  | (Common4 & HttpRequest)
  | (Common5 & RunShell)
  | (Common6 & RunCode)
  | (Common7 & Type)
  | (Common8 & Screenshot)
  | (Common9 & SaveCookie)
  | (Common10 & Record)
  | (Common11 & StopRecord)
  | (Common12 & LoadVariables)
  | (Common13 & DragAndDrop)
  | (Common14 & LoadCookie)
  | (Common15 & Wait);
export type CheckLink1 = CheckLinkDetailed | CheckLinkDetailed1;
/**
 * Check if an HTTP or HTTPS URL returns an acceptable status code from a GET request.
 */
export type CheckLinkDetailed = string;
/**
 * Click or tap an element.
 */
export type Click1 = ClickElementSimple | ClickElementDetailed | boolean;
/**
 * Identifier for the element to click. Can be a selector, element text, ARIA name, ID, or test ID.
 */
export type ClickElementSimple = string;
export type ClickElementDetailed =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * Find an element based on display text or a selector, then optionally interact with it.
 */
export type Find1 = FindElementSimple | FindElementDetailed;
/**
 * Identifier for the element to find. Can be a selector, element text, ARIA name, ID, or test ID.
 */
export type FindElementSimple = string;
export type FindElementDetailed =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
export type GoTo1 = GoToURLSimple | GoToURLDetailed;
/**
 * Navigate to an HTTP or HTTPS URL. Can be a full URL or a path. If a path is provided, navigates relative to the current URL, if any.
 */
export type GoToURLSimple = string;
/**
 * Perform a generic HTTP request, for example to an API.
 */
export type HttpRequest1 = HTTPRequestSimple | HTTPRequestDetailed;
/**
 * URL for the HTTP request.
 */
export type HTTPRequestSimple = string;
export type HTTPRequestDetailed =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * Perform a native shell command.
 */
export type RunShell1 = RunShellCommandSimple | RunShellCommandDetailed;
/**
 * Command to perform in the machine's default shell.
 */
export type RunShellCommandSimple = string;
/**
 * Assemble and run code.
 */
export type RunCode1 = RunCodeDetailed;
/**
 * Type keys. To type special keys, begin and end the string with `$` and use the special key's keyword. For example, to type the Escape key, enter `$ESCAPE$`.
 */
export type TypeKeys = TypeKeysSimple | TypeKeysDetailed;
/**
 * Sequence of keys to enter.
 */
export type TypeKeysSimple = string | string[];
/**
 * Sequence of keys to enter.
 */
export type TypeKeysSimple1 = string | string[];
/**
 * Takes a screenshot in PNG format.
 */
export type Screenshot1 = ScreenshotSimple | CaptureScreenshotDetailed | CaptureScreenshot;
/**
 * File path of the PNG file. Accepts absolute paths. If not specified, the file name is the ID of the step.
 */
export type ScreenshotSimple = string;
/**
 * File path of the PNG file. Accepts absolute paths. If not specified, the file name is the ID of the step.
 */
export type ScreenshotSimple1 = string;
/**
 * Display text or selector of the element to screenshot.
 */
export type CropByElementSimple = string;
/**
 * Crop the screenshot to a specific element.
 */
export type CropByElementDetailed =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * If `true`, captures a screenshot. If `false`, doesn't capture a screenshot.
 */
export type CaptureScreenshot = boolean;
/**
 * Save a specific browser cookie to a file or environment variable for later reuse.
 */
export type SaveCookie1 = CookieName | SaveCookieDetailed;
/**
 * Name of the specific cookie to save. Will be saved to a default file path or environment variable.
 */
export type CookieName = string;
export type SaveCookieDetailed =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * Start recording the current browser viewport. Must be followed by a `stopRecord` step. Only runs in Chrome browsers when they are visible. Supported extensions: [ '.mp4', '.webm', '.gif' ]
 */
export type Record1 = RecordSimple | RecordDetailed | RecordBoolean;
/**
 * File path of the recording. Supports the `.mp4`, `.webm`, and `.gif` extensions. If not specified, the file name is the ID of the step, and the extension is `.mp4`.
 */
export type RecordSimple = string;
/**
 * If `true`, records the current browser viewport. If `false`, doesn't record the current browser viewport.
 */
export type RecordBoolean = boolean;
/**
 * Stop the current recording.
 */
export type StopRecord1 = boolean;
/**
 * Load environment variables from the specified `.env` file.
 */
export type LoadVariables1 = string;
/**
 * Display text, selector, or regex pattern (enclosed in forward slashes) of the element.
 */
export type ElementSimple = string;
export type ElementDetailed =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * Display text, selector, or regex pattern (enclosed in forward slashes) of the element.
 */
export type ElementSimple1 = string;
export type ElementDetailed1 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * Load a specific cookie from a file or environment variable into the browser.
 */
export type LoadCookie1 = CookieNameOrFilePath | LoadCookieDetailed;
/**
 * Name of the specific cookie to load from default location, or file path to cookie file.
 */
export type CookieNameOrFilePath = string;
export type LoadCookieDetailed =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * Pause (in milliseconds) before performing the next action.
 */
export type Wait1 = WaitSimple | WaitEnvironmentVariable | WaitBoolean;
export type WaitSimple = number;
export type WaitEnvironmentVariable = string;
export type WaitBoolean = boolean;
/**
 * OpenAPI description and configuration.
 */
export type OpenApi1 = {
  [k: string]: unknown;
};
/**
 * A step in a test.
 */
export type Step1 =
  | (Common16 & CheckLink2)
  | (Common17 & Click2)
  | (Common18 & Find2)
  | (Common19 & GoTo2)
  | (Common20 & HttpRequest2)
  | (Common21 & RunShell2)
  | (Common22 & RunCode2)
  | (Common23 & Type1)
  | (Common24 & Screenshot2)
  | (Common25 & SaveCookie2)
  | (Common26 & Record2)
  | (Common27 & StopRecord2)
  | (Common28 & LoadVariables2)
  | (Common29 & DragAndDrop2)
  | (Common30 & LoadCookie2)
  | (Common31 & Wait2);
export type CheckLink3 = CheckLinkDetailed2 | CheckLinkDetailed3;
/**
 * Check if an HTTP or HTTPS URL returns an acceptable status code from a GET request.
 */
export type CheckLinkDetailed2 = string;
/**
 * Click or tap an element.
 */
export type Click3 = ClickElementSimple1 | ClickElementDetailed1 | boolean;
/**
 * Identifier for the element to click. Can be a selector, element text, ARIA name, ID, or test ID.
 */
export type ClickElementSimple1 = string;
export type ClickElementDetailed1 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * Find an element based on display text or a selector, then optionally interact with it.
 */
export type Find3 = FindElementSimple1 | FindElementDetailed1;
/**
 * Identifier for the element to find. Can be a selector, element text, ARIA name, ID, or test ID.
 */
export type FindElementSimple1 = string;
export type FindElementDetailed1 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
export type GoTo3 = GoToURLSimple1 | GoToURLDetailed1;
/**
 * Navigate to an HTTP or HTTPS URL. Can be a full URL or a path. If a path is provided, navigates relative to the current URL, if any.
 */
export type GoToURLSimple1 = string;
/**
 * Perform a generic HTTP request, for example to an API.
 */
export type HttpRequest3 = HTTPRequestSimple1 | HTTPRequestDetailed1;
/**
 * URL for the HTTP request.
 */
export type HTTPRequestSimple1 = string;
export type HTTPRequestDetailed1 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * Perform a native shell command.
 */
export type RunShell3 = RunShellCommandSimple1 | RunShellCommandDetailed1;
/**
 * Command to perform in the machine's default shell.
 */
export type RunShellCommandSimple1 = string;
/**
 * Assemble and run code.
 */
export type RunCode3 = RunCodeDetailed1;
/**
 * Type keys. To type special keys, begin and end the string with `$` and use the special key's keyword. For example, to type the Escape key, enter `$ESCAPE$`.
 */
export type TypeKeys1 = TypeKeysSimple2 | TypeKeysDetailed1;
/**
 * Sequence of keys to enter.
 */
export type TypeKeysSimple2 = string | string[];
/**
 * Sequence of keys to enter.
 */
export type TypeKeysSimple3 = string | string[];
/**
 * Takes a screenshot in PNG format.
 */
export type Screenshot3 = ScreenshotSimple2 | CaptureScreenshotDetailed1 | CaptureScreenshot1;
/**
 * File path of the PNG file. Accepts absolute paths. If not specified, the file name is the ID of the step.
 */
export type ScreenshotSimple2 = string;
/**
 * File path of the PNG file. Accepts absolute paths. If not specified, the file name is the ID of the step.
 */
export type ScreenshotSimple3 = string;
/**
 * Display text or selector of the element to screenshot.
 */
export type CropByElementSimple1 = string;
/**
 * Crop the screenshot to a specific element.
 */
export type CropByElementDetailed1 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * If `true`, captures a screenshot. If `false`, doesn't capture a screenshot.
 */
export type CaptureScreenshot1 = boolean;
/**
 * Save a specific browser cookie to a file or environment variable for later reuse.
 */
export type SaveCookie3 = CookieName1 | SaveCookieDetailed1;
/**
 * Name of the specific cookie to save. Will be saved to a default file path or environment variable.
 */
export type CookieName1 = string;
export type SaveCookieDetailed1 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * Start recording the current browser viewport. Must be followed by a `stopRecord` step. Only runs in Chrome browsers when they are visible. Supported extensions: [ '.mp4', '.webm', '.gif' ]
 */
export type Record3 = RecordSimple1 | RecordDetailed1 | RecordBoolean1;
/**
 * File path of the recording. Supports the `.mp4`, `.webm`, and `.gif` extensions. If not specified, the file name is the ID of the step, and the extension is `.mp4`.
 */
export type RecordSimple1 = string;
/**
 * If `true`, records the current browser viewport. If `false`, doesn't record the current browser viewport.
 */
export type RecordBoolean1 = boolean;
/**
 * Stop the current recording.
 */
export type StopRecord3 = boolean;
/**
 * Load environment variables from the specified `.env` file.
 */
export type LoadVariables3 = string;
/**
 * Display text, selector, or regex pattern (enclosed in forward slashes) of the element.
 */
export type ElementSimple2 = string;
export type ElementDetailed2 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * Display text, selector, or regex pattern (enclosed in forward slashes) of the element.
 */
export type ElementSimple3 = string;
export type ElementDetailed3 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * Load a specific cookie from a file or environment variable into the browser.
 */
export type LoadCookie3 = CookieNameOrFilePath1 | LoadCookieDetailed1;
/**
 * Name of the specific cookie to load from default location, or file path to cookie file.
 */
export type CookieNameOrFilePath1 = string;
export type LoadCookieDetailed1 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };
/**
 * Pause (in milliseconds) before performing the next action.
 */
export type Wait3 = WaitSimple1 | WaitEnvironmentVariable1 | WaitBoolean1;
export type WaitSimple1 = number;
export type WaitEnvironmentVariable1 = string;
export type WaitBoolean1 = boolean;
/**
 * Resolved contexts to run the test in. This is a resolved version of the `runOn` property. It is not user-defined and should not be used in test specifications.
 */
export type ResolvedContexts = ResolvedContext[];

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
export interface OpenAPIDescriptionTest {
  [k: string]: unknown;
}
export interface Common {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep;
  variables?: VariablesStep;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
export interface CheckLink {
  checkLink: CheckLink1;
  [k: string]: unknown;
}
/**
 * Check if an HTTP or HTTPS URL returns an acceptable status code from a GET request.
 */
export interface CheckLinkDetailed1 {
  /**
   * URL to check. Can be a full URL or a path. If a path is provided, `origin` must be specified.
   */
  url: string;
  /**
   * Protocol and domain to navigate to. Prepended to `url`.
   */
  origin?: string;
  /**
   * Accepted status codes. If the specified URL returns a code other than what is specified here, the action fails.
   */
  statusCodes?: number | number[];
}
export interface Common1 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep1;
  variables?: VariablesStep1;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep1 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep1`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep1 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep1`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
export interface Click {
  click: Click1;
  [k: string]: unknown;
}
export interface Common2 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep2;
  variables?: VariablesStep2;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep2 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep2`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep2 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep2`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
export interface Find {
  find: Find1;
  [k: string]: unknown;
}
export interface Common3 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep3;
  variables?: VariablesStep3;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep3 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep3`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep3 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep3`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
export interface GoTo {
  goTo: GoTo1;
  [k: string]: unknown;
}
/**
 * Navigate to an HTTP or HTTPS URL.
 */
export interface GoToURLDetailed {
  /**
   * URL to navigate to. Can be a full URL or a path. If a path is provided and `origin` is specified, prepends `origin` to `url`. If a path is provided but `origin` isn't specified, attempts to navigate relative to the current URL, if any.
   */
  url: string;
  /**
   * Protocol and domain to navigate to. Prepended to `url`.
   */
  origin?: string;
  /**
   * Maximum time in milliseconds to wait for the page to be ready. If exceeded, the goTo action fails.
   */
  timeout?: number;
  /**
   * Configuration for waiting conditions after navigation.
   */
  waitUntil?: {
    /**
     * Wait for network activity to be idle (no new requests) for this duration in milliseconds. Set to `null` to skip this check.
     */
    networkIdleTime?: number | null;
    /**
     * Wait for DOM mutations to stop for this duration in milliseconds. Set to `null` to skip this check.
     */
    domIdleTime?: number | null;
    /**
     * Wait for a specific element to be present in the DOM. At least one of selector or elementText must be specified.
     */
    find?:
      | {
          [k: string]: unknown;
        }
      | {
          [k: string]: unknown;
        }
      | {
          [k: string]: unknown;
        }
      | {
          [k: string]: unknown;
        }
      | {
          [k: string]: unknown;
        }
      | {
          [k: string]: unknown;
        }
      | {
          [k: string]: unknown;
        };
  };
}
export interface Common4 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep4;
  variables?: VariablesStep4;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep4 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep4`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep4 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep4`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
export interface HttpRequest {
  httpRequest: HttpRequest1;
  [k: string]: unknown;
}
export interface Common5 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep5;
  variables?: VariablesStep5;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep5 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep5`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep5 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep5`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
export interface RunShell {
  runShell: RunShell1;
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
export interface Common6 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep6;
  variables?: VariablesStep6;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep6 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep6`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep6 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep6`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
export interface RunCode {
  runCode: RunCode1;
  [k: string]: unknown;
}
export interface RunCodeDetailed {
  /**
   * Language of the code to run.
   */
  language: "python" | "bash" | "javascript";
  /**
   * Code to run.
   */
  code: string;
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
   * Content expected in the command's output. If the expected content can't be found in the command's output (either stdout or stderr), the step fails. Supports strings and regular expressions. To use a regular expression, the string must start and end with a forward slash, like in `/^hello-world.* /`.
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
  [k: string]: unknown;
}
export interface Common7 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep7;
  variables?: VariablesStep7;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep7 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep7`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep7 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep7`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
export interface Type {
  type: TypeKeys;
  [k: string]: unknown;
}
export interface TypeKeysDetailed {
  keys: TypeKeysSimple1;
  /**
   * Delay in milliseconds between each key press during a recording
   */
  inputDelay?: number;
  /**
   * Selector for the element to type into. If not specified, the typing occurs in the active element.
   */
  selector?: string;
  /**
   * Display text of the element to type into. If combined with other element finding fields, the element must match all specified criteria.
   */
  elementText?: string;
  /**
   * ID attribute of the element to find. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementId?: string;
  /**
   * data-testid attribute of the element to find. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementTestId?: string;
  /**
   * Class or array of classes that the element must have. Each class supports exact match or regex pattern using /pattern/ syntax. Element must have all specified classes.
   */
  elementClass?: string | string[];
  /**
   * Object of attribute key-value pairs that the element must have. Values can be strings (supporting /pattern/ regex), numbers, or booleans. Boolean true matches attribute presence, false matches absence.
   */
  elementAttribute?: {
    [k: string]: string | number | boolean;
  };
  /**
   * Computed accessible name of the element per ARIA specification. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementAria?: string;
}
export interface Common8 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep8;
  variables?: VariablesStep8;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep8 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep8`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep8 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep8`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
export interface Screenshot {
  screenshot: Screenshot1;
  [k: string]: unknown;
}
export interface CaptureScreenshotDetailed {
  path?: ScreenshotSimple1;
  /**
   * Directory of the PNG file. If the directory doesn't exist, creates the directory.
   */
  directory?: string;
  /**
   * Allowed variation in percentage of pixels between the new screenshot and the existing screenshot at `path`. If the difference between the new screenshot and the existing screenshot is greater than `maxVariation`, the step fails. If a screenshot doesn't exist at `path`, this value is ignored.
   */
  maxVariation?: number;
  /**
   * If `true`, overwrites the existing screenshot at `path` if it exists.
   * If `aboveVariation`, overwrites the existing screenshot at `path` if the difference between the new screenshot and the existing screenshot is greater than `maxVariation`.
   */
  overwrite?: "true" | "false" | "aboveVariation";
  crop?: CropByElementSimple | CropByElementDetailed;
  sourceIntegration?: SourceIntegration;
}
/**
 * Information about the source integration for this screenshot, enabling upload of changed files back to the source CMS. Set automatically during test resolution for files from integrations.
 */
export interface SourceIntegration {
  /**
   * The type of integration. Currently supported: 'heretto'. Additional types may be added in the future.
   */
  type: "heretto";
  /**
   * The name of the integration configuration in the config file. Used to look up authentication credentials.
   */
  integrationName: string;
  /**
   * The unique identifier (UUID) of the file in the source CMS. If not provided, the file will be looked up by path.
   */
  fileId?: string;
  /**
   * The path of the file in the source CMS. Used for lookup if fileId is not available.
   */
  filePath?: string;
  /**
   * The local path to the file that references this source. Used for resolving relative paths.
   */
  contentPath?: string;
}
export interface Common9 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep9;
  variables?: VariablesStep9;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep9 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep9`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep9 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep9`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
export interface SaveCookie {
  saveCookie: SaveCookie1;
  [k: string]: unknown;
}
export interface Common10 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep10;
  variables?: VariablesStep10;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep10 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep10`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep10 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep10`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
export interface Record {
  record: Record1;
  [k: string]: unknown;
}
export interface RecordDetailed {
  /**
   * File path of the recording. Supports the `.mp4`, `.webm`, and `.gif` extensions. If not specified, the file name is the ID of the step, and the extension is `.mp4`.
   */
  path?: string;
  /**
   * Directory of the file. If the directory doesn't exist, creates the directory.
   */
  directory?: string;
  /**
   * If `true`, overwrites the existing recording at `path` if it exists.
   */
  overwrite?: "true" | "false";
  [k: string]: unknown;
}
export interface Common11 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep11;
  variables?: VariablesStep11;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep11 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep11`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep11 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep11`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
export interface StopRecord {
  stopRecord: StopRecord1;
  [k: string]: unknown;
}
export interface Common12 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep12;
  variables?: VariablesStep12;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep12 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep12`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep12 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep12`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
export interface LoadVariables {
  loadVariables: LoadVariables1;
  [k: string]: unknown;
}
export interface Common13 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep13;
  variables?: VariablesStep13;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep13 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep13`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep13 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep13`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
export interface DragAndDrop {
  dragAndDrop: DragAndDrop1;
  [k: string]: unknown;
}
/**
 * Drag and drop an element from source to target.
 */
export interface DragAndDrop1 {
  /**
   * The element to drag.
   */
  source: ElementSimple | ElementDetailed;
  /**
   * The target location to drop the element.
   */
  target: ElementSimple1 | ElementDetailed1;
  /**
   * Duration of the drag operation in milliseconds.
   */
  duration?: number;
  [k: string]: unknown;
}
export interface Common14 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep14;
  variables?: VariablesStep14;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep14 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep14`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep14 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep14`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
export interface LoadCookie {
  loadCookie: LoadCookie1;
  [k: string]: unknown;
}
export interface Common15 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep15;
  variables?: VariablesStep15;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep15 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep15`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep15 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep15`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
export interface Wait {
  wait: Wait1;
  [k: string]: unknown;
}
export interface ResolvedContext {
  /**
   * Platform to run the test on. This is a resolved version of the `platforms` property.
   */
  platform?: string;
  browser?: Browser2;
  openApi?: (OpenApi1 & OpenAPIDescriptionTest1)[];
  /**
   * Steps to perform as part of the test. Performed in the sequence defined. If one or more actions fail, the test fails. By default, if a step fails, the test stops and the remaining steps are not executed.
   *
   * @minItems 1
   */
  steps?: [Step1, ...Step1[]];
  [k: string]: unknown;
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
export interface OpenAPIDescriptionTest1 {
  [k: string]: unknown;
}
export interface Common16 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep16;
  variables?: VariablesStep16;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep16 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep16`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep16 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep16`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
export interface CheckLink2 {
  checkLink: CheckLink3;
  [k: string]: unknown;
}
/**
 * Check if an HTTP or HTTPS URL returns an acceptable status code from a GET request.
 */
export interface CheckLinkDetailed3 {
  /**
   * URL to check. Can be a full URL or a path. If a path is provided, `origin` must be specified.
   */
  url: string;
  /**
   * Protocol and domain to navigate to. Prepended to `url`.
   */
  origin?: string;
  /**
   * Accepted status codes. If the specified URL returns a code other than what is specified here, the action fails.
   */
  statusCodes?: number | number[];
}
export interface Common17 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep17;
  variables?: VariablesStep17;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep17 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep17`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep17 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep17`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
export interface Click2 {
  click: Click3;
  [k: string]: unknown;
}
export interface Common18 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep18;
  variables?: VariablesStep18;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep18 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep18`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep18 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep18`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
export interface Find2 {
  find: Find3;
  [k: string]: unknown;
}
export interface Common19 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep19;
  variables?: VariablesStep19;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep19 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep19`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep19 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep19`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
export interface GoTo2 {
  goTo: GoTo3;
  [k: string]: unknown;
}
/**
 * Navigate to an HTTP or HTTPS URL.
 */
export interface GoToURLDetailed1 {
  /**
   * URL to navigate to. Can be a full URL or a path. If a path is provided and `origin` is specified, prepends `origin` to `url`. If a path is provided but `origin` isn't specified, attempts to navigate relative to the current URL, if any.
   */
  url: string;
  /**
   * Protocol and domain to navigate to. Prepended to `url`.
   */
  origin?: string;
  /**
   * Maximum time in milliseconds to wait for the page to be ready. If exceeded, the goTo action fails.
   */
  timeout?: number;
  /**
   * Configuration for waiting conditions after navigation.
   */
  waitUntil?: {
    /**
     * Wait for network activity to be idle (no new requests) for this duration in milliseconds. Set to `null` to skip this check.
     */
    networkIdleTime?: number | null;
    /**
     * Wait for DOM mutations to stop for this duration in milliseconds. Set to `null` to skip this check.
     */
    domIdleTime?: number | null;
    /**
     * Wait for a specific element to be present in the DOM. At least one of selector or elementText must be specified.
     */
    find?:
      | {
          [k: string]: unknown;
        }
      | {
          [k: string]: unknown;
        }
      | {
          [k: string]: unknown;
        }
      | {
          [k: string]: unknown;
        }
      | {
          [k: string]: unknown;
        }
      | {
          [k: string]: unknown;
        }
      | {
          [k: string]: unknown;
        };
  };
}
export interface Common20 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep20;
  variables?: VariablesStep20;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep20 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep20`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep20 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep20`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
export interface HttpRequest2 {
  httpRequest: HttpRequest3;
  [k: string]: unknown;
}
export interface Common21 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep21;
  variables?: VariablesStep21;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep21 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep21`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep21 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep21`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
export interface RunShell2 {
  runShell: RunShell3;
  [k: string]: unknown;
}
export interface RunShellCommandDetailed1 {
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
export interface Common22 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep22;
  variables?: VariablesStep22;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep22 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep22`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep22 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep22`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
export interface RunCode2 {
  runCode: RunCode3;
  [k: string]: unknown;
}
export interface RunCodeDetailed1 {
  /**
   * Language of the code to run.
   */
  language: "python" | "bash" | "javascript";
  /**
   * Code to run.
   */
  code: string;
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
   * Content expected in the command's output. If the expected content can't be found in the command's output (either stdout or stderr), the step fails. Supports strings and regular expressions. To use a regular expression, the string must start and end with a forward slash, like in `/^hello-world.* /`.
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
  [k: string]: unknown;
}
export interface Common23 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep23;
  variables?: VariablesStep23;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep23 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep23`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep23 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep23`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
export interface Type1 {
  type: TypeKeys1;
  [k: string]: unknown;
}
export interface TypeKeysDetailed1 {
  keys: TypeKeysSimple3;
  /**
   * Delay in milliseconds between each key press during a recording
   */
  inputDelay?: number;
  /**
   * Selector for the element to type into. If not specified, the typing occurs in the active element.
   */
  selector?: string;
  /**
   * Display text of the element to type into. If combined with other element finding fields, the element must match all specified criteria.
   */
  elementText?: string;
  /**
   * ID attribute of the element to find. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementId?: string;
  /**
   * data-testid attribute of the element to find. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementTestId?: string;
  /**
   * Class or array of classes that the element must have. Each class supports exact match or regex pattern using /pattern/ syntax. Element must have all specified classes.
   */
  elementClass?: string | string[];
  /**
   * Object of attribute key-value pairs that the element must have. Values can be strings (supporting /pattern/ regex), numbers, or booleans. Boolean true matches attribute presence, false matches absence.
   */
  elementAttribute?: {
    [k: string]: string | number | boolean;
  };
  /**
   * Computed accessible name of the element per ARIA specification. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementAria?: string;
}
export interface Common24 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep24;
  variables?: VariablesStep24;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep24 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep24`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep24 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep24`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
export interface Screenshot2 {
  screenshot: Screenshot3;
  [k: string]: unknown;
}
export interface CaptureScreenshotDetailed1 {
  path?: ScreenshotSimple3;
  /**
   * Directory of the PNG file. If the directory doesn't exist, creates the directory.
   */
  directory?: string;
  /**
   * Allowed variation in percentage of pixels between the new screenshot and the existing screenshot at `path`. If the difference between the new screenshot and the existing screenshot is greater than `maxVariation`, the step fails. If a screenshot doesn't exist at `path`, this value is ignored.
   */
  maxVariation?: number;
  /**
   * If `true`, overwrites the existing screenshot at `path` if it exists.
   * If `aboveVariation`, overwrites the existing screenshot at `path` if the difference between the new screenshot and the existing screenshot is greater than `maxVariation`.
   */
  overwrite?: "true" | "false" | "aboveVariation";
  crop?: CropByElementSimple1 | CropByElementDetailed1;
  sourceIntegration?: SourceIntegration1;
}
/**
 * Information about the source integration for this screenshot, enabling upload of changed files back to the source CMS. Set automatically during test resolution for files from integrations.
 */
export interface SourceIntegration1 {
  /**
   * The type of integration. Currently supported: 'heretto'. Additional types may be added in the future.
   */
  type: "heretto";
  /**
   * The name of the integration configuration in the config file. Used to look up authentication credentials.
   */
  integrationName: string;
  /**
   * The unique identifier (UUID) of the file in the source CMS. If not provided, the file will be looked up by path.
   */
  fileId?: string;
  /**
   * The path of the file in the source CMS. Used for lookup if fileId is not available.
   */
  filePath?: string;
  /**
   * The local path to the file that references this source. Used for resolving relative paths.
   */
  contentPath?: string;
}
export interface Common25 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep25;
  variables?: VariablesStep25;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep25 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep25`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep25 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep25`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
export interface SaveCookie2 {
  saveCookie: SaveCookie3;
  [k: string]: unknown;
}
export interface Common26 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep26;
  variables?: VariablesStep26;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep26 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep26`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep26 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep26`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
export interface Record2 {
  record: Record3;
  [k: string]: unknown;
}
export interface RecordDetailed1 {
  /**
   * File path of the recording. Supports the `.mp4`, `.webm`, and `.gif` extensions. If not specified, the file name is the ID of the step, and the extension is `.mp4`.
   */
  path?: string;
  /**
   * Directory of the file. If the directory doesn't exist, creates the directory.
   */
  directory?: string;
  /**
   * If `true`, overwrites the existing recording at `path` if it exists.
   */
  overwrite?: "true" | "false";
  [k: string]: unknown;
}
export interface Common27 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep27;
  variables?: VariablesStep27;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep27 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep27`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep27 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep27`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
export interface StopRecord2 {
  stopRecord: StopRecord3;
  [k: string]: unknown;
}
export interface Common28 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep28;
  variables?: VariablesStep28;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep28 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep28`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep28 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep28`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
export interface LoadVariables2 {
  loadVariables: LoadVariables3;
  [k: string]: unknown;
}
export interface Common29 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep29;
  variables?: VariablesStep29;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep29 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep29`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep29 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep29`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
export interface DragAndDrop2 {
  dragAndDrop: DragAndDrop3;
  [k: string]: unknown;
}
/**
 * Drag and drop an element from source to target.
 */
export interface DragAndDrop3 {
  /**
   * The element to drag.
   */
  source: ElementSimple2 | ElementDetailed2;
  /**
   * The target location to drop the element.
   */
  target: ElementSimple3 | ElementDetailed3;
  /**
   * Duration of the drag operation in milliseconds.
   */
  duration?: number;
  [k: string]: unknown;
}
export interface Common30 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep30;
  variables?: VariablesStep30;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep30 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep30`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep30 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep30`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
export interface LoadCookie2 {
  loadCookie: LoadCookie3;
  [k: string]: unknown;
}
export interface Common31 {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json";
  /**
   * ID of the step.
   */
  stepId?: string;
  /**
   * Description of the step.
   */
  description?: string;
  /**
   * Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag.
   */
  unsafe?: boolean;
  outputs?: OutputsStep31;
  variables?: VariablesStep31;
  /**
   * Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled.
   */
  breakpoint?: boolean;
  [k: string]: unknown;
}
/**
 * Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence.
 */
export interface OutputsStep31 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `OutputsStep31`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
/**
 * Environment variables to set from user-defined expressions.
 */
export interface VariablesStep31 {
  /**
   * Runtime expression for a user-defined output value.
   *
   * This interface was referenced by `VariablesStep31`'s JSON-Schema definition
   * via the `patternProperty` "^[A-Za-z0-9_]+$".
   */
  [k: string]: string;
}
export interface Wait2 {
  wait: Wait3;
  [k: string]: unknown;
}
