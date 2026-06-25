/* eslint-disable */
/**
 * Auto-generated from runShell_v3.schema.json
 * Do not edit manually
 */

/**
 * Perform a native shell command.
 */
export type RunShell = RunShellCommandSimple | RunShellCommandDetailed;
/**
 * Command to perform in the machine's default shell.
 */
export type RunShellCommandSimple = string;
/**
 * Run the command as a long-running background process and return as soon as it is ready, instead of waiting for exit. `true` derives the name from the base command; a string sets the name; the object form adds `waitUntil`. When set, `exitCodes`/`stdio`/output-saving are ignored and `timeout` bounds `waitUntil`. Owned by the run; stopped by a `closeSurface` step or the run-end sweep.
 */
export type BackgroundProcess =
  | BackgroundOnOff
  | BackgroundName
  | {
      /**
       * Unique process name within the run. Defaults to the base command.
       */
      name?: string;
      waitUntil?: {
        stdio?: string;
        delayMs?: number;
        port?: {
          port: number;
          host?: string;
          pollIntervalMs?: number;
        };
        httpGet?: {
          url: string;
          statusCodes?: number[];
          pollIntervalMs?: number;
        };
      };
    };
export type BackgroundOnOff = boolean;
export type BackgroundName = string;

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
   * Allowed variation as a fraction (0 to 1) of text different between the current output and previously saved output. For example, 0.1 means 10%. If the difference between the current output and the previous output is greater than `maxVariation`, the step fails. If output doesn't exist at `path`, this value is ignored.
   */
  maxVariation?: number;
  /**
   * If `true`, overwrites the existing output at `path` if it exists.
   * If `aboveVariation`, overwrites the existing output at `path` if the difference between the new output and the existing output is greater than `maxVariation`.
   */
  overwrite?: "true" | "false" | "aboveVariation";
  /**
   * Max time in milliseconds the command is allowed to run. If the command runs longer than this, the step fails. When `background` is set, this is instead the max time to wait for the background `waitUntil` readiness to be satisfied before the step fails.
   */
  timeout?: number;
  background?: BackgroundProcess;
}
