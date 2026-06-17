/* eslint-disable */
/**
 * Auto-generated from runBrowserScript_v3.schema.json
 * Do not edit manually
 */

/**
 * Execute arbitrary JavaScript in the browser page context. Runs via the WebDriver `executeScript` endpoint, so it has access to the page's `document`, `window`, and DOM. Doc Detective captures the script's return value in the step's `outputs.result`. Distinct from `runCode`, which runs Node/Python/bash on the host machine.
 */
export type RunBrowserScript = RunBrowserScriptSimple | RunBrowserScriptDetailed;
/**
 * JavaScript to evaluate in the browser page context. Supports `return` to capture a value into `outputs.result`.
 */
export type RunBrowserScriptSimple = string;

export interface RunBrowserScriptDetailed {
  /**
   * JavaScript to evaluate in the browser page context. Supports `return` to capture a value into `outputs.result`. The script reads arguments supplied in `args` through the `arguments` object (`arguments[0]`, `arguments[1]`, and so on).
   */
  script: string;
  /**
   * Arguments passed positionally to the script. Available inside the script via the `arguments` object.
   */
  args?: string[];
  /**
   * Content expected in the script's serialized return value. Doc Detective serializes non-string return values to JSON before matching. If the serialized return value doesn't contain the expected content, the step fails. Supports strings and regular expressions. To use a regular expression, the string must start and end with a forward slash, like in `/^hello-world.* /`.
   */
  output?: string;
  /**
   * File path to save the script's serialized return value, relative to `directory`.
   */
  path?: string;
  /**
   * Directory to save the script's return value. If the directory doesn't exist, creates the directory. If not specified, the directory is your media directory.
   */
  directory?: string;
  /**
   * Allowed variation as a fraction (0 to 1) of text different between the current return value and previously saved value. For example, 0.1 means 10%. If the difference between the current value and the previous value is greater than `maxVariation`, the step returns a warning. If no output exists at `path`, Doc Detective ignores this value.
   */
  maxVariation?: number;
  /**
   * If `true`, overwrites the existing output at `path` if it exists.
   * If `aboveVariation`, overwrites the existing output at `path` if the difference between the new output and the existing output is greater than `maxVariation`.
   */
  overwrite?: "true" | "false" | "aboveVariation";
  /**
   * Maximum time in milliseconds the script may run. If the script runs longer than this, the step fails.
   */
  timeout?: number;
}
