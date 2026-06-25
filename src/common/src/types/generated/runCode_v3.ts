/* eslint-disable */
/**
 * Auto-generated from runCode_v3.schema.json
 * Do not edit manually
 */

/**
 * Assemble and run code.
 */
export type RunCode = RunCodeDetailed;

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
   * Start the code as a long-running background process and return as soon as it is ready, instead of waiting for it to exit. When set, `exitCodes`, `stdio`, and output saving (`path`, `directory`, `maxVariation`, `overwrite`) are ignored, and `timeout` is the max time to wait for `waitUntil`. The process is owned by the run and is stopped by a `closeSurface` step or automatically when the run finishes.
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
  };
  [k: string]: unknown;
}
